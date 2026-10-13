# Recipes are held in `define` blocks and run through a single `bash -c` so the
# multi-line shell logic survives macOS's GNU Make 3.81 (no .ONESHELL support).
SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
DEVOPS := $(ROOT)/devops
export ROOT
export DEVOPS

PG_CONTAINER := tradstry-postgres
PG_IMAGE     := tradstry-postgres:pg18-pgsearch
PG_VOLUME    := tradstry_postgres_data
PG_PORT      ?= 5433
PG_PASSWORD  := tradstry
PG_DATABASE  ?= postgres
BACKEND_PORT ?= 7899
TEST_PG_CONTAINER := tradstry-test-postgres
TEST_PG_PORT      ?= 5435
REDIS_CONTAINER   := tradstry-redis
MCP_PORT          ?= 7910
-include $(DEVOPS)/local.mk
export PG_CONTAINER PG_IMAGE PG_VOLUME PG_PORT PG_PASSWORD PG_DATABASE
export TEST_PG_CONTAINER TEST_PG_PORT
export BACKEND_PORT REDIS_CONTAINER MCP_PORT

SERVER     := myserver
REMOTE_DIR := /opt/tradstry
export SERVER REMOTE_DIR

.PHONY: help backend postgres test-db test-db-stop frontend desktop micro mcp cleanup deploy tag sync-oauth-env test-oauth-env-sync sync-agent-env test-agent-env-sync

help:
	@echo "Tradstry"
	@echo "========"
	@echo "  make backend    Start local Postgres, then the Rust backend on :$(BACKEND_PORT)"
	@echo "  make postgres   Start local Postgres only"
	@echo "                  Uses localhost:5433; override with PG_PORT=<port>"
	@echo "                  Local overrides can be saved in devops/local.mk"
	@echo "  make test-db    Start the throwaway Postgres the backend tests use (localhost:5435)"
	@echo "  make test-db-stop  Stop it; its data lives in memory and is discarded"
	@echo "  make frontend   Start the web frontend (bun dev)"
	@echo "  make desktop    Build and launch the native SwiftUI macOS app"
	@echo "  make micro      Start the SnapTrade Go microservice"
	@echo "  make mcp        Start Redis, the backend (unless running) and the MCP server on :$(MCP_PORT),"
	@echo "                  for testing with Claude Code"
	@echo "  make cleanup    Remove JS, Next, test, and Rust build artifacts"
	@echo "  make deploy     Emergency redeploy of the current origin/master build"
	@echo "  make tag        Create a release tag (not required for deployment)"
	@echo "  make sync-oauth-env  Safely sync OAuth settings to production"
	@echo "  make test-oauth-env-sync  Test OAuth env sync and rollback behavior"
	@echo "  make sync-agent-env  Safely sync agent runtime settings to production"
	@echo "  make test-agent-env-sync  Test agent env allowlisting"

# ---------------------------------------------------------------------------
# Local Postgres (pgvector + pg_search) — brought up if it isn't already
# running. Idempotent and safe to re-run; the persistent volume keeps your data
# across restarts.
# ---------------------------------------------------------------------------
define POSTGRES_SCRIPT
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

if ! command -v docker >/dev/null 2>&1; then
  echo -e "$${YELLOW}Docker not found — skipping local Postgres; using POSTGRES_URL from backend/.env.$${NC}"
  exit 0
fi

if docker container inspect "$$PG_CONTAINER" >/dev/null 2>&1; then
  existing_port=$$(docker inspect --format '{{range (index .HostConfig.PortBindings "5432/tcp")}}{{.HostPort}}{{end}}' "$$PG_CONTAINER")
  if [ "$$existing_port" != "$$PG_PORT" ]; then
    echo "Postgres '$${PG_CONTAINER}' uses host port $${existing_port}, but PG_PORT is $${PG_PORT}." >&2
    echo "Use make backend PG_PORT=$${existing_port} to keep its current port." >&2
    exit 1
  fi
fi

if docker ps --format '{{.Names}}' | grep -q "^$${PG_CONTAINER}$$"; then
  echo -e "$${GREEN}Postgres '$${PG_CONTAINER}' already running.$${NC}"
