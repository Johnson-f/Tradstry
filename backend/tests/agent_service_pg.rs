mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use tradstry_backend::service::agents::{
    AgentConfig, AgentContextKind, AgentContextReference, AgentError, AgentMessageContext,
    AgentService, AgentStore, SendAgentMessage,
};

fn enabled_config() -> AgentConfig {
    enabled_config_for("gemini")
}

fn enabled_config_for(provider: &'static str) -> AgentConfig {
    AgentConfig::from_lookup(|name| match name {
        "AGENTS_V2_ENABLED" => Some("true".into()),
        "AGENT_MODEL_PROVIDER" => Some(provider.into()),
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
                content: "Tell me about this playbook".into(),
                context: AgentMessageContext {
                    playbook_ids: vec!["playbook-1".into()],
                    references: vec![AgentContextReference {
                        key: "playbook:playbook-1".into(),
                        kind: AgentContextKind::Playbook,
                        id: Some("playbook-1".into()),
                        title: "Opening Range Breakout".into(),
                        subtitle: "Momentum".into(),
                    }],
                    ..Default::default()
                },
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
    assert_eq!(messages[0].content["text"], "Tell me about this playbook");
    assert_eq!(
        messages[0].content["context"]["references"][0]["title"],
        "Opening Range Breakout"
    );
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, "run_queued");
}

#[tokio::test]
async fn send_message_rejects_a_reference_that_does_not_match_its_context_id() {
    let fixture = AgentPgFixture::new().await;
    let service = service(&fixture);
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let result = service
        .send_message(
            &fixture.actor,
            SendAgentMessage {
                conversation_id: conversation.id,
                content: "Review this".into(),
                context: AgentMessageContext {
                    playbook_ids: vec!["playbook-1".into()],
                    references: vec![AgentContextReference {
                        key: "playbook:other".into(),
                        kind: AgentContextKind::Playbook,
                        id: Some("other".into()),
                        title: "Wrong playbook".into(),
                        subtitle: String::new(),
                    }],
                    ..Default::default()
                },
                idempotency_key: "invalid-reference".into(),
            },
        )
        .await;
    assert!(matches!(result, Err(AgentError::Validation(_))));
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

#[tokio::test]
async fn perplexity_rejects_video_before_message_or_run_persistence() {
    let fixture = AgentPgFixture::new().await;
    sqlx::query(
        "INSERT INTO notebook_notes (id,user_id,workspace_id,title,document_json,hlc)
         VALUES ('video-note',$1,$2,'Video note','{}','v1')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO notebook_images
         (id,note_id,user_id,workspace_id,cloudinary_asset_id,cloudinary_public_id,secure_url,
          width,height,format,original_filename,media_type,content_type,content_hash)
         VALUES ('video-media','video-note',$1,$2,'asset','object-key','https://example.invalid/video',
                 100,100,'mp4','review.mp4','video','video/mp4','hash')",
    )
    .bind(&fixture.actor.user_id)
    .bind(&fixture.scope.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
    let service = AgentService::from_parts(
        enabled_config_for("perplexity"),
        AgentStore::new(fixture.pool.clone()),
        None,
    );
    let conversation = service
        .create_conversation(&fixture.actor, &fixture.scope)
        .await
        .unwrap();
    let result = service
        .send_message(
            &fixture.actor,
            SendAgentMessage {
                conversation_id: conversation.id.clone(),
                content: "Review this video".into(),
                context: AgentMessageContext {
                    media_ids: vec!["video-media".into()],
                    ..Default::default()
                },
                idempotency_key: "perplexity-video".into(),
            },
        )
        .await;
    assert!(matches!(result, Err(AgentError::Validation(message)) if message.contains("video")));
    let persisted: i64 = sqlx::query_scalar(
        "SELECT
           (SELECT count(*) FROM agent_messages WHERE conversation_id = $1) +
           (SELECT count(*) FROM agent_runs WHERE conversation_id = $1)",
    )
    .bind(&conversation.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(persisted, 0);
}

#[tokio::test]
async fn gemini_preserves_existing_video_enqueue_behavior() {
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
                content: "Review this video".into(),
                context: AgentMessageContext {
                    media_ids: vec!["video-media-not-yet-loaded".into()],
                    ..Default::default()
                },
                idempotency_key: "gemini-video".into(),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        handle.status,
        tradstry_backend::service::agents::AgentRunStatus::Queued
    );
}
