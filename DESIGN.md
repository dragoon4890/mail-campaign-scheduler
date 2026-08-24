# Design Doc — ReachInbox Email Job Scheduler

Full-stack email scheduler: API + persistent delayed-job queue + worker pool + dashboard.
Design principle throughout: **Single Responsibility Principle (SRP)** — every module owns exactly one concern, and every cross-cutting concern (rate limiting, sending, persistence) lives behind one interface.

---

## 1. Goals & Constraints

| Goal | Constraint |
|---|---|
| Schedule emails at a future time | **No cron** (no OS cron, no node-cron/agenda). BullMQ delayed jobs only |
| Survive restarts | Jobs persist in Redis (AOF) + Postgres is source of truth; no re-sends after restart |
| Idempotent sends | Same email never sent twice, even with retries/duplicate enqueues/multiple workers |
| Throughput controls | Worker concurrency, min delay between sends, hourly cap (global + per-sender), all env-configurable |
| Under-load behavior | 1000+ emails at same timestamp: queued, spaced out, overflow rolls into next hour window, order preserved as much as possible |
| Real Google OAuth login | No mock auth |
| Deadline: 48h | Prefer boring, well-documented choices over clever ones |

**Non-goals:** real SMTP deliverability, multi-tenancy beyond users, attachments, open/click tracking.

---

## 2. Tech Stack (decisions)

| Layer | Choice | Rationale |
|---|---|---|
| Backend runtime | Node 20 + TypeScript | Required |
| HTTP framework | Express.js | Required |
| Queue | BullMQ + ioredis | Required; native delayed jobs, rate limiter, stalled-job recovery |
| Database | PostgreSQL + Prisma | Typed schema + migrations fast to build under deadline (MySQL swap-in is trivial) |
| SMTP | Nodemailer → Ethereal Email | Required fake SMTP |
| Frontend | Next.js (App Router) + Tailwind + TS | Required/preferred; `next-auth` gives real Google OAuth quickly |
| Infra | docker-compose (redis + postgres) | Reproducible local dev |

Monorepo layout:

```
Assign/
├── docker-compose.yml          # redis + postgres only
├── apps/
│   ├── api/                    # Express HTTP server  ── own process
│   ├── worker/                 # BullMQ worker        ── separate process (independent scaling, crash isolation)
│   └── web/                    # Next.js dashboard    ── separate process
├── packages/
│   ├── shared/                 # shared types (Email DTOs, enums), zod schemas, constants
│   └── db/                     # prisma schema + client singleton (only place touching DB driver)
└── README.md
```

API and Worker are **separate processes** deliberately: HTTP serving and job execution are different responsibilities with different failure/scaling profiles.

---

## 3. Architecture Overview

```mermaid
flowchart LR
    subgraph Client
        W[Next.js Dashboard]
    end
    subgraph api[API process]
        R[Routes] --> V[zod validation] --> S[Scheduler Service]
        Q[Query Service] --> R
    end
    subgraph data[(State)]
        PG[(Postgres<br/>source of truth)]
        RD[(Redis<br/>queues + rate counters<br/>AOF enabled)]
    end
    subgraph wk[Worker process]
        P[BullMQ Processor] --> RL[Rate Limiter]
        P --> SM[SMTP Adapter<br/>Ethereal]
        P --> ST[Status Updater]
    end
    W -->|REST + session JWT| api
    S -->|insert rows| PG
    S -->|add delayed jobs| RD
    P -->|reserve job| RD
    RL -->|INCR/Lua| RD
    ST -->|guarded UPDATE| PG
    Q --> PG
```

**Core rule:** Postgres owns *what should happen*; Redis/BullMQ owns *when/how it gets triggered*. Any state visible to the user (scheduled/sent lists) is read from Postgres only.

---

## 4. SRP Module Decomposition

### 4.1 Backend (`apps/api`, `apps/worker`, `packages/*`)

Each module below has **exactly one reason to change**.