elif docker ps -a --format '{{.Names}}' | grep -q "^$${PG_CONTAINER}$$"; then
  echo -e "$${BLUE}Starting existing Postgres container...$${NC}"
  docker start "$$PG_CONTAINER" >/dev/null
else
  if ! docker image inspect "$$PG_IMAGE" >/dev/null 2>&1; then
    case "$$(uname -m)" in
      arm64 | aarch64) PG_ARCH=arm64 ;;
      *) PG_ARCH=amd64 ;;
    esac
    echo -e "$${BLUE}Building $${PG_IMAGE} (pgvector/pg18 + pg_search, $${PG_ARCH})...$${NC}"
    docker build --build-arg PG_ARCH="$$PG_ARCH" -t "$$PG_IMAGE" "$$DEVOPS/docker/postgres"
  fi
  echo -e "$${BLUE}Starting Postgres on port $${PG_PORT}...$${NC}"
  docker run -d \
    --name "$$PG_CONTAINER" \
    --restart unless-stopped \
    -p "127.0.0.1:$${PG_PORT}:5432" \
    -e POSTGRES_PASSWORD="$$PG_PASSWORD" \
    -e PGDATA=/var/lib/postgresql/18/docker \
    -v "$${PG_VOLUME}:/var/lib/postgresql" \
    "$$PG_IMAGE" \
    postgres -c shared_preload_libraries=pg_search >/dev/null
fi

echo -e "$${BLUE}Waiting for Postgres to accept connections...$${NC}"
for i in $$(seq 1 60); do
  if docker exec "$$PG_CONTAINER" psql -U postgres -tAc "SELECT 1" >/dev/null 2>&1; then
    echo -e "$${GREEN}Postgres is ready.$${NC}"
    break
  fi
  if [ "$$i" -eq 60 ]; then
    echo -e "$${YELLOW}Postgres did not become ready in time. Check: docker logs $${PG_CONTAINER}$${NC}" >&2
    exit 1
  fi
  sleep 1
done

# Ensure extensions (idempotent; the backend also creates these on startup).
docker exec "$$PG_CONTAINER" psql -U postgres -q \
  -c "CREATE EXTENSION IF NOT EXISTS vector;" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_search;" >/dev/null 2>&1 || true
endef
export POSTGRES_SCRIPT

# ---------------------------------------------------------------------------
# Test Postgres: a separate, disposable server for `cargo test`. Data lives in
# memory and durability is off, because tests only need speed. Each test gets
# its own database copied from a template (backend/tests/integration/test_db.rs).
# ---------------------------------------------------------------------------
define TEST_DB_SCRIPT
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

if docker ps --format '{{.Names}}' | grep -q "^$${TEST_PG_CONTAINER}$$"; then
  echo -e "$${GREEN}Test Postgres '$${TEST_PG_CONTAINER}' already running on $${TEST_PG_PORT}.$${NC}"
  exit 0
fi
if ! docker image inspect "$$PG_IMAGE" >/dev/null 2>&1; then
  case "$$(uname -m)" in
    arm64 | aarch64) PG_ARCH=arm64 ;;
    *) PG_ARCH=amd64 ;;
  esac
  echo -e "$${BLUE}Building $${PG_IMAGE} (pgvector/pg18 + pg_search, $${PG_ARCH})...$${NC}"
  docker build --build-arg PG_ARCH="$$PG_ARCH" -t "$$PG_IMAGE" "$$DEVOPS/docker/postgres"
fi

echo -e "$${BLUE}Starting test Postgres on port $${TEST_PG_PORT}...$${NC}"
docker run -d --rm \
  --name "$$TEST_PG_CONTAINER" \
  -p "127.0.0.1:$${TEST_PG_PORT}:5432" \
  -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql \
  "$$PG_IMAGE" \
  postgres -c shared_preload_libraries=pg_search -c max_connections=300 \
    -c fsync=off -c synchronous_commit=off -c full_page_writes=off >/dev/null

