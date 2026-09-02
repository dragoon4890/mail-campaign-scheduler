# ReachInbox Email Job Scheduler

Pick exact future send times for batches of leads, deliver them through Ethereal SMTP, survive restarts without losing or repeating anything, and watch it all from a Next.js dashboard.

## What it does

| Requirement | Shipped |
|---|---|
| Schedule emails via API for a future time | `POST /api/v1/campaigns` writes Postgres rows and fans out BullMQ delayed jobs. No cron anywhere |
| Multiple senders over Ethereal SMTP | Senders seeded from env, round-robin lanes assigned at insert time |
| Survive restarts, lose nothing, resend nothing | Redis AOF replay + deterministic job ids + boot sweep. A worker stop/start across an hour boundary was part of final testing; queued mail drained exactly once |
| Same email never sent more than once | **At-most-once by construction.** See [why nothing ever sends twice](#why-nothing-ever-sends-twice) |
| Worker concurrency | `WORKER_CONCURRENCY` env, safe in parallel because sending requires winning a guarded claim |
| Min delay between sends | Queue limiter `{max: 1, duration: MIN_DELAY_MS}`, backed by Redis so it holds across instances. Default 2000ms; local runs used 150ms for speed |
| Hourly caps (global / per-sender / per-campaign) | Atomic Lua check-and-reserve keyed by `hourWindow × sender`. Every threshold comes from env or the campaign row; nothing hardcoded |
| Cap exceeded → don't drop, don't fail | Denied slot refunds its claim and the job moves to the top of the next hour window. Order kept as much as the design allows |
| 1000+ emails at one timestamp | Inserts and job adds are O(N). Drain rate is concurrency ÷ min delay. Overflow slides into later windows; you wait longer, nothing fails |
| Real Google OAuth | next-auth Google provider. Header shows name, email, avatar photo, logout |

## Architecture

```
Next.js dashboard ──REST──▶ Express API ──INSERT──▶ Postgres (source of truth)
                                 │
                                 └──add delayed jobs──▶ Redis/BullMQ ◀──consume── Worker pool
                                                                            │
                                             claim → rate-limit reserve → SMTP (Ethereal)
                                                     └──guarded status updates──▶ Postgres
```

> Postgres owns what should happen. Redis/BullMQ only decides when it gets triggered. Everything the dashboard shows is read from Postgres. Redis can delay a send or strand one during a disaster, but it cannot duplicate or erase one.

API, worker, and web run as separate processes on purpose. HTTP serving and job execution fail differently and scale differently.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness |
| POST | `/api/v1/campaigns` | Schedule a batch `{subject, body, leads[], startAt, delayMs, hourlyLimit}` → `201 {id, totalLeads, uniqueLeads, duplicatesRemoved}` |
| GET | `/api/v1/emails?status=scheduled\|sent\|failed&limit=` | Dashboard lists (`sent` includes FAILED rows with their own badge) |
| GET | `/api/v1/emails/:id` | Email detail incl. sender + SMTP message id |
| GET | `/api/v1/emails/stats` | Header counters: scheduled / sent / failed |
| GET | `/api/v1/senders` | Active sender identities |

## Why nothing ever sends twice

This project draws one hard line: the same email must never go out more than once. That line picks the delivery guarantee.

An at-least-once system retries until success and will eventually deliver a duplicate. This project is at-most-once instead: an email goes out once or not at all. For cold outreach the trade is lopsided. One lost send costs you a lead; one duplicate burns them.

The usual defense for at-least-once is verification, which is why payments can afford retries. A bank runs on a ledger with idempotency keys, so when a duplicate charge slips through it gets detected during reconciliation and reversed before anyone notices the difference. Email has none of that leeway. The SMTP server accepts a message and forgets it; there is no delivery receipt to dedupe against and no ledger to ask whether a copy already landed. Here a retry cannot be verified, only hoped for — so the only safe move is to never need one.

Three mechanisms hold the line:

**Claim guard.** Sending starts with a guarded database transition, `UPDATE … SET status='SENDING' WHERE id=? AND status='QUEUED'`. Exactly one worker wins that race. Everyone else acks and walks away without sending.

**Stop at confirmed failure.** When SMTP throws, the server refused the message. That is terminal: the row becomes `FAILED` with the error recorded. The worker contains no send-retry logic at all. Retrying sounded safer on paper and broke in practice; when Ethereal began answering 429 during load tests, the original retry path left rows stuck mid-state permanently. Stopping at rejection fixed it and made the guarantee easy to state: every message was either accepted once or failed visibly.

**Orphaned sends get swept honest.** Between claiming a row and SMTP accepting the message, a server crash or a dropped connection can leave that row stranded in `SENDING` with its owner gone. On the next worker boot, a sweep finds every orphaned `SENDING` row and marks it `FAILED(interrupted)`. The status never updated because the process died mid-send — so the sweep closes the loop instead of pretending it never happened. That outcome hurts, but it is bounded, visible, and it can never come back as two copies.

So the cost, stated without spin: a crash can sacrifice an email. It can never clone one.

### Numbers from live runs on the final build

- 20 leads due together: 20 sent, 20 distinct `message_id`s, attempts=1 on every row.
- Campaign cap of 5 per sender against 20 leads: exactly 10 sent, 10 parked for the next hour window, zero failures.
- Worker stopped across that hour boundary, then restarted: parked mail flushed within seconds, still exactly once each.

## Redis crash behavior

| Redis event | Queued emails | Why |
|---|---|---|
| Crash + normal restart | Safe. Replayed from AOF (`appendfsync everysec`) and fire at their scheduled moment | Delayed-job entries are persisted writes; worst case loses the last ~1s before the crash |
| Crash inside a send window | Never re-sent, the claim guard blocks redelivery. Worst case a stray row sits SENDING until the next boot marks it `FAILED(interrupted)` | Milliseconds-wide window |
| Partial AOF corruption/truncation | Untested middle ground. Behavior depends on redis-server settings for a corrupt tail (refuse to boot vs truncate and continue) | Acknowledged gap, not built for (DESIGN.md §8.3) |
| Volume wiped, no AOF to replay | Jobs gone; rows stay `QUEUED` in Postgres forever | Needs reconciliation, see limitations |

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

**Ethereal accounts:** create them manually at [ethereal.email](https://ethereal.email). Use at least two so per-sender limits are visible, then list them in `.env` as `ETHEREAL_ACCOUNTS=email:pass,email2:pass2`.

**Google OAuth:** in Google Cloud console create an OAuth web client with redirect URI `http://localhost:3000/api/auth/callback/google`. Put the id and secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, any random string in `AUTH_SECRET`.

## Environment variables

Defaults live in `.env.example` and `docker-compose.yml`.

| Var | Purpose |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | Postgres + Redis connections |
| `SMTP_HOST`, `SMTP_PORT` | Ethereal endpoints |
| `ETHEREAL_ACCOUNTS` | `email:pass` pairs, comma separated; these become sender identities |
| `WORKER_CONCURRENCY` | Parallel jobs per worker (default 5) |
| `MIN_DELAY_MS` | Minimum gap between any two sends, cluster-wide (default 2000ms) |
| `MAX_EMAILS_PER_HOUR` | Global hourly ceiling (default 200) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly ceiling (default 50) |
| campaign `hourlyLimit` | Per-campaign cap; lowers lane thresholds through `min()` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` | OAuth + session signing |
| `NEXT_PUBLIC_API_URL`, `WEB_URL` | Web↔API wiring |

## Frontend

Figma-faithful dashboard. Login card first, then a sidebar with your avatar, name, email, a logout menu and live counters. Two tabs cover scheduled and sent mail, with loading skeletons, empty states, and status pills: amber clock while waiting, gray Sent, red Failed. Compose is a full page with recipient chips, CSV/TXT upload that parses and dedupes instantly (with an "N detected" count), a subject and body editor, delay in seconds, hourly limit, Send-Later presets and a custom datetime picker. Clicking any email opens a detail view with sender, timestamps, and the SMTP `message_id`.

## Testing

```bash
pnpm -r test    # 29 automated cases: claim-guard races, limiter atomicity,
                # stop-at-failure semantics, schema validation, CSV parser
```

Manual E2E fixture: `scripts/demo-leads.csv`.

## Known limitations and trade-offs

- Total Redis data loss needs reconciliation. `POST /admin/reconcile` was designed for exactly this case: re-enqueue every `QUEUED` row using the deterministic `send-{emailId}` ids (DESIGN.md §8.3). It is not yet built. Until it exists, any manual re-enqueue must reuse those ids. Ad-hoc insertion is the only path that could break the never-duplicate guarantee.
- Attachments are a UI placeholder and bodies ship as plain text. Both are out of scope for this project.
- Auth lives entirely in the web layer. API routes trust CORS/loopback origins rather than verifying their own JWTs. Documented in DESIGN.md §7.
- Ethereal throttles around 130 rapid sends per account per hour, external to our limiter. Confirmed rejections become visible `FAILED` rows.
- Ordering across hour windows is approximate. Correctness beat strict FIFO in every trade-off call.

Full design rationale (SRP module map, flows, decisions): **DESIGN.md**.

## Repo map

```
apps/api       Express HTTP — validate, persist, fan out jobs
apps/worker    BullMQ processor — claim → rate-limit → send → record
apps/web       Next.js dashboard — OAuth, compose, scheduled/sent views
packages/shared  zod schemas, job contract, lead parser
packages/db    Prisma schema + client singleton
DESIGN.md      design doc: architecture, flows, decisions
```
