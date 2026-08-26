mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use serde_json::json;
use tradstry_backend::service::agents::{ActivateAgentMemory, AgentMemoryKind, AgentMemoryStatus};

async fn source(fixture: &AgentPgFixture) -> (String, String) {
    let conversation = fixture.create_conversation().await;
    let message = fixture
        .store
        .append_message(
            &fixture.actor,
            &conversation.id,
            "user",
            &json!({"text": "I prefer concise reviews"}),
        )
        .await
        .unwrap();
    (conversation.id, message.id)
}

fn input(
    fixture: &AgentPgFixture,
    conversation_id: &str,
    message_id: &str,
    text: &str,
) -> ActivateAgentMemory {
    ActivateAgentMemory {
        workspace_id: Some(fixture.scope.workspace_id.clone()),
        kind: AgentMemoryKind::Preference,
        subject_key: "review_style".into(),
        text: text.into(),
        source_conversation_id: conversation_id.into(),
        source_message_id: message_id.into(),
        provenance_excerpt: text.into(),
        confidence: 0.99,
        extraction_version: "memory-v1".into(),
        status: AgentMemoryStatus::Active,
    }
}

#[tokio::test]
async fn superseding_keeps_one_active_memory_per_subject() {
    let fixture = AgentPgFixture::new().await;
    let (conversation, message) = source(&fixture).await;
    let old = fixture
        .store
        .activate_memory(
            &fixture.actor,
            &input(&fixture, &conversation, &message, "I prefer short reviews"),
        )
        .await
        .unwrap();
    let new = fixture
        .store
        .activate_memory(
            &fixture.actor,
            &input(
                &fixture,
                &conversation,
                &message,
                "I prefer detailed reviews",
            ),
        )
        .await
        .unwrap();
    let active = fixture
        .store
        .list_memories(&fixture.actor, Some(&fixture.scope.workspace_id), false, 20)
        .await
        .unwrap();
    assert_eq!(
        active
            .iter()
            .filter(|row| row.status == AgentMemoryStatus::Active)
            .count(),
        1
    );
    assert_eq!(active[0].id, new.id);
    let old_status: String = sqlx::query_scalar("SELECT status FROM agent_memories WHERE id = $1")
        .bind(&old.id)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(old_status, "superseded");
}

#[tokio::test]
async fn memory_controls_are_owned_and_conversation_delete_cascades() {
    let fixture = AgentPgFixture::new().await;
    let (conversation, message) = source(&fixture).await;
    let memory = fixture
        .store
        .activate_memory(
            &fixture.actor,
            &input(&fixture, &conversation, &message, "I prefer short reviews"),
        )
        .await
        .unwrap();
    let pinned = fixture
        .store
        .set_memory_pinned(&fixture.actor, &memory.id, true)
        .await
        .unwrap();
    assert!(pinned.pinned);
    let edited = fixture
        .store
        .update_memory_text(&fixture.actor, &memory.id, "Use concise reviews")
        .await
        .unwrap();
    assert!(edited.user_edited);
    let (other_user, _) = pg_support::seed_user_workspace(&fixture.pool).await;
    let other = tradstry_backend::service::agents::AgentActor {
        user_id: other_user,
        clerk_id: "other".into(),
    };
    assert!(
        fixture
            .store
            .set_memory_pinned(&other, &memory.id, false)
            .await
            .is_err()
    );
    assert!(
        fixture
            .store
            .delete_conversation(&fixture.actor, &conversation)
            .await
            .unwrap()
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM agent_memories WHERE id = $1")
        .bind(&memory.id)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn forgetting_removes_memory_from_active_listing_immediately() {
    let fixture = AgentPgFixture::new().await;
    let (conversation, message) = source(&fixture).await;
    let memory = fixture
        .store
        .activate_memory(
            &fixture.actor,
            &input(&fixture, &conversation, &message, "I prefer short reviews"),
        )
        .await
        .unwrap();
    assert!(
        fixture
            .store
            .forget_memory(&fixture.actor, &memory.id)
            .await
            .unwrap()
    );
    let rows = fixture
        .store
        .list_memories(&fixture.actor, Some(&fixture.scope.workspace_id), false, 20)
        .await
        .unwrap();
    assert!(rows.is_empty());
}
