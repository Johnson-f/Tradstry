use crate::turso::vector_config::QdrantConfig;
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use qdrant_client::{
    Qdrant,
    qdrant::{
        vectors_config::Config, CreateCollection, Distance, PointStruct, 
        VectorParams, VectorsConfig, Filter, Condition,
        FieldCondition, Match, Value, PointId, ScrollPoints,
        PointsSelector, PointsIdsList,
    },
};
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

pub struct QdrantDocumentClient {
    client: Qdrant,
    config: QdrantConfig,
}

impl QdrantDocumentClient {
    pub async fn new(config: QdrantConfig) -> Result<Self> {
        let client = Qdrant::from_url(&config.url)
            .api_key(config.api_key.clone())
            .build()
            .context("Failed to create Qdrant client")?;

        Ok(Self { client, config })
    }

    pub async fn ensure_collection(&self, user_id: &str) -> Result<()> {
        let collection_name = self.config.get_collection_name(user_id);
        
        // Check if collection exists
        let collections = self.client.list_collections().await?;
        let exists = collections.collections.iter()
            .any(|c| c.name == collection_name);

        if !exists {
            log::info!("Creating Qdrant collection: {}", collection_name);
            
            self.client.create_collection(CreateCollection {
                collection_name: collection_name.clone(),
                vectors_config: Some(VectorsConfig {
                    config: Some(Config::Params(VectorParams {
                        size: 1, // Minimal size since we're using payload search
                        distance: Distance::Cosine.into(),
                        ..Default::default()
                    })),
                }),
                ..Default::default()
            }).await?;
            
            log::info!("Qdrant collection created: {}", collection_name);
        }

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

        self.client.upsert_points(qdrant_client::qdrant::UpsertPoints {
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
}

