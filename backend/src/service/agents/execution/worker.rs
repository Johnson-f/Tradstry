use std::sync::Arc;
use std::time::Duration;

use log::{error, info};

use crate::service::agents::AgentService;
use crate::service::agents::runtime::resilience::{CircuitTransition, ProviderOutcome};
use crate::service::agents::turn::AgentTurnRunner;

pub async fn run_agent_worker(
    service: Arc<AgentService>,
    worker_index: usize,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("agent-worker-{}-{worker_index}", crate::ids::new_uuid_v7());
    let wake = service.wake_handle();
    info!("[agents] worker {owner} started");
    loop {
        if *shutdown.borrow() {
            info!("[agents] worker {owner} stopping");
            return;
        }
        match service
            .store()
            .claim_run(&owner, service.config().run_lease_seconds)
            .await
        {
            Ok(Some(run)) => {
                if let Err(error) = execute_with_lease(&service, &run, &owner).await {
                    error!("[agents] run {} failed: {error}", run.id);
                    let close_result = match &error {
                        crate::service::agents::AgentError::Provider(failure) => {
                            service
                                .store()
                                .fail_claimed_run_with_provider_failure(&run.id, &owner, failure)
                                .await
                        }
                        crate::service::agents::AgentError::GroundingInvalid => {
                            service
                                .store()
                                .fail_claimed_run(&run.id, &owner, "answer_grounding_invalid")
                                .await
                        }
                        crate::service::agents::AgentError::AnswerRepairExhausted => {
                            service
                                .store()
                                .fail_claimed_run(&run.id, &owner, "answer_repair_exhausted")
                                .await
                        }
                        _ => {
                            service
                                .store()
                                .fail_claimed_run(&run.id, &owner, "agent_execution_failed")
                                .await
                        }
                    };
                    if let Err(close_error) = close_result {
                        error!("[agents] failed to close run {}: {close_error}", run.id);
                    }
                }
                wake.notify_waiters();
            }
            Ok(None) => {
                tokio::select! {
                    _ = wake.notified() => {}
                    _ = tokio::time::sleep(Duration::from_secs(15)) => {}
                    _ = shutdown.changed() => {}
                }
            }
            Err(error) => {
                error!("[agents] worker {owner} claim failed: {error}");
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                    _ = shutdown.changed() => {}
                }
            }
        }
    }
}

async fn execute_with_lease(
    service: &AgentService,
    run: &crate::service::agents::AgentRun,
    owner: &str,
) -> crate::service::agents::AgentResult<()> {
    let cancellation = tinyagents::CancellationToken::new();
    let execution = execute_resilient_claimed_run(service, run, owner, cancellation.clone());
    tokio::pin!(execution);
    let mut heartbeat =
        tokio::time::interval(Duration::from_secs(service.config().heartbeat_seconds));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    heartbeat.tick().await;
    loop {
        tokio::select! {
            result = &mut execution => return result,
            _ = heartbeat.tick() => {
                if service.store().claimed_run_cancel_requested(&run.id, owner).await? {
                    cancellation.cancel();
                    service.store().cancel_claimed_run(&run.id, owner).await?;
                    return Ok(());
                }
                if !service.store().heartbeat(&run.id, owner).await? {
                    return Err(crate::service::agents::AgentError::Conflict);
                }
            }
        }
    }
}

async fn execute_resilient_claimed_run(
    service: &AgentService,
    run: &crate::service::agents::AgentRun,
    owner: &str,
    cancellation: tinyagents::CancellationToken,
) -> crate::service::agents::AgentResult<()> {
    let circuit_lease = service.provider_circuit().acquire().await;
    if circuit_lease.probe {
        service
            .store()
            .append_event(
                &run.id,
                "provider_circuit_probe_started",
                &serde_json::json!({}),
            )
            .await?;
    }
    let result = execute_claimed_run(service, run, owner, cancellation).await;
    let outcome = match &result {
        Ok(()) => ProviderOutcome::Success,
        Err(crate::service::agents::AgentError::Provider(failure)) if failure.retryable => {
            ProviderOutcome::RetryableFailure
        }
        _ => ProviderOutcome::Neutral,
    };
    let transition = service.provider_circuit().complete(circuit_lease, outcome);
    let event_kind = match transition {
        Some(CircuitTransition::Opened) => Some("provider_circuit_opened"),
        Some(CircuitTransition::Closed) => Some("provider_circuit_closed"),
        None => None,
    };
    if let Some(kind) = event_kind
        && let Err(error) = service
            .store()
            .append_event(&run.id, kind, &serde_json::json!({}))
            .await
    {
        log::warn!(
            "[agents] could not persist {kind} for run {}: {error}",
            run.id
        );
    }
    result
}

async fn execute_claimed_run(
    service: &AgentService,
    run: &crate::service::agents::AgentRun,
    owner: &str,
    cancellation: tinyagents::CancellationToken,
) -> crate::service::agents::AgentResult<()> {
    let message_id = run
        .input_message_id
        .as_deref()
        .ok_or(crate::service::agents::AgentError::Internal)?;
    let message = service.store().get_message_internal(message_id).await?;
    let content = message
        .content
        .get("text")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            crate::service::agents::AgentError::Validation(
                "agent input message is missing text".into(),
            )
        })?;
    let context: crate::service::agents::AgentMessageContext = message
        .content
        .get("context")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|_| crate::service::agents::AgentError::Internal)?
        .unwrap_or_default();
    AgentTurnRunner::new(service)
        .execute_claimed(run, owner, content, context, cancellation)
        .await
}
