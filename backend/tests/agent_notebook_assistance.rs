mod agent_support;
mod pg_support;

use std::sync::Arc;

use agent_support::AgentPgFixture;
use async_trait::async_trait;
use tinyagents::harness::message::{AssistantMessage, ContentBlock};
use tinyagents::harness::model::{ChatModel, ModelRequest, ModelResponse};
use tinyagents::harness::usage::Usage;
use tradstry_backend::service::agents::assistance::RewriteAction;
use tradstry_backend::service::agents::runtime::{AgentModelRegistry, AgentRuntimeState};
use tradstry_backend::service::agents::{AgentConfig, AgentService, AgentStore};

struct AssistanceModel;

#[async_trait]
impl ChatModel<AgentRuntimeState> for AssistanceModel {
    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        _request: ModelRequest,
    ) -> tinyagents::Result<ModelResponse> {
        let usage = Usage::new(3, 2);
        Ok(ModelResponse {
            message: AssistantMessage {
                id: None,
                content: vec![ContentBlock::Text("because volume faded".into())],
                tool_calls: vec![],
                usage: Some(usage),
            },
            usage: Some(usage),
            finish_reason: Some("stop".into()),
            raw: None,
            resolved_model: None,
            continue_turn: None,
            served_from_cache: false,
        })
    }
}

fn enabled_config() -> AgentConfig {
    AgentConfig::from_lookup(|name| match name {
        "AGENTS_V2_ENABLED" => Some("true".into()),
        "AGENT_MODEL_PROVIDER" => Some("gemini".into()),
        "AGENT_FAST_MODEL" => Some("fast".into()),
        "AGENT_REASONING_MODEL" => Some("reasoning".into()),
        "AGENT_VISION_MODEL" => Some("vision".into()),
        _ => None,
    })
    .unwrap()
}

async fn forbidden_rows(pool: &sqlx::PgPool) -> i64 {
    sqlx::query_scalar(
        "SELECT
          (SELECT count(*) FROM agent_conversations)+
          (SELECT count(*) FROM agent_runs)+
          (SELECT count(*) FROM agent_run_events)+
          (SELECT count(*) FROM agent_run_items)+
          (SELECT count(*) FROM agent_tool_calls)+
          (SELECT count(*) FROM agent_evidence)+
          (SELECT count(*) FROM agent_memories)+
          (SELECT count(*) FROM agent_knowledge_passages)+
          (SELECT count(*) FROM agent_action_proposals)",
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn notebook_assistance_isolated_from_agent_state() {
    let fixture = AgentPgFixture::new().await;
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(AssistanceModel);
    let service = AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        Some(AgentModelRegistry::from_models(
            model.clone(),
            model.clone(),
            model,
        )),
    );
    let before = forbidden_rows(&fixture.pool).await;
    let completion = service
        .notebook_autocomplete(&fixture.actor, "AAPL review", "I exited early ")
        .await
        .unwrap();
    assert_eq!(completion, "because volume faded");
    let rewrite = service
        .notebook_rewrite(
            &fixture.actor,
            RewriteAction::Simplify,
            "I exited because volume faded",
        )
        .await
        .unwrap();
    assert_eq!(rewrite, "because volume faded");
    assert_eq!(forbidden_rows(&fixture.pool).await, before);
    let assistance_rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_assistance_requests WHERE status='completed'",
    )
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(assistance_rows, 2);
}
