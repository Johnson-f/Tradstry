mod agent_support;
mod pg_support;

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use tinyagents::harness::message::{AssistantMessage, ContentBlock, Message};
use tinyagents::harness::model::{ChatModel, ModelRequest, ModelResponse};
use tinyagents::harness::usage::Usage;
use tradstry_backend::service::agents::execution::run_specialists;
use tradstry_backend::service::agents::runtime::{AgentModelRegistry, AgentRuntimeState};
use tradstry_backend::service::agents::specialists::{SpecialistKind, SpecialistRequest};
use tradstry_backend::service::agents::{
    AgentConfig, AgentLane, AgentMessageContext, AgentService, AgentStore,
};

use agent_support::AgentPgFixture;

struct CountingFindingModel {
    calls: Arc<AtomicUsize>,
}

struct BarrierFindingModel {
    barrier: Arc<tokio::sync::Barrier>,
}

#[async_trait]
impl ChatModel<AgentRuntimeState> for CountingFindingModel {
    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> tinyagents::Result<ModelResponse> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        let system = request
            .messages
            .first()
            .map(Message::text)
            .unwrap_or_default();
        let specialist = if system.contains("trading performance") {
            "performance"
        } else if system.contains("journal records") {
            "trade_review"
        } else if system.contains("market context") {
            "market_research"
        } else {
            "knowledge"
        };
        Ok(finding_response(specialist))
    }
}

#[async_trait]
impl ChatModel<AgentRuntimeState> for BarrierFindingModel {
    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> tinyagents::Result<ModelResponse> {
        let system = request
            .messages
            .first()
            .map(Message::text)
            .unwrap_or_default();
        let specialist = if system.contains("trading performance") {
            "performance"
        } else if system.contains("journal records") {
            "trade_review"
        } else {
            "market_research"
        };
        self.barrier.wait().await;
        Ok(finding_response(specialist))
    }
}

fn finding_response(specialist: &str) -> ModelResponse {
    let usage = Usage::new(2, 1);
    ModelResponse {
        message: AssistantMessage {
            id: None,
            content: vec![ContentBlock::Text(
                serde_json::json!({
                    "specialist": specialist,
                    "summary": "No factual claim required for this resume test.",
                    "claims": [],
                    "warnings": [],
                    "missing_information": []
                })
                .to_string(),
            )],
            tool_calls: Vec::new(),
            usage: Some(usage),
        },
        usage: Some(usage),
        finish_reason: Some("stop".into()),
        raw: None,
        resolved_model: None,
        continue_turn: None,
        served_from_cache: false,
    }
}

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

fn request(kind: SpecialistKind) -> SpecialistRequest {
    SpecialistRequest::new(kind, "test").unwrap()
}

#[tokio::test]
async fn completed_children_are_reused_after_parent_resume() {
    let fixture = AgentPgFixture::new().await;
    let calls = Arc::new(AtomicUsize::new(0));
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(CountingFindingModel {
        calls: calls.clone(),
    });
    let service = AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        Some(AgentModelRegistry::from_models(
            model.clone(),
            model.clone(),
            model,
        )),
    );
    let run = fixture.create_run("resume-parent").await;
    fixture.store.claim_run("worker-a", 120).await.unwrap();
    fixture
        .store
        .route_claimed_run(&run.id, "worker-a", AgentLane::Deep)
        .await
        .unwrap();
    let first = vec![
        request(SpecialistKind::Performance),
        request(SpecialistKind::TradeReview),
    ];
    let first_findings = run_specialists(
        &service,
        &run,
        "worker-a",
        &AgentMessageContext::default(),
        &first,
        0,
    )
    .await
    .unwrap();
    assert_eq!(first_findings.len(), 2);
    assert_eq!(calls.load(Ordering::SeqCst), 2);

    let resumed = vec![
        request(SpecialistKind::Performance),
        request(SpecialistKind::TradeReview),
        request(SpecialistKind::Knowledge),
    ];
    let resumed_findings = run_specialists(
        &service,
        &run,
        "worker-a",
        &AgentMessageContext::default(),
        &resumed,
        0,
    )
    .await
    .unwrap();
    assert_eq!(resumed_findings.len(), 3);
    assert_eq!(
        calls.load(Ordering::SeqCst),
        3,
        "the two completed children must load from checkpoints"
    );
    let completed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM agent_runs WHERE parent_run_id = $1 AND status = 'completed'",
    )
    .bind(&run.id)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(completed, 3);
}

#[tokio::test]
async fn three_specialists_execute_concurrently() {
    let fixture = AgentPgFixture::new().await;
    let barrier = Arc::new(tokio::sync::Barrier::new(3));
    let model: Arc<dyn ChatModel<AgentRuntimeState>> = Arc::new(BarrierFindingModel { barrier });
    let service = AgentService::from_parts(
        enabled_config(),
        AgentStore::new(fixture.pool.clone()),
        Some(AgentModelRegistry::from_models(
            model.clone(),
            model.clone(),
            model,
        )),
    );
    let run = fixture.create_run("concurrent-parent").await;
    fixture.store.claim_run("worker-a", 120).await.unwrap();
    fixture
        .store
        .route_claimed_run(&run.id, "worker-a", AgentLane::Deep)
        .await
        .unwrap();
    let requests = vec![
        request(SpecialistKind::Performance),
        request(SpecialistKind::TradeReview),
        request(SpecialistKind::MarketResearch),
    ];
    let findings = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        run_specialists(
            &service,
            &run,
            "worker-a",
            &AgentMessageContext::default(),
            &requests,
            0,
        ),
    )
    .await
    .expect("all three model calls reached the barrier concurrently")
    .unwrap();
    assert_eq!(findings.len(), 3);
    assert_eq!(findings[0].specialist, SpecialistKind::Performance);
    assert_eq!(findings[1].specialist, SpecialistKind::TradeReview);
    assert_eq!(findings[2].specialist, SpecialistKind::MarketResearch);
}
