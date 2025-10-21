#![allow(dead_code)]

use crate::turso::vector_config::OpenRouterConfig;
use anyhow::{Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc;

/// Request structure for OpenRouter chat completion
#[derive(Debug, Serialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub stream: bool,
    pub temperature: f32,
    pub max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

/// Response structure from OpenRouter API (non-streaming)
#[derive(Debug, Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    pub message: Message,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Usage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

/// Streaming response chunk
#[derive(Debug, Deserialize)]
pub struct StreamChunk {
    pub choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
pub struct StreamChoice {
    pub delta: Option<MessageDelta>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MessageDelta {
    pub content: Option<String>,
}

/// OpenRouter error response
#[derive(Debug, Deserialize)]
pub struct OpenRouterError {
    pub error: ErrorDetails,
}

#[derive(Debug, Deserialize)]
pub struct ErrorDetails {
    pub message: String,
    pub code: u16,
}

/// OpenRouter API client with streaming support
pub struct OpenRouterClient {
    config: OpenRouterConfig,
    client: Client,
}

impl OpenRouterClient {
    pub fn new(config: OpenRouterConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { config, client })
    }

    /// Generate a non-streaming chat completion
    pub async fn generate_chat(&self, messages: Vec<ChatMessage>) -> Result<String> {
        let openrouter_messages: Vec<Message> = messages
            .into_iter()
            .map(|msg| Message {
                role: msg.role.to_string(),
                content: msg.content,
            })
            .collect();

        let request = ChatRequest {
            model: self.config.model.clone(),
            messages: openrouter_messages,
            stream: false,
            temperature: self.config.temperature,
            max_tokens: self.config.max_tokens,
        };

        let mut retries = 0;
        loop {
            match self.make_chat_request(&request).await {
                Ok(response) => {
                    if let Some(choice) = response.choices.first() {
                        return Ok(choice.message.content.clone());
                    }
                    return Err(anyhow::anyhow!("No content in OpenRouter response"));
                }
                Err(e) => {
                    // Don't retry on data policy errors (404)
                    if e.to_string().contains("data policy") || e.to_string().contains("privacy") {
                        return Err(e);
                    }
                    
                    retries += 1;
                    if retries >= self.config.max_retries {
                        return Err(e).context("Max retries exceeded for OpenRouter API");
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
        let openrouter_messages: Vec<Message> = messages
            .into_iter()
            .map(|msg| Message {
                role: msg.role.to_string(),
                content: msg.content,
            })
            .collect();

        let request = ChatRequest {
            model: self.config.model.clone(),
            messages: openrouter_messages,
            stream: true,
            temperature: self.config.temperature,
            max_tokens: self.config.max_tokens,
        };

        let (tx, rx) = mpsc::channel(100);

        // Spawn streaming task
        let client = self.client.clone();
        let config = self.config.clone();
        let url = self.config.get_chat_url();
        let request_json = serde_json::to_value(&request)?;

        tokio::spawn(async move {
            if let Err(e) = Self::handle_streaming_response(client, url, config, request_json, tx).await {
                log::error!("Streaming error: {}", e);
            }
        });

        Ok(rx)
    }

    /// Handle streaming response from OpenRouter API
    async fn handle_streaming_response(
        client: Client,
        url: String,
        config: OpenRouterConfig,
        request: serde_json::Value,
        tx: mpsc::Sender<String>,
    ) -> Result<()> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse()?);
        headers.insert("Authorization", format!("Bearer {}", config.api_key).parse()?);
        
        // Add optional headers for site tracking
        if let Some(site_url) = &config.site_url {
            headers.insert("HTTP-Referer", site_url.parse()?);
        }
        if let Some(site_name) = &config.site_name {
            headers.insert("X-Title", site_name.parse()?);
        }

        log::info!("Sending request to OpenRouter: {}", url);
        log::debug!("Request payload: {}", serde_json::to_string_pretty(&request).unwrap_or_default());
        
        let response = client
            .post(&url)
            .headers(headers)
            .json(&request)
            .send()
            .await
            .context("Failed to send streaming request to OpenRouter API")?;

        let status = response.status();
        log::info!("OpenRouter response status: {}", status);

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("OpenRouter API error: {} - {}", status, error_text);
            
            // Parse error details if possible
            if let Ok(error_response) = serde_json::from_str::<OpenRouterError>(&error_text) {
                // Check for data policy errors
                if error_response.error.message.contains("data policy") || 
                   error_response.error.message.contains("privacy") {
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("⚠️  DATA POLICY ERROR");
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("OpenRouter cannot process your request due to privacy settings.");
                    log::error!("");
                    log::error!("To fix this:");
                    log::error!("1. Visit: https://openrouter.ai/settings/privacy");
                    log::error!("2. Review and update your data policy settings");
                    log::error!("3. For free models, you may need to enable 'Free model publication'");
                    log::error!("");
                    log::error!("Current model: {}", &request["model"]);
                    log::error!("Error: {}", error_response.error.message);
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    
                    return Err(anyhow::anyhow!(
                        "Data policy error: {}. Please configure your privacy settings at https://openrouter.ai/settings/privacy",
                        error_response.error.message
                    ));
                }
                
                // Check for model not found or no providers
                if error_response.error.message.contains("No endpoints found") || 
                   error_response.error.message.contains("No allowed providers") {
                    log::warn!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::warn!("Model '{}' not available or has no providers.", &request["model"]);
                    log::warn!("Try these VERIFIED working alternatives (Oct 2025):");
                    log::warn!("");
                    log::warn!("🔥 Recommended (Best Performance):");
                    log::warn!("  • deepseek/deepseek-r1:free");
                    log::warn!("  • google/gemini-2.5-pro:free");
                    log::warn!("  • meta-llama/llama-4-maverick:free");
                    log::warn!("");
                    log::warn!("⚡ Fast & Efficient:");
                    log::warn!("  • deepseek/deepseek-chat-v3.1:free");
                    log::warn!("  • google/gemini-2.5-flash:free");
                    log::warn!("  • x-ai/grok-4-fast:free");
                    log::warn!("");
                    log::warn!("📝 Other Options:");
                    log::warn!("  • mistralai/mistral-small-3.1:free");
                    log::warn!("  • deepseek/deepseek-r1-distill-llama-70b:free");
                    log::warn!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                }
            }
            
            return Err(anyhow::anyhow!(
                "OpenRouter streaming API error: {} - {}",
                status,
                error_text
            ));
        }

        let mut stream = response.bytes_stream();
        log::info!("Starting to read OpenRouter stream...");

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read streaming chunk")?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            log::debug!("Received chunk: {}", chunk_str);
            
            // Process each line in the chunk - OpenRouter returns SSE format
            for line in chunk_str.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                
                log::debug!("Processing line: {}", line);
                
                // Parse SSE format: data: {...}
                if line.starts_with("data: ") {
                    let json_str = &line[6..]; // Remove "data: " prefix
                    log::debug!("Parsing JSON: {}", json_str);
                    
                    if json_str == "[DONE]" {
                        log::info!("Stream completed with [DONE]");
                        break;
                    }
                    
                    match serde_json::from_str::<StreamChunk>(json_str) {
                        Ok(stream_chunk) => {
                            if let Some(choice) = stream_chunk.choices.first() {
                                if let Some(delta) = &choice.delta {
                                    if let Some(content) = &delta.content {
                                        log::debug!("Sending content: {}", content);
                                        if let Err(e) = tx.send(content.clone()).await {
                                            log::error!("Failed to send content through channel: {}", e);
                                            break;
                                        }
                                    }
                                }
                                
                                // Check if stream is finished
                                if choice.finish_reason.is_some() {
                                    log::info!("Stream finished with reason: {:?}", choice.finish_reason);
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            log::warn!("Failed to parse OpenRouter streaming chunk: {} - Error: {}", json_str, e);
                        }
                    }
                } else if !line.starts_with(":") { // Ignore SSE comments
                    log::debug!("Unexpected line format: {}", line);
                }
            }
        }
        
        log::info!("OpenRouter stream processing completed");

        Ok(())
    }

    /// Make non-streaming chat request to OpenRouter API
    async fn make_chat_request(&self, request: &ChatRequest) -> Result<ChatResponse> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse()?);
        headers.insert("Authorization", format!("Bearer {}", self.config.api_key).parse()?);
        
        // Add optional headers for site tracking
        if let Some(site_url) = &self.config.site_url {
            headers.insert("HTTP-Referer", site_url.parse()?);
        }
        if let Some(site_name) = &self.config.site_name {
            headers.insert("X-Title", site_name.parse()?);
        }

        let response = self
            .client
            .post(&self.config.get_chat_url())
            .headers(headers)
            .json(request)
            .send()
            .await
            .context("Failed to send request to OpenRouter API")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            
            // Parse error details if possible
            if let Ok(error_response) = serde_json::from_str::<OpenRouterError>(&error_text) {
                // Check for data policy errors
                if error_response.error.message.contains("data policy") || 
                   error_response.error.message.contains("privacy") {
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("⚠️  DATA POLICY ERROR");
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("OpenRouter cannot process your request due to privacy settings.");
                    log::error!("");
                    log::error!("To fix this:");
                    log::error!("1. Visit: https://openrouter.ai/settings/privacy");
                    log::error!("2. Review and update your data policy settings");
                    log::error!("3. For free models, you may need to enable 'Free model publication'");
                    log::error!("");
                    log::error!("Current model: {}", request.model);
                    log::error!("Error: {}", error_response.error.message);
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    
                    return Err(anyhow::anyhow!(
                        "Data policy error: {}. Please configure your privacy settings at https://openrouter.ai/settings/privacy",
                        error_response.error.message
                    ));
                }
                
                // Check for model not found or no providers
                if error_response.error.message.contains("No endpoints found") || 
                   error_response.error.message.contains("No allowed providers") {
                    log::warn!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::warn!("Model '{}' not available or has no providers.", request.model);
                    log::warn!("Try these VERIFIED working alternatives (Oct 2025):");
                    log::warn!("");
                    log::warn!("🔥 Recommended (Best Performance):");
                    log::warn!("  • deepseek/deepseek-r1:free");
                    log::warn!("  • google/gemini-2.5-pro:free");
                    log::warn!("  • meta-llama/llama-4-maverick:free");
                    log::warn!("");
                    log::warn!("⚡ Fast & Efficient:");
                    log::warn!("  • deepseek/deepseek-chat-v3.1:free");
                    log::warn!("  • google/gemini-2.5-flash:free");
                    log::warn!("  • x-ai/grok-4-fast:free");
                    log::warn!("");
                    log::warn!("📝 Other Options:");
                    log::warn!("  • mistralai/mistral-small-3.1:free");
                    log::warn!("  • deepseek/deepseek-r1-distill-llama-70b:free");
                    log::warn!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                }
            }
            
            return Err(anyhow::anyhow!(
                "OpenRouter API error: {} - {}",
                status,
                error_text
            ));
        }

        let chat_response: ChatResponse = response
            .json()
            .await
            .context("Failed to parse OpenRouter API response")?;

        Ok(chat_response)
    }

    /// Test connection to OpenRouter API
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
            MessageRole::Assistant => "assistant".to_string(),
            MessageRole::System => "system".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_openrouter_client_creation() {
        let config = OpenRouterConfig {
            api_key: "test_key".to_string(),
            model: "meta-llama/llama-3.1-8b-instruct:free".to_string(),
            site_url: None,
            site_name: None,
            max_retries: 3,
            timeout_seconds: 60,
            max_tokens: 4096,
            temperature: 0.7,
        };

        let client = OpenRouterClient::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_message_role_to_string() {
        assert_eq!(MessageRole::User.to_string(), "user");
        assert_eq!(MessageRole::Assistant.to_string(), "assistant");
        assert_eq!(MessageRole::System.to_string(), "system");
    }
}