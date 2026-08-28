#![allow(dead_code)]

use std::sync::Arc;

use sea_orm::SqlxPostgresConnector;
use serde_json::json;
use tokio::sync::OwnedMutexGuard;
use tradstry_backend::service::agents::{
    AgentActor, AgentConversation, AgentRun, AgentScope, AgentStore, CreateAgentRun,
};
use tradstry_backend::service::db::Db;
use tradstry_migration::{Migrator, MigratorTrait};

use crate::pg_support::{reset_schema, seed_user_workspace, test_pool};

pub struct AgentPgFixture {
    pub pool: sqlx::PgPool,
    pub db: Arc<Db>,
    pub actor: AgentActor,
    pub scope: AgentScope,
    pub store: AgentStore,
    _schema_guard: OwnedMutexGuard<()>,
}

impl AgentPgFixture {
    pub async fn new() -> Self {
        let pool = test_pool().await;
        let schema_guard = reset_schema(&pool).await;
        tradstry_backend::service::db::schema::pg::migrate(&pool)
            .await
            .expect("migrate archived agent test schema");
        let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
        Migrator::up(&db, None)
            .await
            .expect("migrate agent test runtime");
        let (user_id, workspace_id) = seed_user_workspace(&pool).await;
        let db = Arc::new(Db::from_pool(pool.clone()));
        let store = AgentStore::new(pool.clone());
        Self {
            pool,
            db,
            actor: AgentActor {
                user_id,
                clerk_id: "clerk-agent-test".into(),
            },
            scope: AgentScope { workspace_id },
            store,
            _schema_guard: schema_guard,
        }
    }

    pub async fn create_conversation(&self) -> AgentConversation {
        self.store
            .create_conversation(&self.actor, &self.scope)
            .await
            .expect("create agent conversation")
    }

    pub async fn create_run(&self, idempotency_key: &str) -> AgentRun {
        let conversation = self.create_conversation().await;
        self.store
            .create_run(
                &self.actor,
                &CreateAgentRun {
                    conversation_id: conversation.id,
                    parent_run_id: None,
                    input_message_id: None,
                    idempotency_key: idempotency_key.into(),
                },
            )
            .await
            .expect("create agent run")
    }

    pub async fn seed_complete_run(&self, conversation_id: &str) -> AgentRun {
        self.store
            .append_message(
                &self.actor,
                conversation_id,
                "user",
                &json!({"text": "hello"}),
            )
            .await
            .expect("append user message");
        let run = self
            .store
            .create_run(
                &self.actor,
                &CreateAgentRun {
                    conversation_id: conversation_id.into(),
                    parent_run_id: None,
                    input_message_id: None,
                    idempotency_key: format!("seed-{conversation_id}"),
                },
            )
            .await
            .expect("create seeded run");
        self.store
            .append_event(&run.id, "run_queued", &json!({}))
            .await
            .expect("append queued event");
        run
    }

    pub async fn count_runtime_rows(&self, conversation_id: &str) -> i64 {
        sqlx::query_scalar(
            "SELECT
                (SELECT count(*) FROM agent_conversations WHERE id = $1) +
                (SELECT count(*) FROM agent_messages WHERE conversation_id = $1) +
                (SELECT count(*) FROM agent_runs WHERE conversation_id = $1) +
                (SELECT count(*) FROM agent_run_events WHERE run_id IN
                    (SELECT id FROM agent_runs WHERE conversation_id = $1)) +
                (SELECT count(*) FROM agent_run_items WHERE run_id IN
                    (SELECT id FROM agent_runs WHERE conversation_id = $1))",
        )
        .bind(conversation_id)
        .fetch_one(&self.pool)
        .await
        .expect("count runtime rows")
    }
}