| Module (file) | Single Responsibility | Must NOT do |
|---|---|---|
| `packages/shared` | Types, zod schemas, constants shared by api/worker/web | Any I/O |
| `packages/db/client.ts` | Export Prisma singleton | Business logic |
| `apps/api/src/config.ts` | Load + validate env vars (zod), export typed config | Defaults buried elsewhere |
| `api/middleware/auth.ts` | Verify Google ID token / session JWT, attach `req.user` | User lookup beyond identity |
| `api/routes/campaigns.ts` | HTTP shape only: parse → validate → call service → map errors to status codes | Enqueue logic, DB writes inline |
| `api/services/campaignService.ts` | Persist Campaign + N Email rows in **one transaction**, return batch result | Talk to Redis/queue |
| `api/services/schedulerService.ts` | Turn persisted Email rows into BullMQ delayed jobs (deterministic IDs) | DB writes, sending |
| `api/services/queryService.ts` | Read models for dashboard (scheduled/sent lists, pagination, counts) | Mutations |
| `worker/queue.ts` | Create BullMQ `Queue` + `Worker` instances with concurrency/limiter options | Know about email semantics |
| `worker/processor/sendEmail.ts` | Orchestrate ONE job: guard → reserve rate slot → send → record outcome. Delegates everything else | Own transport or Redis details |
| `worker/services/rateLimiter.ts` | Atomic Redis slot reservation per `hourWindow × sender`; report `retryAfterMs` | Send, retry policy |
| `worker/services/smtpTransport.ts` | Nodemailer transport pool (one Ethereal account per sender), `send()` | Retry decisions |
| `worker/services/statusUpdater.ts` | Guarded status transitions on Email rows (`UPDATE … WHERE status = expected`) | Anything else |

### 4.2 Frontend (`apps/web`)

| Module | Single Responsibility |
|---|---|
| `lib/auth.ts` | next-auth config (Google provider), session helpers |
| `lib/apiClient.ts` | One typed `fetch` wrapper: base URL, session header, error normalization |
| `hooks/useScheduledEmails.ts` / `useSentEmails.ts` | Data fetching + polling state per tab |
| `features/compose/CsvParser.ts` | Pure function: file text → `{ valid[], invalid[] }`. Testable in isolation |
| `features/compose/ComposeModal.tsx` | Form state + submit; renders UI primitives |
| `components/ui/{Button,Input,Modal,Table,Badge,Spinner,EmptyState,Toast}.tsx` | Dumb presentation primitives |
| `app/(dashboard)/page.tsx` | Layout + tabs only |

---

## 5. Data Model (Postgres)

```sql
CREATE TYPE email_status AS ENUM ('PENDING','QUEUED','SENDING','SENT','FAILED');
CREATE TYPE campaign_status AS ENUM ('ACTIVE','COMPLETED','CANCELLED');

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub   TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT UNIQUE NOT NULL,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ethereal accounts; seeded from env (comma-separated creds) at startup
CREATE TABLE senders (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  smtp_user     TEXT NOT NULL,
  smtp_pass     TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  start_at      TIMESTAMPTZ NOT NULL,
  delay_ms      INT  NOT NULL,          -- requested gap between emails
  hourly_limit  INT  NOT NULL,          -- requested cap for this campaign
  total_count   INT  NOT NULL,
  status        campaign_status NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emails (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id),
  sender_id      INT  NOT NULL REFERENCES senders(id),
  to_email       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         email_status NOT NULL DEFAULT 'PENDING',
  scheduled_at   TIMESTAMPTZ NOT NULL,   -- desired send time
  sent_at        TIMESTAMPTZ,
  message_id     TEXT,                   -- from SMTP response (audit/idempotency evidence)
  attempts       INT NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, to_email)         -- hard idempotency floor at schema level
);
CREATE INDEX idx_emails_status_time ON emails (status, scheduled_at);
CREATE INDEX idx_emails_campaign ON emails (campaign_id);
```

