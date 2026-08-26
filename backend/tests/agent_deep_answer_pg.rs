mod agent_support;
mod pg_support;

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tinyagents::harness::message::{AssistantMessage, ContentBlock, Message};
use tinyagents::harness::model::{ChatModel, ModelRequest, ModelResponse, ResponseFormat};
use tinyagents::harness::tool::ToolCall;
use tinyagents::harness::usage::Usage;
use tradstry_backend::service::agents::actions::execute_action;
use tradstry_backend::service::agents::execution::run_agent_worker;
use tradstry_backend::service::agents::runtime::{AgentModelRegistry, AgentRuntimeState};
use tradstry_backend::service::agents::{
    AgentConfig, AgentMessageContext, AgentRunStatus, AgentService, AgentStore, SendAgentMessage,
};

use agent_support::AgentPgFixture;

struct DeepScriptedModel;

#[async_trait]
impl ChatModel<AgentRuntimeState> for DeepScriptedModel {
    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> tinyagents::Result<ModelResponse> {
        let format_name = match request.response_format.as_ref() {
            Some(ResponseFormat::JsonSchema { name, .. }) => name.as_str(),
            _ => "",
        };
        let transcript = request
            .messages
            .iter()
            .map(Message::text)
            .collect::<Vec<_>>()
            .join("\n");
        match format_name {
            "delegation_plan" => Ok(text_response(
                serde_json::json!({
                    "rationale": "Canonical performance answers the request.",
                    "requests": [{"specialist": "performance", "query": "Analyze canonical performance", "focus": []}]
                })
                .to_string(),
            )),
            "specialist_finding" if !transcript.contains("evidenceId") => {
                Ok(tool_response(ToolCall::new(
                    "deep-performance-tool",
                    "trading_performance",
                    serde_json::json!({"range": "last_30_days"}),
                )))
            }
            "specialist_finding" => {
                let evidence_id = extract_after(&transcript, "\\\"evidenceId\\\":\\\"")
                    .or_else(|| extract_after(&transcript, "\"evidenceId\":\""))
                    .expect("tool result exposes evidence id");
                Ok(text_response(
                    serde_json::json!({
                        "specialist": "performance",
                        "summary": "Canonical performance was loaded.",
                        "claims": [{
                            "claim_id": "performance-source",
                            "text": "The performance result came from canonical Tradstry calculations.",
                            "evidence_ids": [evidence_id]
                        }],
                        "warnings": [],
                        "missing_information": []
                    })
                    .to_string(),
                ))
            }
            "tradstry_deep_answer" => {
                let evidence_id = transcript
                    .split("<allowed_evidence_ids>")
                    .nth(1)
                    .and_then(|tail| tail.split('<').next())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .expect("synthesis receives evidence ids");
                Ok(text_response(
                    serde_json::json!({
                        "blocks": [{"kind": "paragraph", "text": "Your performance was calculated from your canonical closed-trade data."}],
                        "claims": [{
                            "claim_id": "canonical-performance",
                            "text": "The answer uses canonical Tradstry performance data.",
                            "evidence_ids": [evidence_id]
                        }]
                    })
                    .to_string(),
                ))
            }
            "agent_action" => Ok(text_response(
                serde_json::json!({
                    "kind": "add_trade_tag",
                    "input": {
                        "trade_id": "deep-action-trade",
                        "tag_id": "deep-action-tag",
                        "expected_trade_version": ""
                    }
                })
                .to_string(),
            )),
            other => Err(tinyagents::TinyAgentsError::Model(format!(
                "unexpected structured format {other}"
            ))),
        }
    }
}

