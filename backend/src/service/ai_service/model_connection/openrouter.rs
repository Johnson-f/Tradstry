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
        self.generate_chat_with_model(messages, None).await
    }

    /// Generate a non-streaming chat completion with optional model override
    pub async fn generate_chat_with_model(
        &self,
        messages: Vec<ChatMessage>,
        model_override: Option<String>,
    ) -> Result<String> {
        let openrouter_messages: Vec<Message> = messages
            .into_iter()
            .map(|msg| Message {
                role: msg.role.to_string(),
                content: msg.content,
            })
            .collect();

        let model = model_override.unwrap_or_else(|| self.config.model.clone());
        
        log::info!("OpenRouter: Preparing non-streaming request with model: {}", model);
        log::debug!("OpenRouter: Message count: {}", openrouter_messages.len());

        let request = ChatRequest {
            model: model.clone(),
            messages: openrouter_messages,
            stream: false,
            temperature: self.config.temperature,
            max_tokens: self.config.max_tokens,
        };

        let mut retries = 0;
        loop {
            log::debug!("OpenRouter: Attempting request (retry {}/{})", retries + 1, self.config.max_retries);
            
            match self.make_chat_request(&request).await {
                Ok(response) => {
                    if let Some(choice) = response.choices.first() {
                        log::info!("OpenRouter: Successfully received response from model: {}", model);
                        if let Some(usage) = &response.usage {
                            log::debug!("OpenRouter: Token usage - prompt: {:?}, completion: {:?}, total: {:?}", 
                                usage.prompt_tokens, usage.completion_tokens, usage.total_tokens);
                        }
                        return Ok(choice.message.content.clone());
                    }
                    log::error!("OpenRouter: No content in response from model: {}", model);
                    return Err(anyhow::anyhow!("No content in OpenRouter response"));
                }
                Err(e) => {
                    let error_str = e.to_string();
                    log::warn!("OpenRouter: Request failed (attempt {}): {}", retries + 1, error_str);
                    
                    // Don't retry on data policy errors or auth errors
                    if error_str.contains("data policy") || 
                       error_str.contains("privacy") ||
                       error_str.contains("401") ||
                       error_str.contains("User not found") {
                        log::error!("OpenRouter: Non-retryable error, aborting");
                        return Err(e);
                    }
                    
                    retries += 1;
                    if retries >= self.config.max_retries {
                        log::error!("OpenRouter: Max retries ({}) exceeded for model: {}", self.config.max_retries, model);
                        return Err(e).context("Max retries exceeded for OpenRouter API");
                    }
                    
                    // Exponential backoff
                    let delay = Duration::from_millis(1000 * 2_u64.pow(retries - 1));
                    log::debug!("OpenRouter: Retrying in {}ms...", delay.as_millis());
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
        self.generate_chat_stream_with_model(messages, None).await
    }

    /// Generate a streaming chat completion with optional model override
    pub async fn generate_chat_stream_with_model(
        &self,
        messages: Vec<ChatMessage>,
        model_override: Option<String>,
    ) -> Result<mpsc::Receiver<String>> {
        let openrouter_messages: Vec<Message> = messages
            .into_iter()
            .map(|msg| Message {
                role: msg.role.to_string(),
                content: msg.content,
            })
            .collect();

        let model = model_override.unwrap_or_else(|| self.config.model.clone());
        
        log::info!("OpenRouter: Preparing streaming request with model: {}", model);
        log::debug!("OpenRouter: Message count: {}", openrouter_messages.len());

        let request = ChatRequest {
            model: model.clone(),
            messages: openrouter_messages,
            stream: true,
            temperature: self.config.temperature,
            max_tokens: self.config.max_tokens,
        };

        let (tx, rx) = mpsc::channel(100);

        // Make HTTP request first to check status before spawning task
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

        let url = self.config.get_chat_url();
        let request_json = serde_json::to_value(&request)?;

        log::info!("OpenRouter: Sending streaming request to: {}", url);
        log::debug!("OpenRouter: Request payload: {}", serde_json::to_string_pretty(&request_json).unwrap_or_default());
        
        // Check HTTP response status before spawning streaming task
        let response = self.client
            .post(&url)
            .headers(headers.clone())
            .json(&request_json)
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
                log::error!("OpenRouter API error details: {} (code: {})", error_response.error.message, error_response.error.code);
                
                // Special handling for 401 errors
                if status.as_u16() == 401 {
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("⚠️  OPENROUTER AUTHENTICATION ERROR (401)");
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("OpenRouter API key is invalid or user not found.");
                    log::error!("");
                    log::error!("To fix this:");
                    log::error!("1. Check your OPENROUTER_API_KEY environment variable");
                    log::error!("2. Verify your API key at: https://openrouter.ai/keys");
                    log::error!("3. Ensure the API key has proper permissions");
                    log::error!("");
                    log::error!("Current model: {}", model);
                    log::error!("Error message: {}", error_response.error.message);
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                }
                
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
                    log::error!("Current model: {}", model);
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
                    log::warn!("Model '{}' not available or has no providers.", model);
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

        // If status is OK, spawn task to handle the stream
        log::info!("OpenRouter: HTTP status OK, starting stream processing for model: {}", model);
        
        // Convert response into a stream for the spawned task
        let stream = response.bytes_stream();

        tokio::spawn(async move {
            if let Err(e) = Self::handle_streaming_response_from_stream(stream, tx, model.clone()).await {
                log::error!("OpenRouter streaming error: {}", e);
            }
        });

        Ok(rx)
    }

    /// Handle streaming response from OpenRouter API (legacy - for non-streaming requests)
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

        log::info!("OpenRouter: Sending request to: {}", url);
        log::debug!("OpenRouter: Request payload: {}", serde_json::to_string_pretty(&request).unwrap_or_default());
        
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
                log::error!("OpenRouter API error details: {} (code: {})", error_response.error.message, error_response.error.code);
                
                // Special handling for 401 errors
                if status.as_u16() == 401 {
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("⚠️  OPENROUTER AUTHENTICATION ERROR (401)");
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("OpenRouter API key is invalid or user not found.");
                    log::error!("");
                    log::error!("To fix this:");
                    log::error!("1. Check your OPENROUTER_API_KEY environment variable");
                    log::error!("2. Verify your API key at: https://openrouter.ai/keys");
                    log::error!("3. Ensure the API key has proper permissions");
                    log::error!("");
                    log::error!("Current model: {}", &request["model"]);
                    log::error!("Error message: {}", error_response.error.message);
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                }
                
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

        let stream = response.bytes_stream();
        let model = request.get("model").and_then(|m| m.as_str()).unwrap_or("unknown").to_string();
        Self::handle_streaming_response_from_stream(stream, tx, model).await
    }

    /// Handle streaming response from an existing stream
    async fn handle_streaming_response_from_stream(
        mut stream: impl futures_util::Stream<Item = Result<impl AsRef<[u8]>, reqwest::Error>> + Unpin,
        tx: mpsc::Sender<String>,
        model: String,
    ) -> Result<()> {
        log::info!("OpenRouter: Starting to read stream for model: {}", model);

        // Buffer to accumulate incomplete lines across chunks
        let mut line_buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read streaming chunk")?;
            let chunk_str = String::from_utf8_lossy(chunk.as_ref());
            log::debug!("Received chunk ({} bytes)", chunk_str.len());
            
            // Append chunk to buffer
            line_buffer.push_str(&chunk_str);
            
            // Split buffer into complete lines (ending with \n) and incomplete remainder
            // Use split_inclusive to keep newlines, then process complete lines
            let mut lines: Vec<String> = Vec::new();
            let parts: Vec<&str> = line_buffer.split_inclusive('\n').collect();
            
            // All parts except the last are complete lines
            if parts.len() > 1 {
                for part in &parts[..parts.len() - 1] {
                    // Remove the trailing newline
                    let line = part.strip_suffix('\n').unwrap_or(part).to_string();
                    if !line.is_empty() {
                        lines.push(line);
                    }
                }
                // Keep the last part (incomplete line) in buffer
                line_buffer = parts[parts.len() - 1].to_string();
            } else {
                // No newlines found, entire buffer is incomplete
                // Keep it for next chunk
            }
            
            // If we didn't find any complete lines, continue to next chunk
            if lines.is_empty() {
                continue;
            }
            
            // Process each complete line - OpenRouter returns SSE format
            for line in lines {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                
                let line_preview: String = if line.len() > 200 { 
                    format!("{}...", &line[..200]) 
                } else { 
                    line.to_string() 
                };
                log::debug!("Processing line ({} chars): {}", line.len(), line_preview);
                
                // Parse SSE format: data: {...}
                if let Some(json_str) = line.strip_prefix("data: ") {
                    if json_str == "[DONE]" {
                        log::info!("Stream completed with [DONE]");
                        break;
                    }
                    
                    // Validate JSON structure before parsing
                    let json_str_trimmed = json_str.trim();
                    if json_str_trimmed.is_empty() {
                        continue;
                    }
                    
                    // Check if JSON appears complete (starts with { and ends with })
                    // This is a heuristic to avoid parsing incomplete JSON
                    let starts_with_brace = json_str_trimmed.starts_with('{');
                    let ends_with_brace = json_str_trimmed.ends_with('}');
                    
                    // Check if JSON appears complete (starts with { and ends with })
                    // This is a heuristic to avoid parsing incomplete JSON
                    if !starts_with_brace || !ends_with_brace {
                        log::debug!("Skipping incomplete JSON line (starts_with_brace: {}, ends_with_brace: {})", 
                            starts_with_brace, ends_with_brace);
                        // This shouldn't happen if we're properly splitting by newlines,
                        // but if it does, we'll skip it and it should be completed in next chunk
                        continue;
                    }
                    
                    log::debug!("Parsing JSON ({} chars)", json_str_trimmed.len());
                    
                    match serde_json::from_str::<StreamChunk>(json_str_trimmed) {
                        Ok(stream_chunk) => {
                            if let Some(choice) = stream_chunk.choices.first() {
                                if let Some(delta) = &choice.delta
                                    && let Some(content) = &delta.content
                                {
                                    log::debug!("Sending content: {}", content);
                                    if let Err(e) = tx.send(content.clone()).await {
                                        log::error!("Failed to send content through channel: {}", e);
                                        break;
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
                            let error_msg = e.to_string();
                            // Check if it's an incomplete JSON error (EOF, unexpected end, etc.)
                            let is_incomplete = error_msg.contains("EOF") 
                                || error_msg.contains("unexpected end")
                                || error_msg.contains("invalid string")
                                || error_msg.contains("trailing characters");
                            
                            if is_incomplete {
                                // This shouldn't happen if we're properly buffering, but log at debug level
                                let json_preview = if json_str_trimmed.len() > 200 { 
                                    format!("{}...", &json_str_trimmed[..200]) 
                                } else { 
                                    json_str_trimmed.to_string() 
                                };
                                log::debug!("Incomplete JSON detected (likely chunk boundary issue): {} - {}", 
                                    json_preview, error_msg);
                                // Don't add back to buffer - if line is complete (has \n), 
                                // the JSON should be complete. If it's not, it's malformed.
                            } else {
                                // Real parsing error - log as warning
                                let json_preview = if json_str_trimmed.len() > 200 { 
                                    format!("{}...", &json_str_trimmed[..200]) 
                                } else { 
                                    json_str_trimmed.to_string() 
                                };
                                log::warn!("Failed to parse OpenRouter streaming chunk: {} - Error: {}", 
                                    json_preview, e);
                            }
                        }
                    }
                } else if !line.starts_with(":") { // Ignore SSE comments
                    let line_preview: String = if line.len() > 200 { 
                        format!("{}...", &line[..200]) 
                    } else { 
                        line.to_string() 
                    };
                    log::debug!("Unexpected line format: {}", line_preview);
                }
            }
        }
        
        // Process any remaining buffered data as a final attempt
        if !line_buffer.trim().is_empty() {
            log::debug!("Processing remaining buffer ({} chars): {}", 
                line_buffer.len(),
                if line_buffer.len() > 200 { format!("{}...", &line_buffer[..200]) } else { line_buffer.clone() });
            
            let line = line_buffer.trim();
            if let Some(json_str) = line.strip_prefix("data: ") {
                if json_str != "[DONE]" {
                    let json_str_trimmed = json_str.trim();
                    if json_str_trimmed.starts_with('{') && json_str_trimmed.ends_with('}') {
                        if let Ok(stream_chunk) = serde_json::from_str::<StreamChunk>(json_str_trimmed) {
                            if let Some(choice) = stream_chunk.choices.first() {
                                if let Some(delta) = &choice.delta
                                    && let Some(content) = &delta.content
                                {
                                    let _ = tx.send(content.clone()).await;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        log::info!("OpenRouter: Stream processing completed for model: {}", model);

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

        let url = self.config.get_chat_url();
        log::debug!("OpenRouter: Making request to: {}", url);
        log::debug!("OpenRouter: Request model: {}", request.model);

        let response = self
            .client
            .post(&url)
            .headers(headers)
            .json(request)
            .send()
            .await
            .context("Failed to send request to OpenRouter API")?;

            let status = response.status();
        log::debug!("OpenRouter: Response status: {}", status);

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            log::error!("OpenRouter API error: {} - {}", status, error_text);
            
            // Parse error details if possible
            if let Ok(error_response) = serde_json::from_str::<OpenRouterError>(&error_text) {
                log::error!("OpenRouter API error details: {} (code: {})", error_response.error.message, error_response.error.code);
                
                // Special handling for 401 errors
                if status.as_u16() == 401 {
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("⚠️  OPENROUTER AUTHENTICATION ERROR (401)");
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                    log::error!("OpenRouter API key is invalid or user not found.");
                    log::error!("");
                    log::error!("To fix this:");
                    log::error!("1. Check your OPENROUTER_API_KEY environment variable");
                    log::error!("2. Verify your API key at: https://openrouter.ai/keys");
                    log::error!("3. Ensure the API key has proper permissions");
                    log::error!("");
                    log::error!("Current model: {}", request.model);
                    log::error!("Error message: {}", error_response.error.message);
                    log::error!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                }
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

impl std::fmt::Display for MessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MessageRole::User => write!(f, "user"),
            MessageRole::Assistant => write!(f, "assistant"),
            MessageRole::System => write!(f, "system"),
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
