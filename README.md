# ReachInbox Email Job Scheduler

Production-grade email scheduling at scale — Next.js dashboard → Express API → Postgres (source of truth) → BullMQ/Redis delayed jobs → worker pool → Ethereal SMTP. Built for the ReachInbox full-stack hiring assignment (48h).

## Demo

<!-- paste video link: [Watch the ≤5-min demo](...) -->

## What it does

| Requirement | Shipped |
|---|---|
| Schedule emails via API for a future time | `POST /api/v1/campaigns` → Postgres rows + BullMQ delayed jobs (**no cron anywhere**) |
| Multiple senders over Ethereal SMTP | Senders seeded from env; round-robin lanes assigned at insert |
| Survive restarts, lose nothing, resend nothing | Redis AOF replay + deterministic job ids + boot-recovery sweep (proven on camera-ready data) |
| Same email never sent more than once | **At-most-once by construction** — see [the design decision](#the-core-design-decision-at-most-once) below |
| Worker concurrency | `WORKER_CONCURRENCY` env, parallel-safe via guarded claims |
| Min delay between sends | Queue limiter `{max: 1, duration: MIN_DELAY_MS}` — enforced through Redis, holds across instances. Default 2000ms; we ran 150ms locally for fast tests |
| Hourly caps (global / per-sender / per-campaign) | Atomic Lua check-and-reserve keyed by `hourWindow × sender`; all values env/config-driven, zero hardcoding |
| Cap exceeded → don't drop, don't fail | Denied slot refunds its claim; job parks at the top of the next hour window (`moveToDelayed`), order preserved as much as possible |
| 1000+ emails at one timestamp | O(N) inserts + O(N) job adds; workers drain at `concurrency ÷ min-delay`; overflow slides into later windows — latency, not failure |
| Real Google OAuth | next-auth Google provider; header shows name · email · avatar · logout |

## Architecture

```
Next.js dashboard ──REST──▶ Express API ──INSERT──▶ Postgres (source of truth)
                                 │
                                 └──add delayed jobs──▶ Redis/BullMQ ◀──consume── Worker pool
                                                                            │
                                             claim → rate-limit reserve → SMTP (Ethereal)
                                                     └──guarded status updates──▶ Postgres
```

> **Postgres owns *what should happen*; Redis/BullMQ only owns *when/how it gets triggered*.**
> Every user-visible state (scheduled/sent lists) is read from Postgres. Redis can delay or strand a send — it can never duplicate or erase one.

API, worker, and web are separate processes on purpose: HTTP serving and job execution have different failure and scaling profiles.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness |
| POST | `/api/v1/campaigns` | Schedule a batch `{subject, body, leads[], startAt, delayMs, hourlyLimit}` → `201 {id, totalLeads, uniqueLeads, duplicatesRemoved}` |
| GET | `/api/v1/emails?status=scheduled\|sent\|failed&limit=` | Dashboard lists (`sent` includes FAILED rows with per-row status badges) |
| GET | `/api/v1/emails/:id` | Email detail incl. sender + SMTP message id |
| GET | `/api/v1/emails/stats` | Header counters: scheduled / sent / failed |
| GET | `/api/v1/senders` | Active sender identities |

## The core design decision: at-most-once

The assignment's hard constraint is *"same email shall not be sent more than once."* Given the choice between delivery guarantees we deliberately picked **at-most-once**: a duplicate landing in a real lead's inbox is strictly worse than one send lost to a crash. So the system is built so that duplicates are **structurally impossible**, not just unlikely:

- Sending requires winning an atomic guarded transition — `UPDATE … SET status='SENDING' WHERE id=? AND status='QUEUED'`. Exactly one worker ever wins; every loser acks without sending.
- **Stop at failure:** a thrown SMTP send is a *confirmed rejection* — the server refused the message — so the row goes straight to terminal `FAILED(lastError)`. There are no send-retries anywhere, because retrying would either duplicate an ambiguous send or strand rows mid-state. We accepted transient-blip recoverability loss in exchange for a guarantee that can be stated in one sentence and held under crash, kill, and provider throttling (this exact hardening came out of live-fire testing against Ethereal 429s).
- Crash inside the claim→SMTP window may lose that one email honestly (`FAILED(interrupted)` via boot sweep or final-attempt recovery). It can never double-send.

Trade-off stated plainly: **at-most-once means a crash can sacrifice an email; it can never clone one.** For cold outreach that is the correct side of the trade.

### How it stays correct

- **Exactly-once claim guard** — above; regression-tested by racing processors against the same row.
- **Hourly caps** — Lua script does atomic check-and-reserve on `ratelimit:{sender}:{epochHour}` (TTL'd); effective threshold = `min(env global, env per-sender, campaign.hourly_limit)`. Denial ⇒ revert claim (refund the attempt) ⇒ `moveToDelayed(next window top)` ⇒ order kept approximately, FIFO within the delayed set.
- **Restart resilience** — delayed jobs persist in Redis AOF (`appendfsync everysec`); deterministic `send-{emailId}` ids make re-enqueues idempotent; any row still `SENDING` at worker boot gets an honest `FAILED(interrupted)` instead of limbo.
- Proven live: 20/20 batch with distinct `message_id`s at attempts=1; cap=5/sender turned 20 leads into exactly 10 sent + 10 deferred to HH:00; queued mail survived a full worker stop across the hour boundary and drained exactly once after restart.

## Redis crash behavior

| Redis event | Queued emails | Why |
|---|---|---|
| Crash + normal restart | **Safe** — replayed from AOF (`appendfsync everysec`), fire at their scheduled moment | Delayed-job entries are persisted writes; worst case loses the final ~1s before the crash |
| Crash inside a send window | **Never re-sent** (claim guard blocks redelivery); bounded stray → `FAILED(interrupted)` at next worker boot | Milliseconds-wide window; at-most-once is structural |
| Partial AOF corruption/truncation | Untested middle ground — behavior depends on redis-server's refuse-vs-truncate settings for a corrupt tail | Acknowledged gap, not built for (see DESIGN.md §8.3) |
| Volume wiped (no AOF to replay) | Jobs gone; rows stay `QUEUED` in Postgres | Requires reconciliation — see limitations below |

## Quickstart

Prereqs: Node ≥20 · pnpm 10 · Docker

```bash
cp .env.example .env          # then fill ETHEREAL_ACCOUNTS + AUTH_GOOGLE_* (see below)

docker compose up -d --build  # postgres + redis (AOF) + api + worker
pnpm install
pnpm --filter @assign/db db:migrate   # create schema
pnpm --filter @assign/db db:seed      # register senders from ETHEREAL_ACCOUNTS

pnpm --filter web dev         # dashboard on http://localhost:3000
```

**Ethereal accounts:** create manually at [ethereal.email](https://ethereal.email) (2+ accounts recommended so per-sender limits are visible), then list them in `.env` as `ETHEREAL_ACCOUNTS=email:pass,email2:pass2`.

**Google OAuth:** Google Cloud console → OAuth client (Web) with redirect URI `http://localhost:3000/api/auth/callback/google` → put client id/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, any random string into `AUTH_SECRET`.

## Environment variables

All defaults live in `.env.example` / `docker-compose.yml`:

| Var | Purpose |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | Postgres + Redis connections |
| `SMTP_HOST`, `SMTP_PORT` | Ethereal endpoints (587) |
| `ETHEREAL_ACCOUNTS` | `email:pass` pairs, comma separated — becomes sender identities |
| `WORKER_CONCURRENCY` | Parallel jobs per worker (5 default) |
| `MIN_DELAY_MS` | Minimum gap between ANY two sends, cluster-wide (2000ms default) |
| `MAX_EMAILS_PER_HOUR` | Global hourly ceiling (200 default) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly ceiling (50 default) |
| `campaign.hourly_limit` | Per-campaign cap — lowers lane thresholds via `min()` |
| `AUTH_GOOGLE_ID/SECRET`, `AUTH_SECRET` | OAuth + session signing |
| `NEXT_PUBLIC_API_URL`, `WEB_URL` | Web↔API wiring |

## Frontend

Figma-faithful dashboard: login card → sidebar (avatar, name, email, logout menu, live counts) → Scheduled/Sent tabs with loading skeletons, empty states, and per-row status pills (amber clock = scheduled, gray Sent / red Failed) → full-page compose with recipient chips, CSV/TXT upload (client-side parse + dedupe + "N detected"), subject/body editor, delay (sec) + hourly limit fields, Send-Later presets & custom datetime → email detail view with sender, timestamps, and SMTP `message_id`.

## Testing

```bash
pnpm -r test    # 29 automated cases: claim-guard races, limiter atomicity,
                # stop-at-failure semantics, schema validation, CSV parser
```

Manual E2E fixture: `scripts/demo-leads.csv`.

## Known limitations & trade-offs

- **Total Redis data loss requires reconciliation.** `POST /admin/reconcile` was designed for exactly this — re-enqueue every `QUEUED` row idempotently via deterministic `send-{emailId}` ids (DESIGN.md §8.3) — but is not implemented under deadline scope. Until then, any manual re-enqueue **must** reuse those deterministic ids; ad-hoc insertion is the only path that could break never-duplicate.
- Attachments are a UI placeholder; bodies ship as plain text (explicit assignment non-goals).
- Auth is owned by the web layer: API routes trust CORS/loopback origins instead of verifying their own JWTs (deliberate deviation, documented in DESIGN.md §7).
- Ethereal rate-limits ~130+ rapid sends per account per hour (external to our limiter); confirmed rejections become honest terminal `FAILED` rows.
- Ordering across hour windows is approximate — correctness (exactly-once, no drops) dominates strict FIFO.

Full design rationale (SRP module map, flows, trade-offs): **DESIGN.md**.

## Repo map

```
apps/api       Express HTTP — validate, persist, fan out jobs
apps/worker    BullMQ processor — claim → rate-limit → send → record
apps/web       Next.js dashboard — OAuth, compose, scheduled/sent views
packages/shared  zod schemas, job contract, lead parser
packages/db    Prisma schema + client singleton
DESIGN.md      design doc: architecture, flows, decisions
```
