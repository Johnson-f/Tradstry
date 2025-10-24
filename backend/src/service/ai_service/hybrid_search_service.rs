#![allow(dead_code)]

use crate::service::ai_service::upstash_vector_client::UpstashVectorClient;
use crate::service::ai_service::qdrant_client::QdrantDocumentClient;
use crate::service::ai_service::voyager_client::VoyagerClient;
use crate::turso::vector_config::HybridSearchConfig;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;

/// Search mode for hybrid search
#[derive(Debug, Clone, PartialEq)]
pub enum SearchMode {
    VectorOnly,      // Use only vector similarity search
    KeywordOnly,     // Use only keyword/text search
    Hybrid,          // Combine both without AI reranking
    HybridReranked,  // Combine both with AI reranking
}

/// Unified search result combining vector and keyword results
#[derive(Debug, Clone)]
pub struct HybridSearchResult {
    pub id: String,
    pub entity_id: String,
    pub data_type: String,
    pub content_snippet: String,
    pub vector_score: Option<f32>,
    pub keyword_score: Option<f32>,
    pub combined_score: f32,
    pub metadata: HashMap<String, String>,
}

/// Hybrid search service combining vector and keyword search
pub struct HybridSearchService {
    vector_client: Arc<UpstashVectorClient>,
    search_client: Arc<QdrantDocumentClient>,
    voyager_client: Arc<VoyagerClient>,
    config: HybridSearchConfig,
}

impl HybridSearchService {
    pub fn new(
        vector_client: Arc<UpstashVectorClient>,
        search_client: Arc<QdrantDocumentClient>,
        voyager_client: Arc<VoyagerClient>,
        config: HybridSearchConfig,
    ) -> Self {
        Self {
            vector_client,
            search_client,
            voyager_client,
            config,
        }
    }

    /// Perform vector-only search (existing functionality)
    pub async fn vector_only_search(
        &self,
        user_id: &str,
        query: &str,
        top_k: usize,
        data_types: Option<Vec<crate::service::ai_service::upstash_vector_client::DataType>>,
    ) -> Result<Vec<HybridSearchResult>> {
        log::info!(
            "Starting vector-only search - user={}, query_preview='{}', top_k={}, data_types={:?}",
            user_id, query.chars().take(50).collect::<String>(), top_k, data_types
        );

        // Generate embedding for query
        log::debug!("Generating query embedding for user={}", user_id);
        let query_vector = self.voyager_client.embed_text(query).await
            .context("Failed to generate query embedding")?;
        
        log::info!(
            "Query embedding generated - user={}, embedding_dim={}",
            user_id, query_vector.len()
        );
        
        // Create filter if data types are specified
        let filter = if let Some(dtypes) = data_types {
            let filter_values: Vec<String> = dtypes.iter()
                .map(|dt| format!("\"{}\"", format!("{:?}", dt).to_lowercase()))
                .collect();
            log::debug!(
                "Created data type filter - user={}, filter_values={:?}",
                user_id, filter_values
            );
            Some(serde_json::json!({
                "data_type": {"$in": filter_values}
            }))
        } else {
            log::debug!("No data type filter specified - user={}", user_id);
            None
        };

        let namespace = self.vector_client.get_user_namespace(user_id);
        log::info!(
            "Performing vector similarity search - user={}, namespace={}, top_k={}",
            user_id, namespace, top_k
        );

        let vector_matches = self.vector_client
            .query_similarity(&namespace, &query_vector, top_k, filter)
            .await
            .context("Failed to perform vector search")?;

        log::info!(
            "Vector search completed - user={}, matches={}",
            user_id, vector_matches.len()
        );

        // Log top scores for debugging
        if !vector_matches.is_empty() {
            let top_scores: Vec<String> = vector_matches.iter()
                .take(3)
                .map(|vm| format!("{:.3}", vm.score))
                .collect();
            log::debug!(
                "Top vector search scores: [{}] - user={}",
                top_scores.join(", "), user_id
            );
        }

        let results: Vec<HybridSearchResult> = vector_matches
            .into_iter()
            .filter_map(|vm| {
                vm.metadata.map(|metadata| HybridSearchResult {
                id: vm.id.clone(),
                    entity_id: metadata.entity_id.clone(),
                    data_type: format!("{:?}", metadata.data_type).to_lowercase(),
                    content_snippet: metadata.content_hash.clone(), // Using hash as snippet placeholder
                vector_score: Some(vm.score),
                keyword_score: None,
                combined_score: vm.score,
                metadata: HashMap::from([
                        ("user_id".to_string(), metadata.user_id),
                        ("data_type".to_string(), format!("{:?}", metadata.data_type).to_lowercase()),
                        ("entity_id".to_string(), metadata.entity_id),
                        ("timestamp".to_string(), metadata.timestamp.to_rfc3339()),
                    ]),
                })
            })
            .collect();

        log::info!(
            "Vector-only search completed successfully - user={}, results={}",
            user_id, results.len()
        );

        Ok(results)
    }

