---
name: seaorm-schema-change
description: Safely implement and verify database schema changes in the Tradstry repository after its SQLx-to-SeaORM migration. Use for new tables or columns, ordered data migrations, PostgreSQL indexes, constraints, triggers, schema-contract updates, or database upgrade tests. Do not use for ordinary query-only changes.
---

# Tradstry SeaORM Schema Changes

Use the repository checkout as the source of truth. Preserve unrelated work and do not touch a production database without explicit authorization.

## Invariants

- `backend/schema/archive/sqlx/0001` through `0060` are frozen. Never edit, rename, reorder, or append to this archive.
- `_sqlx_migrations` records the retired SQLx history. Startup may finish missing archived migrations for an older database, but new changes never go there.
- `seaql_migrations` records all new ordered SeaORM migrations.
- SeaORM entity sync builds fresh empty databases. Existing managed databases are changed only by ordered migrations, so accidental schema loss fails startup instead of being silently recreated empty.
- `backend/schema/postgres/current_support.sql` is the adoption baseline. Do not edit it after release; put future PostgreSQL-specific work in a new SeaORM migration.
- `backend/schema/postgres/contract.json` is the exact expected final catalog. A schema change is incomplete until the contract matches the verified database.

## Choose the Change Path

Every schema change updates the relevant model under `backend/database/src/entities/`, including keys and relationships. Follow nearby generated models and use SeaORM code generation against a canonical schema when that is safer than manual relationship editing.

Also add an ordered migration under `backend/migration/src/` for every change an existing database must receive, including:

- adding a table or column;
- renaming, altering, or dropping a table or column;
- changing a type, default, nullability, or existing constraint;
- backfilling or transforming stored data;
- PostgreSQL-specific indexes, expressions, functions, triggers, extensions, vectors, or full-text search;
- any operation whose order or one-time execution matters.

Name the migration with a unique timestamp prefix, implement the smallest safe `up`, and append it to `Migrator::migrations()` in `backend/migration/src/lib.rs`. Never reorder or edit a migration that may have run. Provide `down` only when reversal is genuinely safe; do not fake a destructive rollback.

The entity describes fresh-install state; the migration safely moves deployed databases to that same state.

## Workflow

1. Read `backend/README.md`, the entity, nearby migrations, `backend/database/src/schema/`, and affected callers. Record `git status` before editing.
2. State the intended final schema and classify the change using the rules above.
3. Add a failing PostgreSQL test first. Test the public bootstrap or application boundary, not a private helper. Seed representative data when preservation matters.
4. Implement only the entity and migration changes required for that final state.
5. Apply the complete change to a clean local PostgreSQL database. Run the contract query in `backend/schema/postgres/contract_query.sql` against that canonical schema and replace `contract.json` with its normalized JSON output. Never hand-edit individual contract entries. If the repository lacks a deterministic extraction command for the current environment, create or document one as part of the change instead of copying catalog rows manually.
6. Prove both paths reach the same contract: a fresh empty database and an existing database from the relevant prior migration. Verify seeded rows and relationships survive.
7. Inspect the complete diff. Confirm the SQLx archive and released migration files are byte-for-byte unchanged.

## Verification

Before a Rust build or test, respect the repository resource rule:

```bash
ps -Ao command | rg 'cargo (build|test)'
```

Run the narrow checks that cover the change, then at minimum:

```bash
cd backend
cargo fmt --all -- --check
git diff --check
cargo test -p tradstry-database --test seaorm_bootstrap_pg
cargo test -p tradstry-backend --test integration migration_sequence::
cargo check -p tradstry-database
cargo check -p tradstry-backend --bin tradstry-backend -p mcp-server --bin mcp-server
```

Run affected data-preservation or service tests as well. The PostgreSQL tests expect the repository's test database, normally on port `5435`; report an unavailable database as a verification gap rather than weakening the test.

Finish by reporting the entity changes, ordered migrations, contract refresh, fresh/upgrade evidence, preserved data, checks run, and any remaining rollout risk. Do not commit, deploy, or mutate production unless separately requested.
