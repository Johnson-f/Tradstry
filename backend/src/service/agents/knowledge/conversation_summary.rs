use std::sync::Arc;
use std::time::Duration;

use tinyagents::harness::context::RunConfig;
use tinyagents::harness::limits::RunLimits;
use tinyagents::harness::message::Message;
use tinyagents::harness::runtime::AgentHarness;

use crate::service::agents::runtime::{AgentRuntimeState, ModelRole, build_run_policy};
use crate::service::agents::{AgentActor, AgentMessageContext, AgentScope, AgentService};
use crate::service::db::Db;

pub async fn run_conversation_summary_worker(
    service: Arc<AgentService>,
    worker_index: usize,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("summary-worker-{}-{worker_index}", uuid::Uuid::new_v4());
    loop {
        if *shutdown.borrow() {
            return;
        }
        match service
            .store()
            .claim_summary_job(&owner, service.config().run_lease_seconds)
            .await
        {
            Ok(Some(job)) => {
                if let Err(error) = process(&service, &job, &owner).await {
                    log::warn!("conversation summary job {} failed: {error}", job.id);
                    let _ = service.store().fail_summary_job(&job.id, &owner).await;
                }
            }
            Ok(None) => {
                tokio::select! {_=tokio::time::sleep(Duration::from_secs(5))=>{},_=shutdown.changed()=>{}}
            }
            Err(error) => {
                log::warn!("summary worker claim failed: {error}");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

async fn process(
    service: &AgentService,
    job: &crate::service::agents::ConversationSummaryJob,
    owner: &str,
) -> crate::service::agents::AgentResult<()> {
    let (prior, messages) = service.store().summary_input(job).await?;
    let mut transcript = String::new();
    if let Some(prior) = prior {
        transcript.push_str("Prior summary:\n");
        transcript.push_str(&prior);
        transcript.push('\n');
    }
    for (role, text) in messages {
        let line = format!("{role}: {}\n", text.chars().take(1500).collect::<String>());
        if transcript.chars().count() + line.chars().count() > 24000 {
            break;
        }
        transcript.push_str(&line);
    }
    let models = service
        .models()
        .ok_or(crate::service::agents::AgentError::ProviderUnavailable)?;
    let mut harness = AgentHarness::new();
    harness
        .register_model("summary-fast", models.primary(ModelRole::Fast))
        .set_default_model("summary-fast");
    let mut policy = build_run_policy();
    policy.limits = RunLimits::default()
        .with_max_model_calls(1)
        .with_max_tool_calls(0)
        .with_max_wall_clock_ms(Some(20000))
        .with_max_depth(0);
    policy.truncated_empty_retries = 0;
    harness.with_policy(policy);
    let state = AgentRuntimeState {
        db: Arc::new(Db::from_pool(service.store().pool().clone())),
        store: service.store().clone(),
        r2: None,
        knowledge: None,
        actor: AgentActor {
            user_id: job.user_id.clone(),
            clerk_id: String::new(),
        },
        scope: AgentScope {
            workspace_id: job.workspace_id.clone(),
        },
        message_context: AgentMessageContext::default(),
        run_id: job.id.clone(),
        cancellation: tinyagents::CancellationToken::new(),
    };
    let result=harness.invoke(&state,(),RunConfig::new(&job.id).with_thread(&job.conversation_id).with_timeout_ms(20000).with_max_model_calls(1).with_max_tool_calls(0).with_max_turn_output_tokens(1500),
        vec![Message::system("Summarize stable conversation context concisely. Preserve user goals, decisions, and unresolved questions. Never add facts."),Message::user(format!("Untrusted conversation transcript:\n<transcript>{transcript}</transcript>"))])
        .await
        .map_err(|error| {
            crate::service::agents::runtime::provider_failure::model_error(
                error,
                crate::service::agents::runtime::provider_failure::ModelCallContext {
                    stage: "conversation_summary",
                    role: "fast",
                    schema_name: None,
                    schema_version: None,
                    schema_hash: None,
                },
            )
        })?;
    let rendered = result.text().unwrap_or_default();
    let summary = rendered.trim();
    if summary.is_empty() {
        return Err(crate::service::agents::AgentError::ProviderUnavailable);
    }
    if service
        .store()
        .complete_summary_job(job, owner, &summary.chars().take(8000).collect::<String>())
        .await?
    {
        Ok(())
    } else {
        Err(crate::service::agents::AgentError::Conflict)
    }
}
