mod agent_support;
mod pg_support;

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tinyagents::harness::message::{AssistantMessage, ContentBlock, Message};
use tinyagents::harness::model::ResponseFormat;
use tinyagents::harness::model::{ChatModel, ModelRequest, ModelResponse};
use tinyagents::harness::tool::ToolCall;
use tinyagents::harness::usage::Usage;
use tradstry_backend::service::agents::execution::run_agent_worker;
use tradstry_backend::service::agents::runtime::{AgentModelRegistry, AgentRuntimeState};
use tradstry_backend::service::agents::{
    AgentConfig, AgentIntent, AgentMessageContext, AgentRun, AgentRunStatus, AgentService,
    AgentStore, SendAgentMessage,
};

use agent_support::AgentPgFixture;

struct TurnModel;

#[async_trait]
impl ChatModel<AgentRuntimeState> for TurnModel {
    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> tinyagents::Result<ModelResponse> {
        let transcript = request
            .messages
            .iter()
            .map(Message::text)
            .collect::<Vec<_>>()
            .join("\n");
        let format_name = match request.response_format.as_ref() {
            Some(ResponseFormat::JsonSchema { name, .. }) => name.as_str(),
            _ => "",
        };
        let repair_requested = transcript.contains("previous structured answer failed validation");
        if format_name == "specialist_finding" {
            return Ok(text_response(
                serde_json::json!({
                    "summary":"The delegated performance analysis completed.",
                    "claims":[],
                    "warnings":[],
                    "missing_information":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Delegate this analysis")
            && !transcript.contains("delegated performance analysis completed")
        {
            return Ok(response(
                Vec::new(),
                vec![ToolCall::new(
                    "delegate-call",
                    "delegate_performance",
                    serde_json::json!({"task":"Analyze performance patterns."}),
                )],
            ));
        }
        if transcript.contains("delegated performance analysis completed") {
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2",
                    "paragraphs":[{"order":0,"text":"The delegated analysis completed."}],
                    "metrics":[],"lists":[],"warnings":[],"action_proposals":[],
                    "claims":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Use a malformed block") && !repair_requested {
            return Ok(text_response(
                serde_json::json!({
                    "blocks":[{"kind":"metric","label":"Missing value"}],
                    "claims":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Never repair this answer") {
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2","paragraphs":[],"metrics":[],"lists":[],
                    "warnings":[],"action_proposals":[],"claims":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Use a malformed block") && repair_requested {
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2",
                    "paragraphs":[{"order":0,"text":"The malformed answer was repaired."}],
                    "metrics":[],"lists":[],"warnings":[],"action_proposals":[],
                    "claims":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Use an invalid citation") && !repair_requested {
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2",
                    "paragraphs":[{"order":0,"text":"Unsupported claim."}],
                    "metrics":[],"lists":[],"warnings":[],"action_proposals":[],
                    "claims":[{"claim_id":"bad","text":"Unsupported claim.","evidence_ids":["foreign"]}]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Use an invalid citation") && repair_requested {
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2",
                    "paragraphs":[],"metrics":[],"lists":[],
                    "warnings":[{"order":0,"text":"I do not have verified evidence for that claim."}],
                    "action_proposals":[],
                    "claims":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("Create a note") && !transcript.contains("proposalId") {
            return Ok(response(
                Vec::new(),
                vec![ToolCall::new(
                    "proposal-call",
                    "propose_action",
                    serde_json::json!({
                        "kind":"create_notebook_note",
                        "input":{"title":"Trade review","markdown":"Review the attached setup."}
                    }),
                )],
            ));
        }
        if transcript.contains("proposalId") {
            let proposal_id = transcript
                .split("\"proposalId\":\"")
                .nth(1)
                .and_then(|value| value.split('"').next())
                .expect("proposal tool result contains proposal id");
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2",
                    "paragraphs":[{"order":0,"text":"I prepared the note for your approval."}],
                    "metrics":[],"lists":[],"warnings":[],
                    "action_proposals":[{"order":1,"proposal_id":proposal_id}],
                    "claims":[]
                })
                .to_string(),
            ));
        }
        if transcript.contains("What is my win rate") && !transcript.contains("evidenceId") {
            return Ok(response(
                Vec::new(),
                vec![ToolCall::new(
                    "performance-call",
                    "trading_performance",
                    serde_json::json!({"range":"last_30_days"}),
                )],
            ));
        }
        if transcript.contains("evidenceId") {
            let evidence_id = transcript
                .split("\"evidenceId\":\"")
                .nth(1)
                .and_then(|value| value.split('"').next())
                .expect("tool result contains evidence id");
            return Ok(text_response(
                serde_json::json!({
                    "schema_version":"2",
                    "paragraphs":[{"order":0,"text":"I checked your canonical trading performance."}],
                    "metrics":[],"lists":[],"warnings":[],"action_proposals":[],
                    "claims":[{"claim_id":"performance","text":"Canonical performance was checked.","evidence_ids":[evidence_id]}]
                })
                .to_string(),
            ));
        }
        Ok(text_response(
            serde_json::json!({
                "schema_version":"2",
                "paragraphs":[{"order":0,"text":"Hey! How can I help with your trading today?"}],
                "metrics":[],"lists":[],"warnings":[],"action_proposals":[],
                "claims":[]
            })
            .to_string(),
        ))
    }
}

fn response(content: Vec<ContentBlock>, tool_calls: Vec<ToolCall>) -> ModelResponse {
    let usage = Usage {
        input_tokens: 10,
        output_tokens: 5,
        ..Default::default()
    };
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

fn text_response(text: String) -> ModelResponse {
    response(vec![ContentBlock::Text(text)], Vec::new())
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

fn service(fixture: &AgentPgFixture) -> Arc<AgentService> {
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(TurnModel);
    Arc::new(AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        Some(AgentModelRegistry::from_models(
            model.clone(),
            model.clone(),
            model,
        )),
    ))
}

async fn send_and_wait(
    service: &Arc<AgentService>,
    fixture: &AgentPgFixture,
    text: &str,
) -> AgentRun {
    send_with_context_and_wait(service, fixture, text, AgentMessageContext::default()).await
}

async fn send_with_context_and_wait(
    service: &Arc<AgentService>,
    fixture: &AgentPgFixture,
    text: &str,
    context: AgentMessageContext,
) -> AgentRun {
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
                conversation_id: conversation.id,
                content: text.into(),
                context,
                idempotency_key: uuid::Uuid::new_v4().to_string(),
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
    .expect("turn finishes");
    shutdown_tx.send(true).unwrap();
    service.wake_handle().notify_waiters();
    worker.await.unwrap();
    run
}

#[tokio::test]
async fn greeting_answers_directly_without_tools() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "hey").await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.model_calls, 1);
    assert_eq!(run.tool_calls, 0);
}

#[tokio::test]
async fn typed_performance_operation_uses_no_model() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_with_context_and_wait(
        &service,
        &fixture,
        "Show performance",
        AgentMessageContext {
            explicit_intent: Some(AgentIntent::PerformanceSnapshot),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.model_calls, 0);
    assert_eq!(run.tool_calls, 1);
}

#[tokio::test]
async fn data_question_uses_tool_then_grounded_answer() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "What is my win rate?").await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.model_calls, 2);
    assert_eq!(run.tool_calls, 1);
    let evidence: i64 = sqlx::query_scalar("SELECT count(*) FROM agent_evidence WHERE run_id=$1")
        .bind(&run.id)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(evidence, 1);
}

#[tokio::test]
async fn write_request_creates_proposal_without_domain_mutation() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "Create a note from this review").await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    let proposal: (String, String) =
        sqlx::query_as("SELECT kind,status FROM agent_action_proposals WHERE run_id=$1")
            .bind(&run.id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(proposal, ("create_notebook_note".into(), "pending".into()));
    let notes: i64 = sqlx::query_scalar("SELECT count(*) FROM notebook_notes")
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(notes, 0);
}

