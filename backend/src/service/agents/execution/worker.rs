use std::sync::Arc;
use std::time::Duration;

use log::{error, info};

use crate::service::agents::AgentService;
use crate::service::agents::routing::{FastRoute, route_message};

use super::execute_deep;
use super::fast_ai::execute_fast_ai;
use super::instant::execute_instant;

pub async fn run_agent_worker(
    service: Arc<AgentService>,
    worker_index: usize,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("agent-worker-{}-{worker_index}", uuid::Uuid::new_v4());
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
                    if let Err(close_error) = service
                        .store()
                        .fail_claimed_run(&run.id, &owner, "agent_execution_failed")
                        .await
                    {
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
    let execution = execute_claimed_run(service, run, owner);
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

async fn execute_claimed_run(
    service: &AgentService,
    run: &crate::service::agents::AgentRun,
    owner: &str,
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
    let route = route_message(content, &context);
    let lane = match route {
        FastRoute::Instant(_) => crate::service::agents::AgentLane::Instant,
        FastRoute::FastAi(_) => crate::service::agents::AgentLane::FastAi,
        FastRoute::Deep => crate::service::agents::AgentLane::Deep,
    };
    if run.stage == "queued"
        && !service
            .store()
            .route_claimed_run(&run.id, owner, lane.clone())
            .await?
    {
        return Err(crate::service::agents::AgentError::Conflict);
    }
    match route {
        FastRoute::Instant(intent) => execute_instant(service, run, owner, context, intent).await,
        FastRoute::FastAi(intent) => {
            execute_fast_ai(service, run, owner, content, context, intent).await
        }
        FastRoute::Deep => execute_deep(service, run, owner, content, context).await,
    }
}
