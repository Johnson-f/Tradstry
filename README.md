# Tradstry

Tradstry is a trading journal and analytics web app for stock and options traders. It connects brokerage activity to trade records, performance reports, playbooks, principles, and notebook entries.

The repository also contains an authenticated MCP server for AI clients and a native macOS app prototype. The desktop prototype uses AppKit, displays sample data, and keeps newly entered notes only for the current session; it is not yet connected to the web app's accounts or backend.

## Product

- **Journal:** Automatic grouping of brokerage fills into trades, manual entries, trade details, review fields, tags, and linked notes. The separate Journal **Review** tab is currently an empty placeholder.
- **Analytics:** Performance summaries, profit and loss, risk metrics, trading calendars, and breakdowns by symbol and other trade attributes.
- **Brokerage:** SnapTrade connections, account and position data, transaction imports, scheduled synchronization, and webhook reconciliation.
- **Notebook:** Lexical rich text with Yjs document updates, images and videos, folders, and a system-managed Recent Trades folder for linked trade notes.
- **Playbooks and principles:** Trading rules and records of which principles were broken on a trade.
- **AI:** Configurable TinyAgents workers for analysis and research, plus MCP tools for accessing journal data and managing supported records.
- **Notifications:** An in-app feed, notification preferences, and optional browser push notifications.

## Stack

| Area | Implementation |
| --- | --- |
| Web app | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Radix/shadcn UI |
| Web data and editing | TanStack Query/Table, Zustand, Lexical, Yjs, Recharts |
| Backend | Rust 2024 edition, Actix Web, async-graphql, REST endpoints, GraphQL subscriptions |
| Database | PostgreSQL 18, SeaORM and SQLx; pgvector and ParadeDB `pg_search` for search |
| AI runtime | TinyAgents 2, configurable Gemini or Perplexity models; Voyage embeddings and reranking |
| Authentication | Clerk |
| Media storage | Cloudflare R2 through the S3-compatible API |
| Market data | `finance-query`, with Polygon and Financial Modeling Prep integrations |
| Brokerage adapter | Go and gRPC over a private Unix socket |
| MCP server | Rust, Axum, rmcp; authenticated Streamable HTTP at `/mcp` |
| Cache and rate limits | Redis; optional for the main backend, required by the MCP server |
| Desktop prototype | Swift 6, AppKit, macOS 26+, XcodeGen |
| Tooling and hosting | Bun, Biome, Docker Compose, Caddy, GitHub Actions; Vercel configuration for the website |

## Repository layout

```text
apps/
  website/                 Next.js routes, landing pages, authentication, web integration
  desktop/                 Native AppKit prototype and XcodeGen project specification
packages/
  app-ui/                  Product screens, hooks, services, and web platform interface
  notebook-core/           Shared Lexical nodes, document structure, and Yjs helpers
  ui/                      Shared React primitives
backend/
  src/                     HTTP server, GraphQL, domain services, background workers
  database/                SeaORM entities, connection setup, and schema bootstrap
  migration/               Database migrations and schema support
  mcp-server/              Standalone MCP server
  projector/               Bun helpers that turn notebook updates into document data
  proto/                   Versioned SnapTrade protobuf contract
  tests/                   Backend integration checks
microservice/
  snaptrade-service/       Go SnapTrade adapter
devops/
  Makefile                 Local service and deployment commands
  compose.yml              Production service stack
  docker/                  Backend, MCP, SnapTrade, and Postgres image builds
  caddy/                   Reverse proxy configuration
  scripts/                 Deployment and operations scripts
.github/workflows/         Pull request checks and production image/deployment workflow
```

The website calls the Rust backend over GraphQL and HTTP. The backend stores application data in Postgres, media in R2, and calls the Go adapter for SnapTrade operations. AI jobs and search also use Postgres. The MCP process shares backend services and database access, and uses Clerk authentication and Redis rate limits.

## Local development

Run commands from the repository root unless a block changes directories.

### Prerequisites

- Bun **1.3.13**, matching the root package manager declaration and container builds.
- Rust and Cargo; production images build with **Rust 1.95**, and CI uses stable Rust.
- Docker with a running daemon for the local Postgres image, which includes both search extensions.
- Go **1.26.5** for the SnapTrade adapter.
- Clerk, R2, and SnapTrade development credentials for the connected web app.
- `ffmpeg` and `ffprobe` for video processing.
- For the desktop prototype only: macOS 26+, Xcode with the macOS 26 SDK, and XcodeGen.

### 1. Install dependencies

```bash
bun install --frozen-lockfile
(cd backend/projector && bun install --frozen-lockfile)
bun run --cwd backend/projector sync-core
```

The projector has its own dependencies outside the root Bun workspace. The backend can regenerate missing notebook bundles on startup, but its dependencies must already be installed.

### 2. Configure the web app and backend

For a new checkout, copy the templates without replacing existing local configuration:

```bash
cp -n apps/website/.env.example apps/website/.env.local
cp -n backend/.env.example backend/.env
```