Notes:
- `emails.status` is the **state machine**: `PENDING → QUEUED → SENDING → SENT | FAILED`.
- Sender assignment: round-robin across active senders at creation time (spread load; enables per-sender limits).
- `UNIQUE(campaign_id, to_email)` makes duplicate lead rows impossible even before queue-level dedupe.

---

## 6. Redis Usage

| Key | Purpose |
|---|---|
| BullMQ queue `email-send` | Delayed jobs (managed by BullMQ) |
| `ratelimit:{senderId}:{epochHour}` | Counter, `SET` NX EXPIRE 7200 + `INCR` inside Lua (atomic check-and-reserve) |
| `bull:email-send:stalled-check` etc. | BullMQ internals |

Queue options:

```ts
new Queue('email-send', {
  connection,
  limiter: { max: 1, duration: config.MIN_DELAY_MS }, // cluster-safe spacing between ANY two sends
  defaultJobOptions: {
    attempts: 3, // crash-window budget only: lets boot recovery / latecomer acks finalize interrupted sends. SMTP rejections never consume retries (see §8.2)
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: false,
  },
});
```

Rate-limit reservation script (atomicity across N worker instances):

```lua
-- KEYS[1]=ratelimit:{sender}:{hour}  ARGV[1]=limit
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then return -1 end
local v = redis.call('INCR', KEYS[1])
if v == 1 then redis.call('EXPIRE', KEYS[1], 7200) end
return v
```

Effective hourly cap per email = `min(env.MAX_EMAILS_PER_HOUR_GLOBAL, env.MAX_EMAILS_PER_HOUR_PER_SENDER, campaign.hourly_limit)`.

**Per-campaign metering decision (final):** the campaign value only *lowers the lane threshold* through this `min()` — no separate `ratelimit:campaign:{id}` counter key. Strict per-campaign ceilings were considered and declined (extra key complexity without assignment need).

---

## 7. API Contract (`/api/v1`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/auth/google` | Body: Google ID token → verify signature (Google JWKS) → upsert user → issue app JWT cookie | public |
| GET | `/me` | Current user profile (header display) | JWT |
| POST | `/auth/logout` | Clear cookie | JWT |
| POST | `/campaigns` | Schedule batch. Body: `{subject, body, leads: string[], startAt, delayMs, hourlyLimit}` → validates, persists, fans out delayed jobs → 201 `{id, totalLeads, uniqueLeads, duplicatesRemoved, startAt}` · `503 queue_unavailable` (+campaignId) if persisted but enqueue failed · `503 no_senders_configured` | JWT |
| GET | `/campaigns/:id` | Batch detail | JWT |
| DELETE | `/campaigns/:id` | Cancel still-pending jobs (remove from queue + mark CANCELLED) — **deferred to frontend milestone** (needs UI cancel affordance from Figma) | JWT |
| GET | `/emails?status=scheduled\|sent&cursor=&limit=` | Paginated lists for tabs | JWT |
| GET | `/stats` | Header counters (scheduled today, sent today, failed) | JWT |
| GET | `/healthz`, `/readyz` | Liveness / redis+db readiness | public |

Validation: zod schemas in `packages/shared` reused by both API routes and the frontend forms.

**Auth deviation (as shipped):** OAuth is owned end-to-end by the Next.js layer via next-auth (Google provider, session cookies). The API ships **without** its own JWT middleware — routes are unguarded HTTP, reachable only on loopback/CORS-allowlisted `WEB_URL` origins. §14.1's split-API design remains the target shape if programmatic clients ever materialize; under the 48h deadline the single-owner flow was the boring choice.

---

## 8. Core Flows

### 8.1 Schedule (POST /campaigns)