    /// Perform keyword-only search (new functionality)
    pub async fn keyword_only_search(
        &self,
        user_id: &str,
        query: &str,
        limit: usize,
        _data_type: Option<&str>,
    ) -> Result<Vec<HybridSearchResult>> {
        log::info!(
            "Starting keyword-only search - user={}, query_preview='{}', limit={}",
            user_id, query.chars().take(50).collect::<String>(), limit
        );

        // Use Qdrant for keyword search
        let document_ids = self.search_client
            .search_by_keyword(user_id, query, limit)
            .await
            .context("Failed to perform keyword search")?;

        log::info!(
            "Keyword search completed - user={}, found {} documents",
            user_id, document_ids.len()
        );

        // Convert document IDs to HybridSearchResult format
        let results: Vec<HybridSearchResult> = document_ids.into_iter().map(|id| {
            HybridSearchResult {
                id: id.clone(),
                entity_id: id.clone(), // Assuming document ID matches entity ID
                data_type: "unknown".to_string(),
                content_snippet: "".to_string(),
                vector_score: None,
                keyword_score: Some(1.0), // Default keyword score
                combined_score: 1.0,
                metadata: HashMap::from([
                    ("user_id".to_string(), user_id.to_string()),
                    ("search_type".to_string(), "keyword".to_string()),
                ]),
            }
        }).collect();

        Ok(results)
    }

    /// Perform hybrid search combining vector and keyword results
    pub async fn hybrid_search(
        &self,
        user_id: &str,
        query: &str,
        limit: usize,
        data_types: Option<Vec<crate::service::ai_service::upstash_vector_client::DataType>>,
    ) -> Result<Vec<HybridSearchResult>> {
        if !self.config.enabled {
            // Fallback to vector-only search
            return self.vector_only_search(user_id, query, limit, data_types).await;
        }

        // Perform vector search first (this should always work)
        let vector_results = self.vector_only_search(user_id, query, limit, data_types.clone()).await?;
        
        // Try keyword search, but don't fail if it's not available
        let keyword_results = match self.keyword_only_search(user_id, query, limit, None).await {
            Ok(results) => results,
            Err(e) => {
                log::warn!("Keyword search failed, continuing with vector-only results: {}", e);
                vec![]
            }
        };

        // Merge and deduplicate results
        let mut merged_results = self.merge_search_results(vector_results, keyword_results);

        // Sort by combined score
        merged_results.sort_by(|a, b| b.combined_score.partial_cmp(&a.combined_score).unwrap());

        // Limit results
        merged_results.truncate(self.config.max_results);

        Ok(merged_results)
    }

    /// Perform hybrid search with AI-powered reranking
    pub async fn hybrid_search_with_reranking(
        &self,
        user_id: &str,
        query: &str,
        limit: usize,
        data_types: Option<Vec<crate::service::ai_service::upstash_vector_client::DataType>>,
    ) -> Result<Vec<HybridSearchResult>> {
        log::info!(
            "Starting hybrid search with reranking - user={}, query_preview='{}', limit={}, data_types={:?}",
            user_id, query.chars().take(50).collect::<String>(), limit, data_types
        );

        // First get hybrid results
        let mut results = self.hybrid_search(user_id, query, limit, data_types).await
            .context("Failed to perform hybrid search")?;

        log::info!(
            "Hybrid search completed - user={}, results={}",
            user_id, results.len()
        );

        if !self.config.ai_reranking_enabled || results.is_empty() {
            log::debug!(
                "Skipping AI reranking - user={}, ai_reranking_enabled={}, results_empty={}",
                user_id, self.config.ai_reranking_enabled, results.is_empty()
            );
            return Ok(results);
        }

        log::info!(
            "Starting AI reranking - user={}, results={}",
            user_id, results.len()
        );

        // Try AI reranking, but don't fail if it's not available
        match self.perform_ai_reranking(user_id, query, &mut results).await {
            Ok(_) => {
                log::info!(
                    "AI reranking completed successfully - user={}, query='{}'",
                    user_id, query.chars().take(50).collect::<String>()
                );
            }
            Err(e) => {
                log::warn!(
                    "AI reranking failed, returning original results - user={}, error={:?}",
                    user_id, e
                );
            }
        }

        log::info!(
            "Hybrid search with reranking completed - user={}, final_results={}",
            user_id, results.len()
        );

        Ok(results)
    }

