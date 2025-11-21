use crate::turso::vector_config::QdrantConfig as AppQdrantConfig;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use qdrant_client::{
    Qdrant,
    config::QdrantConfig,
    qdrant::{
        vectors_config::Config, CreateCollection, Distance, PointStruct, 
        VectorParams, VectorsConfig, Filter, Condition,
        FieldCondition, Match, Value, PointId, ScrollPoints,
        PointsSelector, PointsIdsList, UpsertPoints, SearchPoints,
    },
    qdrant::value::Kind,
};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub user_id: String,
    pub data_type: String,
    pub entity_id: String,
    pub timestamp: DateTime<Utc>,
    pub tags: Vec<String>,
    pub content_hash: String,
}

#[derive(Debug, Clone)]
pub struct Document {
    pub id: String,
    pub content: HashMap<String, String>,
    pub metadata: DocumentMetadata,
}

/// Search result from Qdrant semantic search
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub content: String,
    pub r#type: Option<String>, // "chat" or "trade"
    pub created_at: Option<DateTime<Utc>>, // Timestamp from payload
}

pub struct QdrantDocumentClient {
    client: Qdrant,
    config: AppQdrantConfig,
}

impl QdrantDocumentClient {
    pub async fn new(config: AppQdrantConfig) -> Result<Self> {
        // Use QdrantConfig to properly configure the client
        // Disable version check to avoid HTTP/2 protocol errors with self-hosted instances
        let qdrant_config = QdrantConfig {
            uri: config.url.clone(),
            timeout: Duration::from_secs(config.timeout_seconds),
            connect_timeout: Duration::from_secs(10),
            api_key: if !config.api_key.is_empty() {
                Some(config.api_key.clone())
            } else {
                None
            },
            check_compatibility: false, // Disable version check to avoid HTTP/2 issues
            ..Default::default()
        };
        
        let client = Qdrant::new(qdrant_config)
            .context("Failed to create Qdrant client")?;
        
        if !config.api_key.is_empty() {
            log::info!("Qdrant client initialized with API key authentication - URL: {}", config.url);
        } else {
            log::info!("Qdrant client initialized without API key (unauthenticated) - URL: {}", config.url);
        }

        Ok(Self { client, config })
    }

    pub async fn ensure_collection(&self, user_id: &str) -> Result<()> {
        let collection_name = self.config.get_collection_name(user_id);
        
        // Check if collection exists
        let collections = match self.client.list_collections().await {
            Ok(cols) => cols,
            Err(e) => {
                log::error!(
                    "Failed to list Qdrant collections - user={}, collection={}, error={}, error_debug={:?}",
                    user_id, collection_name, e, e
                );
                return Err(anyhow::anyhow!("Failed to list collections: {}", e));
            }
        };
        
        let exists = collections.collections.iter()
            .any(|c| c.name == collection_name);

        if !exists {
            log::info!("Creating Qdrant collection: {}", collection_name);
            
            match self.client.create_collection(CreateCollection {
                collection_name: collection_name.clone(),
                vectors_config: Some(VectorsConfig {
                    config: Some(Config::Params(VectorParams {
                        size: 1024, // Voyager embeddings are 1024 dimensions
                        distance: Distance::Cosine.into(),
                        ..Default::default()
                    })),
                }),
                ..Default::default()
            }).await {
                Ok(_) => {
                    log::info!("Qdrant collection created: {}", collection_name);
                }
                Err(e) => {
                    log::error!(
                        "Failed to create Qdrant collection - user={}, collection={}, error={}, error_debug={:?}",
                        user_id, collection_name, e, e
                    );
                    return Err(anyhow::anyhow!("Failed to create collection: {}", e));
                }
            }
        }

        Ok(())
    }

