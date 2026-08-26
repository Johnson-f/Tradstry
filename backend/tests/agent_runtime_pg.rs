mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use serde_json::json;
use tradstry_backend::service::agents::{
    AgentActor, AgentError, AgentLane, AgentRunStatus, AgentScope, CreateAgentRun,
};

#[tokio::test]
async fn conversation_requires_owned_workspace() {
    let fixture = AgentPgFixture::new().await;
    let (_, foreign_workspace) = pg_support::seed_user_workspace(&fixture.pool).await;
    let result = fixture
        .store
        .create_conversation(
            &fixture.actor,
            &AgentScope {
                workspace_id: foreign_workspace,
            },
        )
        .await;
    assert!(matches!(result, Err(AgentError::NotFound)));
}

#[tokio::test]
async fn messages_are_monotonic_and_recent_page_is_in_display_order() {
    let fixture = AgentPgFixture::new().await;
    let conversation = fixture.create_conversation().await;
    for value in ["one", "two", "three"] {
        fixture
            .store
            .append_message(
                &fixture.actor,
                &conversation.id,
                "user",
                &json!({"text": value}),
            )
            .await
            .unwrap();
    }
    let messages = fixture
        .store
        .list_messages(&fixture.actor, &conversation.id, 2)
        .await
        .unwrap();
    assert_eq!(
        messages.iter().map(|m| m.sequence).collect::<Vec<_>>(),
        [2, 3]
    );
    assert_eq!(messages[0].content["text"], "two");
}

#[tokio::test]
async fn run_idempotency_returns_the_original_run() {
    let fixture = AgentPgFixture::new().await;
    let conversation = fixture.create_conversation().await;
    let input = CreateAgentRun {
        conversation_id: conversation.id,
        lane: AgentLane::Deep,
        parent_run_id: None,
        input_message_id: None,
        idempotency_key: "same-request".into(),
    };
    let first = fixture
        .store
        .create_run(&fixture.actor, &input)
        .await
        .unwrap();
    let second = fixture
        .store
        .create_run(&fixture.actor, &input)
        .await
        .unwrap();
    assert_eq!(first.id, second.id);
}

#[tokio::test]
async fn events_are_monotonic_and_replay_after_sequence() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("event-order").await;
    let first = fixture
        .store
        .append_event(&run.id, "queued", &json!({}))
        .await
        .unwrap();
    let second = fixture
        .store
        .append_event(&run.id, "running", &json!({}))
        .await
        .unwrap();
    assert_eq!((first.sequence, second.sequence), (1, 2));
    assert_eq!(
        fixture
            .store
            .events_after(&fixture.actor, &run.id, 1)
            .await
            .unwrap(),
        vec![second]
    );
}

#[tokio::test]
async fn another_user_cannot_read_run_events() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("private-events").await;
    fixture
        .store
        .append_event(&run.id, "queued", &json!({}))
        .await
        .unwrap();
    let (other_user, _) = pg_support::seed_user_workspace(&fixture.pool).await;
    let result = fixture
        .store
        .events_after(
            &AgentActor {
                user_id: other_user,
                clerk_id: "other".into(),
            },
            &run.id,
            0,
        )
        .await;
    assert!(matches!(result, Err(AgentError::NotFound)));
}

#[tokio::test]
async fn checkpoint_rejects_an_older_sequence() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("checkpoint-order").await;
    fixture
        .store
        .save_checkpoint(&run.id, "routed", 2, &json!({"v": 2}))
        .await
        .unwrap();
    let stale = fixture
        .store
        .save_checkpoint(&run.id, "routed", 1, &json!({"v": 1}))
        .await;
    assert!(matches!(stale, Err(AgentError::Conflict)));
    let latest = fixture
        .store
        .latest_checkpoint(&fixture.actor, &run.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(latest.state["v"], 2);
}

#[tokio::test]
async fn lease_heartbeat_is_fenced_by_owner() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("lease").await;
    let claimed = fixture
        .store
        .claim_run("worker-a", 120)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claimed.id, run.id);
    assert_eq!(claimed.status, AgentRunStatus::Running);
    assert!(!fixture.store.heartbeat(&run.id, "worker-b").await.unwrap());
    assert!(fixture.store.heartbeat(&run.id, "worker-a").await.unwrap());
}

#[tokio::test]
async fn deleting_conversation_cascades_runtime_rows() {
    let fixture = AgentPgFixture::new().await;
    let conversation = fixture.create_conversation().await;
    fixture.seed_complete_run(&conversation.id).await;
    assert!(fixture.count_runtime_rows(&conversation.id).await > 0);
    assert!(
        fixture
            .store
            .delete_conversation(&fixture.actor, &conversation.id)
            .await
            .unwrap()
    );
    assert_eq!(fixture.count_runtime_rows(&conversation.id).await, 0);
}

#[tokio::test]
async fn cancellation_is_owned_and_idempotent() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("cancel").await;
    assert!(
        fixture
            .store
            .request_cancel(&fixture.actor, &run.id)
            .await
            .unwrap()
    );
    assert!(
        fixture
            .store
            .request_cancel(&fixture.actor, &run.id)
            .await
            .unwrap()
    );
}
