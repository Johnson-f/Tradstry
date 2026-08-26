mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use tradstry_backend::service::agents::{
    AgentActionChange, AgentActionPayload, AgentActionPreview, CreateNotebookNoteAction,
};

fn payload() -> AgentActionPayload {
    AgentActionPayload::CreateNotebookNote(CreateNotebookNoteAction {
        title: "Weekly review".into(),
        markdown: "# Weekly review\nStay patient.".into(),
        trade_ids: Vec::new(),
        playbook_ids: Vec::new(),
    })
}

fn preview() -> AgentActionPreview {
    AgentActionPreview {
        title: "Create notebook note".into(),
        summary: "Create after confirmation".into(),
        changes: vec![AgentActionChange {
            field: "note".into(),
            before: None,
            after: "Weekly review".into(),
        }],
        warnings: vec!["Confirmation required".into()],
    }
}

#[tokio::test]
async fn only_pending_proposal_can_be_confirmed_and_same_key_is_idempotent() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("action-proposal").await;
    let proposal = fixture
        .store
        .create_action_proposal(&fixture.actor, &run.id, &payload(), &preview(), 15)
        .await
        .unwrap();
    let approved = fixture
        .store
        .approve_action_proposal(&fixture.actor, &proposal.id, "confirm-1")
        .await
        .unwrap();
    assert_eq!(approved.status, "approved");
    let same = fixture
        .store
        .approve_action_proposal(&fixture.actor, &proposal.id, "confirm-1")
        .await
        .unwrap();
    assert_eq!(same.status, "approved");
    assert!(
        fixture
            .store
            .approve_action_proposal(&fixture.actor, &proposal.id, "confirm-2",)
            .await
            .is_err()
    );
    let executions: i64 =
        sqlx::query_scalar("SELECT count(*) FROM agent_action_executions WHERE proposal_id=$1")
            .bind(&proposal.id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(executions, 1);
}

#[tokio::test]
async fn proposal_approval_and_rejection_are_owned() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("action-owned").await;
    let proposal = fixture
        .store
        .create_action_proposal(&fixture.actor, &run.id, &payload(), &preview(), 15)
        .await
        .unwrap();
    let (other_user, _) = pg_support::seed_user_workspace(&fixture.pool).await;
    let other = tradstry_backend::service::agents::AgentActor {
        user_id: other_user,
        clerk_id: "forged".into(),
    };
    assert!(
        fixture
            .store
            .approve_action_proposal(&other, &proposal.id, "forged")
            .await
            .is_err()
    );
    let rejected = fixture
        .store
        .reject_action_proposal(&fixture.actor, &proposal.id)
        .await
        .unwrap();
    assert_eq!(rejected.status, "rejected");
    assert!(
        fixture
            .store
            .reject_action_proposal(&fixture.actor, &proposal.id)
            .await
            .is_err()
    );
}
