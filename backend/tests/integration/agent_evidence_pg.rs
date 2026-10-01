use crate::agent_support::AgentPgFixture;
use serde_json::json;
use tradstry_backend::service::agents::{AgentClaim, AgentError, CreateAgentRun, NewAgentEvidence};

async fn run_with_message(
    fixture: &AgentPgFixture,
    key: &str,
) -> (
    tradstry_backend::service::agents::AgentRun,
    tradstry_backend::service::agents::AgentMessage,
) {
    let conversation = fixture.create_conversation().await;
    let message = fixture
        .store
        .append_message(
            &fixture.actor,
            &conversation.id,
            "assistant",
            &json!({"text": "answer"}),
        )
        .await
        .unwrap();
    let run = fixture
        .store
        .create_run(
            &fixture.actor,
            &CreateAgentRun {
                conversation_id: conversation.id,
                parent_run_id: None,
                input_message_id: Some(message.id.clone()),
                idempotency_key: key.into(),
            },
        )
        .await
        .unwrap();
    (run, message)
}

fn evidence(source_id: &str) -> NewAgentEvidence {
    NewAgentEvidence {
        tool_call_id: None,
        source_type: "calculation".into(),
        source_id: source_id.into(),
        source_version: "trading-performance-v1".into(),
        title: "Trading performance".into(),
        excerpt: "Win rate 50%".into(),
        source_url: None,
        freshness: "canonical".into(),
        payload: json!({"winRate": 50.0}),
    }
}

#[tokio::test]
async fn claim_rejects_evidence_from_another_run() {
    let fixture = AgentPgFixture::new().await;
    let (run, message) = run_with_message(&fixture, "claim-run").await;
    let (other, _) = run_with_message(&fixture, "other-run").await;
    let foreign = fixture
        .store
        .record_evidence(&other.id, &evidence("foreign"))
        .await
        .unwrap();
    let result = fixture
        .store
        .record_answer_claims(
            &run.id,
            &message.id,
            &[AgentClaim {
                claim_id: "c1".into(),
                text: "Win rate is 50%".into(),
                evidence_ids: vec![foreign.id],
            }],
        )
        .await;
    assert!(matches!(result, Err(AgentError::Validation(_))));
}

#[tokio::test]
async fn claims_round_trip_sources_in_stable_order() {
    let fixture = AgentPgFixture::new().await;
    let (run, message) = run_with_message(&fixture, "claim-roundtrip").await;
    let first = fixture
        .store
        .record_evidence(&run.id, &evidence("first"))
        .await
        .unwrap();
    let second = fixture
        .store
        .record_evidence(&run.id, &evidence("second"))
        .await
        .unwrap();
    fixture
        .store
        .record_answer_claims(
            &run.id,
            &message.id,
            &[AgentClaim {
                claim_id: "c1".into(),
                text: "Win rate is 50%".into(),
                evidence_ids: vec![first.id.clone(), second.id.clone()],
            }],
        )
        .await
        .unwrap();
    let sources = fixture
        .store
        .evidence_for_message(&fixture.actor, &message.id)
        .await
        .unwrap();
    assert_eq!(
        sources
            .iter()
            .map(|source| source.id.clone())
            .collect::<Vec<_>>(),
        vec![first.id, second.id]
    );
}

#[tokio::test]
async fn tool_evidence_must_share_its_run() {
    let fixture = AgentPgFixture::new().await;
    let (run, _) = run_with_message(&fixture, "tool-run").await;
    let (other, _) = run_with_message(&fixture, "tool-other").await;
    let tool = fixture
        .store
        .start_tool_call(&other.id, "call-1", "trading_performance", &json!({}))
        .await
        .unwrap();
    let mut input = evidence("wrong-tool");
    input.tool_call_id = Some(tool.id);
    let result = fixture.store.record_evidence(&run.id, &input).await;
    assert!(matches!(result, Err(AgentError::Validation(_))));
}

#[tokio::test]
async fn tool_call_terminal_transition_is_fenced() {
    let fixture = AgentPgFixture::new().await;
    let (run, _) = run_with_message(&fixture, "tool-fence").await;
    let tool = fixture
        .store
        .start_tool_call(
            &run.id,
            "call-1",
            "trading_performance",
            &json!({"range": "last_30_days"}),
        )
        .await
        .unwrap();
    let completed = fixture
        .store
        .finish_tool_call(&tool.id, "completed", Some("done"), None)
        .await
        .unwrap();
    assert_eq!(completed.status, "completed");
    assert!(matches!(
        fixture
            .store
            .finish_tool_call(&tool.id, "completed", Some("again"), None)
            .await,
        Err(AgentError::Conflict)
    ));
}

#[tokio::test]
async fn retrying_tool_evidence_keeps_one_uuid_v7_row() {
    let fixture = AgentPgFixture::new().await;
    let (run, _) = run_with_message(&fixture, "tool-evidence-retry").await;
    let tool = fixture
        .store
        .start_tool_call(&run.id, "call-retry", "trading_performance", &json!({}))
        .await
        .unwrap();
    let mut input = evidence("same-source");
    input.tool_call_id = Some(tool.id);

    let first = fixture
        .store
        .record_evidence(&run.id, &input)
        .await
        .unwrap();
    let retried = fixture
        .store
        .record_evidence(&run.id, &input)
        .await
        .unwrap();

    assert_eq!(retried.id, first.id);
    assert_eq!(
        uuid::Uuid::parse_str(&first.id).unwrap().get_version_num(),
        7
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_evidence WHERE run_id=$1 AND idempotency_key IS NOT NULL",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}
