use std::sync::Arc;
use std::time::Duration;

use pgvector::HalfVector;
use serde::Deserialize;
use tinyagents::harness::context::RunConfig;
use tinyagents::harness::limits::RunLimits;
use tinyagents::harness::message::Message;
use tinyagents::harness::runtime::AgentHarness;

use super::memory_policy::{MemoryCandidate, admit_user_candidate};
use crate::service::agents::runtime::{
    AgentRuntimeState, ModelRole, build_run_policy, schemas::AgentSchema,
};
use crate::service::agents::{
    ActivateAgentMemory, AgentActor, AgentError, AgentMessageContext, AgentResult, AgentScope,
    AgentService,
};
use crate::service::db::Db;

#[derive(Deserialize)]
struct ExtractionOutput {
    candidates: Vec<ExtractedCandidate>,
}

#[derive(Deserialize)]
struct ExtractedCandidate {
    #[serde(flatten)]
    candidate: MemoryCandidate,
    confidence: f64,
}

pub async fn run_memory_worker(
    service: Arc<AgentService>,
    worker_index: usize,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("memory-worker-{}-{worker_index}", uuid::Uuid::new_v4());
    loop {
        if *shutdown.borrow() {
            return;
        }
        match service
            .store()
            .claim_memory_job(&owner, service.config().run_lease_seconds)
            .await
        {
            Ok(Some(job)) => {
                if let Err(error) = process_job(&service, &job, &owner).await {
                    log::warn!("[agents] memory extraction job {} failed: {error}", job.id);
                    let retryable = match &error {
                        AgentError::Provider(failure) => failure.retryable,
                        AgentError::ProviderUnavailable | AgentError::Internal => true,
                        _ => false,
                    };
                    let _ = service
                        .store()
                        .fail_memory_job(&job.id, &owner, "memory_extraction_failed", retryable)
                        .await;
                }
            }
            Ok(None) => tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(5)) => {},
                _ = shutdown.changed() => {},
            },
            Err(error) => {
                log::warn!("[agents] memory worker claim failed: {error}");
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {},
                    _ = shutdown.changed() => {},
                }
            }
        }
    }
}

async fn process_job(
    service: &AgentService,
    job: &crate::service::agents::AgentMemoryJob,
    owner: &str,
) -> AgentResult<()> {
    let message = service
        .store()
        .get_message_internal(&job.source_message_id)
        .await?;
    if message.role != "user" || message.user_id != job.user_id {
        return Err(AgentError::Validation(
            "memory source must be an owned user message".into(),
        ));
    }
    let text = message
        .content
        .get("text")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| AgentError::Validation("memory source has no user text".into()))?;
    let models = service.models().ok_or(AgentError::ProviderUnavailable)?;
    let mut harness = AgentHarness::new();
    harness
        .register_model("memory-extractor", models.primary(ModelRole::Fast))
        .set_default_model("memory-extractor");
    let mut policy = build_run_policy();
    policy.limits = RunLimits::default()
        .with_max_model_calls(1)
        .with_max_tool_calls(0)
        .with_max_wall_clock_ms(Some(20_000))
        .with_max_depth(0);
    policy.default_response_format = Some(AgentSchema::MemoryCandidates.response_format());
    policy.truncated_empty_retries = 0;
    harness.with_policy(policy);
    let state = AgentRuntimeState {
        db: Arc::new(Db::from_pool(service.store().pool().clone())),
        store: service.store().clone(),
        r2: None,
        knowledge: service.knowledge().cloned(),
        actor: AgentActor {
            user_id: job.user_id.clone(),
            clerk_id: String::new(),
        },
        scope: AgentScope {
            workspace_id: job.workspace_id.clone(),
        },
        message_context: AgentMessageContext::default(),
        run_id: job.run_id.clone(),
        cancellation: tinyagents::CancellationToken::new(),
    };
    let result = harness.invoke(
        &state, (),
        RunConfig::new(&job.id).with_thread(&job.source_conversation_id)
            .with_timeout_ms(20_000).with_max_model_calls(1).with_max_tool_calls(0)
            .with_max_turn_output_tokens(2_000),
        vec![
            Message::system("Extract only explicit stable user-authored preferences, goals, routines, or instructions. Never extract prices, balances, P&L, positions, orders, metrics, secrets, or ephemeral facts. Return an empty candidates array when none qualify."),
            Message::user(format!("Untrusted user message:\n<user_message>{}</user_message>", text.chars().take(32_000).collect::<String>())),
        ],
    ).await.map_err(model_error)?;
    let output: ExtractionOutput =
        serde_json::from_value(result.structured.ok_or(AgentError::Internal)?)
            .map_err(|_| AgentError::Validation("invalid memory extraction output".into()))?;
    if output.candidates.len() > 4 {
        return Err(AgentError::Validation("too many memory candidates".into()));
    }
    for extracted in output.candidates {
        let admission =
            match admit_user_candidate("user", text, &extracted.candidate, extracted.confidence) {
                Ok(admission) => admission,
                Err(_) => continue,
            };
        let global = text.to_lowercase().contains("all workspaces")
            || text.to_lowercase().contains("every workspace");
        let memory = service
            .store()
            .activate_memory(
                &state.actor,
                &ActivateAgentMemory {
                    workspace_id: (!global).then(|| job.workspace_id.clone()),
                    kind: extracted.candidate.kind,
                    subject_key: admission.subject_key,
                    text: extracted.candidate.statement,
                    source_conversation_id: job.source_conversation_id.clone(),
                    source_message_id: job.source_message_id.clone(),
                    provenance_excerpt: extracted.candidate.provenance_excerpt,
                    confidence: extracted.confidence,
                    extraction_version: job.extraction_version.clone(),
                    status: admission.status,
                },
            )
            .await?;
        if memory.status == crate::service::agents::AgentMemoryStatus::Active
            && let Some(knowledge) = service.knowledge()
        {
            match knowledge.embed_document(&memory.text).await {
                Ok(vector)
                    if vector.len() == 2048 && vector.iter().all(|value| value.is_finite()) =>
                {
                    sqlx::query("UPDATE agent_memories SET embedding=$1 WHERE id=$2 AND user_id=$3 AND status='active'")
                        .bind(HalfVector::from_f32_slice(&vector)).bind(&memory.id).bind(&job.user_id)
                        .execute(service.store().pool()).await?;
                }
                Ok(_) => log::warn!("memory embedding returned invalid dimensions"),
                Err(error) => log::warn!("memory saved without embedding: {error}"),
            }
        }
    }
    if service.store().complete_memory_job(&job.id, owner).await? {
        Ok(())
    } else {
        Err(AgentError::Conflict)
    }
}

fn model_error(error: tinyagents::TinyAgentsError) -> AgentError {
    crate::service::agents::runtime::provider_failure::model_error(
        error,
        crate::service::agents::runtime::provider_failure::ModelCallContext {
            stage: "memory_extraction",
            role: "fast",
            schema_name: Some("memory_candidates"),
        },
    )
}
