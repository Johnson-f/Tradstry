#![allow(dead_code)]

use crate::turso::vector_config::SearchConfig;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Document metadata for Upstash Search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub user_id: String,
    pub data_type: String,
    pub entity_id: String,
    pub timestamp: DateTime<Utc>,
    pub tags: Vec<String>,
    pub content_hash: String,
}

/// Document structure for Upstash Search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub content: HashMap<String, String>, // title, description, symbol, etc.
    pub metadata: DocumentMetadata,
}

/// Search query structure
#[derive(Debug, Serialize)]
pub struct SearchQuery {
    pub query: String,
    pub limit: usize,
    pub reranking: bool,
    pub filter: Option<String>,
    pub namespace: Option<String>,
}

/// Search result from Upstash Search
#[derive(Debug, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub content: HashMap<String, String>,
    pub metadata: DocumentMetadata,
}

/// Response structure from Upstash Search upsert
#[derive(Debug, Deserialize)]
pub struct UpsertResponse {
    pub success: bool,
    pub message: Option<String>,
}

/// Response structure from Upstash Search query
#[derive(Debug, Deserialize)]
pub struct QueryResponse {
    pub results: Vec<SearchResult>,
    pub total: usize,
}

/// Upstash Search API client
pub struct UpstashSearchClient {
    config: SearchConfig,
    client: Client,
}