for i in $$(seq 1 60); do
  if docker exec "$$TEST_PG_CONTAINER" psql -U postgres -tAc "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  if [ "$$i" -eq 60 ]; then
    echo "Test Postgres did not become ready. Check: docker logs $${TEST_PG_CONTAINER}" >&2
    exit 1
  fi
  sleep 1
done

# Tests create and drop their own databases and extensions, so the role is a
# superuser. The server holds nothing but test data.
docker exec "$$TEST_PG_CONTAINER" psql -U postgres -q \
  -c "CREATE ROLE tradstry LOGIN SUPERUSER PASSWORD 'tradstry'" \
  -c "CREATE DATABASE tradstry_test OWNER tradstry" >/dev/null
# Installed up front because test processes bootstrapping schemas in parallel
# would otherwise race to create them.
docker exec "$$TEST_PG_CONTAINER" psql -U postgres -d tradstry_test -q \
  -c "CREATE EXTENSION IF NOT EXISTS vector" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_search" >/dev/null
echo -e "$${GREEN}Test Postgres ready: postgres://tradstry:tradstry@localhost:$${TEST_PG_PORT}/tradstry_test$${NC}"
endef
export TEST_DB_SCRIPT

define BACKEND_SCRIPT
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "$${BLUE}Starting Tradstry Backend Server$${NC}"
echo "=================================="

# dotenvy does not override existing env, so these take precedence over any
# POSTGRES_URL in backend/.env.
export POSTGRES_URL="postgres://postgres:$${PG_PASSWORD}@localhost:$${PG_PORT}/$${PG_DATABASE}"
export POSTGRES_DATABASE="$${POSTGRES_DATABASE:-dev}"
export RUST_BACKTRACE=full

cd "$$ROOT/backend"
echo "Current directory: $$(pwd)"
echo -e "$${GREEN}Starting Rust server with backtrace enabled...$${NC}"
echo -e "$${YELLOW}RUST_BACKTRACE is enabled for debugging$${NC}"
exec env RUST_LOG=info cargo run --bin tradstry-backend
endef
export BACKEND_SCRIPT

define FRONTEND_SCRIPT
cd "$$ROOT/apps/website"
[ -d node_modules ] || bun install
exec bun run dev
endef
export FRONTEND_SCRIPT

# ---------------------------------------------------------------------------
# The Go MCP server for local testing with Claude Code. Brings up Redis for its
# rate limits, starts the backend in the background unless one already answers,
# and stops that backend again when the MCP server exits.
# ---------------------------------------------------------------------------
define MCP_SCRIPT
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
setting() { grep -E "^$$1=" "$$ROOT/backend/.env" 2>/dev/null | tail -1 | cut -d= -f2-; }

redis_url="$$(setting REDIS_URL)"
redis_url="$${redis_url:-redis://localhost:6381}"
redis_port="$$(echo "$$redis_url" | sed -E 's#.*:([0-9]+)/?.*$$#\1#')"
if ! docker ps --format '{{.Names}}' | grep -q "^$${REDIS_CONTAINER}$$"; then
  if docker container inspect "$$REDIS_CONTAINER" >/dev/null 2>&1; then
    docker start "$$REDIS_CONTAINER" >/dev/null
  else
    docker run -d --name "$$REDIS_CONTAINER" -p "127.0.0.1:$${redis_port}:6379" redis:8-alpine >/dev/null
  fi
fi
echo -e "$${GREEN}Redis '$${REDIS_CONTAINER}' running on port $${redis_port}.$${NC}"

backend_pid=""
if curl -fsS "http://localhost:$${BACKEND_PORT}/health" >/dev/null 2>&1; then
  echo -e "$${GREEN}Backend already running on :$${BACKEND_PORT}.$${NC}"
else
  log="$${TMPDIR:-/tmp}/tradstry-backend.log"
  echo -e "$${BLUE}Starting the backend; its log is $${log}$${NC}"
  make -C "$$ROOT" backend >"$$log" 2>&1 &
  backend_pid=$$!
  trap '[ -n "$$backend_pid" ] && pkill -P "$$backend_pid" 2>/dev/null; kill "$$backend_pid" 2>/dev/null' EXIT
  until curl -fsS "http://localhost:$${BACKEND_PORT}/health" >/dev/null 2>&1; do
    if ! kill -0 "$$backend_pid" 2>/dev/null; then
      echo "The backend stopped while starting; see $${log}" >&2
      exit 1
    fi
    sleep 2
  done
  echo -e "$${GREEN}Backend ready on :$${BACKEND_PORT}.$${NC}"
