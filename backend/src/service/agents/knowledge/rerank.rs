use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;

use super::VoyageClient;
use super::retrieval::KnowledgeCandidate;
use crate::service::agents::{AgentError, AgentResult};

#[async_trait]
pub trait Reranker: Send + Sync {
    async fn rerank(
        &self,
        query: &str,
        candidates: &[KnowledgeCandidate],
        take: usize,
    ) -> AgentResult<Vec<usize>>;
}

pub struct VoyageReranker {
    client: Arc<VoyageClient>,
}

impl VoyageReranker {
    pub fn new(client: Arc<VoyageClient>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl Reranker for VoyageReranker {
    async fn rerank(
        &self,
        query: &str,
        candidates: &[KnowledgeCandidate],
        take: usize,
    ) -> AgentResult<Vec<usize>> {
        if candidates.len() > 100 || take > candidates.len() {
            return Err(AgentError::Validation(
                "knowledge rerank request exceeds its bounds".into(),
            ));
        }
        let results = self
            .client
            .rerank(
                query.to_string(),
                candidates
                    .iter()
                    .map(|candidate| candidate.search_text.clone())
                    .collect(),
                Some(take as u32),
            )
            .await
            .map_err(|error| {
                log::warn!("knowledge reranker unavailable: {error:#}");
                AgentError::ProviderUnavailable
            })?;
        validate_indexes(
            results.into_iter().map(|result| result.index).collect(),
            candidates.len(),
            take,
        )
    }
}

fn validate_indexes(
    indexes: Vec<usize>,
    candidate_count: usize,
    take: usize,
) -> AgentResult<Vec<usize>> {
    let mut seen = HashSet::new();
    if indexes.len() > take
        || indexes
            .iter()
            .any(|index| *index >= candidate_count || !seen.insert(*index))
    {
        return Err(AgentError::ProviderUnavailable);
    }
    Ok(indexes)
}

#[cfg(test)]
mod tests {
    use super::validate_indexes;

    #[test]
    fn rerank_indexes_must_be_unique_and_in_range() {
        assert_eq!(validate_indexes(vec![2, 0], 3, 2).unwrap(), [2, 0]);
        assert!(validate_indexes(vec![0, 0], 3, 2).is_err());
        assert!(validate_indexes(vec![3], 3, 2).is_err());
    }
}
