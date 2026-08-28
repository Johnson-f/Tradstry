mod pg_support;

use pg_support::{reset_schema, seed_user_workspace, test_pool};
use sea_orm::SqlxPostgresConnector;
use tradstry_backend::service::users::export::build_export;
use tradstry_migration::{Migrator, MigratorTrait};

async fn migrated_pool() -> sqlx::PgPool {
    let pool = test_pool().await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .expect("migrate");
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    Migrator::up(&db, None)
        .await
        .expect("apply SeaORM migrations");
    pool
}

#[tokio::test]
async fn export_contains_a_key_for_every_user_table() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    let pool = migrated_pool().await;

    let (user_id, _account_id) = seed_user_workspace(&pool).await;

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let export = build_export(&db, &user_id).await.expect("build export");

    for key in [
        "user",
        "workspaces",
        "brokerage_connections",
        "journal_entries",
        "playbooks",
        "trading_principles",
        "tags",
        "tag_categories",
        "trade_tags",
        "trade_principle_violations",
        "notebook_folders",
        "notebook_notes",
        "notebook_note_trades",
        "notebook_images",
        "brokerage_transactions",
        "account_equity_history",
        "agent_conversations",
        "agent_messages",
        "agent_runs",
        "agent_run_events",
        "agent_run_items",
        "agent_tool_calls",
        "agent_evidence",
        "agent_claims",
        "agent_claim_evidence",
        "agent_conversation_summary_jobs",
        "agent_memories",
        "agent_memory_jobs",
        "agent_knowledge_passages",
        "agent_index_outbox",
        "agent_action_proposals",
        "agent_action_executions",
        "agent_assistance_requests",
    ] {
        assert!(export.get(key).is_some(), "export is missing `{key}`");
    }

    assert_eq!(
        export["workspaces"].as_array().map(|rows| rows.len()),
        Some(1),
        "the seeded account should be in the export"
    );
}

#[tokio::test]
async fn export_excludes_another_users_rows() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    let pool = migrated_pool().await;

    let (mine, _) = seed_user_workspace(&pool).await;
    let (_theirs, _) = seed_user_workspace(&pool).await;

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let export = build_export(&db, &mine).await.expect("build export");

    let workspaces = export["workspaces"].as_array().expect("workspaces array");
    assert_eq!(
        workspaces.len(),
        1,
        "export leaked another user's workspaces"
    );
    assert_eq!(workspaces[0]["user_id"], mine);
}
