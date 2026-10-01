use crate::agent_support::AgentPgFixture;
use serde_json::json;
use tinyagents::harness::message::Message;
use tradstry_backend::service::agents::{
    AgentActor, AgentError, AgentRunStatus, AgentScope, CreateAgentRun,
};

#[tokio::test]
async fn conversation_requires_owned_workspace() {
    let fixture = AgentPgFixture::new().await;
    let (_, foreign_workspace) = crate::pg_support::seed_user_workspace(&fixture.pool).await;
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
    let (other_user, _) = crate::pg_support::seed_user_workspace(&fixture.pool).await;
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
async fn run_items_are_idempotent() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("run-item-order").await;
    let message = Message::assistant("done");
    let first = fixture
        .store
        .append_run_item(&run.id, &message)
        .await
        .unwrap();
    let second = fixture
        .store
        .append_run_item(&run.id, &message)
        .await
        .unwrap();
    assert_eq!(first, second);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM agent_run_items WHERE run_id=$1")
        .bind(&run.id)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
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
async fn reclaiming_expired_root_terminalizes_orphaned_children() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("expired-root").await;
    fixture
        .store
        .claim_run("old-worker", 120)
        .await
        .unwrap()
        .unwrap();
    let child_id = fixture
        .store
        .create_subagent_run(&run.id, "delegate_trade_review", "call-1")
        .await
        .unwrap();
    sqlx::query("UPDATE agent_runs SET heartbeat_at=now()-interval '10 minutes' WHERE id=$1")
        .bind(&run.id)
        .execute(&fixture.pool)
        .await
        .unwrap();

    let reclaimed = fixture
        .store
        .claim_run("new-worker", 1)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(reclaimed.id, run.id);
    let child: (String, Option<String>) =
        sqlx::query_as("SELECT status,error_code FROM agent_runs WHERE id=$1")
            .bind(child_id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(child.0, "failed");
    assert_eq!(child.1.as_deref(), Some("parent_lease_expired"));
}

#[tokio::test]
async fn subagent_retry_replaces_terminal_run_with_uuid_v7() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("subagent-retry").await;
    fixture
        .store
        .claim_run("worker", 120)
        .await
        .unwrap()
        .unwrap();

    let first = fixture
        .store
        .create_subagent_run(&run.id, "delegate_trade_review", "call-1")
        .await
        .unwrap();
    assert_eq!(uuid::Uuid::parse_str(&first).unwrap().get_version_num(), 7);
    fixture
        .store
        .fail_subagent_run(&first, "subagent_execution_failed")
        .await
        .unwrap();

    let replacement = fixture
        .store
        .create_subagent_run(&run.id, "delegate_trade_review", "call-1")
        .await
        .unwrap();
    assert_ne!(replacement, first);
    assert_eq!(
        uuid::Uuid::parse_str(&replacement)
            .unwrap()
            .get_version_num(),
        7
    );
    assert!(
        fixture
            .store
            .create_subagent_run(&run.id, "delegate_trade_review", "call-1")
            .await
            .is_err()
    );
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
