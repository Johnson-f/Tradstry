mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use tradstry_backend::service::agents::{
    AgentConfig, AgentError, AgentMessageContext, AgentService, AgentStore, SendAgentMessage,
};

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

fn service(fixture: &AgentPgFixture) -> AgentService {
    AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        None,
    )
}

#[tokio::test]
async fn disabled_service_rejects_conversation_creation() {
    let fixture = AgentPgFixture::new().await;
    let disabled = AgentService::from_parts(
        AgentConfig::from_lookup(|_| None).unwrap(),
        AgentStore::new(fixture.pool.clone()),
        None,
    );
    let result = disabled
        .create_conversation(&fixture.actor, &fixture.scope)
        .await;
    assert!(matches!(result, Err(AgentError::Disabled)));
}

#[tokio::test]
async fn send_message_commits_message_run_and_queued_event_together() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let handle = service
        .send_message(
            &fixture.actor,
            SendAgentMessage {
                conversation_id: conversation.id,
                content: "What is my win rate?".into(),
                context: AgentMessageContext::default(),
                idempotency_key: "request-1".into(),
            },
        )
        .await
        .unwrap();
    let messages = service
        .list_messages(&fixture.actor, &handle.conversation_id, 20)
        .await
        .unwrap();
    let events = service
        .replay_events(&fixture.actor, &handle.run_id, 0)
        .await
        .unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].content["text"], "What is my win rate?");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, "run_queued");
}

#[tokio::test]
async fn retrying_idempotency_key_does_not_append_a_second_message() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let input = SendAgentMessage {
        conversation_id: conversation.id.clone(),
        content: "Analyze this".into(),
        context: AgentMessageContext::default(),
        idempotency_key: "same-request".into(),
    };
    let first = service
        .send_message(&fixture.actor, input.clone())
        .await
        .unwrap();
    let second = service.send_message(&fixture.actor, input).await.unwrap();
    assert_eq!(first.run_id, second.run_id);
    assert_eq!(
        service
            .list_messages(&fixture.actor, &conversation.id, 20)
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn send_message_rejects_blank_and_oversized_input() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    for content in [" ".to_string(), "a".repeat(32_001)] {
        let result = service
            .send_message(
                &fixture.actor,
                SendAgentMessage {
                    conversation_id: conversation.id.clone(),
                    content,
                    context: AgentMessageContext::default(),
                    idempotency_key: uuid::Uuid::new_v4().to_string(),
                },
            )
            .await;
        assert!(matches!(result, Err(AgentError::Validation(_))));
    }
}

#[tokio::test]
async fn cancelling_queued_run_commits_terminal_event() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let handle = service
        .send_message(
            &fixture.actor,
            SendAgentMessage {
                conversation_id: conversation.id,
                content: "Analyze this".into(),
                context: AgentMessageContext::default(),
                idempotency_key: "cancel-request".into(),
            },
        )
        .await
        .unwrap();
    assert!(
        service
            .cancel_run(&fixture.actor, &handle.run_id)
            .await
            .unwrap()
    );
    let events = service
        .replay_events(&fixture.actor, &handle.run_id, 0)
        .await
        .unwrap();
    assert_eq!(events.last().unwrap().kind, "run_cancelled");
}