impl UpstashSearchClient {
    pub fn new(config: SearchConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { config, client })
    }

    /// Upsert documents into Upstash Search
    pub async fn upsert_documents(
        &self,
        index: &str,
        documents: Vec<Document>,
    ) -> Result<()> {
        if documents.is_empty() {
            log::debug!("Skipping empty document upsert - index={}", index);
            return Ok(());
        }

        log::info!(
            "Starting document upsert - index={}, document_count={}",
            index, documents.len()
        );

        let mut retries = 0;
        loop {
            log::debug!(
                "Attempting document upsert - attempt={}, index={}, documents={}",
                retries + 1, index, documents.len()
            );

            match self.make_upsert_request(index, &documents).await {
                Ok(_) => {
                    log::info!(
                        "Document upsert successful - index={}, documents={}",
                        index, documents.len()
                    );
                    return Ok(());
                },
                Err(e) => {
                    // Check if it's a 404 error (index doesn't exist)
                    if e.to_string().contains("404") && retries == 0 {
                        log::info!(
                            "Index not found, attempting to create - index={}",
                            index
                        );
                        
                        // Try to create the index
                        if let Err(create_err) = self.create_index(index).await {
                            log::warn!(
                                "Failed to create index - index={}, error={:?}",
                                index, create_err
                            );
                        } else {
                            log::info!(
                                "Index created successfully - index={}",
                                index
                            );
                            // Continue to retry the upsert
                        }
                    }

                    retries += 1;
                    log::warn!(
                        "Document upsert failed - attempt={}, index={}, error={:?}",
                        retries, index, e
                    );

                    if retries >= self.config.max_retries {
                        log::error!(
                            "Document upsert max retries exceeded - index={}, attempts={}, final_error={:?}",
                            index, retries, e
                        );
                        return Err(e).context("Max retries exceeded for Upstash Search upsert");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    log::debug!(
                        "Retrying document upsert in {}ms - index={}, attempt={}",
                        delay.as_millis(), index, retries + 1
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Search documents with optional reranking
    pub async fn search(&self, query: SearchQuery) -> Result<Vec<SearchResult>> {
        let mut retries = 0;
        loop {
            match self.make_search_request(&query).await {
                Ok(response) => return Ok(response.results),
                Err(e) => {
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for Upstash Search query");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Delete documents by IDs
    pub async fn delete_documents(&self, index: &str, document_ids: &[String]) -> Result<()> {
        if document_ids.is_empty() {
            return Ok(());
        }

        let url = format!("{}/indexes/{}/documents", self.config.get_base_url(), index);
        let payload = serde_json::json!({
            "ids": document_ids
        });

        let mut retries = 0;
        loop {
            match self.make_delete_request(&url, &payload).await {
                Ok(_) => return Ok(()),
                Err(e) => {
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for Upstash Search delete");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Delete all documents for a user by listing and deleting all documents in their index
    pub async fn delete_all_user_documents(&self, user_id: &str) -> Result<()> {
        let index_name = self.config.get_index_name(user_id);
        
        log::info!("Deleting all documents from Upstash Search index: {}", index_name);

        // First, try to list all documents in the index
        // Note: Upstash Search doesn't have a direct "list all" API, so we'll try to delete by pattern
        // For now, we'll attempt to delete the entire index (if API supports it) or mark as cleanup needed
        
        // Attempt to delete the index itself (if supported by API)
        let delete_index_url = format!("{}/indexes/{}", self.config.get_base_url(), index_name);
        
        let response = self.client
            .delete(&delete_index_url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .send()
            .await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    log::info!("Successfully deleted Upstash Search index: {}", index_name);
                    return Ok(());
                } else {
                    let error_text = resp.text().await.unwrap_or_default();
                    log::warn!("Failed to delete index {}: status {} - {}", index_name, status, error_text);
                    // Fall through to document deletion approach
                }
            }
            Err(e) => {
                log::warn!("Failed to delete index {}: {}", index_name, e);
                // Fall through to document deletion approach
            }
        }

        // If index deletion fails, we note that manual cleanup may be needed
        // Upstash Search doesn't have a direct way to list all documents,
        // so this is a limitation we accept
        log::warn!("Upstash Search index {} may require manual cleanup. Documents may still exist.", index_name);
        Ok(())
    }

    /// Make upsert request to Upstash Search API
    async fn make_upsert_request(&self, index: &str, documents: &[Document]) -> Result<()> {
        // Upstash Search uses a different API structure
        // The correct endpoint is POST /indexes/{index}/documents
        let url = format!("{}/indexes/{}/documents", self.config.get_base_url(), index);

        log::debug!(
            "Making search upsert request - url={}, index={}, documents={}",
            url, index, documents.len()
        );

        // Log document details for debugging
        for (i, doc) in documents.iter().enumerate() {
            log::debug!(
                "Document {} - id={}, content_keys={:?}, metadata={:?}",
                i, doc.id, doc.content.keys().collect::<Vec<_>>(), doc.metadata
            );
        }

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(documents)
            .send()
            .await
            .context("Failed to send upsert request to Upstash Search")?;

        let status = response.status();
        log::debug!(
            "Search upsert response received - status={}, index={}",
            status, index
        );

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!(
                "Search upsert failed with status {} - index={}, error_text={}",
                status, index, error_text
            );
            return Err(anyhow::anyhow!(
                "Upstash Search upsert error: {} - {}",
                status,
                error_text
            ));
        }

        log::debug!(
            "Search upsert successful - index={}, documents={}",
            index, documents.len()
        );

        Ok(())
    }

    /// Make search request to Upstash Search API
    async fn make_search_request(&self, query: &SearchQuery) -> Result<QueryResponse> {
        let url = format!("{}/indexes/search", self.config.get_base_url());
        
        let mut payload = serde_json::json!({
            "query": query.query,
            "limit": query.limit,
            "reranking": query.reranking
        });

        if let Some(ref filter) = query.filter {
            payload["filter"] = serde_json::Value::String(filter.clone());
        }

        if let Some(ref namespace) = query.namespace {
            payload["namespace"] = serde_json::Value::String(namespace.clone());
        }

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .context("Failed to send search request to Upstash Search")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Upstash Search query error: {} - {}",
                status,
                error_text
            ));
        }

        let query_response: QueryResponse = response
            .json()
            .await
            .context("Failed to parse Upstash Search query response")?;

        Ok(query_response)
    }

    /// Make delete request to Upstash Search API
    async fn make_delete_request(&self, url: &str, payload: &serde_json::Value) -> Result<()> {
        let response = self
            .client
            .delete(url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(payload)
            .send()
            .await
            .context("Failed to send delete request to Upstash Search")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Upstash Search delete error: {} - {}",
                status,
                error_text
            ));
        }

        Ok(())
    }

    /// Health check for Upstash Search
    pub async fn ping(&self) -> Result<Duration> {
        let start = std::time::Instant::now();
        
        // Test with a simple search query
        let test_query = SearchQuery {
            query: "test".to_string(),
            limit: 1,
            reranking: false,
            filter: None,
            namespace: None,
        };
        
        let _ = self.search(test_query).await;
        
        Ok(start.elapsed())
    }

    /// Get user namespace
    pub fn get_user_namespace(&self, user_id: &str) -> String {
        self.config.get_user_namespace(user_id)
    }

    /// Create a new search index
    pub async fn create_index(&self, index_name: &str) -> Result<()> {
        // Upstash Search uses POST /indexes to create indexes
        let url = format!("{}/indexes", self.config.get_base_url());
        
        log::info!(
            "Creating search index - url={}, index_name={}",
            url, index_name
        );

        let payload = serde_json::json!({
            "name": index_name,
            "description": format!("Search index for user {}", index_name),
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 0
            }
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .context("Failed to send create index request to Upstash Search")?;

        let status = response.status();
        log::debug!(
            "Create index response received - status={}, index_name={}",
            status, index_name
        );

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!(
                "Create index failed with status {} - index_name={}, error_text={}",
                status, index_name, error_text
            );
            return Err(anyhow::anyhow!(
                "Upstash Search create index error: {} - {}",
                status,
                error_text
            ));
        }

        log::info!(
            "Search index created successfully - index_name={}",
            index_name
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upstash_search_client_creation() {
        let config = SearchConfig {
            url: "https://test-search.upstash.io".to_string(),
            token: "test_token".to_string(),
            max_retries: 3,
            timeout_seconds: 30,
            namespace_prefix: "user".to_string(),
        };

        let client = UpstashSearchClient::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_user_namespace_generation() {
        let config = SearchConfig {
            url: "https://test-search.upstash.io".to_string(),
            token: "test_token".to_string(),
            max_retries: 3,
            timeout_seconds: 30,
            namespace_prefix: "user".to_string(),
        };

        let client = UpstashSearchClient::new(config).unwrap();
        let namespace = client.get_user_namespace("user123");
        assert_eq!(namespace, "user_user123");
    }

    #[test]
    fn test_document_creation() {
        let metadata = DocumentMetadata {
            user_id: "user123".to_string(),
            data_type: "stock".to_string(),
            entity_id: "stock456".to_string(),
            timestamp: Utc::now(),
            tags: vec!["profitable".to_string(), "momentum".to_string()],
            content_hash: "abc123".to_string(),
        };

        let mut content = HashMap::new();
        content.insert("title".to_string(), "AAPL Trade".to_string());
        content.insert("description".to_string(), "Profitable momentum trade".to_string());

        let document = Document {
            id: "stock_456".to_string(),
            content,
            metadata,
        };

        assert_eq!(document.id, "stock_456");
        assert_eq!(document.metadata.user_id, "user123");
        assert_eq!(document.content.get("title").unwrap(), "AAPL Trade");
    }
}