#[tokio::test]
async fn invalid_citation_gets_one_repair_turn() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "Use an invalid citation").await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.model_calls, 2);
    let repairs: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_run_events WHERE run_id=$1 AND kind='answer_repair_started'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(repairs, 1);
}

#[tokio::test]
async fn malformed_structured_answer_gets_one_repair_turn() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "Use a malformed block").await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    assert_eq!(run.model_calls, 2);
    let issue_code: String = sqlx::query_scalar(
        "SELECT payload_json#>>'{issues,0,code}' FROM agent_run_events
         WHERE run_id=$1 AND kind='answer_repair_started'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(issue_code, "answer_schema_invalid");
    let contract: (String, String, String) = sqlx::query_as(
        "SELECT payload_json->>'schemaName', payload_json->>'schemaVersion',
                payload_json->>'schemaHash'
         FROM agent_run_events WHERE run_id=$1 AND kind='answer_contract_selected'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(contract.0, "tradstry_answer_v2");
    assert_eq!(contract.1, "2");
    assert_eq!(contract.2.len(), 64);
    let repaired: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_run_events
         WHERE run_id=$1 AND kind='answer_repair_completed'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(repaired, 1);
}

#[tokio::test]
async fn invalid_repair_fails_once_with_a_specific_terminal_code() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "Never repair this answer").await;
    assert_eq!(run.status, AgentRunStatus::Failed);
    assert_eq!(run.error_code.as_deref(), Some("answer_repair_exhausted"));
    assert_eq!(run.model_calls, 2);
    let exhausted: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_run_events
         WHERE run_id=$1 AND kind='answer_repair_exhausted'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(exhausted, 1);
}

#[tokio::test]
async fn complex_request_may_use_optional_subagent() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let run = send_and_wait(&service, &fixture, "Delegate this analysis").await;
    assert_eq!(
        run.status,
        AgentRunStatus::Completed,
        "{:?}",
        run.error_code
    );
    let child: (String, i64) =
        sqlx::query_as("SELECT status,model_calls FROM agent_runs WHERE parent_run_id=$1")
            .bind(&run.id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(child, ("completed".into(), 1));
}
