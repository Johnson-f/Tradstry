use std::collections::VecDeque;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::{Response, StatusCode};
use serde_json::{Value, json};
use tinyagents::harness::cache::model_cache_identity;
use tinyagents::harness::message::{AssistantMessage, ContentBlock, MessageDelta};
use tinyagents::harness::model::{
    ChatModel, Modalities, ModelProfile, ModelRequest, ModelResponse, ModelStatus, ModelStream,
    ModelStreamItem, ProviderError,
};
use tinyagents::harness::tool::{ToolCall, ToolDelta};
use tinyagents::harness::usage::Usage;
use tinyagents::{Result as TinyResult, TinyAgentsError};
use tokio_stream::wrappers::UnboundedReceiverStream;

use super::AgentRuntimeState;
use super::provider_contract::{ProviderDialect, compile_request};
use crate::service::agents::{AgentError, AgentResult};

const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_SECS: u64 = 120;
const MAX_ERROR_BODY_BYTES: usize = 64 * 1024;
const MAX_SSE_BUFFER_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
pub struct GeminiModel {
    api_key: String,
    model: String,
    base_url: String,
    client: reqwest::Client,
    profile: ModelProfile,
    cache_identity: String,
}

impl GeminiModel {
    pub fn from_env(model: impl Into<String>) -> AgentResult<Self> {
        let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| {
            AgentError::Validation("GEMINI_API_KEY is required for agent models".into())
        })?;
        Self::new(api_key, model, DEFAULT_BASE_URL)
    }

    pub fn from_api_key(api_key: impl Into<String>, model: impl Into<String>) -> AgentResult<Self> {
        Self::new(api_key, model, DEFAULT_BASE_URL)
    }

    pub fn new(
        api_key: impl Into<String>,
        model: impl Into<String>,
        base_url: impl Into<String>,
    ) -> AgentResult<Self> {
        let api_key = api_key.into();
        let model = model.into().trim().to_owned();
        let base_url = base_url.into().trim_end_matches('/').to_owned();
        if api_key.trim().is_empty() || model.is_empty() || base_url.is_empty() {
            return Err(AgentError::Validation(
                "Gemini API key, model, and base URL must be non-blank".into(),
            ));
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|error| {
                log::error!("failed to create Gemini HTTP client: {error:#}");
                AgentError::Internal
            })?;
        let profile = ModelProfile {
            provider: Some("gemini".into()),
            model: Some(model.clone()),
            display_name: None,
            status: ModelStatus::Stable,
            release_date: None,
            modalities: Modalities {
                text_in: true,
                text_out: true,
                image_in: true,
                image_out: false,
                audio_in: false,
                audio_out: false,
            },
            tool_calling: true,
            parallel_tool_calls: true,
            streaming: true,
            streaming_tool_chunks: true,
            native_structured_output: true,
            json_schema: true,
            reasoning: true,
            reasoning_effort: false,
            max_input_tokens: None,
            max_output_tokens: None,
        };
        let cache_identity = model_cache_identity("gemini", &model, &base_url, None, &api_key);
        Ok(Self {
            api_key,
            model,
            base_url,
            client,
            profile,
            cache_identity,
        })
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    fn endpoint(&self, operation: &str) -> String {
        format!("{}/{}:{operation}", self.base_url, self.model)
    }

    fn request_body(&self, request: &ModelRequest) -> TinyResult<Value> {
        build_request_body(request)
    }

    async fn send_unary(&self, request: ModelRequest) -> TinyResult<ModelResponse> {
        let timeout = request
            .timeout_ms
            .map(Duration::from_millis)
            .unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        let response = self
            .client
            .post(self.endpoint("generateContent"))
            .header("x-goog-api-key", &self.api_key)
            .json(&self.request_body(&request)?)
            .timeout(timeout)
            .send()
            .await
            .map_err(|error| provider_transport_error(&self.model, error))?;
        parse_unary_response(&self.model, response).await
    }

    async fn drive_stream(
        self,
        request: ModelRequest,
        tx: tokio::sync::mpsc::UnboundedSender<ModelStreamItem>,
    ) {
        if tx.send(ModelStreamItem::Started).is_err() {
            return;
        }
        let timeout = request
            .timeout_ms
            .map(Duration::from_millis)
            .unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        let response = self
            .client
            .post(format!(
                "{}?alt=sse",
                self.endpoint("streamGenerateContent")
            ))
            .header("x-goog-api-key", &self.api_key)
            .json(&match self.request_body(&request) {
                Ok(body) => body,
                Err(error) => {
                    let _ = tx.send(ModelStreamItem::Failed(error.to_string()));
                    return;
                }
            })
            .timeout(timeout)
            .send()
            .await;
        let response = match response {
            Ok(response) if response.status().is_success() => response,
            Ok(response) => {
                let provider = provider_http_error(&self.model, response).await;
                let _ = tx.send(ModelStreamItem::ProviderFailed(provider));
                return;
            }
            Err(error) => {
                let provider = provider_error_from_reqwest(&self.model, &error);
                let _ = tx.send(ModelStreamItem::ProviderFailed(provider));
                return;
            }
        };

        let mut accumulator = GeminiAccumulator::default();
        let mut bytes = response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = bytes.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(error) => {
                    let _ = tx.send(ModelStreamItem::ProviderFailed(
                        provider_error_from_reqwest(&self.model, &error),
                    ));
                    return;
                }
            };
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            if buffer.len() > MAX_SSE_BUFFER_BYTES {
                let _ = tx.send(ModelStreamItem::Failed(
                    "Gemini stream frame exceeded the safety limit".into(),
                ));
                return;
            }
            let mut frames = VecDeque::new();
            while let Some(position) = buffer.find('\n') {
                let line = buffer[..position].trim_end_matches('\r').to_owned();
                buffer.drain(..=position);
                if let Some(data) = line.strip_prefix("data: ")
                    && data != "[DONE]"
                {
                    frames.push_back(data.to_owned());
                }
            }
            while let Some(frame) = frames.pop_front() {
                let value: Value = match serde_json::from_str(&frame) {
                    Ok(value) => value,
                    Err(error) => {
                        let _ = tx.send(ModelStreamItem::Failed(format!(
                            "Gemini returned malformed stream JSON: {error}"
                        )));
                        return;
                    }
                };
                for item in accumulator.apply(&value) {
                    if tx.send(item).is_err() {
                        return;
                    }
                }
            }
        }
        if !buffer.trim().is_empty()
            && let Some(data) = buffer.trim().strip_prefix("data: ")
            && data != "[DONE]"
        {
            match serde_json::from_str::<Value>(data) {
                Ok(value) => {
                    for item in accumulator.apply(&value) {
                        if tx.send(item).is_err() {
                            return;
                        }
                    }
                }
                Err(error) => {
                    let _ = tx.send(ModelStreamItem::Failed(format!(
                        "Gemini returned malformed final stream JSON: {error}"
                    )));
                    return;
                }
            }
        }
        let _ = tx.send(ModelStreamItem::Completed(accumulator.finish()));
    }
}

