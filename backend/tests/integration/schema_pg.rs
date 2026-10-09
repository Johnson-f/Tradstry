use crate::pg_support::{TestDb, seed_user_workspace};
use sea_orm::SqlxPostgresConnector;
use tradstry_migration::{Migrator, MigratorTrait};

async fn migrate(pool: &sqlx::PgPool) {
    tradstry_backend::service::db::schema::pg::migrate(pool)
        .await
        .expect("replay archived migrations");
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, None)
        .await
        .expect("apply SeaORM migrations");
}

#[tokio::test(flavor = "multi_thread")]
async fn migrate_creates_all_tables_idempotently() {
    let test_db = TestDb::empty().await;
    let pool = test_db.pool();

    migrate(&pool).await;
    migrate(&pool).await;

    let mut tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema = 'public' \
           AND table_name NOT IN ('_sqlx_migrations', 'seaql_migrations')",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    tables.sort();

    let contract: serde_json::Value =
        serde_json::from_str(include_str!("../../schema/postgres/contract.json"))
            .expect("parse schema contract");
    let mut expected: Vec<String> = contract["tables"]
        .as_array()
        .expect("contract lists tables")
        .iter()
        .map(|table| table.as_str().expect("table name").to_owned())
        .collect();
    // Support tables the contract deliberately leaves unmanaged; see
    // schema/postgres/contract_query.sql.
    expected.extend(
        [
            "account_equity_rebuild",
            "brokerage_transactions_dedup_archive",
            "paddle_webhook_events",
            "price_fetch_failures",
            "price_history",
        ]
        .map(String::from),
    );
    expected.sort();
    assert_eq!(
        tables, expected,
        "migrated tables differ from the schema contract"
    );

    let indexes: Vec<String> = sqlx::query_scalar(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)",
    )
    .bind([
        "idx_journal_entries_user_workspace_created_live",
        "idx_journal_entries_user_workspace_close_live",
        "idx_brokerage_tx_user_workspace_date_id",
        "idx_brokerage_tx_workspace_type_date",
        "idx_brokerage_tx_symbol_search_trgm",
        "idx_notebook_notes_user_workspace_order_live",
        "idx_playbooks_user_workspace_created_live",
        "idx_principles_user_workspace_priority_live",
        "idx_position_history_user_workspace_created",
        "idx_position_plans_user_workspace_created",
    ])
    .fetch_all(&pool)
    .await
    .expect("query performance indexes");
    assert_eq!(indexes.len(), 10, "missing performance index: {indexes:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn migration_adds_notebook_sync_columns() {
    let test_db = TestDb::empty().await;
    let pool = test_db.pool();
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .expect("migrate");

    let row: (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='notebook_notes' AND column_name='deleted_at')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(row.0, "notebook_notes.deleted_at missing");

    let row: (bool,) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables
         WHERE table_name='notebook_client_mutations')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(row.0, "notebook_client_mutations missing");
}

#[tokio::test(flavor = "multi_thread")]
async fn notification_tables_exist_with_expected_columns() {
    let test_db = TestDb::empty().await;
    let pool = test_db.pool();
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .expect("migrate");

    for (table, column) in [
        ("notification_outbox", "coalesce_key"),
        ("notification_outbox", "attempts"),
        ("notification_outbox", "last_error"),
        ("notifications", "group_count"),
        ("notifications", "last_pushed_at"),
        ("notifications", "read_at"),
        ("notification_preferences", "enabled"),
        ("push_subscriptions", "p256dh"),
        ("notification_deliveries", "next_attempt_at"),
        ("notification_deliveries", "status"),
    ] {
        let found: Option<(String,)> = sqlx::query_as(
            "SELECT column_name FROM information_schema.columns \
             WHERE table_name = $1 AND column_name = $2",
        )
        .bind(table)
        .bind(column)
        .fetch_optional(&pool)
        .await
        .expect("query information_schema");
        assert!(found.is_some(), "{table}.{column} is missing");
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn unread_coalesce_key_is_unique_per_user() {
    let test_db = TestDb::empty().await;
    let pool = test_db.pool();
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .expect("migrate");
    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    let insert = |id: &'static str| {
        let pool = pool.clone();
        let user_id = user_id.clone();
        async move {
            sqlx::query(
                "INSERT INTO notifications (id, user_id, event_type, title, body, payload, coalesce_key) \
                 VALUES ($1, $2, 'FillsLanded', 't', 'b', '{}'::jsonb, 'fills:a:2026-07-28')",
            )
            .bind(id)
            .bind(&user_id)
            .execute(&pool)
            .await
        }
    };

    insert("n1").await.expect("first unread row inserts");
    assert!(
        insert("n2").await.is_err(),
        "a second unread row with the same coalesce key must be rejected"
    );

    sqlx::query("UPDATE notifications SET read_at = now() WHERE id = 'n1'")
        .execute(&pool)
        .await
        .expect("mark read");
    insert("n3")
        .await
        .expect("once the first is read, a new group may start");
}
