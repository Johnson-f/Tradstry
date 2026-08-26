use std::sync::Arc;
use std::time::Duration;

use log::{error, info};

use super::KnowledgeIndexer;

pub async fn run_knowledge_worker(
    indexer: Arc<KnowledgeIndexer>,
    worker_index: usize,
    lease_seconds: u64,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("knowledge-worker-{}-{worker_index}", uuid::Uuid::new_v4());
    info!("[agents] knowledge worker {owner} started");
    loop {
        if *shutdown.borrow() {
            return;
        }
        match indexer.store().claim(&owner, lease_seconds).await {
            Ok(Some(record)) => {
                if let Err(failure) = indexer.process(&record, &owner).await {
                    error!("[agents] knowledge job {} failed: {failure}", record.id);
                    let retryable = matches!(
                        failure,
                        crate::service::agents::AgentError::ProviderUnavailable
                            | crate::service::agents::AgentError::Internal
                    );
                    let _ = indexer
                        .store()
                        .fail(record.id, &owner, "knowledge_index_failed", retryable)
                        .await;
                }
            }
            Ok(None) => {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(5)) => {},
                    _ = shutdown.changed() => {},
                }
            }
            Err(failure) => {
                error!("[agents] knowledge worker claim failed: {failure}");
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {},
                    _ = shutdown.changed() => {},
                }
            }
        }
    }
}