fi

export MCP_PUBLIC_URL="http://localhost:$${MCP_PORT}"
export MCP_BIND_ADDR="127.0.0.1:$${MCP_PORT}"
export TRADSTRY_API_URL="http://localhost:$${BACKEND_PORT}"
# Sign in against the Stytch project the local web app uses (its custom domain),
# not a production one. MCP_OAUTH_ISSUER overrides it.
local_stytch="$$(grep -E '^NEXT_PUBLIC_STYTCH_DOMAIN=' "$$ROOT/apps/website/.env.local" 2>/dev/null | cut -d= -f2-)"
export OAUTH_ISSUER="$${MCP_OAUTH_ISSUER:-$${local_stytch:-$$(setting STYTCH_ISSUER)}}"
export OAUTH_AUDIENCE="$$(setting STYTCH_PROJECT_ID)"
export REDIS_URL="$$redis_url"

echo ""
echo -e "$${GREEN}MCP server on $${MCP_PUBLIC_URL}/mcp, signing in with $${OAUTH_ISSUER}$${NC}"
echo "Connect Claude Code once with:"
echo "  claude mcp add --transport http tradstry $${MCP_PUBLIC_URL}/mcp"
echo "then run /mcp in Claude Code and authenticate tradstry."
echo ""
cd "$$ROOT/microservice/tradstry-mcp"
go run .
endef
export MCP_SCRIPT

define MICRO_SCRIPT
cd "$$ROOT/microservice/snaptrade-service"
exec go run main.go
endef
export MICRO_SCRIPT

define CLEANUP_SCRIPT
set -euo pipefail

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: cargo is required to clean the backend workspace." >&2
  exit 1
fi

echo "Removing JavaScript dependencies and generated build directories..."
find "$$ROOT" \
  \( \
    -path "$$ROOT/.git" -o \
    -path "$$ROOT/.claude" -o \
    -path "$$ROOT/.superpowers" \
  \) -prune -o \
  -type d \
  \( \
    -name node_modules -o \
    -name .next -o \
    -name dist -o \
    -name dist-ssr -o \
    -name out -o \
    -name build -o \
    -name release -o \
    -name .cache -o \
    -name .turbo -o \
    -name .vite -o \
    -name coverage -o \
    -name playwright-report -o \
    -name test-results \
  \) -prune -exec rm -rf {} +

echo "Removing TypeScript and generated projector artifacts..."
find "$$ROOT" \
  \( \
    -path "$$ROOT/.git" -o \
    -path "$$ROOT/.claude" -o \
    -path "$$ROOT/.superpowers" \
  \) -prune -o \
  -type f -name '*.tsbuildinfo' -delete
rm -f \
  "$$ROOT/backend/projector/notebook-core.gen.mjs" \
  "$$ROOT/backend/projector/notebook-seed.gen.mjs"

echo "Cleaning the Rust workspace..."
cargo clean --manifest-path "$$ROOT/backend/Cargo.toml"

echo "Cleanup complete. Run 'bun install' before starting the frontend again."
endef
export CLEANUP_SCRIPT

define DEPLOY_SCRIPT
set -euo pipefail
cd "$$ROOT"

git fetch --quiet origin master
commit_sha="$$(git rev-parse origin/master)"
image_tag="sha-$${commit_sha}"

echo "Emergency deployment of origin/master at $${commit_sha}..."
ssh "$$SERVER" \
  "sudo -u tradstry-deploy env DEPLOY_DIR='$$REMOTE_DIR' '$$REMOTE_DIR/devops/scripts/deploy-production.sh' '$${commit_sha}' '$${image_tag}'"
endef
export DEPLOY_SCRIPT

define TAG_SCRIPT
set -e
cd "$$ROOT"

latest_tag=$$(git tag --sort=-v:refname | head -1)
if [ -z "$$latest_tag" ]; then
  latest_tag="v0.0.0"
