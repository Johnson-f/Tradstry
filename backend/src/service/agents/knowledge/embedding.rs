use std::sync::Arc;

use async_trait::async_trait;

use super::VoyageClient;
use crate::service::agents::{AgentError, AgentResult};

const MAX_BATCH_ITEMS: usize = 64;
const MAX_BATCH_ESTIMATED_TOKENS: usize = 100_000;

#[async_trait]
pub trait EmbeddingProvider: Send + Sync {
    fn model_id(&self) -> &str;
    fn dimensions(&self) -> usize;
    async fn embed_documents(&self, inputs: &[String]) -> AgentResult<Vec<Vec<f32>>>;
    async fn embed_query(&self, input: &str) -> AgentResult<Vec<f32>>;
}

pub struct VoyageEmbeddingProvider {
    client: Arc<VoyageClient>,
    model_id: String,
    dimensions: usize,
}

impl VoyageEmbeddingProvider {
    pub fn new(client: Arc<VoyageClient>) -> Self {
        Self {
            model_id: client.config().embedding_model.clone(),
            dimensions: client.config().output_dimension as usize,
            client,
        }
    }

    fn validate(&self, vectors: Vec<Vec<f32>>, expected: usize) -> AgentResult<Vec<Vec<f32>>> {
        if vectors.len() != expected
            || vectors.iter().any(|vector| {
                vector.len() != self.dimensions || vector.iter().any(|value| !value.is_finite())
            })
        {
            return Err(AgentError::ProviderUnavailable);
        }
        Ok(vectors)
    }
}

#[async_trait]
impl EmbeddingProvider for VoyageEmbeddingProvider {
    fn model_id(&self) -> &str {
        &self.model_id
    }

    fn dimensions(&self) -> usize {
        self.dimensions
    }

    async fn embed_documents(&self, inputs: &[String]) -> AgentResult<Vec<Vec<f32>>> {
        let mut all = Vec::with_capacity(inputs.len());
        let mut start = 0;
        while start < inputs.len() {
            let mut end = start;
            let mut tokens = 0usize;
            while end < inputs.len() && end - start < MAX_BATCH_ITEMS {
                let next_tokens = estimated_tokens(&inputs[end]);
                if next_tokens > MAX_BATCH_ESTIMATED_TOKENS {
                    return Err(AgentError::Validation(
                        "one knowledge passage exceeds the embedding token ceiling".into(),
                    ));
                }
                if end > start && tokens + next_tokens > MAX_BATCH_ESTIMATED_TOKENS {
                    break;
                }
                tokens += next_tokens;
                end += 1;
            }
            let batch = inputs[start..end].to_vec();
            let vectors = self
                .client
                .embed_texts(batch, Some("document"))
                .await
                .map_err(|error| {
                    log::warn!("knowledge embedding provider unavailable: {error:#}");
                    AgentError::ProviderUnavailable
                })?;
            all.extend(self.validate(vectors, end - start)?);
            start = end;
        }
        Ok(all)
    }

    async fn embed_query(&self, input: &str) -> AgentResult<Vec<f32>> {
        if input.trim().is_empty() || estimated_tokens(input) > MAX_BATCH_ESTIMATED_TOKENS {
            return Err(AgentError::Validation(
                "knowledge query is empty or too large".into(),
            ));
        }
        let vector = self
            .client
            .embed_text(input.to_string(), Some("query"))
            .await
            .map_err(|error| {
                log::warn!("knowledge query embedding unavailable: {error:#}");
                AgentError::ProviderUnavailable
            })?;
        self.validate(vec![vector], 1)
            .map(|mut values| values.remove(0))
    }
}

fn estimated_tokens(input: &str) -> usize {
    (input.chars().count() / 4).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_estimate_is_unicode_safe_and_nonzero() {
        assert_eq!(estimated_tokens(""), 1);
        assert_eq!(estimated_tokens(&"🦀".repeat(12)), 3);
    }
}
