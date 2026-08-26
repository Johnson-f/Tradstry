mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use serde_json::json;
use tradstry_backend::service::agents::AgentLane;
use tradstry_backend::service::agents::execution::stages::{DeepStage, DeepStageTransition};

#[tokio::test]
async fn deep_stages_are_atomic_monotonic_and_lease_fenced() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("deep-stages").await;
    fixture.store.claim_run("worker-a", 120).await.unwrap();
    assert!(
        fixture
            .store
            .route_claimed_run(&run.id, "worker-a", AgentLane::Deep)
            .await
            .unwrap()
    );

    assert!(
        fixture
            .store
            .advance_deep_stage(
                &run.id,
                "worker-a",
                DeepStageTransition {
                    expected: DeepStage::Routed,
                    next: DeepStage::SpecialistsSelected,
                    checkpoint: &json!({"specialists": ["performance"]}),
                    event_kind: "specialists_selected",
                    event_payload: &json!({"count": 1})
                },
            )
            .await
            .unwrap()
    );
    assert!(
        !fixture
            .store
            .advance_deep_stage(
                &run.id,
                "worker-b",
                DeepStageTransition {
                    expected: DeepStage::SpecialistsSelected,
                    next: DeepStage::SpecialistsCompleted,
                    checkpoint: &json!({}),
                    event_kind: "specialists_completed",
                    event_payload: &json!({})
                },
            )
            .await
            .unwrap()
    );
    assert!(
        fixture
            .store
            .advance_deep_stage(
                &run.id,
                "worker-a",
                DeepStageTransition {
                    expected: DeepStage::SpecialistsSelected,
                    next: DeepStage::SpecialistsCompleted,
                    checkpoint: &json!({"findings": 1}),
                    event_kind: "specialists_completed",
                    event_payload: &json!({"count": 1})
                },
            )
            .await
            .unwrap()
    );

    let events = fixture
        .store
        .events_after(&fixture.actor, &run.id, 0)
        .await
        .unwrap();
    assert_eq!(
        events
            .iter()
            .map(|event| event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    let checkpoint_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_checkpoints WHERE run_id = $1 AND stage IN
         ('specialists_selected', 'specialists_completed')",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(checkpoint_count, 2);
}

#[tokio::test]
async fn deep_stage_regression_is_rejected_before_writing() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("deep-regression").await;
    fixture.store.claim_run("worker-a", 120).await.unwrap();
    fixture
        .store
        .route_claimed_run(&run.id, "worker-a", AgentLane::Deep)
        .await
        .unwrap();
    let error = fixture
        .store
        .advance_deep_stage(
            &run.id,
            "worker-a",
            DeepStageTransition {
                expected: DeepStage::Synthesized,
                next: DeepStage::SpecialistsSelected,
                checkpoint: &json!({}),
                event_kind: "regressed",
                event_payload: &json!({}),
            },
        )
        .await
        .unwrap_err();
    assert!(error.to_string().contains("advance exactly one step"));
}