#[async_trait]
impl ChatModel<AgentRuntimeState> for GeminiModel {
    fn profile(&self) -> Option<&ModelProfile> {
        Some(&self.profile)
    }

    fn cache_identity(&self) -> Option<String> {
        Some(self.cache_identity.clone())
    }

    async fn invoke(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> TinyResult<ModelResponse> {
        self.send_unary(request).await
    }

    async fn stream(
        &self,
        _state: &AgentRuntimeState,
        request: ModelRequest,
    ) -> TinyResult<ModelStream> {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        let model = self.clone();
        tokio::spawn(model.drive_stream(request, tx));
        Ok(Box::pin(UnboundedReceiverStream::new(rx)))
    }
}

fn build_request_body(request: &ModelRequest) -> TinyResult<Value> {
    compile_request(ProviderDialect::Gemini, "", request, false)
}

async fn parse_unary_response(model: &str, response: Response) -> TinyResult<ModelResponse> {
    if !response.status().is_success() {
        return Err(TinyAgentsError::Provider(Box::new(
            provider_http_error(model, response).await,
        )));
    }
    let value: Value = response.json().await.map_err(|error| {
        TinyAgentsError::Model(format!("Gemini returned malformed JSON: {error}"))
    })?;
    parse_response_value(&value)
}

fn parse_response_value(value: &Value) -> TinyResult<ModelResponse> {
    if let Some(error) = value.get("error") {
        return Err(TinyAgentsError::Model(format!(
            "Gemini response error: {}",
            error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
        )));
    }
    let mut accumulator = GeminiAccumulator::default();
    accumulator.apply(value);
    Ok(accumulator.finish())
}

#[derive(Default)]
struct PendingTool {
    id: String,
    name: String,
    arguments: Value,
    signature: Option<String>,
}

#[derive(Default)]
struct GeminiAccumulator {
    text: String,
    reasoning: String,
    tools: Vec<PendingTool>,
    usage: Option<Usage>,
    finish_reason: Option<String>,
    raw: Option<Value>,
}

impl GeminiAccumulator {
    fn apply(&mut self, value: &Value) -> Vec<ModelStreamItem> {
        let mut items = Vec::new();
        let parts = value
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut function_index = 0usize;
        for part in parts {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                if part
                    .get("thought")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    self.reasoning.push_str(text);
                    items.push(ModelStreamItem::MessageDelta(MessageDelta::reasoning(text)));
                } else {
                    self.text.push_str(text);
                    items.push(ModelStreamItem::MessageDelta(MessageDelta::text(text)));
                }
            }
            if let Some(call) = part.get("functionCall") {
                while self.tools.len() <= function_index {
                    self.tools.push(PendingTool {
                        id: format!("call_{}", crate::ids::new_uuid_v7()),
                        ..Default::default()
                    });
                }
                let pending = &mut self.tools[function_index];
                if let Some(id) = call.get("id").and_then(Value::as_str)
                    && !id.is_empty()
                {
                    pending.id = id.to_owned();
                }
                pending.name = call
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                pending.arguments = call.get("args").cloned().unwrap_or_else(|| json!({}));
                pending.signature = part
                    .get("thoughtSignature")
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                items.push(ModelStreamItem::ToolCallDelta(ToolDelta {
                    call_id: pending.id.clone(),
                    content: pending.arguments.to_string(),
                    tool_name: Some(pending.name.clone()),
                }));
                function_index += 1;
            }
        }
        self.finish_reason = value
            .pointer("/candidates/0/finishReason")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| self.finish_reason.clone());
        if let Some(usage) = parse_usage(value.get("usageMetadata")) {
            self.usage = Some(usage);
            items.push(ModelStreamItem::UsageDelta(usage));
        }
        self.raw = Some(value.clone());
        items
    }

    fn finish(self) -> ModelResponse {
        let mut content = Vec::new();
        if !self.text.is_empty() {
            content.push(ContentBlock::Text(self.text));
        }
        if !self.reasoning.is_empty() {
            content.push(ContentBlock::Thinking {
                text: self.reasoning,
                signature: None,
            });
        }
        let mut tool_calls = Vec::new();
        for tool in self.tools {
            if let Some(signature) = tool.signature {
                content.push(ContentBlock::Thinking {
                    text: String::new(),
                    signature: Some(signature),
                });
            }
            tool_calls.push(ToolCall::new(tool.id, tool.name, tool.arguments));
        }
        ModelResponse {
            message: AssistantMessage {
                id: None,
                content,
                tool_calls,
                usage: self.usage,
            },
            usage: self.usage,
            finish_reason: self.finish_reason,
            raw: self.raw,
            resolved_model: None,
            continue_turn: None,
            served_from_cache: false,
        }
    }
}

