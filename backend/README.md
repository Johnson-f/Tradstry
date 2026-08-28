# Tradstry Backend

Rust backend built with Actix-Web and async-graphql. All data lives in a single Postgres database, namespaced per environment by schema. Tradstry AI runs on TinyAgents with selectable Gemini or Perplexity generation, Voyage embeddings/reranking, and PostgreSQL hybrid retrieval.

## Stack

- **Runtime:** Rust (stable, edition 2024)
- **Web framework:** Actix-Web 4
- **API:** GraphQL (async-graphql) + WebSocket subscriptions
- **Database:** Postgres through SeaORM 2 — entity-first schema sync plus SeaORM migrations for PostgreSQL-only objects
- **Vector search:** pgvector `halfvec` + PostgreSQL full-text search
- **AI:** TinyAgents, Gemini or Perplexity model roles, Voyage embeddings (`voyage-3.5`) + reranker (`rerank-2.5`)
- **Auth:** Clerk (JWT validation via JWKS)
- **Media:** Cloudflare R2 (S3-compatible)
- **Cache:** Redis (optional — the server runs without it)
- **Brokerage:** SnapTrade, via the Go microservice in `../microservice/snaptrade-service`
- **Market data:** `finance-query` crate
- **Observability:** `tracing` + Sentry (self-hosted Bugsink in production)

SnapTrade webhooks enter Rust directly at `/webhooks/snaptrade`. Rust verifies
SnapTrade's signature and replay window, persists the normalized event before
acknowledging it, then performs targeted reconciliation from a retrying
database-backed worker. Rust calls Go only through authenticated gRPC on a
shared Unix socket.

## Architecture

This crate is a Cargo workspace producing two binaries plus a JS sidecar:

| Component | Path | Port | Role |
|---|---|---|---|
| `tradstry-backend` | `src/` | 7899 | The GraphQL API server and background workers |
| `mcp-server` | `mcp-server/` | 7900 | Streamable-HTTP MCP server (rmcp), Clerk-authed, reuses this crate as a library |
| `projector` | `projector/` | — | Bun sidecar spawned per call for Yjs CRDT ops (project, seed, compact, markdown) |

The projector is the only place Yjs updates are interpreted. Rust treats CRDT updates as opaque `Vec<u8>` end to end and only base64-encodes them at the GraphQL boundary — routing a Yjs update through any other `String` corrupts the document.

## Prerequisites

