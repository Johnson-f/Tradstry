mod agent_support;
mod pg_support;

use agent_support::AgentPgFixture;
use tradstry_backend::service::agents::runtime::provider_failure::ProviderFailure;

#[tokio::test]
async fn provider_failure_is_stored_with_safe_diagnostic_fields() {
    let fixture = AgentPgFixture::new().await;
    let run = fixture.create_run("provider-failure").await;
    fixture.store.claim_run("worker-a", 120).await.unwrap();

    let failure = ProviderFailure {
        provider: "perplexity".into(),
        model: Some("gpt-5.6".into()),
        stage: "turn".into(),
        role: "reasoning".into(),
        status: Some(400),
        code: Some("invalid_request".into()),
        retryable: false,
        retry_after_ms: None,
        schema_name: Some("tradstry_answer_v2".into()),
        schema_version: Some("2".into()),
        schema_hash: Some("safe-hash".into()),
        error_code: "provider_request_rejected".into(),
    };
    assert!(
        fixture
            .store
            .fail_claimed_run_with_provider_failure(&run.id, "worker-a", &failure)
            .await
            .unwrap()
    );

    let stored = fixture
        .store
        .get_run(&fixture.actor, &run.id)
        .await
        .unwrap();
    assert_eq!(
        stored.error_code.as_deref(),
        Some("provider_request_rejected")
    );
    let events = fixture
        .store
        .events_after(&fixture.actor, &run.id, 0)
        .await
        .unwrap();
    let payload = &events.last().unwrap().payload;
    assert_eq!(payload["provider"], "perplexity");
    assert_eq!(payload["stage"], "turn");
    assert_eq!(payload["status"], 400);
    assert_eq!(payload["schemaName"], "tradstry_answer_v2");
    assert_eq!(payload["schemaVersion"], "2");
    assert_eq!(payload["schemaHash"], "safe-hash");
    let serialized = payload.to_string();
    assert!(!serialized.contains("message"));
    assert!(!serialized.contains("raw"));
    assert!(!serialized.contains("apiKey"));
}
