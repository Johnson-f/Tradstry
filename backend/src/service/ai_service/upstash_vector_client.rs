#![allow(dead_code)]

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
    #[serde(serialize_with = "serialize_data_type")]
    pub data_type: DataType,
    pub entity_id: String,
    #[serde(serialize_with = "serialize_timestamp")]
    pub timestamp: DateTime<Utc>,
    pub tags: Vec<String>,
    pub content_hash: String,
}

// Custom serializer for DataType to ensure lowercase string
fn serialize_data_type<S>(data_type: &DataType, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let type_str = match data_type {
        DataType::Stock => "stock",
        DataType::Option => "option",
        DataType::TradeNote => "tradenote",
        DataType::NotebookEntry => "notebookentry",
        DataType::PlaybookStrategy => "playbookstrategy",
    };
    serializer.serialize_str(type_str)
}

// Custom serializer for timestamp to ensure ISO 8601 format
fn serialize_timestamp<S>(timestamp: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&timestamp.to_rfc3339())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
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
    #[serde(rename = "topK")]
    pub top_k: usize,
    #[serde(rename = "includeMetadata")]
    pub include_metadata: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
}

/// Response structure from Upstash Vector query
#[derive(Debug, Deserialize)]
pub struct QueryResponse {
    #[serde(default)]
    pub result: Vec<VectorMatch>,
}

#[derive(Debug, Deserialize)]
pub struct VectorMatch {
    pub id: String,
    pub score: f32,
    #[serde(default)]
    pub metadata: Option<VectorMetadata>,
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

    /// Sanitize string to ensure it's valid JSON
    fn sanitize_string(s: &str) -> String {
        s.chars()
            .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
            .collect()
    }

    /// Validate and sanitize metadata before upserting
    fn sanitize_metadata(metadata: &mut VectorMetadata) {
        metadata.user_id = Self::sanitize_string(&metadata.user_id);
        metadata.entity_id = Self::sanitize_string(&metadata.entity_id);
        metadata.content_hash = Self::sanitize_string(&metadata.content_hash);
        metadata.tags = metadata.tags
            .iter()
            .map(|tag| Self::sanitize_string(tag))
            .collect();
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
            .map(|(id, vector, mut metadata)| {
                // Sanitize metadata before serialization
                Self::sanitize_metadata(&mut metadata);

                VectorData {
                    id: Self::sanitize_string(&id),
                    vector,
                    metadata,
                }
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
                        // Log the payload for debugging
                        if let Ok(payload_str) = serde_json::to_string_pretty(&request) {
                            log::error!(
                                "Failed upsert payload (first 1000 chars): {}",
                                payload_str.chars().take(1000).collect::<String>()
                            );
                        }
                        return Err(e).context("Max retries exceeded for Upstash Vector upsert");
                    }

                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Query vectors by similarity using query text (generates embedding internally)
    pub async fn query_similar_vectors(
        &self,
        _user_id: &str,
        _query_text: &str,
        _top_k: usize,
        _data_types: Option<Vec<DataType>>,
    ) -> Result<Vec<VectorMatch>> {
        // This method would need access to VoyagerClient to generate embeddings
        // For now, return an error indicating this method needs to be implemented differently
        Err(anyhow::anyhow!("query_similar_vectors method needs VoyagerClient integration"))
    }

    /// Query vectors by similarity
    pub async fn query_similarity(
        &self,
        namespace: &str,
        query_vector: &[f32],
        top_k: usize,
        filter: Option<serde_json::Value>,
    ) -> Result<Vec<VectorMatch>> {
        log::info!(
            "Starting vector similarity query - namespace={}, vector_dim={}, top_k={}, filter={:?}",
            namespace, query_vector.len(), top_k, filter
        );

        // Convert filter to string format if provided
        let filter_string = filter.map(|f| f.to_string());

        let request = QueryRequest {
            vector: query_vector.to_vec(),
            top_k,
            include_metadata: true,
            filter: filter_string,
        };

        let mut retries = 0;
        loop {
            log::debug!(
                "Attempting vector query - attempt={}, namespace={}, top_k={}",
                retries + 1, namespace, top_k
            );

            match self.make_query_request(namespace, &request).await {
                Ok(response) => {
                    log::info!(
                        "Vector query successful - namespace={}, results={}, top_k={}",
                        namespace, response.result.len(), top_k
                    );
                    
                    // Log top scores for debugging
                    if !response.result.is_empty() {
                        let top_scores: Vec<String> = response.result.iter()
                            .take(3)
                            .map(|r| format!("{:.3}", r.score))
                            .collect();
                        log::debug!(
                            "Top vector scores: [{}] - namespace={}",
                            top_scores.join(", "), namespace
                        );
                    }
                    
                    return Ok(response.result);
                },
                Err(e) => {
                    retries += 1;
                    log::warn!(
                        "Vector query failed - attempt={}, namespace={}, error={:?}",
                        retries, namespace, e
                    );

                    if retries >= self.config.max_retries {
                        log::error!(
                            "Vector query max retries exceeded - namespace={}, attempts={}, final_error={:?}",
                            namespace, retries, e
                        );
                        return Err(e).context("Max retries exceeded for Upstash Vector query");
                    }

                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    log::debug!(
                        "Retrying vector query in {}ms - namespace={}, attempt={}",
                        delay.as_millis(), namespace, retries + 1
                    );
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

        let url = format!("{}/delete/{}", self.config.get_base_url(), namespace);
        let payload = serde_json::json!(vector_ids);

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
        let url = format!("{}/upsert/{}", self.config.get_base_url(), namespace);

        // Send the vectors array directly as the body
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(&request.vectors)
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
    async fn make_query_request(&self, namespace: &str, request: &QueryRequest) -> Result<QueryResponse> {
        // The query endpoint is just /query, with namespace in URL path
        let url = format!("{}/query/{}", self.config.get_base_url(), namespace);

        log::debug!(
            "Making vector query request - url={}, vector_dim={}, top_k={}, filter={:?}",
            url, request.vector.len(), request.top_k, request.filter
        );

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await
            .context("Failed to send query request to Upstash Vector")?;

        let status = response.status();
        log::debug!(
            "Vector query response received - status={}, namespace={}",
            status, namespace
        );

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!(
                "Vector query failed with status {} - namespace={}, error_text={}",
                status, namespace, error_text
            );
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

        log::debug!(
            "Vector query response parsed successfully - namespace={}, results={}",
            namespace, query_response.result.len()
        );

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

// Implement conversion from VectorMatch to the expected type
impl VectorMatch {
    pub fn metadata(&self) -> VectorMetadata {
        self.metadata.clone().unwrap_or_else(|| VectorMetadata {
            user_id: String::new(),
            data_type: DataType::Stock,
            entity_id: String::new(),
            timestamp: Utc::now(),
            tags: Vec::new(),
            content_hash: String::new(),
        })
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

    #[test]
    fn test_sanitize_string() {
        let dirty = "Hello\x00World\x1FTest";
        let clean = UpstashVectorClient::sanitize_string(dirty);
        assert_eq!(clean, "HelloWorldTest");
    }
}
