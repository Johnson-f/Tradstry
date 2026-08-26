mod agent_support;
mod pg_support;

use std::sync::Arc;
use std::time::Duration;

use agent_support::AgentPgFixture;
use async_trait::async_trait;
use tinyagents::harness::message::{AssistantMessage, ContentBlock, Message};
use tinyagents::harness::model::{ChatModel, ModelRequest, ModelResponse};
use tradstry_backend::service::agents::execution::run_agent_worker;
use tradstry_backend::service::agents::runtime::{AgentModelRegistry, AgentRuntimeState};
use tradstry_backend::service::agents::{
    AgentConfig, AgentMessageContext, AgentRunStatus, AgentService, AgentStore, SendAgentMessage,
};

struct EvidenceEchoModel;

#[async_trait]
impl ChatModel<AgentRuntimeState> for EvidenceEchoModel {
    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> tinyagents::Result<ModelResponse> {
        let prompt = request
            .messages
            .last()
            .map(Message::text)
            .unwrap_or_default();
        let evidence_id = prompt
            .split("allowed list: ")
            .nth(1)
            .and_then(|tail| tail.split('.').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| tinyagents::TinyAgentsError::Model("missing evidence id".into()))?;
        let text = serde_json::json!({
            "blocks": [{"kind": "paragraph", "text": "Your win rate summarizes profitable closed trades."}],
            "claims": [{
                "claim_id": "win-rate-explanation",
                "text": "The reported win rate comes from canonical closed-trade performance.",
                "evidence_ids": [evidence_id]
            }]
        })
        .to_string();
        Ok(ModelResponse {
            message: AssistantMessage {
                id: None,
                content: vec![ContentBlock::Text(text)],
                tool_calls: Vec::new(),
                usage: Some(tinyagents::harness::usage::Usage::new(10, 5)),
            },
            usage: Some(tinyagents::harness::usage::Usage::new(10, 5)),
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
        "AGENT_FAST_MODEL" => Some("fast".into()),
        "AGENT_REASONING_MODEL" => Some("reasoning".into()),
        "AGENT_VISION_MODEL" => Some("vision".into()),
        _ => None,
    })
    .unwrap()
}

#[tokio::test]
async fn instant_performance_answer_uses_no_model_and_commits_evidence() {
    let fixture = AgentPgFixture::new().await;
    let service = Arc::new(AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        None,
    ));
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let worker = tokio::spawn(run_agent_worker(service.clone(), 0, shutdown_rx));
    let handle = service
        .send_message(
            &fixture.actor,
            SendAgentMessage {
                conversation_id: conversation.id.clone(),
                content: "What is my win rate?".into(),
                context: AgentMessageContext::default(),
                idempotency_key: "instant-performance".into(),
            },
        )
        .await
        .unwrap();

    let run = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let run = service
                .get_run(&fixture.actor, &handle.run_id)
                .await
                .unwrap();
            if matches!(
                run.status,
                AgentRunStatus::Completed | AgentRunStatus::Failed
            ) {
                break run;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("instant run finishes");
    shutdown_tx.send(true).unwrap();
    service.wake_handle().notify_waiters();
    worker.await.unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert_eq!(run.model_calls, 0);
    assert_eq!(run.tool_calls, 1);
    let messages = service
        .list_messages(&fixture.actor, &conversation.id, 20)
        .await
        .unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[1].role, "assistant");
    assert!(messages[1].content["blocks"].is_array());
    let evidence_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM agent_evidence WHERE run_id = $1")
            .bind(&run.id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(evidence_count, 1);
    let usage_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM usage_counters WHERE user_id = $1")
            .bind(&fixture.actor.user_id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(usage_count, 0);
}

#[tokio::test]
async fn fast_ai_lane_uses_one_tool_one_model_and_one_budget_action() {
    let fixture = AgentPgFixture::new().await;
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(EvidenceEchoModel);
    let models = AgentModelRegistry::from_models(model.clone(), model.clone(), model);
    let service = Arc::new(AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        Some(models),
    ));
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let worker = tokio::spawn(run_agent_worker(service.clone(), 0, shutdown_rx));
    let handle = service
        .send_message(
            &fixture.actor,
            SendAgentMessage {
                conversation_id: conversation.id.clone(),
                content: "Explain my win rate".into(),
                context: AgentMessageContext::default(),
                idempotency_key: "fast-performance".into(),
            },
        )
        .await
        .unwrap();
    let run = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let run = service
                .get_run(&fixture.actor, &handle.run_id)
                .await
                .unwrap();
            if matches!(
                run.status,
                AgentRunStatus::Completed | AgentRunStatus::Failed
            ) {
                break run;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("fast run finishes");
    shutdown_tx.send(true).unwrap();
    service.wake_handle().notify_waiters();
    worker.await.unwrap();

    assert_eq!(run.status, AgentRunStatus::Completed);
    assert_eq!(run.model_calls, 1);
    assert_eq!(run.tool_calls, 1);
    assert_eq!(run.input_tokens, 10);
    assert_eq!(run.output_tokens, 5);
    let used: i32 = sqlx::query_scalar(
        "SELECT used FROM usage_counters WHERE user_id = $1 AND metric = 'ai_actions'",
    )
    .bind(&fixture.actor.user_id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(used, 1);
}
