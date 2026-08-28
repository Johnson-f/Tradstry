# Archived SQLx schema history

`sqlx/` contains the immutable 0001–0060 migration history. Production startup only replays pending entries when it detects an SQLx-era database; new databases do not run this archive. Adoption tests use the same history to prove that an older database can move to the current SeaORM entity and migration contract without losing active rows.

Five historical tables are intentionally unmanaged by SeaORM: `price_history`, `price_fetch_failures`, `account_equity_rebuild`, `paddle_webhook_events`, and `brokerage_transactions_dedup_archive`. Fresh databases omit them; existing databases retain them.

Do not add a removal migration until all of these are true:

1. A recoverable production backup has been tested.
2. The five tables have been rescanned for production readers and writers.
3. Their row counts and required retention have been reviewed.
4. `brokerage_transactions_dedup_archive` has been exported and its recovery copy verified.
5. The removal is approved as a separate destructive change.
