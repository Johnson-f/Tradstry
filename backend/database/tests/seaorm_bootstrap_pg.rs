use std::path::PathBuf;
use std::str::FromStr;

use sqlx::migrate::Migrator as SqlxMigrator;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Executor, PgPool};
use tradstry_database::schema::{bootstrap, contract, pg};
use tradstry_migration::{Migrator, MigratorTrait};
use uuid::Uuid;

fn test_url() -> String {
    std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://tradstry:tradstry@localhost:5435/tradstry_test".to_string())
}

async fn isolated_pool() -> (PgPool, PgPool, String) {
    let options = PgConnectOptions::from_str(&test_url())
        .expect("parse test database URL")
        .disable_statement_logging();
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .expect("connect admin pool");
    let schema = format!("seaorm_test_{}", Uuid::new_v4().simple());
    admin
        .execute(sqlx::AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
        .await
        .expect("create isolated schema");

    let search_path = format!("\"{schema}\", public");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(move |connection, _| {
            let search_path = search_path.clone();
            Box::pin(async move {
                connection
                    .execute(sqlx::AssertSqlSafe(format!(
                        "SET search_path TO {search_path}"
                    )))
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .expect("connect isolated pool");
    (admin, pool, schema)
}

async fn cleanup(admin: PgPool, pool: PgPool, schema: &str) {
    pool.close().await;
    admin
        .execute(sqlx::AssertSqlSafe(format!(
            "DROP SCHEMA \"{schema}\" CASCADE"
        )))
        .await
        .expect("drop isolated schema");
    admin.close().await;
}

#[tokio::test]
async fn fresh_bootstrap_is_concurrent_and_idempotent() {
    let (admin, pool, schema) = isolated_pool().await;
    let (left, right) = tokio::join!(bootstrap(&pool, &schema), bootstrap(&pool, &schema));
    let left = left.expect("first concurrent bootstrap");
    right.expect("second concurrent bootstrap");
    contract::verify(&left)
        .await
        .expect("contract after bootstrap");
    bootstrap(&pool, &schema)
        .await
        .expect("idempotent bootstrap");

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
    )
    .fetch_all(&pool)
    .await
    .expect("list fresh tables");
    assert_eq!(tables.len(), 73);
    assert!(tables.contains(&"seaql_migrations".to_string()));
    assert!(tables.contains(&"agent_run_items".to_string()));
    assert!(!tables.contains(&"agent_checkpoints".to_string()));
    let legacy_run_columns: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'agent_runs'
           AND column_name IN ('lane', 'stage')",
    )
    .fetch_one(&pool)
    .await
    .expect("check retired run columns");
    assert_eq!(legacy_run_columns, 0);
    let output_message_columns: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'agent_runs'
           AND column_name = 'output_message_id'",
    )
    .fetch_one(&pool)
    .await
    .expect("check output message link");
    assert_eq!(output_message_columns, 1);
    for excluded in [
        "price_history",
        "price_fetch_failures",
        "account_equity_rebuild",
        "paddle_webhook_events",
        "brokerage_transactions_dedup_archive",
    ] {
        assert!(!tables.contains(&excluded.to_string()), "found {excluded}");
    }
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn current_sqlx_schema_adopts_without_data_loss() {
    let (admin, pool, schema) = isolated_pool().await;
    pg::migrate(&pool).await.expect("replay SQLx archive");
    sqlx::query(
        "INSERT INTO users (id, clerk_uuid, email, full_name) VALUES ('u1', 'c1', 'u1@test.local', 'User One')",
    )
    .execute(&pool)
    .await
    .expect("seed adoption row");
    let index_oid_before: i64 = sqlx::query_scalar(
        "SELECT 'idx_brokerage_tx_user_workspace_date_id'::regclass::oid::bigint",
    )
    .fetch_one(&pool)
    .await
    .expect("read adoption index oid");

    let db = bootstrap(&pool, &schema)
        .await
        .expect("adopt current schema");
    contract::verify(&db)
        .await
        .expect("contract after adoption");
    for retained in [
        "price_history",
        "price_fetch_failures",
        "account_equity_rebuild",
        "paddle_webhook_events",
        "brokerage_transactions_dedup_archive",
    ] {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables \
             WHERE table_schema = current_schema() AND table_name = $1)",
        )
        .bind(retained)
        .fetch_one(&pool)
        .await
        .expect("check retained unmanaged table");
        assert!(exists, "adoption removed unmanaged table {retained}");
    }
    let user_name: String = sqlx::query_scalar("SELECT full_name FROM users WHERE id = 'u1'")
        .fetch_one(&pool)
        .await
        .expect("read preserved row");
    assert_eq!(user_name, "User One");
    let index_oid_after: i64 = sqlx::query_scalar(
        "SELECT 'idx_brokerage_tx_user_workspace_date_id'::regclass::oid::bigint",
    )
    .fetch_one(&pool)
    .await
    .expect("read adopted index oid");
    assert_eq!(index_oid_after, index_oid_before);
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn managed_schema_rejects_a_missing_table() {
    let (admin, pool, schema) = isolated_pool().await;
    bootstrap(&pool, &schema)
        .await
        .expect("bootstrap current managed schema");
    sqlx::query("DROP TABLE market_monitors")
        .execute(&pool)
        .await
        .expect("simulate accidental table loss");

    let error = bootstrap(&pool, &schema)
        .await
        .expect_err("missing managed table must block startup");
    assert!(error.to_string().contains("partial managed schema"));
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn older_sqlx_schema_finishes_archived_migrations_before_adoption() {
    let (admin, pool, schema) = isolated_pool().await;
    let migrations_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../schema/archive/sqlx");
    let all_migrations = SqlxMigrator::new(migrations_path.as_path())
        .await
        .expect("load archived migrations");
    SqlxMigrator::with_migrations(
        all_migrations
            .iter()
            .filter(|migration| migration.version <= 52)
            .cloned()
            .collect(),
    )
    .run(&pool)
    .await
    .expect("migrate through SQLx schema 0052");
    sqlx::query(
        "INSERT INTO users (id, clerk_uuid, email, full_name) VALUES ('u1', 'c1', 'u1@test.local', 'User One')",
    )
    .execute(&pool)
    .await
    .expect("seed older schema row");

    let db = bootstrap(&pool, &schema)
        .await
        .expect("upgrade and adopt older SQLx schema");
    contract::verify(&db)
        .await
        .expect("contract after older schema adoption");
    let applied_versions: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .expect("read applied SQLx versions");
    assert_eq!(applied_versions, (1..=60).collect::<Vec<_>>());
    let user_name: String = sqlx::query_scalar("SELECT full_name FROM users WHERE id = 'u1'")
        .fetch_one(&pool)
        .await
        .expect("read preserved older schema row");
    assert_eq!(user_name, "User One");
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn activity_migration_backfills_owned_completed_message_links() {
    let (admin, pool, schema) = isolated_pool().await;
    pg::migrate(&pool).await.expect("replay SQLx archive");
    let db = sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, Some(2))
        .await
        .expect("migrate through runtime replacement");
    pool.execute(sqlx::AssertSqlSafe(
        "INSERT INTO users (id,clerk_uuid,email,full_name)
         VALUES ('u1','c1','u1@test.local','User One');
         INSERT INTO workspaces (id,user_id,name) VALUES ('w1','u1','Main');
         INSERT INTO agent_conversations (id,user_id,workspace_id) VALUES ('c1','u1','w1');
         INSERT INTO agent_messages
             (id,conversation_id,user_id,workspace_id,sequence,role,content_json)
         VALUES ('m1','c1','u1','w1',1,'assistant','{\"blocks\":[]}'::jsonb);
         INSERT INTO agent_runs
             (id,conversation_id,user_id,workspace_id,status,idempotency_key,completed_at)
         VALUES ('r1','c1','u1','w1','completed','activity-backfill',now());
         INSERT INTO agent_run_events
             (id,run_id,user_id,workspace_id,sequence,kind,payload_json)
         VALUES ('e1','r1','u1','w1',1,'run_completed','{\"messageId\":\"m1\"}'::jsonb);"
            .to_string(),
    ))
    .await
    .expect("seed completed pre-activity run");

    Migrator::up(&db, None)
        .await
        .expect("apply activity migration");
    let output_message_id: Option<String> =
        sqlx::query_scalar("SELECT output_message_id FROM agent_runs WHERE id='r1'")
            .fetch_one(&pool)
            .await
            .expect("read backfilled message link");
    assert_eq!(output_message_id.as_deref(), Some("m1"));
    contract::verify(&db)
        .await
        .expect("contract after activity upgrade");
    cleanup(admin, pool, &schema).await;
}