    /// Upsert a trade vector with the new format: {user_id, id, content, embedding, type: "trade", created_at}
    pub async fn upsert_trade_vector(
        &self,
        user_id: &str,
        vector_id: &str,
        content: &str,
        embedding: &[f32],
    ) -> Result<()> {
        self.ensure_collection(user_id).await?;
        let collection_name = self.config.get_collection_name(user_id);

        log::info!(
            "Upserting trade vector to Qdrant - collection={}, vector_id={}, content_length={}, embedding_dim={}",
            collection_name, vector_id, content.len(), embedding.len()
        );

        let now = Utc::now();

        // Create payload with the specified format
        let mut payload = HashMap::new();
        payload.insert("user_id".to_string(), Value::from(user_id));
        payload.insert("id".to_string(), Value::from(vector_id));
        payload.insert("content".to_string(), Value::from(content));
        payload.insert("type".to_string(), Value::from("trade"));
        payload.insert("created_at".to_string(), Value::from(now.to_rfc3339()));

        // Create point with embedding
        let point = PointStruct {
            id: Some(PointId {
                point_id_options: Some(qdrant_client::qdrant::point_id::PointIdOptions::Uuid(
                    vector_id.to_string()
                )),
            }),
            vectors: Some(embedding.to_vec().into()),
            payload,
        };

        self.client.upsert_points(UpsertPoints {
            collection_name: collection_name.clone(),
            points: vec![point],
            ..Default::default()
        }).await?;
        
        log::info!("Successfully upserted trade vector to Qdrant - vector_id={}", vector_id);
        Ok(())
    }

    pub async fn upsert_documents(&self, user_id: &str, documents: Vec<Document>) -> Result<()> {
        if documents.is_empty() {
            return Ok(());
        }

        self.ensure_collection(user_id).await?;
        let collection_name = self.config.get_collection_name(user_id);

        log::info!("Upserting {} documents to Qdrant collection: {}", 
            documents.len(), collection_name);

        let points: Vec<PointStruct> = documents.into_iter().map(|doc| {
            let mut payload = HashMap::new();
            
            // Add metadata
            payload.insert("user_id".to_string(), Value::from(doc.metadata.user_id));
            payload.insert("data_type".to_string(), Value::from(doc.metadata.data_type));
            payload.insert("entity_id".to_string(), Value::from(doc.metadata.entity_id));
            payload.insert("timestamp".to_string(), Value::from(doc.metadata.timestamp.to_rfc3339()));
            payload.insert("content_hash".to_string(), Value::from(doc.metadata.content_hash));
            payload.insert("original_id".to_string(), Value::from(doc.id.clone()));
            
            // Add content fields
            for (key, value) in doc.content {
                payload.insert(key, Value::from(value));
            }
            
            // Add tags
            let tags: Vec<Value> = doc.metadata.tags.into_iter()
                .map(Value::from)
                .collect();
            payload.insert("tags".to_string(), Value::from(tags));

            // Generate a proper UUID for the document ID
            let document_uuid = Uuid::new_v4().to_string();

            PointStruct {
                id: Some(PointId {
                    point_id_options: Some(qdrant_client::qdrant::point_id::PointIdOptions::Uuid(document_uuid)),
                }),
                vectors: Some(vec![0.0].into()), // Dummy vector
                payload,
            }
        }).collect();

        self.client.upsert_points(UpsertPoints {
            collection_name: collection_name.clone(),
            points,
            ..Default::default()
        }).await?;
        
        log::info!("Successfully upserted documents to Qdrant");
        Ok(())
    }