```mermaid
sequenceDiagram
    participant U as UI
    participant A as API
    participant DB as Postgres
    participant Q as Redis/BullMQ

    U->>A: POST /campaigns (leads parsed from CSV client-side)
    A->>A: zod validate, dedupe leads, round-robin assign senders
    A->>DB: BEGIN; INSERT campaign; INSERT N emails (PENDING); COMMIT
    A->>Q: add(jobId="send-{emailId}", delay=scheduledAt-now, opts)
    A-->>U: 201 {id, totalLeads, uniqueLeads, duplicatesRemoved, startAt}
    Note over A,Q: Jobs already past due get delay=0; BullMQ dedupes identical jobIds
```

### 8.2 Send (worker, per job)

```mermaid
flowchart TD
    J[Job picked up, concurrency=C] --> G{Email row status == QUEUED?}
    G -- no, SENDING + final attempt --> INT[FAILED: send interrupted by crash<br/>at-most-once: never re-send]
    G -- no, other terminal --> DONE[already handled elsewhere -> ack, no send]
    G --> CAS[claim: UPDATE SET status=SENDING WHERE id=? AND status=QUEUED]
    CAS -- 1 row --> RL{Lua reserve slot<br/>sender × hour}
    RL -- granted --> SM[smtpTransport.send]
    SM -- ok --> UPD[statusUpdater: SENT + sent_at + message_id] --> ACK
    SM -- fail --> FAIL[FAILED: confirmed rejection, terminal<br/>no send-retries anywhere] --> ACK
    RL -- denied --> REV[revert row SENDING -> QUEUED] --> MOVE[job.moveToDelayed nextHourStart + jitter] --> ACK
```

Key properties:
- **At-most-once sends**: duplicates are structurally impossible — sending requires winning the guarded `QUEUED → SENDING` claim, and only one worker ever does. A crash inside the claim→SMTP window may lose that email (marked FAILED as interrupted on retry); it can never double-send. This satisfies the assignment's hard constraint ("same email shall not be sent more than once").
- **Stop at failure (final decision):** a thrown send is a *confirmed* rejection — the server refused the message — so the row goes straight to `FAILED(lastError)` and BullMQ acks. No send-retries: retrying would either duplicate an ambiguous send or strand rows in SENDING (the original rethrow-on-stale-attempt-count path did exactly that under Ethereal 429s; fixed + regression-tested). `attempts: 3` survives purely as crash-window sweep budget. Strays are acceptable; honesty of state is not.
- **Rate-limit denial never fails a job**: the row is first reverted to QUEUED (state truth: SENDING must mean an SMTP attempt is in flight), then `moveToDelayed(next window start)` keeps the job alive, preserves relative order (FIFO within delayed set by score), and satisfies "delay into next available hour."
- **Per-campaign cap via threshold lowering** (decided): `campaign.hourly_limit` lowers the effective lane threshold through the same `min()` — no separate per-campaign counter key.
- **Min delay between sends**: queue-level `limiter {max:1, duration:MIN_DELAY_MS}` is enforced through Redis, so it holds across multiple worker instances.

### 8.3 Restart resilience

```mermaid
timeline
    title Crash at T, restart at T+5m
    Section Before crash
        Redis AOF has delayed jobs : Postgres rows are QUEUED
    Section Restart
        API boots : no rebuild needed (stateless)
        Worker boots : BullMQ resumes delayed + retries stalled SENDING jobs
    Section Outcome
        Future jobs fire at original times : claimed-once guarantee prevents any resend
```

Worst case (Redis volume wiped while DB says QUEUED): a **manual reconcile endpoint** `POST /admin/reconcile` re-enqueues every `QUEUED` email whose `scheduled_at` is in range — idempotent because jobIds are deterministic. This is operator-triggered, not cron.

Between those endpoints sits **partial AOF corruption/truncation** (disk fills mid-write; a corrupt AOF tail can make redis-server refuse to boot or truncate-and-continue depending on preamble/truncate configuration). Acknowledged as an untested middle ground — documented gap, deliberately not built for under deadline scope.

---

## 9. Concurrency & Rate Limiting Summary (README-facing)

