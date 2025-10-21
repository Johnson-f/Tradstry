use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;

pub struct EmbeddingService {
    client: Client,
    api_key: String,
    model: String,
}

impl EmbeddingService {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: "text-embedding-3-small".to_string(), // 1536 dimensions
        }
    }
    
    pub async fn embed_text(&self, text: &str) -> Result<Vec<f32>> {
        let response = self.client
            .post("https://api.openai.com/v1/embeddings")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&EmbeddingRequest {
                input: text.to_string(),
                model: self.model.clone(),
            })
            .send()
            .await?
            .json::<EmbeddingResponse>()
            .await?;
        
        Ok(response.data[0].embedding.clone())
    }
}

#[derive(Serialize)]
struct EmbeddingRequest {
    input: String,
    model: String,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}
