#![allow(dead_code)]

use crate::service::ai_service::voyager_client::VoyagerClient;
use crate::service::ai_service::upstash_vector_client::{UpstashVectorClient, VectorMetadata, DataType};
use crate::service::ai_service::qdrant_client::{QdrantDocumentClient, Document, DocumentMetadata};
use crate::service::ai_service::data_formatter::{DataFormatter, DataType as FormatterDataType};
use crate::turso::vector_config::AIConfig;
use anyhow::{Context, Result};
use chrono::Utc;
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

/// Convert upstash DataType to formatter DataType
fn convert_data_type(data_type: &DataType) -> FormatterDataType {
    match data_type {
        DataType::Stock => FormatterDataType::Stock,
        DataType::Option => FormatterDataType::Option,
        DataType::TradeNote => FormatterDataType::TradeNote,
        DataType::NotebookEntry => FormatterDataType::NotebookEntry,
        DataType::PlaybookStrategy => FormatterDataType::PlaybookStrategy,
    }
}

/// Vectorization task for processing
#[derive(Debug, Clone)]
pub struct VectorizationTask {
    pub task_id: String,
    pub user_id: String,
    pub data_type: DataType,
    pub entity_id: String,
    pub content: String,
    pub priority: Priority,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Priority {
    High,    // Real-time updates
    Medium,  // Batch updates
    Low,     // Background processing
}

/// Result of vectorization operation
#[derive(Debug, Clone)]
pub struct VectorizationResult {
    pub task_id: String,
    pub vector_id: String,
    pub success: bool,
    pub error: Option<String>,
    pub processing_time_ms: u64,
}

/// Main vectorization service
pub struct VectorizationService {
    voyager_client: Arc<VoyagerClient>,
    upstash_vector: Arc<UpstashVectorClient>,
    qdrant_client: Arc<QdrantDocumentClient>,
    config: AIConfig,
}

impl VectorizationService {
    pub fn new(
        voyager_client: Arc<VoyagerClient>,
        upstash_vector: Arc<UpstashVectorClient>,
        qdrant_client: Arc<QdrantDocumentClient>,
        config: AIConfig,
    ) -> Self {
        Self {
            voyager_client,
            upstash_vector,
            qdrant_client,
            config,
        }
    }

    /// Vectorize a single piece of data
    pub async fn vectorize_data(
        &self,
        user_id: &str,
        data_type: DataType,
        entity_id: &str,
        content: &str,
    ) -> Result<VectorizationResult> {
        let start_time = std::time::Instant::now();
        let task_id = Uuid::new_v4().to_string();
        let vector_id = format!("{}_{}_{}", user_id, data_type_to_string(&data_type), entity_id);

        // Validate content
        DataFormatter::validate_content(content)
            .map_err(|e| anyhow::anyhow!("Content validation failed: {}", e))?;

        // Generate content hash
        let content_hash = DataFormatter::generate_content_hash(content);

        // Generate embedding
        log::info!(
            "Generating embedding for user={}, entity_id={}, content_length={}",
            user_id, entity_id, content.len()
        );
        let embedding = self.voyager_client
            .embed_text(content)
            .await
            .context("Failed to generate embedding")?;

        log::info!(
            "Embedding generated successfully - user={}, entity_id={}, embedding_dim={}",
            user_id, entity_id, embedding.len()
        );

        // Create metadata
        let metadata = VectorMetadata {
            user_id: user_id.to_string(),
            data_type: data_type.clone(),
            entity_id: entity_id.to_string(),
            timestamp: Utc::now(),
            tags: DataFormatter::extract_tags(content, &convert_data_type(&data_type)),
            content_hash: content_hash.clone(),
        };

        log::debug!(
            "Created vector metadata - user={}, entity_id={}, data_type={:?}, tags={:?}",
            user_id, entity_id, metadata.data_type, metadata.tags
        );

        // Store in vector database
        let namespace = self.upstash_vector.get_user_namespace(user_id);
        log::info!(
            "Storing vector in database - user={}, namespace={}, vector_id={}",
            user_id, namespace, vector_id
        );

        self.upstash_vector
            .upsert_vectors(&namespace, vec![(vector_id.clone(), embedding, metadata)])
            .await
            .context("Failed to store vector")?;

        log::info!(
            "Vector stored successfully - user={}, namespace={}, vector_id={}",
            user_id, namespace, vector_id
        );

        // Create search document
        let mut search_doc = Document {
            id: vector_id.clone(),
            content: std::collections::HashMap::new(),
            metadata: DocumentMetadata {
                user_id: user_id.to_string(),
                data_type: format!("{:?}", data_type).to_lowercase(),
                entity_id: entity_id.to_string(),
                timestamp: Utc::now(),
                tags: DataFormatter::extract_tags(content, &convert_data_type(&data_type)),
                content_hash,
            },
        };

        // Add content to search document
        search_doc.content.insert("content".to_string(), content.to_string());
        search_doc.content.insert("title".to_string(), format!("{:?} {}", data_type, entity_id));

        // Store in Qdrant for keyword search
        log::info!(
            "Attempting to store search document - user={}, vector_id={}",
            user_id, vector_id
        );

        if let Err(search_err) = self.qdrant_client
            .upsert_documents(user_id, vec![search_doc])
            .await
        {
            log::error!(
                "Failed to store search document for user {}: {} - vector_id={}, error_details={:?}",
                user_id, search_err, vector_id, search_err
            );
            // Continue without failing the entire operation
        } else {
            log::info!(
                "Successfully stored search document - user={}, vector_id={}",
                user_id, vector_id
            );
        }

        let processing_time = start_time.elapsed().as_millis() as u64;

        Ok(VectorizationResult {
            task_id,
            vector_id,
            success: true,
            error: None,
            processing_time_ms: processing_time,
        })
    }