| Control | Mechanism | Configurable via |
|---|---|---|
| Worker concurrency | `new Worker(…, { concurrency })` | `WORKER_CONCURRENCY` (default 5) |
| Min gap between sends | Queue limiter `{max:1, duration:X}` — Redis-coordinated, global across instances | `MIN_DELAY_MS` (default 2000) |
| Hourly cap, global | Lua counter `ratelimit:global:{epochHour}` | `MAX_EMAILS_PER_HOUR` (default 200) |
| Hourly cap, per sender | Lua counter `ratelimit:{senderId}:{epochHour}` | `MAX_EMAILS_PER_HOUR_PER_SENDER` (default 50) |
| Per-campaign cap | Effective limit computed at reserve time | `campaigns.hourly_limit` column |
| Overflow behavior | `job.moveToDelayed(nextHourStart)` — not dropped, not failed | — |

**Under load (1000 emails @ same timestamp):** enqueue fan-out is O(N) inserts + O(N) job adds (batched). Workers drain at `concurrency / MIN_DELAY_MS` ≈ 1800/hour with defaults; the first 200 go out this hour, the rest slide into subsequent windows keeping submission order (delayed-set scores). No data loss, no failures — just latency. This is intentional provider-throttling semantics.

Trade-off note: strict global FIFO across windows is approximate (per-sender lanes interleave); acceptable because correctness (exactly-once, no drops) dominates ordering here.

---

## 10. Environment Variables

```env
# shared
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reachinbox
REDIS_URL=redis://localhost:6379
AUTH_GOOGLE_ID=xxx.apps.googleusercontent.com   # next-auth Google provider
AUTH_GOOGLE_SECRET=xxx
AUTH_SECRET=xxx                                  # next-auth session signing
PORT=4000
WEB_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000

# scheduling
WORKER_CONCURRENCY=5
MIN_DELAY_MS=2000
MAX_EMAILS_PER_HOUR=200
MAX_EMAILS_PER_HOUR_PER_SENDER=50

# ethereal senders: user:pass pairs, comma separated (accounts created manually at ethereal.email)
ETHEREAL_ACCOUNTS=testuser1:pass1,testuser2:pass2
```

`config.ts` parses/validates all of this once with zod and exports an immutable object — no other module reads `process.env`.

---

## 11. Frontend Plan (Figma-driven)

- **Login page**: Google button → `signIn('google')` (next-auth) → redirect `/`.
- **Header**: avatar + name + email + Logout (from `useSession()`), plus stat chips from `/stats`.
- **Tabs**: Scheduled | Sent. Shared `<EmailTable>` primitive (columns differ via props) + `<Spinner>` + `<EmptyState>` + error toast on fetch failure. Poll every 15s while tab visible.
- **Compose modal**: subject/body inputs; CSV/TXT dropzone → client-side parse → show “N addresses detected” chip (+ ignored-invalid count); datetime-local start, delay input (seconds), hourly limit input; Schedule → POST → success toast + switch to Scheduled tab.
- All responses typed via `packages/shared` types; no `any`.

---

## 12. Build Plan (independence-first)

Independent tracks run in parallel; each phase leaves the repo green (`tsc` + lint pass).

```mermaid
flowchart TD
    P0["Phase 0 · Foundations (all independent)<br/>monorepo scaffold · docker-compose(redis+pg) · config module<br/>prisma schema+migrate · ethereal:create script · web scaffold(tailwind+auth shell)"]
    P1A["Track A: SMTP adapter + send-smoke script"]
    P1B["Track B: queue bootstrap + dummy job roundtrip"]
    P1C["Track C: auth middleware (JWKS verify) + /me"]
    P1D["Track D: web UI kit + static dashboard shell per Figma"]
    P2A["Phase 2a: campaignService + POST /campaigns + lists API"]
    P2B["Phase 2b: wire Compose modal + tables to real APIs"]
    P3["Phase 3: worker pipeline (claim → ratelimit → send → status)"]
    P4["Phase 4: resilience tests (kill -9, 1k-job load)"]
    P5["Phase 5: README, demo video, submit"]

    P0 --> P1A & P1B & P1C & P1D
    P1B --> P2A
    P1C --> P2A
    P1A --> P3
    P2A --> P2B & P3
    P3 --> P4 --> P5
```

