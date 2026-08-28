mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use serde_json::json;
use tradstry_backend::service::agents::{
    AgentActivityCategory, AgentActivityStatus, AgentActor, AgentError, AnswerBlock, AnswerDraft,
};

#[tokio::test]
async fn completed_answer_links_and_replays_safe_activity() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("activity-completion").await;
    fixture
        .store
        .claim_run("activity-worker", 120)
        .await
        .unwrap()
        .unwrap();
    fixture
        .store
        .append_event(
            &run.id,
            "model_started",
            &json!({"callId":"model-1","model":"private-model-name","prompt":"secret"}),
        )
        .await
        .unwrap();
    fixture
        .store
        .append_event(
            &run.id,
            "model_completed",
            &json!({"callId":"model-1","inputTokens":20,"outputTokens":10}),
        )
        .await
        .unwrap();
    fixture
        .store
        .append_event(
            &run.id,
            "tool_started",
            &json!({"callId":"tool-1","tool":"market_company","arguments":{"apiKey":"secret"}}),
        )
        .await
        .unwrap();
    fixture
        .store
        .append_event(
            &run.id,
            "tool_completed",
            &json!({"callId":"tool-1","tool":"market_company","durationMs":40,"symbol":"CBRS","output":{"secret":true}}),
        )
        .await
        .unwrap();
    sqlx::query("UPDATE agent_runs SET model_calls=2,tool_calls=1 WHERE id=$1")
        .bind(&run.id)
        .execute(&fixture.pool)
        .await
        .unwrap();
    let completed = fixture
        .store
        .complete_claimed_answer(
            &run.id,
            "activity-worker",
            &AnswerDraft {
                blocks: vec![AnswerBlock::Paragraph {
                    text: "Activity answer".into(),
                }],
                claims: Vec::new(),
            },
        )
        .await
        .unwrap();

    let linked_message: Option<String> =
        sqlx::query_scalar("SELECT output_message_id FROM agent_runs WHERE id=$1")
            .bind(&run.id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(
        linked_message.as_deref(),
        Some(completed.message.id.as_str())
    );

    let activity = fixture
        .store
        .activity_for_message(&fixture.actor, &completed.message.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(activity.summary.message_id, completed.message.id);
    assert_eq!(activity.summary.model_calls, 2);
    assert_eq!(activity.summary.tool_calls, 1);
    assert!(activity.entries.iter().any(|entry| {
        entry.category == AgentActivityCategory::Tool
            && entry.status == AgentActivityStatus::Completed
            && entry.label == "Checked market context"
            && entry.metadata.symbol.as_deref() == Some("CBRS")
    }));
    let serialized = serde_json::to_string(&activity).unwrap();
    assert!(!serialized.contains("private-model-name"));
    assert!(!serialized.contains("apiKey"));
    assert!(!serialized.contains("secret"));
}

#[tokio::test]
async fn activity_is_owned_and_bulk_summaries_are_bounded() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("activity-owned").await;
    fixture
        .store
        .claim_run("activity-worker", 120)
        .await
        .unwrap()
        .unwrap();
    let completed = fixture
        .store
        .complete_claimed_answer(
            &run.id,
            "activity-worker",
            &AnswerDraft {
                blocks: vec![AnswerBlock::Paragraph {
                    text: "Owned answer".into(),
                }],
                claims: Vec::new(),
            },
        )
        .await
        .unwrap();
    let summaries = fixture
        .store
        .activity_summaries(&fixture.actor, std::slice::from_ref(&completed.message.id))
        .await
        .unwrap();
    assert_eq!(summaries.len(), 1);

    let (other_user, _) = pg_support::seed_user_workspace(&fixture.pool).await;
    let foreign = fixture
        .store
        .activity_for_message(
            &AgentActor {
                user_id: other_user,
                clerk_id: "other".into(),
            },
            &completed.message.id,
        )
        .await;
    assert!(matches!(foreign, Err(AgentError::NotFound)));
    let oversized = vec!["message".to_string(); 101];
    assert!(matches!(
        fixture
            .store
            .activity_summaries(&fixture.actor, &oversized)
            .await,
        Err(AgentError::Validation(_))
    ));
}