    /// Vectorize multiple pieces of data in batch
    pub async fn vectorize_batch(
        &self,
        tasks: Vec<VectorizationTask>,
    ) -> Result<Vec<VectorizationResult>> {
        if tasks.is_empty() {
            return Ok(vec![]);
        }

        // Group by user for efficient namespace handling
        let mut results = Vec::new();
        let mut by_user: std::collections::HashMap<String, Vec<VectorizationTask>> = std::collections::HashMap::new();

        for task in tasks {
            by_user.entry(task.user_id.clone()).or_insert_with(Vec::new).push(task);
        }

        // Process each user's data
        for (user_id, user_tasks) in by_user {
            let user_results = self.process_user_batch(&user_id, user_tasks).await?;
            results.extend(user_results);
        }

        Ok(results)
    }

    /// Process a batch of tasks for a single user
    async fn process_user_batch(
        &self,
        user_id: &str,
        tasks: Vec<VectorizationTask>,
    ) -> Result<Vec<VectorizationResult>> {
        let namespace = self.upstash_vector.get_user_namespace(user_id);
        let mut results = Vec::new();

        // Prepare content for batch embedding
        let contents: Vec<String> = tasks.iter().map(|t| t.content.clone()).collect();
        
        // Generate embeddings in batch
        let embeddings = self.voyager_client
            .embed_texts(&contents)
            .await
            .context("Failed to generate batch embeddings")?;

        // Prepare vectors for upsert
        let mut vectors_to_upsert = Vec::new();

        for (i, task) in tasks.iter().enumerate() {
            if let Some(embedding) = embeddings.get(i) {
                let vector_id = format!("{}_{}_{}", user_id, data_type_to_string(&task.data_type), task.entity_id);
                
                let metadata = VectorMetadata {
                    user_id: user_id.to_string(),
                    data_type: task.data_type.clone(),
                    entity_id: task.entity_id.clone(),
                    timestamp: task.created_at,
                    tags: DataFormatter::extract_tags(&task.content, &convert_data_type(&task.data_type)),
                    content_hash: DataFormatter::generate_content_hash(&task.content),
                };

                vectors_to_upsert.push((vector_id, embedding.clone(), metadata));
            }
        }

        // Store all vectors at once
        if !vectors_to_upsert.is_empty() {
            self.upstash_vector
                .upsert_vectors(&namespace, vectors_to_upsert)
                .await
                .context("Failed to store batch vectors")?;
        }

        // Create results
        for (i, task) in tasks.iter().enumerate() {
            let success = i < embeddings.len();
            results.push(VectorizationResult {
                task_id: task.task_id.clone(),
                vector_id: format!("{}_{}_{}", user_id, data_type_to_string(&task.data_type), task.entity_id),
                success,
                error: if success { None } else { Some("Failed to generate embedding".to_string()) },
                processing_time_ms: 0, // Batch processing time not tracked per item
            });
        }

        Ok(results)
    }