- Rust 1.85+ (install from [rustup.rs](https://rustup.rs/))
- [Bun](https://bun.sh) — required at runtime for the projector, not just to build
- Postgres 18 with `pgvector` and `pg_search` extensions. `make postgres` from the repo root builds and runs the right image (`devops/docker/postgres/Dockerfile`).
- A SnapTrade microservice sharing `SNAPTRADE_GRPC_SOCKET` (`make micro` from the repo root)
- API keys: Clerk, Gemini, Voyage, Cloudflare R2, SnapTrade

## Setup

```bash
cd backend
cp .env.example .env  # then fill in values
cargo build
```

### Agent model provider

Set `AGENT_MODEL_PROVIDER=gemini` with `GEMINI_API_KEY` and native Gemini model names, or set `AGENT_MODEL_PROVIDER=perplexity` with `PERPLEXITY_API_KEY` and Perplexity registry IDs such as `openai/gpt-5.4`. Only the selected provider key is read. Perplexity startup authenticates against `/v1/models` and stops if a configured primary or fallback ID is unavailable.

Tradstry sends only its own role-scoped function tools through Perplexity; Perplexity built-in search tools are disabled so external results cannot bypass agent evidence checks. Perplexity supports image context with a vision-capable registry model. Video context is rejected before the message is queued because the Agent API does not currently document direct video input. Gemini keeps the existing image and video path.

All Gemini and Perplexity requests pass through `service/agents/runtime/provider_contract`. Response and tool schemas use a portable subset: closed objects, declared properties, typed arrays, scalar types, enums, and size/range limits. Unions, references, bare objects, open maps, and empty enums are rejected locally before HTTP. Add structured outputs only through `runtime/schemas.rs`; provider adapters must not clean or rewrite schemas themselves.

Natural-language messages run through one durable `service/agents/turn` loop. The model can answer conversationally, call authenticated read tools, create approval-only action proposals, or delegate bounded work to an optional domain subagent. There is no phrase router, lane, supervisor, mandatory specialist, synthesis pass, or verifier pass. Typed client operations may still use the model-free direct path. Assistant/tool transcript items are stored in `agent_run_items`; evidence, action proposals, provider failures, and lifecycle events remain queryable in PostgreSQL and safe to resume after a worker restart.

User-visible model, tool, subagent, retry, and terminal activity is projected through `service/agents/activity`. The projector emits a stable allowlisted vocabulary and never exposes prompts, raw reasoning, tool payloads, provider artifacts, secrets, or internal database identifiers. Activity streams live through typed GraphQL entries, replays by event sequence after reconnect, and is linked to the completed assistant message through `agent_runs.output_message_id` for persistent chat history.

Provider failures are stored on the failed run with a stable `error_code` and a sanitized `run_failed` event. The event keeps provider, model, stage, role, HTTP status, provider code, retryability, retry delay, and schema name. It never stores prompts, request/response bodies, provider messages, raw payloads, or keys. Diagnose a run with:

```sql
SELECT r.error_code, e.payload_json
FROM agent_runs r
JOIN agent_run_events e ON e.run_id = r.id AND e.kind = 'run_failed'
WHERE r.id = $1;
```

The non-mutating provider/Voyage smoke is opt-in because it makes paid external calls:

```bash
cargo run --bin agent_live_smoke
```

### Environment Variables

```bash
# Database — Postgres holds canonical trading data and durable agent state.
POSTGRES_URL=postgres://user:pass@localhost:5432/postgres

# Environment schema selector. All tables are namespaced under a per-environment
# Postgres schema so dev and prod never collide in one database:
#   dev  -> schema tradstry_dev
#   prod -> schema tradstry_prod
# Leave unset to use the default `public` schema.
POSTGRES_DATABASE=dev

# Auth — Clerk
CLERK_SECRET_KEY=sk_live_...

# Market data — Polygon powers snapshots, charts, financials, news, and live prices.
POLYGON_API_KEY=

# Earnings call transcripts — Financial Modeling Prep.
FMP_API_KEY=

# AI model providers — only the selected provider key is required.
GEMINI_API_KEY=AI...
PERPLEXITY_API_KEY=pplx-...

# TinyAgents v2 runtime
AGENTS_V2_ENABLED=false
AGENT_MODEL_PROVIDER=gemini
AGENT_FAST_MODEL=
AGENT_REASONING_MODEL=
AGENT_VISION_MODEL=
AGENT_FAST_FALLBACK_MODEL=
AGENT_REASONING_FALLBACK_MODEL=
AGENT_VISION_FALLBACK_MODEL=
AGENT_WORKER_CONCURRENCY=2
AGENT_INDEX_WORKER_CONCURRENCY=2
AGENT_RUN_LEASE_SECONDS=120
AGENT_HEARTBEAT_SECONDS=15
AGENT_MAX_ACTIVE_RUNS_PER_USER=4
AGENT_PROVIDER_BURST=8
AGENT_PROVIDER_CALLS_PER_MINUTE=120
AGENT_PROVIDER_CIRCUIT_FAILURES=5
AGENT_PROVIDER_CIRCUIT_COOLDOWN_SECONDS=30

# Embeddings + reranking — Voyage
VOYAGE_API_KEY=pa-...
VOYAGE_EMBEDDING_MODEL=voyage-3.5     # optional, this is the default
VOYAGE_RERANKER_MODEL=rerank-2.5      # optional
VOYAGE_OUTPUT_DIMENSION=2048          # optional
VOYAGE_RPM=2000                       # optional, raise with your account tier
VOYAGE_TPM=8000000                    # optional

# Media — Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Brokerage — SnapTrade via the private Go gRPC adapter
SNAPTRADE_GRPC_SOCKET=/tmp/tradstry-snaptrade.sock
SNAPTRADE_INTERNAL_SECRET=                   # same private HMAC key as the Go adapter
SNAPTRADE_CONSUMER_KEY=                      # verifies public SnapTrade webhooks in Rust
BROKERAGE_ENCRYPTION_KEY=                    # AES-GCM key for stored user secrets
SNAPTRADE_OAUTH_REDIRECT_URI=                # backend callback registered exactly in SnapTrade
SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=         # allowlisted web receipt after the callback
SYNC_TEST_NOW=false                          # true = sync every account once at boot

# Cache — optional. Absent or unreachable, the server logs a warning and runs uncached.
REDIS_URL=redis://localhost:6379

# Product analytics — self-hosted Countly Lite. The backend uses the Clerk ID
# as Countly's device ID, so its events and browser events share one profile.
COUNTLY_APP_KEY=
COUNTLY_HOST=https://countly.example.com
# The frontend needs the same Countly app key and self-hosted URL at build time:
NEXT_PUBLIC_COUNTLY_APP_KEY=
NEXT_PUBLIC_COUNTLY_HOST=https://countly.example.com
# Optional. Defaults to false, keeping all dashboard metrics visible. Set true
# only to hide the secondary dashboard metrics; this replaces Countly Remote Config.
NEXT_PUBLIC_DASHBOARD_COMPACT_METRICS=false

# Server
RUST_LOG=info,sqlx=warn,hyper=warn,h2=warn,rustls=warn
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
DB_MAX_CONNECTIONS=12                     # must be at least 2 for schema bootstrap
DB_MIN_CONNECTIONS=1
DB_ACQUIRE_TIMEOUT_SECS=10
DB_SLOW_QUERY_MS=250

# Observability
LOG_FORMAT=pretty                     # `json` in production: one JSON object per line
SENTRY_DSN=                           # unset = error reporting disabled
SENTRY_ENVIRONMENT=
SENTRY_TRACES_SAMPLE_RATE=0.0

# Web push (VAPID). Unset, the delivery worker never starts and notifications
# stay in the in-app feed — which is a supported way to run.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@tradstry.com

# Clerk webhooks. Unset, POST /webhooks/clerk returns 500 and deleted accounts
# keep their rows and R2 objects. Clerk Dashboard → Webhooks → signing secret.
CLERK_WEBHOOK_SECRET=whsec_...            # required

# MCP server only
MCP_PUBLIC_URL=https://mcp.tradstry.com   # required, advertised in OAuth metadata
CLERK_ISSUER=https://clerk.tradstry.com   # required
MCP_BIND_ADDR=0.0.0.0:7900                # optional

# Overrides
PROJECTOR_DIR=                        # defaults to ./projector, or beside the binary
TEST_DATABASE_URL=                    # integration tests only, see Tests below
```

`dotenvy` does not override variables already set in the environment, so anything exported by your shell or the Makefile wins over `.env`.

## Running

```bash
# From the repo root — starts local Postgres, then the backend
make backend

# Or directly
RUST_BACKTRACE=1 cargo run --bin tradstry-backend

# MCP server
cargo run --bin mcp-server

# Production build
cargo build --release
./target/release/tradstry-backend
```

Local backend startup verifies the ignored `projector/notebook-core.gen.mjs`
and `projector/notebook-seed.gen.mjs` bundles before starting workers. If either
is absent in a source checkout, it runs `projector:sync-core` automatically.
Docker images continue to generate both bundles during their projector build
stage.

The API server binds `0.0.0.0:7899`, the MCP server `0.0.0.0:7900`. Both stop gracefully on SIGTERM/SIGINT: HTTP drains first, then the background workers get 20 seconds to finish the unit of work in flight.

## API

Nearly everything flows through one GraphQL endpoint. The REST routes exist only for binary payloads and streaming assistance.

- **GraphQL:** `POST /graphql`
- **GraphiQL:** `GET /graphql`
- **WebSocket (subscriptions):** `GET /graphql/ws`
- **Health:** `GET /health`
- **Images:** `POST /notebook/images/upload`, `GET|DELETE /notebook/images/{id}`
- **Media:** `POST /notebook/media/upload`, `GET|DELETE /notebook/media/{hash}`, `GET /notebook/media/{hash}/thumb`
- **Assistance:** `POST /notebook/assist/autocomplete`, `POST /notebook/assist/transform`

All routes are Clerk-authenticated. `/health` is not in the middleware's exclusion list, so a liveness probe should accept any HTTP response rather than only 200.

### Key GraphQL operations

**Queries:** `accounts`, `journalEntries`, `playbooks`, `principles`, `tags`, `tagCategories`, `chatSessions`, `chatMessages`, `notebookNotes`, `notebookFolders`, `userAgents`, `userPrompts`, `journalAnalytics`, `calendarAnalytics`, `advancedAnalytics`, `accountEquityHistory`, `brokerageTransactions`, `brokerageHoldings`, `brokerageBalances`, `pendingTrades`, `aiInsights`, `aiReport`, `mindsetSummary`

**Sync (offline-first pull):** `pullNotebook`, `pullJournal`, `pullPlaybook`, `pullPrinciple`, `pullTags`, `pullCalculator`, `notebookUpdatesSince`, `notebookAccountUpdatesSince`

**Mutations:** `createAccount`, `createJournalEntry`, `sendChatMessage`, `createNotebookNote`, `updateNotebookNote`, `moveNotebookNode`, `createPlaybook`, `createPrinciple`, `createTag`, `mergeTags`, `initiateBrokerageConnection`, `completeBrokerageConnection`, `syncBrokerageData`, `rebuildAccountEquityHistory`, `notebookAutocomplete`, `notebookTransform`, `pushNotebook`, `appendNotebookUpdates`

**Subscriptions:** `chatStream`, `aiJobEvents`

## Sync model

The desktop and web clients are offline-first. Two mechanisms carry writes:

- **Replicache-style push/pull** (`src/graphql/notebook/sync.rs`) for row data. Push is idempotent on a per-client sequential mutation id — the server ignores any mutation whose id is at or below `last_mutation_id`, turning at-least-once delivery into exactly-once application.
- **Yjs CRDT updates** (`src/graphql/notebook/crdt.rs`) for note bodies, appended as `bytea` and projected by the Bun sidecar.

Conflicts on synced rows resolve last-writer-wins on a Hybrid Logical Clock string. The server is a peer with its own clock (`src/service/hlc.rs`) — it stamps its own writes and observes incoming stamps. Server writes must never leave `hlc` empty; `'' > anything` is false, so an unstamped server edit is silently discarded by every client.

## Background workers

Background loops are spawned from `main.rs`, each stopping at a safe point on shutdown:

- **Agent execution workers** (`service/agents/execution/worker.rs`) — claim durable runs and execute the single model/tool turn loop or an explicitly typed direct operation.
- **Agent knowledge workers** (`service/agents/knowledge/worker.rs`) — project canonical source changes from `agent_index_outbox`.
- **Agent memory, summary, and action workers** — process their dedicated durable queues with lease fencing.
- **Brokerage sync** (`service/brokerage/sync.rs`) — ticks every 60s; syncs on the hour and half-hour 9:00–16:30 ET on weekdays, plus 01:00 ET Saturday. Transactions are fetched only when SnapTrade's `sync_status` has advanced past the stored watermark; holdings are fetched every run.
- **Notebook maintenance** (`service/notebook/maintenance.rs`) — re-seeds notes stranded mid-seed and compacts overgrown update chains.
- **Equity scheduler** (`service/equity/schedule.rs`) — refreshes curves that went stale on price movement alone.
- **Notification outbox** (`service/notifications/outbox_worker.rs`) — every 5s, turns recorded events into rendered, coalesced notifications and fans out push deliveries.
- **Notification delivery** (`service/notifications/delivery_worker.rs`) — every 5s, sends due web pushes with exponential backoff and prunes dead endpoints. Only started when VAPID keys are configured.
- **Notification schedule** (`service/notifications/schedule_worker.rs`) — every 60s, fires per-user scheduled digests when their local wall clock crosses a configured slot: a weekday after-the-close journaling prompt and a weekly process review. Slots are claimed in `notification_schedule_runs` so a restart cannot double-send, and a slot with nothing to say is left unclaimed so it can still fire later the same day. Set `SCHEDULED_FEEDBACK_DRY_RUN=1` to log decisions without writing.

  Scheduled copy reports counts and sample-size-gated ratios only — never P&L. Performance feedback provokes asymmetric risk-taking (traders scale up after wins without scaling down after losses), so the push stays on process and the app keeps the numbers. Thresholds live in `service/notifications/metrics.rs`.

## Project structure

```
src/
  main.rs                    # Server setup, middleware, background workers, shutdown
  routes/                    # REST handlers (GraphQL entry, images, media)
  graphql/                   # Resolvers, merged into one Query/Mutation/Subscription root
    notebook/                # base (CRUD), sync (push/pull), crdt (Yjs blobs)
  service/
    db/
      schema/tables/         # Backend-owned domain queries and persistence mapping
    agents/                  # TinyAgents runtime, durable execution, evidence, memory, actions, knowledge
    brokerage/               # SnapTrade sync, transactions, holdings, pending trades
    equity/                  # Equity curve replay, rebuild, price history
    notebook/                # Lexical document logic, projector, block extraction, maintenance loop
    read_service/            # Shared read helpers and analytics
    auth/                    # Clerk JWKS provider
    hlc.rs                   # Server Hybrid Logical Clock
    telemetry.rs             # tracing subscriber + Sentry
mcp-server/                  # MCP binary (read + write tools over the same services)
database/                    # tradstry-database crate: Db, entities, bootstrap, contract
migration/                   # Ordered SeaORM migrations
schema/postgres/             # PostgreSQL support DDL and catalog contract
schema/archive/sqlx/         # Immutable pre-SeaORM migration history for adoption tests
projector/                   # Bun/Yjs sidecar
tests/                       # Integration tests against a real Postgres
```

## Domain invariants

A few rules are load-bearing and easy to break by accident:

- **`journal_entries.total_pl` is a percent, not dollars.** Money is only recoverable with the position: `position_size * entry_price * total_pl / 100`. Every dollar figure in the codebase is built from that expression.
- **Brokerage sync refetches an account's full history every run.** A `MAX(trade_date)` watermark is a hard floor — a backdated or amended fill lands below it and is never fetched again. Re-reading everything is safe because the upsert keys on `dedup_key`, derived from the trade's own attributes.
- **An empty fetch against a populated account does not advance the watermark** (`service/brokerage/transaction.rs`). SnapTrade reports an inherited `last_successful_sync` while still backfilling after a re-registration; advancing there freezes the account permanently.
- **SnapTrade transactions are day-delayed.** Their docs state intraday transactions are unavailable, and `last_successful_sync` is a whole-calendar-day marker over a once-a-day cache. Polling harder re-reads the same rows; the orders array on the holdings response is the only intraday view.
- **Equity curves carry `REPLAY_VERSION`** (`service/equity/mod.rs`). Bump it whenever the replay math changes — stored curves whose version is behind then rebuild on next read instead of serving numbers the current code would never produce.

## Tests

```bash
# Unit tests (no database)
cargo test --lib

# Integration tests — need a Postgres with pgvector + pg_search
export TEST_DATABASE_URL=postgres://postgres:tradstry@localhost:5432/tradstry_test
cargo test

# One suite
cargo test --test brokerage_dedup_pg
```

`tests/pg_support.rs` migrates the target database on first use and defaults to `postgres://tradstry:tradstry@localhost:5435/tradstry_test` when `TEST_DATABASE_URL` is unset. Point it at whatever Postgres you have; `make postgres` from the repo root gives you one on 5432.

Projector tests run under Bun:

```bash
cd projector && bun test
```

## Database schema

Both backend binaries use the `tradstry-database` crate and run the same schema bootstrap before serving traffic. A PostgreSQL advisory lock serializes concurrent startup, SeaORM entity sync builds a fresh empty schema, ordered migrations in `migration/` evolve existing databases, and the final catalog must match `schema/postgres/contract.json`.

Every schema change updates the final entity under `database/src/entities/` and adds an immutable SeaORM migration for existing databases. This includes additive tables and columns as well as type/nullability changes, destructive work, data movement, and PostgreSQL-only objects. Never edit an applied migration. The old 0001–0060 SQLx files are archived under `schema/archive/sqlx/`; startup finishes any pending archived migrations when adopting an SQLx-era database, and adoption tests replay the same history.

Backend persistence is intentionally hybrid: isolated single-table CRUD uses SeaORM entities, while analytics, joined views, bulk writes, locks, optimistic sync, recursive operations, and tuned PostgreSQL statements stay on SQLx. Keep the existing table-module interface stable when changing either implementation.

Tables are created inside the schema named by `POSTGRES_DATABASE` (`tradstry_dev`, `tradstry_prod`), with `search_path` set to `"<schema>", public` on every connection so extension types still resolve from `public`.

## Docker

```bash
# From the repo root, which supplies the notebook-core build context
docker compose --env-file devops/.env -f devops/compose.yml up backend

# Building the image directly needs that context passed explicitly
cd backend
docker build --target backend -f ../devops/docker/backend.Dockerfile \
  --build-context notebook-core=../packages/notebook-core -t tradstry-backend .
```

The Dockerfile is multi-stage: `cargo-chef` caches dependencies, one builder produces both Rust binaries, a Bun stage bundles the projector against `packages/notebook-core`, and two thin Debian stages (`backend`, `mcp`) each carry a binary, the Bun runtime, and the projector. Both run as a non-root user with a healthcheck. The backend exposes 7899, the MCP server 7900.