Checklist per phase (annotated with actual build order — user-directed slow cadence sequenced backend-first; web/auth tracks deferred):

- [x] **P0** docker-compose healthy (postgres+redis, AOF on); prisma migrate clean; api boots. *(deviation: ethereal accounts created manually on website instead of script, per user decision; web scaffold deferred to frontend milestone)*
- [x] **P1A** SMTP adapter — pooled Nodemailer transport per sender, landed with worker milestone.
- [x] **P1B** queue bootstrap: `email-send` queue + delayed fan-out verified live (5 jobs durable). Worker consumption follows next.
- [x] **P1C** auth — *shipped as deviation*: next-auth owns the Google OAuth flow web-side; API routes stay unguarded behind CORS (see §7 note). Campaigns attach to the session user.
- [x] **P1D** web UI kit + static dashboard shell per Figma (rebuilt from screenshots after Figma export was blocked).
- [x] **P2a** campaignService + POST /campaigns persistence; dashboard read endpoints (`/emails` list/detail/stats, `/senders`) shipped with frontend milestone.
- [x] **P2b/P3** emails land in Ethereal respecting delay + caps; Sent tab populates; duplicate job does **not** double-send. Live-proven: 20/20 batch with unique message_ids; cap=5/sender defers overflow to next window; forced redelivery acks without re-sending.
- [x] **P4** resilience checks: SIGKILL mid-batch → restart → boot sweep finalizes strays, zero dupes; 200-mail load drains cleanly; hourly-limit overflow arrives next hour. Stop-at-failure semantics added + regression tests (10 worker cases).
- [x] **P5** README mirrors sections 8–9 above; ≤5-min demo video recorded. *(final repo push + submission form at submit time)*

---

## 13. Testing Strategy

| Level | What | How |
|---|---|---|
| Unit | CsvParser (shared `parseLeadsCsv`: extraction, dedupe, invalid-count, CRLF), campaign-input zod schemas | vitest |
| Integration | claim-guard races + stop-at-failure semantics (10 cases on isolated `_test` db / redis db 15) | vitest |
| E2E manual | Restart scenario, load scenario, cap overflow | Scripted + captured in demo video |

The claim-guard test is the one that matters most — it proves the idempotency contract. 30 automated cases total (`pnpm -r test`).

---

## 14. Assumptions & Trade-offs

1. **Auth split**: frontend performs OAuth dance (next-auth); backend verifies the ID token and issues its own short-lived JWT. Keeps API free of OAuth-flow responsibility (SRP) and works for programmatic clients too.
2. **Per-email jobs** (vs one job per campaign): finer-grained retry/rate-limit/ordering; 10k jobs is comfortably within BullMQ norms.
3. **Ordering across windows is approximate** — exact-once delivery prioritized over strict FIFO.
4. **Reconcile endpoint instead of auto-healing daemon** — avoids sneaking cron-like loops back in; document as operator tool.
5. **CSV parsing client-side** — matches Figma UX (“N detected” instantly), server still re-validates every address.
6. **Prisma over raw SQL** — migration speed under 48h deadline; queries used are simple enough that swapping ORMs later is cheap.
7. **Stop at confirmed SMTP failure** — no send-retries anywhere. A thrown send is a refused message, so `FAILED` is terminal; crash-window strays get honest `FAILED(interrupted)` states from boot recovery instead of limbo. Trades transient-blip recoverability for structural at-most-once and truthful state (user decision, 2026-08-24).
8. **Auth owned by the web layer** — next-auth handles OAuth + sessions; API trusts CORS/loopback instead of verifying its own JWTs (see §7). Documented deviation from §14.1's original split.