    /// Delete vectors for a specific entity
    pub async fn delete_vectors(&self, user_id: &str, entity_ids: &[String]) -> Result<()> {
        if entity_ids.is_empty() {
            return Ok(());
        }

        let namespace = self.upstash_vector.get_user_namespace(user_id);
        
        // Generate vector IDs to delete
        let vector_ids: Vec<String> = entity_ids
            .iter()
            .flat_map(|entity_id| {
                // Delete vectors for all data types
                vec![
                    format!("{}_{}_{}", user_id, "stock", entity_id),
                    format!("{}_{}_{}", user_id, "option", entity_id),
                    format!("{}_{}_{}", user_id, "tradenote", entity_id),
                    format!("{}_{}_{}", user_id, "notebookentry", entity_id),
                    format!("{}_{}_{}", user_id, "playbookstrategy", entity_id),
                ]
            })
            .collect();

        self.upstash_vector
            .delete_vectors(&namespace, &vector_ids)
            .await
            .context("Failed to delete vectors")?;

        // Also delete from Qdrant search database
        if let Err(search_err) = self.qdrant_client
            .delete_documents(user_id, &vector_ids)
            .await
        {
            log::warn!("Failed to delete search documents for user {}: {}", user_id, search_err);
            // Continue without failing the entire operation
        } else {
            log::info!("Successfully deleted search documents for user {}", user_id);
        }

        Ok(())
    }

    /// Query similar vectors for context retrieval
    pub async fn query_similar_vectors(
        &self,
        user_id: &str,
        query_text: &str,
        top_k: usize,
        data_types: Option<Vec<DataType>>,
    ) -> Result<Vec<crate::service::ai_service::upstash_vector_client::VectorMatch>> {
        // Generate embedding for query
        let query_embedding = self.voyager_client
            .embed_text(query_text)
            .await
            .context("Failed to generate query embedding")?;

        // Build filter if data types specified
        let filter = if let Some(types) = data_types {
            let type_strings: Vec<String> = types.iter().map(|dt| data_type_to_string(dt).to_string()).collect();
            Some(serde_json::json!({
                "data_type": { "$in": type_strings }
            }))
        } else {
            None
        };

        let namespace = self.upstash_vector.get_user_namespace(user_id);
        self.upstash_vector
            .query_similarity(&namespace, &query_embedding, top_k, filter)
            .await
            .context("Failed to query similar vectors")
    }

    /// Health check for vectorization service
    pub async fn health_check(&self) -> Result<()> {
        // Check Voyager client
        self.voyager_client.health_check().await?;
        
        // Check Upstash Vector client
        self.upstash_vector.ping().await?;
        
        Ok(())
    }

    /// Get vectorization statistics
    pub async fn get_stats(&self) -> Result<VectorizationStats> {
        // This would typically query metrics from a metrics store
        // For now, return placeholder stats
        Ok(VectorizationStats {
            total_vectors: 0,
            vectors_per_second: 0.0,
            avg_processing_time_ms: 0,
            error_rate: 0.0,
        })
    }
}

/// Vectorization statistics
#[derive(Debug, Serialize)]
pub struct VectorizationStats {
    pub total_vectors: u64,
    pub vectors_per_second: f64,
    pub avg_processing_time_ms: u64,
    pub error_rate: f64,
}

/// Helper function to convert DataType to string
fn data_type_to_string(data_type: &DataType) -> &'static str {
    match data_type {
        DataType::Stock => "stock",
        DataType::Option => "option",
        DataType::TradeNote => "tradenote",
        DataType::NotebookEntry => "notebookentry",
        DataType::PlaybookStrategy => "playbookstrategy",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_type_to_string() {
        assert_eq!(data_type_to_string(&DataType::Stock), "stock");
        assert_eq!(data_type_to_string(&DataType::Option), "option");
        assert_eq!(data_type_to_string(&DataType::TradeNote), "tradenote");
    }

    #[test]
    fn test_vectorization_task_creation() {
        let task = VectorizationTask {
            task_id: "test_task".to_string(),
            user_id: "user123".to_string(),
            data_type: DataType::Stock,
            entity_id: "stock456".to_string(),
            content: "Test content".to_string(),
            priority: Priority::High,
            created_at: Utc::now(),
        };

        assert_eq!(task.task_id, "test_task");
        assert_eq!(task.user_id, "user123");
        assert_eq!(task.priority, Priority::High);
    }
}