    pub async fn search_by_keyword(&self, user_id: &str, query: &str, limit: usize) -> Result<Vec<String>> {
        let collection_name = self.config.get_collection_name(user_id);
        
        // Build filter for keyword search in content field
        let filter = Filter {
            must: vec![
                Condition {
                    condition_one_of: Some(
                        qdrant_client::qdrant::condition::ConditionOneOf::Field(
                            FieldCondition {
                                key: "content".to_string(),
                                r#match: Some(Match {
                                    match_value: Some(
                                        qdrant_client::qdrant::r#match::MatchValue::Text(query.to_string())
                                    ),
                                }),
                                ..Default::default()
                            }
                        )
                    ),
                },
            ],
            ..Default::default()
        };

        let scroll_request = ScrollPoints {
            collection_name: collection_name.clone(),
            filter: Some(filter),
            limit: Some(limit as u32),
            ..Default::default()
        };

        let search_result = self.client.scroll(scroll_request).await?;
        
        let ids: Vec<String> = search_result.result.into_iter()
            .filter_map(|point| {
                point.id.map(|id| {
                    match id {
                        PointId { point_id_options: Some(point_id_options) } => {
                            match point_id_options {
                                qdrant_client::qdrant::point_id::PointIdOptions::Num(n) => n.to_string(),
                                qdrant_client::qdrant::point_id::PointIdOptions::Uuid(u) => u,
                            }
                        }
                        _ => "unknown".to_string(),
                    }
                })
            })
            .collect();

        Ok(ids)
    }

    /// Delete a trade vector by ID
    pub async fn delete_trade_vector(&self, user_id: &str, vector_id: &str) -> Result<()> {
        let collection_name = self.config.get_collection_name(user_id);
        
        // Build filter to find the vector by ID
        let filter = Filter {
            must: vec![
                Condition {
                    condition_one_of: Some(
                        qdrant_client::qdrant::condition::ConditionOneOf::Field(
                            FieldCondition {
                                key: "id".to_string(),
                                r#match: Some(Match {
                                    match_value: Some(
                                        qdrant_client::qdrant::r#match::MatchValue::Text(vector_id.to_string())
                                    ),
                                }),
                                ..Default::default()
                            }
                        )
                    ),
                },
            ],
            ..Default::default()
        };

        // Find the point to get its Qdrant UUID
        let scroll_request = ScrollPoints {
            collection_name: collection_name.clone(),
            filter: Some(filter),
            limit: Some(1),
            ..Default::default()
        };

        let search_result = self.client.scroll(scroll_request).await?;
        
        if let Some(point) = search_result.result.into_iter().next() {
            if let Some(qdrant_id) = point.id {
                let points_selector = PointsSelector {
                    points_selector_one_of: Some(
                        qdrant_client::qdrant::points_selector::PointsSelectorOneOf::Points(
                            PointsIdsList { ids: vec![qdrant_id] }
                        )
                    ),
                };

                self.client.delete_points(qdrant_client::qdrant::DeletePoints {
                    collection_name: collection_name.clone(),
                    points: Some(points_selector),
                    ..Default::default()
                }).await?;
                
                log::info!("Deleted trade vector from Qdrant - vector_id={}", vector_id);
            }
        } else {
            log::warn!("Trade vector not found in Qdrant - vector_id={}", vector_id);
        }

        Ok(())
    }

    pub async fn delete_documents(&self, user_id: &str, document_ids: &[String]) -> Result<()> {
        if document_ids.is_empty() {
            return Ok(());
        }

        let collection_name = self.config.get_collection_name(user_id);
        
        // Build filter to find documents by their original_id
        let mut conditions = Vec::new();
        for doc_id in document_ids {
            conditions.push(Condition {
                condition_one_of: Some(
                    qdrant_client::qdrant::condition::ConditionOneOf::Field(
                        FieldCondition {
                            key: "original_id".to_string(),
                            r#match: Some(Match {
                                match_value: Some(
                                    qdrant_client::qdrant::r#match::MatchValue::Text(doc_id.clone())
                                ),
                            }),
                            ..Default::default()
                        }
                    )
                ),
            });
        }

        let filter = Filter {
            should: conditions,
            ..Default::default()
        };

        // First, find the documents to get their Qdrant UUIDs
        let scroll_request = ScrollPoints {
            collection_name: collection_name.clone(),
            filter: Some(filter),
            limit: Some(document_ids.len() as u32),
            ..Default::default()
        };

        let search_result = self.client.scroll(scroll_request).await?;
        
        // Extract the Qdrant UUIDs
        let qdrant_ids: Vec<PointId> = search_result.result.into_iter()
            .filter_map(|point| point.id)
            .collect();

        if qdrant_ids.is_empty() {
            log::warn!("No documents found to delete for IDs: {:?}", document_ids);
            return Ok(());
        }

        let points_selector = PointsSelector {
            points_selector_one_of: Some(qdrant_client::qdrant::points_selector::PointsSelectorOneOf::Points(
                PointsIdsList { ids: qdrant_ids }
            )),
        };

        self.client.delete_points(qdrant_client::qdrant::DeletePoints {
            collection_name: collection_name.clone(),
            points: Some(points_selector),
            ..Default::default()
        }).await?;
        
        log::info!("Deleted {} documents from Qdrant", document_ids.len());
        Ok(())
    }

    /// Upsert a chat vector with format: {user_id, id, content, embedding, type: "chat", created_at}
    pub async fn upsert_chat_vector(
        &self,
        user_id: &str,
        qdrant_uuid: &str,      // The UUID for Qdrant's point ID
        meaningful_id: &str,     // Your "chat-{session_id}-qa" ID for payload
        content: &str,
        embedding: &[f32],
    ) -> Result<()> {
        self.ensure_collection(user_id).await?;
        let collection_name = self.config.get_collection_name(user_id);

        log::info!(
            "Upserting chat vector to Qdrant - collection={}, qdrant_uuid={}, meaningful_id={}, content_length={}, embedding_dim={}",
            collection_name, qdrant_uuid, meaningful_id, content.len(), embedding.len()
        );

        let now = Utc::now();

        // Create payload with the specified format
        let mut payload = HashMap::new();
        payload.insert("user_id".to_string(), Value::from(user_id));
        payload.insert("id".to_string(), Value::from(meaningful_id));  // Use meaningful_id in payload
        payload.insert("content".to_string(), Value::from(content));
        payload.insert("type".to_string(), Value::from("chat"));
        payload.insert("created_at".to_string(), Value::from(now.to_rfc3339()));

        // Create point with embedding
        let point = PointStruct {
            id: Some(PointId {
                point_id_options: Some(qdrant_client::qdrant::point_id::PointIdOptions::Uuid(
                    qdrant_uuid.to_string()  // Use the generated UUID for Qdrant's point ID
                )),
            }),
            vectors: Some(embedding.to_vec().into()),
            payload,
        };

        match self.client.upsert_points(UpsertPoints {
            collection_name: collection_name.clone(),
            points: vec![point],
            ..Default::default()
        }).await {
            Ok(_) => {
                log::info!(
                    "Successfully upserted chat vector to Qdrant - qdrant_uuid={}, meaningful_id={}",
                    qdrant_uuid, meaningful_id
                );
                Ok(())
            }
            Err(e) => {
                log::error!(
                    "Failed to upsert chat vector to Qdrant - collection={}, qdrant_uuid={}, meaningful_id={}, error={}, error_debug={:?}",
                    collection_name, qdrant_uuid, meaningful_id, e, e
                );
                Err(anyhow::anyhow!("Failed to upsert chat vector: {}", e))
            }
        }
    }

    /// Upsert a playbook vector with format: {user_id, id, content, embedding, type: "playbook", created_at}
    pub async fn upsert_playbook_vector(
        &self,
        user_id: &str,
        vector_id: &str,
        content: &str,
        embedding: &[f32],
    ) -> Result<()> {
        self.ensure_collection(user_id).await?;
        let collection_name = self.config.get_collection_name(user_id);

        log::info!(
            "Upserting playbook vector to Qdrant - collection={}, vector_id={}, content_length={}, embedding_dim={}",
            collection_name, vector_id, content.len(), embedding.len()
        );

        let now = Utc::now();

        // Create payload with the specified format
        let mut payload = HashMap::new();
        payload.insert("user_id".to_string(), Value::from(user_id));
        payload.insert("id".to_string(), Value::from(vector_id));
        payload.insert("content".to_string(), Value::from(content));
        payload.insert("type".to_string(), Value::from("playbook"));
        payload.insert("created_at".to_string(), Value::from(now.to_rfc3339()));

        // Create point with embedding
        let point = PointStruct {
            id: Some(PointId {
                point_id_options: Some(qdrant_client::qdrant::point_id::PointIdOptions::Uuid(
                    vector_id.to_string()
                )),
            }),
            vectors: Some(embedding.to_vec().into()),
            payload,
        };

        self.client.upsert_points(UpsertPoints {
            collection_name: collection_name.clone(),
            points: vec![point],
            ..Default::default()
        }).await?;
        
        log::info!("Successfully upserted playbook vector to Qdrant - vector_id={}", vector_id);
        Ok(())
    }

    /// Upsert a notebook vector with format: {user_id, id, content, embedding, type: "notebook", created_at}
    pub async fn upsert_notebook_vector(
        &self,
        user_id: &str,
        vector_id: &str,
        content: &str,
        embedding: &[f32],
    ) -> Result<()> {
        self.ensure_collection(user_id).await?;
        let collection_name = self.config.get_collection_name(user_id);

        log::info!(
            "Upserting notebook vector to Qdrant - collection={}, vector_id={}, content_length={}, embedding_dim={}",
            collection_name, vector_id, content.len(), embedding.len()
        );

        let now = Utc::now();

        // Create payload with the specified format
        let mut payload = HashMap::new();
        payload.insert("user_id".to_string(), Value::from(user_id));
        payload.insert("id".to_string(), Value::from(vector_id));
        payload.insert("content".to_string(), Value::from(content));
        payload.insert("type".to_string(), Value::from("notebook"));
        payload.insert("created_at".to_string(), Value::from(now.to_rfc3339()));

        // Create point with embedding
        let point = PointStruct {
            id: Some(PointId {
                point_id_options: Some(qdrant_client::qdrant::point_id::PointIdOptions::Uuid(
                    vector_id.to_string()
                )),
            }),
            vectors: Some(embedding.to_vec().into()),
            payload,
        };

        self.client.upsert_points(UpsertPoints {
            collection_name: collection_name.clone(),
            points: vec![point],
            ..Default::default()
        }).await?;
        
        log::info!("Successfully upserted notebook vector to Qdrant - vector_id={}", vector_id);
        Ok(())
    }

    /// Delete a notebook vector by ID
    pub async fn delete_notebook_vector(&self, user_id: &str, vector_id: &str) -> Result<()> {
        let collection_name = self.config.get_collection_name(user_id);
        
        // Build filter to find the vector by ID
        let filter = Filter {
            must: vec![
                Condition {
                    condition_one_of: Some(
                        qdrant_client::qdrant::condition::ConditionOneOf::Field(
                            FieldCondition {
                                key: "id".to_string(),
                                r#match: Some(Match {
                                    match_value: Some(
                                        qdrant_client::qdrant::r#match::MatchValue::Text(vector_id.to_string())
                                    ),
                                }),
                                ..Default::default()
                            }
                        )
                    ),
                },
            ],
            ..Default::default()
        };

        // Find the point to get its Qdrant UUID
        let scroll_request = ScrollPoints {
            collection_name: collection_name.clone(),
            filter: Some(filter),
            limit: Some(1),
            ..Default::default()
        };

        let search_result = self.client.scroll(scroll_request).await?;
        
        if let Some(point) = search_result.result.into_iter().next() {
            if let Some(qdrant_id) = point.id {
                let points_selector = PointsSelector {
                    points_selector_one_of: Some(
                        qdrant_client::qdrant::points_selector::PointsSelectorOneOf::Points(
                            PointsIdsList { ids: vec![qdrant_id] }
                        )
                    ),
                };

                self.client.delete_points(qdrant_client::qdrant::DeletePoints {
                    collection_name: collection_name.clone(),
                    points: Some(points_selector),
                    ..Default::default()
                }).await?;
                
                log::info!("Deleted notebook vector from Qdrant - vector_id={}", vector_id);
            }
        } else {
            log::warn!("Notebook vector not found in Qdrant - vector_id={}", vector_id);
        }

        Ok(())
    }

    /// Search by embedding using semantic similarity
    /// Returns top N results sorted by cosine similarity score
    pub async fn search_by_embedding(
        &self,
        user_id: &str,
        query_embedding: &[f32],
        limit: usize,
        type_filter: Option<&str>,
    ) -> Result<Vec<SearchResult>> {
        let collection_name = self.config.get_collection_name(user_id);

        log::info!(
            "Searching Qdrant by embedding - collection={}, limit={}, type_filter={:?}",
            collection_name, limit, type_filter
        );

        // Build filter for user_id (required) and optionally by type
        let mut must_conditions = vec![
            Condition {
                condition_one_of: Some(
                    qdrant_client::qdrant::condition::ConditionOneOf::Field(
                        FieldCondition {
                            key: "user_id".to_string(),
                            r#match: Some(Match {
                                match_value: Some(
                                    qdrant_client::qdrant::r#match::MatchValue::Text(user_id.to_string())
                                ),
                            }),
                            ..Default::default()
                        }
                    )
                ),
            },
        ];

        // Add type filter if specified
        if let Some(type_val) = type_filter {
            must_conditions.push(
                Condition {
                    condition_one_of: Some(
                        qdrant_client::qdrant::condition::ConditionOneOf::Field(
                            FieldCondition {
                                key: "type".to_string(),
                                r#match: Some(Match {
                                    match_value: Some(
                                        qdrant_client::qdrant::r#match::MatchValue::Text(type_val.to_string())
                                    ),
                                }),
                                ..Default::default()
                            }
                        )
                    ),
                }
            );
        }

        let filter = Filter {
            must: must_conditions,
            ..Default::default()
        };

        // Perform semantic search
        let search_request = SearchPoints {
            collection_name: collection_name.clone(),
            vector: query_embedding.to_vec(),
            limit: limit as u64,
            filter: Some(filter),
            with_payload: Some(true.into()),
            ..Default::default()
        };

        let search_result = self.client.search_points(search_request).await?;

        // Convert results to SearchResult
        let results: Vec<SearchResult> = search_result.result.into_iter().map(|scored_point| {
            let id = scored_point.payload.get("id")
                .and_then(|v| match &v.kind {
                    Some(Kind::StringValue(s)) => Some(s.clone()),
                    _ => None,
                })
                .unwrap_or_else(|| {
                    // Fallback to Qdrant point ID if payload id not found
                    match &scored_point.id {
                        Some(PointId { point_id_options: Some(point_id_options) }) => {
                            match point_id_options {
                                qdrant_client::qdrant::point_id::PointIdOptions::Uuid(u) => u.clone(),
                                qdrant_client::qdrant::point_id::PointIdOptions::Num(n) => n.to_string(),
                            }
                        }
                        _ => "unknown".to_string(),
                    }
                });

            let content = scored_point.payload.get("content")
                .and_then(|v| match &v.kind {
                    Some(Kind::StringValue(s)) => Some(s.clone()),
                    _ => None,
                })
                .unwrap_or_default();

            let r#type = scored_point.payload.get("type")
                .and_then(|v| match &v.kind {
                    Some(Kind::StringValue(s)) => Some(s.clone()),
                    _ => None,
                });

            let created_at = scored_point.payload.get("created_at")
                .and_then(|v| match &v.kind {
                    Some(Kind::StringValue(s)) => {
                        DateTime::parse_from_rfc3339(s).ok()
                            .map(|dt| dt.with_timezone(&Utc))
                    },
                    _ => None,
                });

            SearchResult {
                id,
                score: scored_point.score,
                content,
                r#type,
                created_at,
            }
        }).collect();

        log::info!(
            "Semantic search completed - collection={}, results={}",
            collection_name, results.len()
        );

        if results.is_empty() {
            log::warn!(
                "Semantic search returned no results - collection={}, user_id={}, limit={}, type_filter={:?}",
                collection_name, user_id, limit, type_filter
            );
        }

        Ok(results)
    }

    /// Delete entire user collection from Qdrant
    pub async fn delete_user_collection(&self, user_id: &str) -> Result<()> {
        let collection_name = self.config.get_collection_name(user_id);
        
        log::info!("Deleting Qdrant collection: {}", collection_name);

        // Check if collection exists
        let collections = self.client.list_collections().await?;
        let exists = collections.collections.iter()
            .any(|c| c.name == collection_name);

        if !exists {
            log::info!("Collection {} does not exist, skipping deletion", collection_name);
            return Ok(());
        }

        // Delete the collection
        self.client.delete_collection(collection_name.clone()).await
            .context("Failed to delete Qdrant collection")?;

        log::info!("Successfully deleted Qdrant collection: {}", collection_name);
        Ok(())
    }

    /// Health check to verify Qdrant connection
    /// Returns Ok(()) if connection is healthy, Err otherwise
    pub async fn health_check(&self) -> Result<()> {
        log::info!("Performing Qdrant health check - URL: {}", self.config.url);
        
        // Retry logic for health check (network might be slow)
        let mut last_error = None;
        for attempt in 1..=self.config.max_retries {
            match self.client.list_collections().await {
                Ok(collections) => {
                    log::info!(
                        "Qdrant health check passed - connection is healthy. Found {} collections (attempt {})",
                        collections.collections.len(),
                        attempt
                    );
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < self.config.max_retries {
                        log::warn!(
                            "Qdrant health check attempt {} failed, retrying... Error: {}",
                            attempt,
                            last_error.as_ref().unwrap()
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(500 * attempt as u64)).await;
                    }
                }
            }
        }
        
        let error_msg = format!(
            "Qdrant health check failed after {} attempts - unable to list collections. Last error: {}",
            self.config.max_retries,
            last_error.map(|e| e.to_string()).unwrap_or_else(|| "Unknown error".to_string())
        );
        log::error!("{}", error_msg);
        Err(anyhow::anyhow!(error_msg))
    }
}
