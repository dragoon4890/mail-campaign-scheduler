# ReachInbox Email Job Scheduler

<!-- One-liner: production-grade email scheduling at scale — Next.js dashboard → Express API → Postgres (source of truth) → BullMQ/Redis delayed jobs → worker pool → Ethereal SMTP. Built for the ReachInbox 48h hiring assignment. -->

## Demo

<!-- Link the ≤5-min video here: [watch](...) -->

## What it does

<!-- Requirement checklist vs what shipped. Pull from assignment brief + DESIGN.md §1. Cover at minimum:
- Schedule emails at future times (no cron — BullMQ delayed jobs only)
- Survive restarts with zero re-sends / zero duplicates
- Throughput controls: worker concurrency, min delay between sends, hourly caps global + per-sender, all env-configurable
- 1000+ emails at one timestamp queue cleanly; overflow rolls into the next hour window
- Real Google OAuth login
-->

## Architecture

<!-- Diagram + 3-sentence summary. Reuse DESIGN.md §3 mermaid flowchart.
Mention api / worker / web are separate processes (independent scaling, crash isolation).
-->

> **Postgres owns *what should happen*; Redis/BullMQ only owns *when/how it gets triggered*.**
> Every user-visible state (scheduled/sent lists) is read from Postgres; Redis can delay or strand a send, but never duplicate or erase one.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness |
| POST | `/api/v1/campaigns` | Schedule a batch: `{subject, body, leads[], startAt, delayMs, hourlyLimit}` → `201 {id, totalLeads, uniqueLeads, duplicatesRemoved}` |
| GET | `/api/v1/emails?status=scheduled\|sent\|failed&limit=` | Dashboard lists (`sent` includes FAILED rows with per-row status) |
| GET | `/api/v1/emails/:id` | Single email detail incl. sender + message id |
| GET | `/api/v1/emails/stats` | Header counters: scheduled / sent / failed |
| GET | `/api/v1/senders` | Active SMTP sender identities |

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

<!-- Add 2 lines: how to get Ethereal accounts (create manually at ethereal.email) and Google OAuth credentials (Cloud console → OAuth client, redirect http://localhost:3000/api/auth/callback/google). -->

## Environment variables

<!-- Table or bullet list mirroring .env.example: DATABASE_URL, REDIS_URL, SMTP_HOST/PORT, ETHEREAL_ACCOUNTS, WORKER_CONCURRENCY, MIN_DELAY_MS, MAX_EMAILS_PER_HOUR, MAX_EMAILS_PER_HOUR_PER_SENDER, AUTH_GOOGLE_ID/SECRET, AUTH_SECRET, NEXT_PUBLIC_API_URL, WEB_URL/API_PORT. Note defaults live in docker-compose.yml. -->

## How it stays correct

<!-- The section reviewers will actually read — pull from DESIGN.md §8–9 and HANDOFF "Decisions locked":
- Exactly-once sends: atomic QUEUED→SENDING claim guard; duplicates structurally impossible
- Stop at failure: confirmed SMTP rejection = terminal FAILED; no send-retries anywhere; crash-window strays get honest FAILED(interrupted) via boot recovery
- Hourly caps: atomic Lua check-and-reserve per sender×hour; denial refunds the claim and parks the job at the next window top (never dropped)
- Restart resilience: Redis AOF + deterministic job ids + boot sweep
Live-proof numbers you can cite: 20/20 batch unique message_ids attempts=1; cap=5/sender → exactly 10 sent + overflow deferred to HH:00; cross-window rollover verified.
-->

## Testing

```bash
pnpm -r test    # 29 automated cases: claim-guard races, limiter atomicity,
                # stop-at-failure semantics, schema validation, CSV parser
```

<!-- Optional: one line on manual E2E (scripts/demo-leads.csv fixture). -->

## Known limitations & trade-offs

<!-- From DESIGN.md §14 + HANDOFF:
- Attachments are UI placeholder; body is plain text (explicit non-goals)
- Auth owned by web layer: API routes trust CORS/loopback instead of verifying JWTs (documented deviation, DESIGN.md §7 note)
- No campaign cancel endpoint, no reconcile endpoint (designed, deferred)
- Ethereal rate-limits ~130+ rapid sends/account/hour externally; those become honest FAILED rows
- Cross-window ordering approximate (correctness dominates FIFO)
-->

- **Total Redis data loss requires reconciliation.** `POST /admin/reconcile` was designed for exactly this — re-enqueue every `QUEUED` row idempotently via the deterministic `send-{emailId}` job ids (DESIGN.md §8.3) — but is not implemented under deadline scope. Until it exists, any manual re-enqueue **must** reuse those deterministic ids; ad-hoc insertion is the one path that could break never-duplicate.
- Attachments are a UI placeholder; bodies ship as plain text (explicit assignment non-goals).
- Auth is owned by the web layer: API routes trust CORS/loopback origins instead of verifying their own JWTs (deliberate deviation, documented in DESIGN.md §7).
- Ethereal rate-limits ~130+ rapid sends per account per hour (external to our limiter); confirmed rejections become honest terminal `FAILED` rows.
- Ordering across hour windows is approximate — correctness (exactly-once, no drops) dominates strict FIFO.

## Repo map

```
apps/api       Express HTTP — validate, persist, fan out jobs
apps/worker    BullMQ processor — claim → rate-limit → send → record
apps/web       Next.js dashboard — OAuth, compose, scheduled/sent views
packages/shared  zod schemas, job contract, lead parser
packages/db    Prisma schema + client singleton
DESIGN.md      full design doc (untracked working doc)
```
