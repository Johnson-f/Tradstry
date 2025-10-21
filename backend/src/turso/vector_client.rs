use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// Upstash Vector client for semantic search
#[derive(Clone)]
pub struct VectorClient {
    client: Client,
    rest_url: String,
    rest_token: String,
}

impl VectorClient {
    pub fn new(rest_url: String, rest_token: String) -> Self {
        Self {
            client: Client::new(),
            rest_url,
            rest_token,
        }
    }
    
    /// Upsert a vector with metadata
    pub async fn upsert_vector(
        &self,
        id: String,
        vector: Vec<f32>,
        metadata: VectorMetadata,
    ) -> Result<()> {
        let request = UpsertRequest {
            id,
            vector,
            metadata: Some(metadata),
        };
        
        let response = self.client
            .post(format!("{}/upsert", self.rest_url))
            .header("Authorization", format!("Bearer {}", self.rest_token))
            .json(&vec![request])
            .send()
            .await?;
        
        if !response.status().is_success() {
            anyhow::bail!("Upstash upsert failed: {}", response.text().await?);
        }
        
        Ok(())
    }
    
    /// Query similar vectors with filtering
    pub async fn search_similar(
        &self,
        query_vector: Vec<f32>,
        user_id: &str,
        limit: usize,
        data_type: Option<&str>,
    ) -> Result<Vec<VectorMatch>> {
        let mut filter = format!("user_id = '{}'", user_id);
        if let Some(dtype) = data_type {
            filter.push_str(&format!(" AND data_type = '{}'", dtype));
        }
        
        let request = QueryRequest {
            vector: query_vector,
            top_k: limit,
            include_metadata: true,
            include_vectors: false,
            filter: Some(filter),
        };
        
        let response = self.client
            .post(format!("{}/query", self.rest_url))
            .header("Authorization", format!("Bearer {}", self.rest_token))
            .json(&request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            anyhow::bail!("Upstash query failed: {}", response.text().await?);
        }
        
        let results: Vec<QueryResultItem> = response.json().await?;
        
        Ok(results.into_iter().map(|item| VectorMatch {
            id: item.id,
            score: item.score,
            metadata: item.metadata.unwrap_or_default(),
        }).collect())
    }
}

#[derive(Serialize)]
struct UpsertRequest {
    id: String,
    vector: Vec<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<VectorMetadata>,
}

#[derive(Serialize)]
struct QueryRequest {
    vector: Vec<f32>,
    #[serde(rename = "topK")]
    top_k: usize,
    #[serde(rename = "includeMetadata")]
    include_metadata: bool,
    #[serde(rename = "includeVectors")]
    include_vectors: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    filter: Option<String>,
}

#[derive(Deserialize)]
struct QueryResultItem {
    id: String,
    score: f32,
    #[serde(default)]
    metadata: Option<VectorMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VectorMetadata {
    pub user_id: String,
    pub data_type: String,
    pub entity_id: String,
    pub content_snippet: String,
    pub created_at: String,
}

#[derive(Debug)]
pub struct VectorMatch {
    pub id: String,
    pub score: f32,
    pub metadata: VectorMetadata,
}