fn parse_usage(value: Option<&Value>) -> Option<Usage> {
    let value = value?;
    Some(Usage {
        input_tokens: value
            .get("promptTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: value
            .get("candidatesTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: value
            .get("totalTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_tokens: value
            .get("cachedContentTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_creation_tokens: 0,
        reasoning_tokens: value
            .get("thoughtsTokenCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

fn provider_transport_error(model: &str, error: reqwest::Error) -> TinyAgentsError {
    TinyAgentsError::Provider(Box::new(provider_error_from_reqwest(model, &error)))
}

fn provider_error_from_reqwest(model: &str, error: &reqwest::Error) -> ProviderError {
    ProviderError {
        provider: "gemini".into(),
        model: Some(model.into()),
        status: error.status().map(|status| status.as_u16()),
        code: None,
        message: error.to_string(),
        retryable: error.is_timeout() || error.is_connect(),
        retry_after_ms: None,
        raw: None,
    }
}

async fn provider_http_error(model: &str, response: Response) -> ProviderError {
    let status = response.status();
    let retry_after_ms = retry_after_ms(response.headers());
    let body = read_limited_body(response, MAX_ERROR_BODY_BYTES).await;
    let raw = serde_json::from_str::<Value>(&body).ok();
    let message = raw
        .as_ref()
        .and_then(|value| value.pointer("/error/message"))
        .and_then(Value::as_str)
        .unwrap_or_else(|| body.trim())
        .chars()
        .take(1_000)
        .collect::<String>();
    let code = raw
        .as_ref()
        .and_then(|value| value.pointer("/error/status"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    ProviderError {
        provider: "gemini".into(),
        model: Some(model.into()),
        status: Some(status.as_u16()),
        code,
        message,
        retryable: status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error(),
        retry_after_ms,
        raw,
    }
}

fn retry_after_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|seconds| seconds.saturating_mul(1_000))
}

async fn read_limited_body(response: Response, limit: usize) -> String {
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else {
            break;
        };
        let remaining = limit.saturating_sub(body.len());
        body.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
        if body.len() >= limit {
            break;
        }
    }
    String::from_utf8_lossy(&body).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tinyagents::harness::message::{ImageRef, Message, ToolMessage, UserMessage};
    use tinyagents::harness::model::{ModelRequest, ResponseFormat, ToolChoice};
    use tinyagents::harness::tool::ToolSchema;

    #[test]
    fn signed_tool_call_is_replayed_on_the_function_part() {
        let request = ModelRequest {
            messages: vec![Message::Assistant(AssistantMessage {
                id: None,
                content: vec![ContentBlock::Thinking {
                    text: String::new(),
                    signature: Some("sig-123".into()),
                }],
                tool_calls: vec![ToolCall::new("call-1", "lookup", json!({"id": "x"}))],
                usage: None,
            })],
            ..Default::default()
        };
        let body = build_request_body(&request).unwrap();
        assert_eq!(
            body["contents"][0]["parts"][1]["thoughtSignature"],
            "sig-123"
        );
    }

    #[test]
    fn tool_result_resolves_name_from_prior_call() {
        let request = ModelRequest {
            messages: vec![
                Message::Assistant(AssistantMessage {
                    id: None,
                    content: vec![],
                    tool_calls: vec![ToolCall::new("call-1", "lookup", json!({}))],
                    usage: None,
                }),
                Message::Tool(ToolMessage {
                    tool_call_id: "call-1".into(),
                    content: vec![ContentBlock::Text("done".into())],
                    trusted_verbatim: false,
                    artifact: Some(json!({"ok": true})),
                }),
            ],
            ..Default::default()
        };
        let body = build_request_body(&request).unwrap();
        assert_eq!(
            body["contents"][1]["parts"][0]["functionResponse"]["name"],
            "lookup"
        );
        assert_eq!(
            body["contents"][1]["parts"][0]["functionResponse"]["response"]["ok"],
            true
        );
    }

    #[test]
    fn tool_schema_and_structured_output_use_gemini_wire_shape() {
        let request = ModelRequest {
            tools: vec![ToolSchema::new(
                "lookup",
                "Lookup",
                json!({
                    "type": "object",
                    "$defs": {"Id": {"type": "string"}},
                    "properties": {"id": {"$ref": "#/$defs/Id"}}
                }),
            )],
            tool_choice: ToolChoice::Tool("lookup".into()),
            response_format: Some(ResponseFormat::JsonSchema {
                name: "answer".into(),
                schema: json!({"type": "object", "properties": {"ok": {"type": "boolean"}}}),
            }),
            ..Default::default()
        };
        let body = build_request_body(&request).unwrap();
        assert!(
            body["tools"][0]["functionDeclarations"][0]["parameters"]
                .get("$defs")
                .is_none()
        );
        assert_eq!(body["toolConfig"]["functionCallingConfig"]["mode"], "ANY");
        assert_eq!(
            body["toolConfig"]["functionCallingConfig"]["allowedFunctionNames"][0],
            "lookup"
        );
        assert_eq!(
            body["generationConfig"]["responseMimeType"],
            "application/json"
        );
    }

    #[test]
    fn image_and_video_extensions_are_native_parts() {
        let request = ModelRequest {
            messages: vec![Message::User(UserMessage {
                content: vec![
                    ContentBlock::Image(ImageRef {
                        url: "data:image/png;base64,aGVsbG8=".into(),
                        mime_type: Some("image/png".into()),
                    }),
                    ContentBlock::ProviderExtension(json!({
                        "gemini_file_data": {
                            "mime_type": "video/mp4",
                            "file_uri": "https://files.example/video"
                        }
                    })),
                ],
            })],
            ..Default::default()
        };
        let body = build_request_body(&request).unwrap();
        assert_eq!(
            body["contents"][0]["parts"][0]["inlineData"]["mimeType"],
            "image/png"
        );
        assert_eq!(
            body["contents"][0]["parts"][1]["fileData"]["mimeType"],
            "video/mp4"
        );
    }

    #[test]
    fn response_parses_text_tools_signature_and_usage() {
        let response = parse_response_value(&json!({
            "candidates": [{
                "content": {"parts": [
                    {"text": "hello"},
                    {"functionCall": {"id": "call-1", "name": "lookup", "args": {"id": "x"}}, "thoughtSignature": "sig"}
                ]},
                "finishReason": "STOP"
            }],
            "usageMetadata": {
                "promptTokenCount": 4,
                "candidatesTokenCount": 3,
                "totalTokenCount": 7,
                "cachedContentTokenCount": 2,
                "thoughtsTokenCount": 1
            }
        })).unwrap();
        assert_eq!(response.message.tool_calls[0].name, "lookup");
        assert_eq!(response.usage.unwrap().total_tokens, 7);
        assert!(response.message.content.iter().any(|block| matches!(
            block,
            ContentBlock::Thinking { signature: Some(value), .. } if value == "sig"
        )));
    }
}