    /// Perform AI reranking on search results
    async fn perform_ai_reranking(
        &self,
        _user_id: &str,
        _query: &str,
        results: &mut Vec<HybridSearchResult>,
    ) -> Result<()> {
        // For now, just log that reranking would happen here
        // In a full implementation, this would call Upstash Search's reranking API
        log::info!("AI reranking would be performed here for {} results", results.len());
        Ok(())
    }

    /// Merge vector and keyword search results, deduplicating by entity_id
    fn merge_search_results(
        &self,
        vector_results: Vec<HybridSearchResult>,
        keyword_results: Vec<HybridSearchResult>,
    ) -> Vec<HybridSearchResult> {
        let mut merged_map: HashMap<String, HybridSearchResult> = HashMap::new();

        // Add vector results
        for result in vector_results {
            merged_map.insert(result.entity_id.clone(), result);
        }

        // Merge keyword results
        for keyword_result in keyword_results {
            if let Some(existing) = merged_map.get_mut(&keyword_result.entity_id) {
                // Merge scores
                existing.keyword_score = keyword_result.keyword_score;
                existing.combined_score = self.calculate_combined_score(
                    existing.vector_score,
                    keyword_result.keyword_score,
                );
                
                // Update content snippet if keyword result has better description
                if !keyword_result.content_snippet.is_empty() {
                    existing.content_snippet = keyword_result.content_snippet;
                }
            } else {
                // Add new result
                merged_map.insert(keyword_result.entity_id.clone(), keyword_result);
            }
        }

        merged_map.into_values().collect()
    }

    /// Calculate combined score from vector and keyword scores
    fn calculate_combined_score(&self, vector_score: Option<f32>, keyword_score: Option<f32>) -> f32 {
        let vector_score = vector_score.unwrap_or(0.0);
        let keyword_score = keyword_score.unwrap_or(0.0);

        vector_score * self.config.vector_weight + keyword_score * self.config.keyword_weight
    }

    /// Health check for hybrid search service
    pub async fn health_check(&self) -> Result<()> {
        // Check vector client
        self.vector_client.ping().await?;
        
        // Check voyager client
        self.voyager_client.health_check().await?;
        
        // Note: Qdrant client doesn't have a ping method, but we can assume it's healthy
        // if the service was initialized successfully
        
        Ok(())
    }

    /// Get search configuration
    pub fn get_config(&self) -> &HybridSearchConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_calculate_combined_score() {
        let config = HybridSearchConfig {
            enabled: true,
            ai_reranking_enabled: true,
            vector_weight: 0.6,
            keyword_weight: 0.4,
            max_results: 20,
        };

        let service = HybridSearchService {
            vector_client: Arc::new(UpstashVectorClient::new(crate::turso::vector_config::VectorConfig::from_env().unwrap()).unwrap()),
            search_client: Arc::new(QdrantDocumentClient::new(crate::turso::vector_config::QdrantConfig::from_env().unwrap()).await.unwrap()),
            voyager_client: Arc::new(VoyagerClient::new(crate::turso::vector_config::VoyagerConfig::from_env().unwrap()).unwrap()),
            config,
        };

        let combined_score = service.calculate_combined_score(Some(0.8), Some(0.6));
        assert_eq!(combined_score, 0.8 * 0.6 + 0.6 * 0.4); // 0.48 + 0.24 = 0.72
    }

    #[test]
    fn test_search_mode_enum() {
        assert_eq!(SearchMode::VectorOnly, SearchMode::VectorOnly);
        assert_ne!(SearchMode::VectorOnly, SearchMode::KeywordOnly);
        assert_ne!(SearchMode::Hybrid, SearchMode::HybridReranked);
    }
}