#[tokio::test]
async fn explicit_write_request_creates_pending_proposal_and_only_mutates_after_approval() {
    let fixture = AgentPgFixture::new().await;
    sqlx::query(
        "INSERT INTO journal_entries
         (id,user_id,workspace_id,open_date,close_date,entry_price,exit_price,position_size,
          symbol,symbol_name,status,total_pl,net_roi,duration,stop_loss,risk_reward,trade_type,
          mistakes,entry_tactics,edges_spotted,hlc)
         VALUES('deep-action-trade',$1,$2,now()-interval '1 hour',now(),1,2,1,'AAPL','Apple',
                'profit',1,1,1,0.5,1,'long','','','','action-v1')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tag_categories(id,user_id,workspace_id,name,created_at,updated_at)
         VALUES('deep-action-category',$1,$2,'Setup',now(),now())",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO tags(id,user_id,workspace_id,category_id,name,created_at,updated_at)
         VALUES('deep-action-tag',$1,$2,'deep-action-category','Breakout',now(),now())",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(DeepScriptedModel);
    let service = Arc::new(AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        Some(AgentModelRegistry::from_models(
            model.clone(),
            model.clone(),
            model,
        )),
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
                content: "Add tag to this trade after reviewing it".into(),
                context: AgentMessageContext {
                    trade_ids: vec!["deep-action-trade".into()],
                    ..Default::default()
                },
                idempotency_key: "deep-action-request".into(),
            },
        )
        .await
        .unwrap();
    let run = tokio::time::timeout(Duration::from_secs(8), async {
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
    .unwrap();
    shutdown_tx.send(true).unwrap();
    service.wake_handle().notify_waiters();
    worker.await.unwrap();
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.model_calls, 3);
    let proposal_id: String = sqlx::query_scalar(
        "SELECT id FROM agent_action_proposals WHERE run_id=$1 AND status='pending'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    let linked_before: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM trade_tags WHERE journal_entry_id='deep-action-trade' AND tag_id='deep-action-tag')",
    ).fetch_one(&fixture.pool).await.unwrap();
    assert!(!linked_before);
    service
        .approve_action(&fixture.actor, &proposal_id, "deep-action-confirm")
        .await
        .unwrap();
    let job = service
        .store()
        .claim_action_execution("action-test", 120)
        .await
        .unwrap()
        .unwrap();
    execute_action(&service, &job, "action-test").await.unwrap();
    let linked_after: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM trade_tags WHERE journal_entry_id='deep-action-trade' AND tag_id='deep-action-tag')",
    ).fetch_one(&fixture.pool).await.unwrap();
    assert!(linked_after);
}

fn extract_after<'a>(value: &'a str, marker: &str) -> Option<&'a str> {
    value
        .split(marker)
        .nth(1)
        .and_then(|tail| tail.split(['"', '\\']).next())
        .filter(|value| !value.is_empty())
}

fn text_response(text: String) -> ModelResponse {
    response(vec![ContentBlock::Text(text)], Vec::new())
}

fn tool_response(call: ToolCall) -> ModelResponse {
    response(Vec::new(), vec![call])
}

fn response(content: Vec<ContentBlock>, tool_calls: Vec<ToolCall>) -> ModelResponse {
    let usage = Usage::new(12, 6);
    ModelResponse {
        message: AssistantMessage {
            id: None,
            content,
            tool_calls,
            usage: Some(usage),
        },
        usage: Some(usage),
        finish_reason: Some("stop".into()),
        raw: None,
        resolved_model: None,
        continue_turn: None,
        served_from_cache: false,
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
async fn deep_run_completes_with_child_lineage_and_verified_evidence() {
    let fixture = AgentPgFixture::new().await;
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(DeepScriptedModel);
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
                content: "Why does my recent trading performance look this way?".into(),
                context: AgentMessageContext::default(),
                idempotency_key: "deep-performance".into(),
            },
        )
        .await
        .unwrap();
    let run = tokio::time::timeout(Duration::from_secs(8), async {
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
    .expect("deep run finishes");
    shutdown_tx.send(true).unwrap();
    service.wake_handle().notify_waiters();
    worker.await.unwrap();

    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.stage, "completed");
    assert_eq!(run.model_calls, 2, "supervisor plus synthesis");
    let child: (String, i64, i64, String) = sqlx::query_as(
        "SELECT status, model_calls, tool_calls, stage FROM agent_runs WHERE parent_run_id = $1",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(
        child,
        ("completed".into(), 2, 1, "specialist_completed".into())
    );
    let used: i32 = sqlx::query_scalar(
        "SELECT used FROM usage_counters WHERE user_id = $1 AND metric = 'ai_actions'",
    )
    .bind(&fixture.actor.user_id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(used, 1);
    let messages = service
        .list_messages(&fixture.actor, &conversation.id, 20)
        .await
        .unwrap();
    assert_eq!(messages.len(), 2);
    let sources = service
        .store()
        .evidence_for_message(&fixture.actor, &messages[1].id)
        .await
        .unwrap();
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0].source_type, "calculation");
}