In `apps/website/.env.local`, fill in both Clerk keys and set the full GraphQL URL:

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://localhost:7899/graphql
```

In `backend/.env`, use these local database and browser origins:

```dotenv
POSTGRES_URL=postgres://postgres:tradstry@localhost:5433/postgres
POSTGRES_DATABASE=dev
BACKEND_PORT=7899
CORS_ALLOWED_ORIGINS=http://localhost:3038,http://127.0.0.1:3038
SNAPTRADE_OAUTH_REDIRECT_URI=http://localhost:7899/oauth/snaptrade/callback
SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=http://localhost:3038/dashboard/brokerage/oauth/callback
```

`POSTGRES_DATABASE=dev` selects the `tradstry_dev` **schema** inside the database named in `POSTGRES_URL`. Database schema bootstrap runs when the backend connects.

Fill in the remaining settings in [backend/.env.example](backend/.env.example):

- `CLERK_SECRET_KEY`, using the same Clerk instance as the website.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` for notebook media.
- `SNAPTRADE_INTERNAL_SECRET` with at least 32 bytes, shared with the Go adapter; `SNAPTRADE_CONSUMER_KEY`; and `BROKERAGE_ENCRYPTION_KEY`, a base64-encoded 32-byte key.
- `POLYGON_API_KEY` and `FMP_API_KEY` for the corresponding market data providers.

Leave `AGENTS_V2_ENABLED=false` to keep in-app AI workers disabled. To enable them, set it to `true`, choose `AGENT_MODEL_PROVIDER`, fill in the fast/reasoning/vision model names, and supply the selected provider's API key plus `VOYAGE_API_KEY`. Optional Redis, Sentry, and browser push settings are also listed in the template.

### 3. Configure and start the SnapTrade adapter

Create `microservice/snaptrade-service/.env` with:

```dotenv
SNAPTRADE_CLIENT_ID=your_client_id
SNAPTRADE_CONSUMER_KEY=your_consumer_key
SNAPTRADE_OAUTH_CLIENT_ID=your_oauth_client_id
SNAPTRADE_OAUTH_CLIENT_SECRET=your_oauth_client_secret
SNAPTRADE_INTERNAL_SECRET=the_same_secret_as_the_backend
SNAPTRADE_GRPC_SOCKET=/tmp/tradstry-snaptrade.sock
```

Start it in its own terminal:

```bash
make micro
```

The adapter uses a private Unix socket, not a public HTTP port. Keep the socket path and shared secret consistent with the backend. See [microservice/README.md](microservice/README.md) for the adapter contract and protobuf generation commands.

### 4. Start the backend and website

In separate terminals:

```bash
make backend
```

```bash
make frontend
```

Default local addresses:

| Service | Address |
| --- | --- |
| Website | `http://localhost:3038` |
| Backend GraphQL | `http://localhost:7899/graphql` |
| Backend health | `http://localhost:7899/health` |
| Postgres | `localhost:5433` |

`make backend` starts Postgres and then runs `tradstry-backend`. It sets the connection URL from `PG_PORT` and `PG_DATABASE`, overriding `POSTGRES_URL` in the backend environment file. Defaults are port `5433` and database `postgres`; ignored `devops/local.mk` can override them and `BACKEND_PORT`.

For an existing external database, run `cargo run --bin tradstry-backend` from `backend/` to use its environment file directly. If you change the backend port, also update the website GraphQL URL and SnapTrade redirect URL.

### MCP server

The MCP server runs separately. Configure `MCP_PUBLIC_URL`, `MCP_BIND_ADDR`, and `CLERK_ISSUER` in `backend/.env`, plus working Postgres, Clerk, R2, Voyage, and Redis settings. Redis and Voyage are required for this process even when in-app AI workers are disabled.

```bash
cd backend
cargo run -p mcp-server --bin mcp-server
```

The default local MCP endpoint is `http://localhost:7900/mcp`. Its `/health` and OAuth discovery routes are public; MCP tool requests require authentication.

### Native macOS prototype

Generate the Xcode project from [apps/desktop/project.yml](apps/desktop/project.yml), then build and open the local app:

```bash
cd apps/desktop
xcodegen generate
xcodebuild -project Tradstry.xcodeproj -scheme Tradstry \
  -configuration Debug -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO build
open build/Debug/Tradstry.app
```

The generated Xcode project and `build/` directory are ignored by Git. Use these direct commands: the root `make desktop` target currently points to a desktop Makefile that is absent.

## Development checks

From the repository root:

```bash
# Web and shared packages
bun run typecheck:app-ui
bunx tsc --noEmit -p apps/website/tsconfig.json
bun run test:packages
bun run build:website
bun run --cwd apps/website lint

# Notebook document helpers
bun run --cwd backend/projector test

# Rust checks used by CI
(cd backend && cargo fmt --all -- --check)
(cd backend && cargo check --all-targets)
(cd backend && cargo clippy --all-targets --all-features -- -D warnings)

# Backend workspace tests
(cd backend && cargo test --workspace)

# SnapTrade adapter
(cd microservice/snaptrade-service && go test ./...)
(cd microservice/snaptrade-service && go vet ./...)
```

Database integration tests need a separate test Postgres database with the required extensions. Set `TEST_DATABASE_URL` for that database; do not point it at application data. Notebook tests also need the projector dependencies above.

## Deployment

[devops/compose.yml](devops/compose.yml) defines the backend, MCP server, SnapTrade adapter, Postgres, Redis, Caddy, and container health management. Website deployment is separate from this stack.

- [commit-check.yml](.github/workflows/commit-check.yml) runs Rust formatting, type checks, and Clippy for pull requests to `main` or `master`. It does not currently run the frontend or test suites.
- [release.yml](.github/workflows/release.yml) runs on pushes to `master` or manual dispatch, reuses the Rust checks, builds backend/MCP/SnapTrade images tagged `sha-<commit>`, deploys the exact commit through the GitHub `Production` environment, and promotes successfully deployed images to `latest`.
- `make deploy` is an emergency deployment command for already-built `origin/master` images. Release tags are not required by the deployment workflow.
- Environment files remain outside Git. See [devops/README.md](devops/README.md) for operations and Compose commands.

## License

This project is proprietary software. All rights reserved.
