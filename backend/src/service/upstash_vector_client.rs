use crate::turso::vector_config::VectorConfig;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Vector metadata for storage in Upstash Vector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorMetadata {
    pub user_id: String,
    pub data_type: DataType,
    pub entity_id: String,
    pub timestamp: DateTime<Utc>,
    pub tags: Vec<String>,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataType {
    Stock,
    Option,
    TradeNote,
    NotebookEntry,
    PlaybookStrategy,
}

/// Request structure for Upstash Vector upsert
#[derive(Debug, Serialize)]
pub struct UpsertRequest {
    pub vectors: Vec<VectorData>,
}

#[derive(Debug, Serialize)]
pub struct VectorData {
    pub id: String,
    pub vector: Vec<f32>,
    pub metadata: VectorMetadata,
}

/// Request structure for Upstash Vector query
#[derive(Debug, Serialize)]
pub struct QueryRequest {
    pub vector: Vec<f32>,
    pub top_k: usize,
    pub namespace: Option<String>,
    pub filter: Option<serde_json::Value>,
}

/// Response structure from Upstash Vector query
#[derive(Debug, Deserialize)]
pub struct QueryResponse {
    pub matches: Vec<VectorMatch>,
}

#[derive(Debug, Deserialize)]
pub struct VectorMatch {
    pub id: String,
    pub score: f32,
    pub metadata: VectorMetadata,
}

/// Upstash Vector API client
pub struct UpstashVectorClient {
    config: VectorConfig,
    client: Client,
}

impl UpstashVectorClient {
    pub fn new(config: VectorConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { config, client })
    }

    /// Upsert vectors into Upstash Vector
    pub async fn upsert_vectors(
        &self,
        namespace: &str,
        vectors: Vec<(String, Vec<f32>, VectorMetadata)>,
    ) -> Result<()> {
        if vectors.is_empty() {
            return Ok(());
        }

        let vector_data: Vec<VectorData> = vectors
            .into_iter()
            .map(|(id, vector, metadata)| VectorData {
                id,
                vector,
                metadata,
            })
            .collect();

        let request = UpsertRequest { vectors: vector_data };

        let mut retries = 0;
        loop {
            match self.make_upsert_request(namespace, &request).await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for Upstash Vector upsert");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Query vectors by similarity
    pub async fn query_similarity(
        &self,
        namespace: &str,
        query_vector: &[f32],
        top_k: usize,
        filter: Option<serde_json::Value>,
    ) -> Result<Vec<VectorMatch>> {
        let request = QueryRequest {
            vector: query_vector.to_vec(),
            top_k,
            namespace: Some(namespace.to_string()),
            filter,
        };

        let mut retries = 0;
        loop {
            match self.make_query_request(&request).await {
                Ok(response) => return Ok(response.matches),
                Err(e) => {
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for Upstash Vector query");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Delete vectors by IDs
    pub async fn delete_vectors(&self, namespace: &str, vector_ids: &[String]) -> Result<()> {
        if vector_ids.is_empty() {
            return Ok(());
        }

        let url = format!("{}/vectors/delete", self.config.get_base_url());
        let payload = serde_json::json!({
            "ids": vector_ids,
            "namespace": namespace
        });

        let mut retries = 0;
        loop {
            match self.make_delete_request(&url, &payload).await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for Upstash Vector delete");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Make upsert request to Upstash Vector API
    async fn make_upsert_request(&self, namespace: &str, request: &UpsertRequest) -> Result<()> {
        let url = format!("{}/vectors/upsert", self.config.get_base_url());
        let payload = serde_json::json!({
            "vectors": request.vectors,
            "namespace": namespace
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .context("Failed to send upsert request to Upstash Vector")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Upstash Vector upsert error: {} - {}",
                status,
                error_text
            ));
        }

        Ok(())
    }

    /// Make query request to Upstash Vector API
    async fn make_query_request(&self, request: &QueryRequest) -> Result<QueryResponse> {
        let url = format!("{}/vectors/query", self.config.get_base_url());

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await
            .context("Failed to send query request to Upstash Vector")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Upstash Vector query error: {} - {}",
                status,
                error_text
            ));
        }

        let query_response: QueryResponse = response
            .json()
            .await
            .context("Failed to parse Upstash Vector query response")?;

        Ok(query_response)
    }

    /// Make delete request to Upstash Vector API
    async fn make_delete_request(&self, url: &str, payload: &serde_json::Value) -> Result<()> {
        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(payload)
            .send()
            .await
            .context("Failed to send delete request to Upstash Vector")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Upstash Vector delete error: {} - {}",
                status,
                error_text
            ));
        }

        Ok(())
    }

    /// Health check for Upstash Vector
    pub async fn ping(&self) -> Result<Duration> {
        let start = std::time::Instant::now();
        
        // Test with a simple query using a dummy vector
        let dummy_vector = vec![0.0; self.config.dimensions];
        let _ = self.query_similarity("test", &dummy_vector, 1, None).await;
        
        Ok(start.elapsed())
    }

    /// Get user namespace
    pub fn get_user_namespace(&self, user_id: &str) -> String {
        self.config.get_user_namespace(user_id)
    }

    /// Get vector dimensions
    pub fn get_dimensions(&self) -> usize {
        self.config.dimensions
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_upstash_vector_client_creation() {
        let config = VectorConfig {
            url: "https://test.upstash.io".to_string(),
            token: "test_token".to_string(),
            dimensions: 1024,
            namespace_prefix: "user".to_string(),
            max_retries: 3,
            timeout_seconds: 30,
        };

        let client = UpstashVectorClient::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_user_namespace_generation() {
        let config = VectorConfig {
            url: "https://test.upstash.io".to_string(),
            token: "test_token".to_string(),
            dimensions: 1024,
            namespace_prefix: "user".to_string(),
            max_retries: 3,
            timeout_seconds: 30,
        };

        let client = UpstashVectorClient::new(config).unwrap();
        let namespace = client.get_user_namespace("user123");
        assert_eq!(namespace, "user_user123");
    }
}

