# Recipes are held in `define` blocks and run through a single `bash -c` so the
# multi-line shell logic survives macOS's GNU Make 3.81 (no .ONESHELL support).
SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
export ROOT

.PHONY: help postgres backend docker frontend

help:
	@echo "Tradstry"
	@echo "========"
	@echo "  make backend    Start local Postgres, then the Rust backend (port from backend/.env)"
	@echo "  make postgres   Start local Postgres only (Docker, localhost:5432)"
	@echo "  make docker     Build and run Postgres and the backend in Docker (localhost:7900)"
	@echo "  make frontend   Start the website (bun dev, localhost:5173)"

# Local Postgres from compose.yml at the repo root. Idempotent; the volume
# keeps data across restarts.
define POSTGRES_SCRIPT
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for local Postgres." >&2
  exit 1
fi
echo -e "$${BLUE}Starting Postgres...$${NC}"
docker compose -f "$$ROOT/compose.yml" up -d --wait postgres
echo -e "$${GREEN}Postgres is ready.$${NC}"
endef
export POSTGRES_SCRIPT

define BACKEND_SCRIPT
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

cd "$$ROOT/backend"
if [ ! -f .env ]; then
  echo "backend/.env is missing; copy .env.example and fill it in." >&2
  exit 1
fi
echo -e "$${BLUE}Starting Tradstry backend$${NC}"
echo "========================="
echo -e "$${GREEN}Running cargo in $$(pwd); migrations apply on startup.$${NC}"
exec env RUST_BACKTRACE=1 cargo run
endef
export BACKEND_SCRIPT

define FRONTEND_SCRIPT
set -e
cd "$$ROOT/apps/website"
[ -d node_modules ] || bun install
exec bun run dev
endef
export FRONTEND_SCRIPT

postgres:
	@bash -c "$$POSTGRES_SCRIPT"

backend: postgres
	@bash -c "$$BACKEND_SCRIPT"

docker:
	docker compose -f "$(ROOT)/compose.yml" up -d --build --wait

frontend:
	@bash -c "$$FRONTEND_SCRIPT"
