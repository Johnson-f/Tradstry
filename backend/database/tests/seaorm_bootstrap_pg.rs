use std::path::PathBuf;
use std::str::FromStr;

use sqlx::migrate::Migrator as SqlxMigrator;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Executor, PgPool};
use tradstry_database::schema::{bootstrap, contract, pg};
use tradstry_migration::{Migrator, MigratorTrait};
use uuid::Uuid;

#[tokio::test]
async fn recent_trades_upgrade_preserves_note_content_and_trade_links() {
    let (admin, pool, schema) = isolated_pool().await;
    pg::migrate(&pool).await.unwrap();
    let db = sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, Some(8)).await.unwrap();
    pool.execute("INSERT INTO users(id,clerk_uuid,email,full_name) VALUES ('recent-u','recent-c','recent@test.local','Recent');
        INSERT INTO workspaces(id,user_id,name) VALUES ('recent-w','recent-u','Main');
        INSERT INTO notebook_folders(id,user_id,workspace_id,name,is_system) VALUES ('recent-system','recent-u','recent-w','System',true);
        INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,open_date,close_date,entry_price,exit_price,position_size,trade_type,status,total_pl,net_roi,duration)
        VALUES ('recent-trade','recent-u','recent-w','PAY','Paymentus',now(),now(),1,2,1,'long','profit',1,1,1);
        INSERT INTO notebook_notes(id,user_id,workspace_id,title,document_json,purpose,hlc) VALUES ('recent-note','recent-u','recent-w','Keep title','{\"keep\":true}','trade_context','009999999999999:00001:test');
        INSERT INTO journal_trade_context(entry_id,user_id,workspace_id,companion_note_id) VALUES ('recent-trade','recent-u','recent-w','recent-note');
        INSERT INTO notebook_note_trades(note_id,trade_id) VALUES ('recent-note','recent-trade');").await.unwrap();
    bootstrap(&pool, &schema).await.unwrap();
    let row: (String, String, String, bool, String) = sqlx::query_as("SELECT n.title,n.document_json,f.name,f.is_system,f.parent_folder_id FROM notebook_notes n JOIN notebook_folders f ON f.id=n.folder_id WHERE n.id='recent-note'").fetch_one(&pool).await.unwrap();
    assert_eq!(
        row,
        (
            "Keep title".into(),
            "{\"keep\":true}".into(),
            "Recent Trades".into(),
            true,
            "recent-system".into()
        )
    );
    let links: i64 = sqlx::query_scalar("SELECT count(*) FROM notebook_note_trades WHERE note_id='recent-note' AND trade_id='recent-trade'").fetch_one(&pool).await.unwrap();
    assert_eq!(links, 1);
    let stamp: String = sqlx::query_scalar("SELECT hlc FROM notebook_notes WHERE id='recent-note'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(
        stamp.as_str() > "009999999999999:00001:test",
        "desktop must accept the folder backfill"
    );
    bootstrap(&pool, &schema).await.unwrap();
    let folders: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM notebook_folders WHERE workspace_id='recent-w' AND is_system",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(folders, 2);
    cleanup(admin, pool, &schema).await;
}

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
    let schema = format!("seaorm_test_{}", Uuid::now_v7().simple());
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

async fn assert_uuid_v7_defaults(pool: &PgPool) {
    let defaults: Vec<String> = sqlx::query_scalar(
        "SELECT column_default FROM information_schema.columns
         WHERE table_schema=current_schema()
           AND table_name IN ('snaptrade_oauth_attempts','snaptrade_oauth_grants')
           AND column_name='id'
         ORDER BY table_name",
    )
    .fetch_all(pool)
    .await
    .expect("read UUID defaults");
    assert_eq!(defaults.len(), 2);
    assert!(
        defaults.iter().all(|default| default.contains("uuidv7()")),
        "expected UUIDv7 defaults, got {defaults:?}"
    );
}