fi
echo "Latest tag: $$latest_tag"

if [ -n "$$(git status --porcelain)" ]; then
  echo "Error: release tags require a clean working tree." >&2
  git status --short >&2
  exit 1
fi

version="$${latest_tag#v}"
major=$$(echo "$$version" | cut -d. -f1)
minor=$$(echo "$$version" | cut -d. -f2)
patch=$$(echo "$$version" | cut -d. -f3)

# Optional 4th (build/hotfix) segment, e.g. v0.4.6.1 → build=1.
build=$$(echo "$$version" | cut -d. -f4)
if [[ "$$build" =~ ^[0-9]+$$ ]]; then
  hotfix_tag="v$${major}.$${minor}.$${patch}.$$((build + 1))"
else
  hotfix_tag="v$${major}.$${minor}.$${patch}.1"
fi

echo ""
echo "Current version: $$latest_tag"
echo "  1) patch  → v$${major}.$${minor}.$$((patch + 1))"
echo "  2) minor  → v$${major}.$$((minor + 1)).0"
echo "  3) major  → v$$((major + 1)).0.0"
echo "  4) hotfix → $${hotfix_tag}"
echo "  5) custom"
echo ""
read -p "Bump type [1/2/3/4/5] (default: 1): " bump

input="$${bump:-1}"
if [[ "$$input" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$$ ]]; then
  new_tag="v$${input#v}"
elif [ "$$input" = "1" ]; then
  new_tag="v$${major}.$${minor}.$$((patch + 1))"
elif [ "$$input" = "2" ]; then
  new_tag="v$${major}.$$((minor + 1)).0"
elif [ "$$input" = "3" ]; then
  new_tag="v$$((major + 1)).0.0"
elif [ "$$input" = "4" ]; then
  new_tag="$${hotfix_tag}"
elif [ "$$input" = "5" ]; then
  read -p "Enter version (e.g. v1.2.3 or v1.2.3.4): " new_tag
  if [[ ! "$$new_tag" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$$ ]]; then
    echo "Error: invalid version format. Use vX.Y.Z or vX.Y.Z.N"
    exit 1
  fi
  new_tag="v$${new_tag#v}"
else
  echo "Error: invalid option"
  exit 1
fi

echo ""
echo "Creating tag: $$new_tag"
git tag "$$new_tag"
git push origin "$$(git branch --show-current)" --tags
echo ""
echo "Pushed with tag $$new_tag"
endef
export TAG_SCRIPT

postgres:
	@bash -c "$$POSTGRES_SCRIPT"

test-db:
	@bash -c "$$TEST_DB_SCRIPT"

test-db-stop:
	@docker stop "$(TEST_PG_CONTAINER)" >/dev/null 2>&1 && echo "Stopped $(TEST_PG_CONTAINER)." || echo "$(TEST_PG_CONTAINER) is not running."

backend: postgres
	@bash -c "$$BACKEND_SCRIPT"

frontend:
	@bash -c "$$FRONTEND_SCRIPT"

desktop:
	@$(MAKE) -C "$(ROOT)/apps/desktop" run

micro:
	@bash -c "$$MICRO_SCRIPT"

mcp:
	@bash -c "$$MCP_SCRIPT"

sync-oauth-env:
	@bash "$(DEVOPS)/scripts/sync-oauth-env.sh"

test-oauth-env-sync:
	@bash "$(DEVOPS)/scripts/merge-env-file.test.sh"
	@bash "$(DEVOPS)/scripts/sync-oauth-env.test.sh"
	@bash "$(DEVOPS)/scripts/apply-oauth-env-remote.test.sh"

sync-agent-env:
	@bash "$(DEVOPS)/scripts/sync-agent-env.sh"

test-agent-env-sync:
	@bash "$(DEVOPS)/scripts/sync-agent-env.test.sh"
	@bash "$(DEVOPS)/scripts/apply-agent-env-remote.test.sh"

cleanup:
	@bash -c "$$CLEANUP_SCRIPT"

deploy:
	@bash -c "$$DEPLOY_SCRIPT"

tag:
	@bash -c "$$TAG_SCRIPT"
