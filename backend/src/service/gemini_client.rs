#![allow(dead_code)]

use crate::turso::vector_config::GeminiConfig;
use anyhow::{Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc;

/// Request structure for Gemini chat completion
#[derive(Debug, Serialize)]
pub struct ChatRequest {
    pub contents: Vec<Content>,
    pub generation_config: GenerationConfig,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Content {
    pub role: String,
    pub parts: Vec<Part>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Part {
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct GenerationConfig {
    pub max_output_tokens: u32,
    pub temperature: f32,
}

/// Response structure from Gemini API
#[derive(Debug, Deserialize)]
pub struct ChatResponse {
    pub candidates: Vec<Candidate>,
}

#[derive(Debug, Deserialize)]
pub struct Candidate {
    pub content: Content,
    pub finish_reason: Option<String>,
}

/// Streaming response chunk
#[derive(Debug, Deserialize)]
pub struct StreamChunk {
    pub candidates: Vec<StreamCandidate>,
}

#[derive(Debug, Deserialize)]
pub struct StreamCandidate {
    pub content: Option<Content>,
    pub finish_reason: Option<String>,
}

/// Gemini API client with streaming support
pub struct GeminiClient {
    config: GeminiConfig,
    client: Client,
}

impl GeminiClient {
    pub fn new(config: GeminiConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { config, client })
    }

    /// Generate a non-streaming chat completion
    pub async fn generate_chat(&self, messages: Vec<ChatMessage>) -> Result<String> {
        let contents: Vec<Content> = messages
            .into_iter()
            .map(|msg| Content {
                role: msg.role.to_string(),
                parts: vec![Part { text: msg.content }],
            })
            .collect();

        let request = ChatRequest {
            contents,
            generation_config: GenerationConfig {
                max_output_tokens: self.config.max_tokens,
                temperature: self.config.temperature,
            },
        };

        let mut retries = 0;
        loop {
            match self.make_chat_request(&request).await {
                Ok(response) => {
                    if let Some(candidate) = response.candidates.first() {
                        if let Some(part) = candidate.content.parts.first() {
                            return Ok(part.text.clone());
                        }
                    }
                    return Err(anyhow::anyhow!("No content in Gemini response"));
                }
                Err(e) => {
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for Gemini API");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Generate a streaming chat completion
    pub async fn generate_chat_stream(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Result<mpsc::Receiver<String>> {
        let contents: Vec<Content> = messages
            .into_iter()
            .map(|msg| Content {
                role: msg.role.to_string(),
                parts: vec![Part { text: msg.content }],
            })
            .collect();

        let request = ChatRequest {
            contents,
            generation_config: GenerationConfig {
                max_output_tokens: self.config.max_tokens,
                temperature: self.config.temperature,
            },
        };

        let (tx, rx) = mpsc::channel(100);

        // Spawn streaming task
        let client = self.client.clone();
        let url = self.config.get_chat_url();
        let token = self.config.api_key.clone();
        let request_json = serde_json::to_value(&request)?;

        tokio::spawn(async move {
            if let Err(e) = Self::handle_streaming_response(client, url, token, request_json, tx).await {
                log::error!("Streaming error: {}", e);
            }
        });

        Ok(rx)
    }

    /// Handle streaming response from Gemini API
    async fn handle_streaming_response(
        client: Client,
        url: String,
        token: String,
        request: serde_json::Value,
        tx: mpsc::Sender<String>,
    ) -> Result<()> {
        let response = client
            .post(&url)
            .query(&[("key", &token)])
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to send streaming request to Gemini API")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Gemini streaming API error: {} - {}",
                status,
                error_text
            ));
        }

        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read streaming chunk")?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            
            // Process each line in the chunk
            for line in chunk_str.lines() {
                if line.starts_with("data: ") {
                    let data = &line[6..]; // Remove "data: " prefix
                    
                    if data == "[DONE]" {
                        break;
                    }
                    
                    if let Ok(stream_chunk) = serde_json::from_str::<StreamChunk>(data) {
                        if let Some(candidate) = stream_chunk.candidates.first() {
                            if let Some(content) = &candidate.content {
                                if let Some(part) = content.parts.first() {
                                    let _ = tx.send(part.text.clone()).await;
                                }
                            }
                            
                            // Check if stream is finished
                            if candidate.finish_reason.is_some() {
                                break;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Make non-streaming chat request to Gemini API
    async fn make_chat_request(&self, request: &ChatRequest) -> Result<ChatResponse> {
        let url = format!("{}?key={}", self.config.get_chat_url_non_streaming(), self.config.api_key);

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await
            .context("Failed to send request to Gemini API")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "Gemini API error: {} - {}",
                status,
                error_text
            ));
        }

        let chat_response: ChatResponse = response
            .json()
            .await
            .context("Failed to parse Gemini API response")?;

        Ok(chat_response)
    }

    /// Test connection to Gemini API
    pub async fn test_connection(&self) -> Result<()> {
        let test_messages = vec![ChatMessage {
            role: MessageRole::User,
            content: "Hello".to_string(),
        }];

        self.generate_chat(test_messages).await?;
        Ok(())
    }

    /// Get the model being used
    pub fn get_model(&self) -> &str {
        &self.config.model
    }
}

/// Chat message structure
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Clone)]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl ToString for MessageRole {
    fn to_string(&self) -> String {
        match self {
            MessageRole::User => "user".to_string(),
            MessageRole::Assistant => "model".to_string(),
            MessageRole::System => "user".to_string(), // Gemini doesn't have system role
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gemini_client_creation() {
        let config = GeminiConfig {
            api_key: "test_key".to_string(),
            model: "gemini-1.5-flash".to_string(),
            max_retries: 3,
            timeout_seconds: 60,
            max_tokens: 4096,
            temperature: 0.7,
        };

        let client = GeminiClient::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_message_role_to_string() {
        assert_eq!(MessageRole::User.to_string(), "user");
        assert_eq!(MessageRole::Assistant.to_string(), "model");
        assert_eq!(MessageRole::System.to_string(), "user");
    }
}