#[tokio::test]
async fn journal_flow_schema_records_an_open_trade_without_inventing_a_close_or_stop() {
    let (admin, pool, schema) = isolated_pool().await;
    bootstrap(&pool, &schema)
        .await
        .expect("bootstrap journal schema");
    pool.execute("INSERT INTO users (id,clerk_uuid,email,full_name) VALUES ('journal-user','journal-clerk','journal@test.local','Journal User');
        INSERT INTO workspaces (id,user_id,name) VALUES ('journal-workspace','journal-user','Journal');
        INSERT INTO journal_entries (id,user_id,workspace_id,symbol,symbol_name,trade_type,source_kind,lifecycle_state,outcome,remaining_quantity)
        VALUES ('open-trade','journal-user','journal-workspace','ACME','Acme','long','broker','open','unknown',100)")
        .await.expect("record an open broker trade");
    let row: (Option<String>, Option<f64>, Option<f64>, String) =
        sqlx::query_as("SELECT close_date::text,exit_price,stop_loss,lifecycle_state FROM journal_entries WHERE id='open-trade'")
        .fetch_one(&pool).await.expect("read the open entry");
    assert_eq!(row, (None, None, None, "open".to_string()));
    let missing_price = pool.execute("INSERT INTO journal_trade_context(entry_id,user_id,workspace_id,stop_state) VALUES ('open-trade','journal-user','journal-workspace','price')").await;
    assert!(
        missing_price.is_err(),
        "a stated stop price cannot be unknown"
    );
    pool.execute("INSERT INTO journal_trade_context(entry_id,user_id,workspace_id,stop_state) VALUES ('open-trade','journal-user','journal-workspace','unknown')")
        .await.expect("unknown stop remains valid");
    pool.execute("INSERT INTO users(id,clerk_uuid,email,full_name) VALUES ('other','other-clerk','other@test.local','Other'); INSERT INTO workspaces(id,user_id,name) VALUES ('other-workspace','other','Other')")
        .await.expect("seed separate owner");
    let wrong_owner = pool.execute("INSERT INTO journal_review_drafts(entry_id,user_id,workspace_id) VALUES ('open-trade','other','other-workspace')").await;
    assert!(wrong_owner.is_err(), "draft must belong to the entry owner");
    cleanup(admin, pool, &schema).await;
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
    assert_uuid_v7_defaults(&pool).await;

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()",
    )
    .fetch_all(&pool)
    .await
    .expect("list fresh tables");
    assert_eq!(tables.len(), 89);
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
async fn journal_flow_upgrade_preserves_existing_entry_notes_and_execution_links() {
    let (admin, pool, schema) = isolated_pool().await;
    pg::migrate(&pool).await.expect("replay archived schema");
    let db = sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, Some(7))
        .await
        .expect("previous release schema");
    pool.execute("INSERT INTO users(id,clerk_uuid,email,full_name) VALUES ('u1','c1','one@test.local','One');
        INSERT INTO workspaces(id,user_id,name) VALUES ('w1','u1','Main');
        INSERT INTO journal_entries(id,user_id,workspace_id,open_date,close_date,entry_price,exit_price,position_size,symbol,symbol_name,status,total_pl,net_roi,duration,trade_type,mistakes,entry_tactics,edges_spotted,notes)
        VALUES ('existing','u1','w1','2026-09-01','2026-09-02',100,110,10,'ACME','Acme','profit',10,10,86400,'long','','','','Keep my original reflection');
        INSERT INTO journal_brokerage_links(id,user_id,journal_entry_id,brokerage_transaction_id) VALUES ('link1','u1','existing','broker-buy');
        INSERT INTO notebook_notes(id,user_id,workspace_id,title,document_json) VALUES ('note1','u1','w1','My notes','{}');
        INSERT INTO notebook_note_trades(note_id,trade_id) VALUES ('note1','existing');
        INSERT INTO tag_categories(id,user_id,workspace_id,name,created_at,updated_at) VALUES ('category','u1','w1','Strategy',now(),now());
        INSERT INTO tags(id,user_id,workspace_id,category_id,name,created_at,updated_at) VALUES ('tag','u1','w1','category','Breakout',now(),now());
        INSERT INTO trade_tags(journal_entry_id,tag_id) VALUES ('existing','tag');
        INSERT INTO notebook_media_blobs(id,user_id,object_key,content_type,media_type,format,bytes,checksum_sha256)
        VALUES ('blob','u1','owned/image','image/png','image','png',100,'test-checksum');
        INSERT INTO notebook_media_references(id,blob_id,user_id,workspace_id,note_id,original_filename)
        VALUES ('attachment','blob','u1','w1','note1','chart.png');")
        .await.expect("seed linked legacy journal entry");
    let related_sql = "SELECT jsonb_build_object('tags',(SELECT jsonb_agg(to_jsonb(t)) FROM trade_tags t),'notes',(SELECT jsonb_agg(to_jsonb(t)) FROM notebook_note_trades t),'media',(SELECT jsonb_agg(to_jsonb(t)) FROM notebook_media_references t),'blobs',(SELECT jsonb_agg(to_jsonb(t)) FROM notebook_media_blobs t))";
    let related_before: serde_json::Value = sqlx::query_scalar(related_sql)
        .fetch_one(&pool)
        .await
        .expect("capture related records");
    let before: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(e) FROM journal_entries e WHERE id='existing'")
            .fetch_one(&pool)
            .await
            .expect("capture legacy entry");
    bootstrap(&pool, &schema)
        .await
        .expect("upgrade journal schema");
    let after: serde_json::Value =
        sqlx::query_scalar("SELECT to_jsonb(e) FROM journal_entries e WHERE id='existing'")
            .fetch_one(&pool)
            .await
            .expect("read upgraded entry");
    for (key, value) in before.as_object().expect("entry object") {
        if key == "updated_at" {
            assert!(after[key].as_str().unwrap() >= value.as_str().unwrap());
            continue;
        }
        assert_eq!(&after[key], value, "changed legacy field {key}");
    }
    assert_eq!(after["source_kind"], "manual");
    assert_eq!(after["outcome"], "profit");
    let links: (i64,i64) = sqlx::query_as("SELECT (SELECT count(*) FROM journal_brokerage_links WHERE id='link1'),(SELECT count(*) FROM notebook_note_trades WHERE trade_id='existing')")
        .fetch_one(&pool).await.expect("read preserved links");
    assert_eq!(links, (1, 1));
    let related_after: serde_json::Value = sqlx::query_scalar(related_sql)
        .fetch_one(&pool)
        .await
        .expect("read preserved related records");
    assert_eq!(related_after, related_before);
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
    sqlx::query("INSERT INTO workspaces (id,user_id,name) VALUES ('w1','u1','Main')")
        .execute(&pool)
        .await
        .expect("seed adoption workspace");
    sqlx::query(
        "INSERT INTO snaptrade_oauth_grants (id,user_id,oauth_client_id,status)
         VALUES ('74738ff5-5367-5958-9aee-98fffdcd1876','u1','legacy-client','revoked')",
    )
    .execute(&pool)
    .await
    .expect("seed legacy UUIDv5 row");
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
    assert_uuid_v7_defaults(&pool).await;
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
    let legacy_id: String = sqlx::query_scalar(
        "SELECT id FROM snaptrade_oauth_grants WHERE oauth_client_id='legacy-client'",
    )
    .fetch_one(&pool)
    .await
    .expect("read preserved legacy UUIDv5 row");
    assert_eq!(legacy_id, "74738ff5-5367-5958-9aee-98fffdcd1876");
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

#[tokio::test]
async fn notebook_media_migration_normalizes_shared_hashes_and_quota() {
    let (admin, pool, schema) = isolated_pool().await;
    pg::migrate(&pool).await.expect("replay SQLx archive");
    pool.execute(sqlx::AssertSqlSafe(
        "INSERT INTO users (id,clerk_uuid,email,full_name)
         VALUES ('u1','c1','u1@test.local','User One');
         INSERT INTO workspaces (id,user_id,name) VALUES ('w1','u1','Main');
         INSERT INTO notebook_notes
             (id,user_id,workspace_id,title,document_json)
         VALUES
             ('n1','u1','w1','One','{\"root\":{\"children\":[]}}'),
             ('n2','u1','w1','Two','{\"root\":{\"children\":[]}}'),
             ('n3','u1','w1','Three','{\"root\":{\"children\":[]}}'),
             ('n4','u1','w1','Four','{\"root\":{\"children\":[]}}');
         INSERT INTO notebook_images
             (id,note_id,user_id,workspace_id,cloudinary_asset_id,
              cloudinary_public_id,secure_url,width,height,format,bytes,
              original_filename,media_type,content_type,duration_seconds,content_hash)
         VALUES
             ('i1','n1','u1','w1','shared','notebook/u1/media/shared','',10,10,
              'png',100,'one.png','image','image/png',0,'shared'),
             ('i2','n2','u1','w1','shared','notebook/u1/media/shared','',10,10,
              'png',100,'two.png','image','image/png',0,'shared'),
             ('i3','n3','u1','w1','legacy-1','notebook/u1/w1/legacy','',5,5,
              'png',50,'three.png','image','image/png',0,''),
             ('i4','n4','u1','w1','legacy-2','notebook/u1/w1/legacy','',5,5,
              'png',50,'four.png','image','image/png',0,'');"
            .to_string(),
    ))
    .await
    .expect("seed shared notebook media");

    let db = bootstrap(&pool, &schema)
        .await
        .expect("upgrade notebook media lifecycle");
    contract::verify(&db)
        .await
        .expect("contract after notebook media upgrade");

    let blob_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_blobs WHERE user_id='u1'")
            .fetch_one(&pool)
            .await
            .expect("count normalized blobs");
    let reference_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE user_id='u1'")
            .fetch_one(&pool)
            .await
            .expect("count normalized references");
    let usage: (i64, i64) =
        sqlx::query_as("SELECT media_bytes_used,media_bytes_reserved FROM users WHERE id='u1'")
            .fetch_one(&pool)
            .await
            .expect("read normalized media quota");
    let legacy_table: Option<String> = sqlx::query_scalar(
        "SELECT table_name FROM information_schema.tables
         WHERE table_schema=current_schema() AND table_name='notebook_images'",
    )
    .fetch_optional(&pool)
    .await
    .expect("inspect legacy notebook media table");

    assert_eq!(blob_count, 2);
    assert_eq!(reference_count, 4);
    assert_eq!(usage, (150, 0));
    assert_eq!(legacy_table, None);
    cleanup(admin, pool, &schema).await;
}

#[tokio::test]
async fn media_derivative_recovery_requeues_exhausted_jobs() {
    let (admin, pool, schema) = isolated_pool().await;
    let db = bootstrap(&pool, &schema)
        .await
        .expect("bootstrap media schema");
    pool.execute(sqlx::AssertSqlSafe(
        "INSERT INTO users(id,clerk_uuid,email,full_name)
         VALUES ('u1','c1','u1@test.local','User One');
         INSERT INTO notebook_media_blobs
         (id,user_id,content_hash,object_key,state,content_type,media_type,format,bytes,
          checksum_sha256,quota_counted)
         VALUES ('b1','u1','hash','object','ready','image/png','image','png',10,'hash',true);
         INSERT INTO notebook_media_outbox
         (blob_id,user_id,action,attempt_count,max_attempts,last_error_code)
         VALUES ('b1','u1','derive',5,5,'media_worker_failed');
         DELETE FROM seaql_migrations
         WHERE version='m20260830_000006_requeue_media_derivatives';"
            .to_string(),
    ))
    .await
    .expect("seed exhausted derivative job");

    Migrator::up(&db, None)
        .await
        .expect("apply derivative recovery migration");
    let job: (i32, Option<String>) = sqlx::query_as(
        "SELECT attempt_count,last_error_code FROM notebook_media_outbox
         WHERE blob_id='b1' AND action='derive'",
    )
    .fetch_one(&pool)
    .await
    .expect("read recovered derivative job");
    assert_eq!(job, (0, None));
    cleanup(admin, pool, &schema).await;
}
