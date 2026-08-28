use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::{Response, StatusCode};
use serde_json::Value;
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

const DEFAULT_BASE_URL: &str = "https://api.perplexity.ai/v1";
const DEFAULT_TIMEOUT_SECS: u64 = 120;
const MAX_BODY_BYTES: usize = 64 * 1024;
const MAX_SSE_BUFFER_BYTES: usize = 1024 * 1024;

#[derive(Clone)]
pub struct PerplexityProvider {
    api_key: Arc<str>,
    base_url: Arc<str>,
    client: reqwest::Client,
}

impl PerplexityProvider {
    pub fn new(api_key: impl Into<String>) -> AgentResult<Self> {
        Self::at(api_key, DEFAULT_BASE_URL)
    }

    pub fn at(api_key: impl Into<String>, base_url: impl Into<String>) -> AgentResult<Self> {
        let api_key = api_key.into();
        let base_url = base_url.into().trim_end_matches('/').to_owned();
        if api_key.trim().is_empty() || base_url.is_empty() {
            return Err(AgentError::Validation(
                "Perplexity API key and base URL must be non-blank".into(),
            ));
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|error| {
                log::error!("failed to create Perplexity HTTP client: {error:#}");
                AgentError::Internal
            })?;
        Ok(Self {
            api_key: api_key.into(),
            base_url: base_url.into(),
            client,
        })
    }

    pub async fn validate_models<'a>(
        &self,
        models: impl IntoIterator<Item = &'a str>,
    ) -> AgentResult<()> {
        let response = self
            .client
            .get(format!("{}/models", self.base_url))
            .bearer_auth(self.api_key.as_ref())
            .send()
            .await
            .map_err(|error| {
                log::error!("Perplexity model catalogue request failed: {error:#}");
                AgentError::ProviderUnavailable
            })?;
        if !response.status().is_success() {
            let status = response.status();
            let body = read_limited_body(response, MAX_BODY_BYTES).await;
            log::error!(
                "Perplexity model catalogue returned status {}: {}",
                status.as_u16(),
                body.chars().take(500).collect::<String>()
            );
            return Err(
                if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
                    AgentError::Validation("PERPLEXITY_API_KEY was rejected".into())
                } else {
                    AgentError::ProviderUnavailable
                },
            );
        }
        let body = read_limited_body(response, MAX_BODY_BYTES).await;
        let value: Value = serde_json::from_str(&body).map_err(|_| {
            AgentError::Validation("Perplexity model catalogue response is invalid".into())
        })?;
        let catalog = parse_model_catalog(&value)?;
        validate_catalog(&catalog, models)
    }

    pub fn model(&self, model: impl Into<String>) -> AgentResult<PerplexityModel> {
        PerplexityModel::new(self.clone(), model)
    }
}

#[derive(Clone)]
pub struct PerplexityModel {
    provider: PerplexityProvider,
    model: String,
    profile: ModelProfile,
    cache_identity: String,
}

impl PerplexityModel {
    fn new(provider: PerplexityProvider, model: impl Into<String>) -> AgentResult<Self> {
        let model = model.into().trim().to_owned();
        if model.is_empty() {
            return Err(AgentError::Validation(
                "Perplexity model must be non-blank".into(),
            ));
        }
        let profile = ModelProfile {
            provider: Some("perplexity".into()),
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
            reasoning_effort: true,
            max_input_tokens: None,
            max_output_tokens: None,
        };
        let cache_identity = model_cache_identity(
            "perplexity",
            &model,
            provider.base_url.as_ref(),
            None,
            provider.api_key.as_ref(),
        );
        Ok(Self {
            provider,
            model,
            profile,
            cache_identity,
        })
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    fn endpoint(&self) -> String {
        format!("{}/agent", self.provider.base_url)
    }

    fn request_body(&self, request: &ModelRequest, stream: bool) -> TinyResult<Value> {
        build_request_body(&self.model, request, stream)
    }

    async fn send_unary(&self, request: ModelRequest) -> TinyResult<ModelResponse> {
        let timeout = request
            .timeout_ms
            .map(Duration::from_millis)
            .unwrap_or(Duration::from_secs(DEFAULT_TIMEOUT_SECS));
        let response = self
            .provider
            .client
            .post(self.endpoint())
            .bearer_auth(self.provider.api_key.as_ref())
            .json(&self.request_body(&request, false)?)
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
            .provider
            .client
            .post(self.endpoint())
            .bearer_auth(self.provider.api_key.as_ref())
            .json(&match self.request_body(&request, true) {
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
                let error = provider_http_error(&self.model, response).await;
                let _ = tx.send(ModelStreamItem::ProviderFailed(error));
                return;
            }
            Err(error) => {
                let error = match provider_transport_error(&self.model, error) {
                    TinyAgentsError::Provider(error) => *error,
                    other => {
                        let _ = tx.send(ModelStreamItem::Failed(other.to_string()));
                        return;
                    }
                };
                let _ = tx.send(ModelStreamItem::ProviderFailed(error));
                return;
            }
        };
        let is_sse = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("text/event-stream"));
        if !is_sse {
            let _ = tx.send(ModelStreamItem::Failed(
                "Perplexity stream did not return server-sent events".into(),
            ));
            return;
        }

        let mut parser = SseParser::default();
        let mut state = PerplexityStreamState::new(self.model.clone());
        let mut bytes = response.bytes_stream();
        while let Some(chunk) = bytes.next().await {
            let chunk = match chunk {
                Ok(chunk) => chunk,
                Err(error) => {
                    let provider = match provider_transport_error(&self.model, error) {
                        TinyAgentsError::Provider(error) => *error,
                        other => {
                            let _ = tx.send(ModelStreamItem::Failed(other.to_string()));
                            return;
                        }
                    };
                    let _ = tx.send(ModelStreamItem::ProviderFailed(provider));
                    return;
                }
            };
            let frames = match parser.push(&String::from_utf8_lossy(&chunk)) {
                Ok(frames) => frames,
                Err(error) => {
                    let _ = tx.send(ModelStreamItem::Failed(error));
                    return;
                }
            };
            for frame in frames {
                for item in state.apply(&frame) {
                    let terminal = matches!(
                        item,
                        ModelStreamItem::Completed(_)
                            | ModelStreamItem::Failed(_)
                            | ModelStreamItem::ProviderFailed(_)
                    );
                    if tx.send(item).is_err() || terminal {
                        return;
                    }
                }
            }
        }
        for frame in parser.finish() {
            for item in state.apply(&frame) {
                let terminal = matches!(
                    item,
                    ModelStreamItem::Completed(_)
                        | ModelStreamItem::Failed(_)
                        | ModelStreamItem::ProviderFailed(_)
                );
                if tx.send(item).is_err() || terminal {
                    return;
                }
            }
        }
        let _ = tx.send(ModelStreamItem::Failed(
            "Perplexity stream ended without a completion event".into(),
        ));
    }
}

#[async_trait]
impl ChatModel<AgentRuntimeState> for PerplexityModel {
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

#[derive(Default)]
struct SseParser {
    buffer: String,
    event: Option<String>,
    data: Vec<String>,
}

struct SseFrame {
    event: String,
    data: String,
}

impl SseParser {
    fn push(&mut self, value: &str) -> Result<Vec<SseFrame>, String> {
        self.buffer.push_str(value);
        if self.buffer.len() > MAX_SSE_BUFFER_BYTES {
            return Err("Perplexity stream buffer exceeded the safety limit".into());
        }
        let mut frames = Vec::new();
        while let Some(position) = self.buffer.find('\n') {
            let line = self.buffer[..position].trim_end_matches('\r').to_owned();
            self.buffer.drain(..=position);
            if line.is_empty() {
                if let Some(frame) = self.take_frame() {
                    frames.push(frame);
                }
            } else if let Some(event) = line.strip_prefix("event:") {
                self.event = Some(event.trim().to_owned());
            } else if let Some(data) = line.strip_prefix("data:") {
                self.data.push(data.trim_start().to_owned());
            }
        }
        Ok(frames)
    }

    fn finish(mut self) -> Vec<SseFrame> {
        if !self.buffer.trim().is_empty() {
            let line = self.buffer.trim_end_matches(['\r', '\n']).to_owned();
            if let Some(event) = line.strip_prefix("event:") {
                self.event = Some(event.trim().to_owned());
            } else if let Some(data) = line.strip_prefix("data:") {
                self.data.push(data.trim_start().to_owned());
            }
        }
        self.take_frame().into_iter().collect()
    }

    fn take_frame(&mut self) -> Option<SseFrame> {
        if self.event.is_none() && self.data.is_empty() {
            return None;
        }
        Some(SseFrame {
            event: self.event.take().unwrap_or_else(|| "message".into()),
            data: std::mem::take(&mut self.data).join("\n"),
        })
    }
}

struct PerplexityStreamState {
    model: String,
    call_names: std::collections::HashMap<String, String>,
    item_calls: std::collections::HashMap<String, String>,
}

impl PerplexityStreamState {
    fn new(model: String) -> Self {
        Self {
            model,
            call_names: std::collections::HashMap::new(),
            item_calls: std::collections::HashMap::new(),
        }
    }

    fn apply(&mut self, frame: &SseFrame) -> Vec<ModelStreamItem> {
        if frame.data == "[DONE]" {
            return Vec::new();
        }
        let value: Value = match serde_json::from_str(&frame.data) {
            Ok(value) => value,
            Err(error) => {
                return vec![ModelStreamItem::Failed(format!(
                    "Perplexity returned malformed stream JSON: {error}"
                ))];
            }
        };
        let event = if frame.event == "message" {
            value
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("message")
        } else {
            frame.event.as_str()
        };
        match event {
            "response.output_text.delta" => value
                .get("delta")
                .and_then(Value::as_str)
                .map(|delta| ModelStreamItem::MessageDelta(MessageDelta::text(delta)))
                .into_iter()
                .collect(),
            "response.output_item.added" => {
                let item = value.get("item").unwrap_or(&value);
                if item.get("type").and_then(Value::as_str) != Some("function_call") {
                    return Vec::new();
                }
                let call_id = item
                    .get("call_id")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                let item_id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or(&call_id)
                    .to_owned();
                let name = item
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                if call_id.is_empty() || name.is_empty() {
                    return vec![ModelStreamItem::Failed(
                        "Perplexity opened an invalid function call".into(),
                    )];
                }
                self.call_names.insert(call_id.clone(), name.clone());
                self.item_calls.insert(item_id, call_id.clone());
                vec![ModelStreamItem::ToolCallDelta(ToolDelta {
                    call_id,
                    content: String::new(),
                    tool_name: Some(name),
                })]
            }
            "response.function_call_arguments.delta" => {
                let call_id = value
                    .get("call_id")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .or_else(|| {
                        value
                            .get("item_id")
                            .and_then(Value::as_str)
                            .and_then(|item_id| self.item_calls.get(item_id).cloned())
                    })
                    .unwrap_or_default();
                let delta = value
                    .get("delta")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned();
                if call_id.is_empty() || !self.call_names.contains_key(&call_id) {
                    return vec![ModelStreamItem::Failed(
                        "Perplexity streamed arguments for an unknown function call".into(),
                    )];
                }
                vec![ModelStreamItem::ToolCallDelta(ToolDelta {
                    call_id,
                    content: delta,
                    tool_name: None,
                })]
            }
            "response.completed" => {
                let response = value.get("response").unwrap_or(&value);
                match parse_response_value(&self.model, response) {
                    Ok(response) => {
                        let mut items = Vec::new();
                        if let Some(usage) = response.usage {
                            items.push(ModelStreamItem::UsageDelta(usage));
                        }
                        items.push(ModelStreamItem::Completed(response));
                        items
                    }
                    Err(error) => vec![ModelStreamItem::Failed(error.to_string())],
                }
            }
            "response.failed" | "error" => {
                let error = value
                    .get("response")
                    .and_then(|response| response.get("error"))
                    .or_else(|| value.get("error"))
                    .unwrap_or(&value);
                vec![ModelStreamItem::ProviderFailed(ProviderError {
                    provider: "perplexity".into(),
                    model: Some(self.model.clone()),
                    status: None,
                    code: error
                        .get("code")
                        .or_else(|| error.get("type"))
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    message: error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("Perplexity stream failed")
                        .chars()
                        .take(1_000)
                        .collect(),
                    retryable: false,
                    retry_after_ms: None,
                    raw: Some(error.clone()),
                })]
            }
            _ => Vec::new(),
        }
    }
}

fn build_request_body(model: &str, request: &ModelRequest, stream: bool) -> TinyResult<Value> {
    compile_request(ProviderDialect::Perplexity, model, request, stream)
}
async fn parse_unary_response(model: &str, response: Response) -> TinyResult<ModelResponse> {
    if !response.status().is_success() {
        return Err(TinyAgentsError::Provider(Box::new(
            provider_http_error(model, response).await,
        )));
    }
    let body = read_limited_body(response, MAX_BODY_BYTES).await;
    let value: Value = serde_json::from_str(&body).map_err(|error| {
        TinyAgentsError::Model(format!("Perplexity returned malformed JSON: {error}"))
    })?;
    parse_response_value(model, &value)
}

fn parse_response_value(model: &str, value: &Value) -> TinyResult<ModelResponse> {
    if let Some(error) = value.get("error").filter(|error| !error.is_null()) {
        return Err(TinyAgentsError::Provider(Box::new(ProviderError {
            provider: "perplexity".into(),
            model: Some(model.into()),
            status: None,
            code: error.get("code").and_then(Value::as_str).map(str::to_owned),
            message: error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Perplexity response failed")
                .chars()
                .take(1_000)
                .collect(),
            retryable: false,
            retry_after_ms: None,
            raw: Some(error.clone()),
        })));
    }
    let mut text = String::new();
    let mut tool_calls = Vec::new();
    for item in value
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        match item.get("type").and_then(Value::as_str) {
            Some("message") => {
                for content in item
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if content.get("type").and_then(Value::as_str) == Some("output_text")
                        && let Some(fragment) = content.get("text").and_then(Value::as_str)
                    {
                        text.push_str(fragment);
                    }
                }
            }
            Some("function_call") => {
                let id = item
                    .get("call_id")
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        TinyAgentsError::Model(
                            "Perplexity function call omitted its call id".into(),
                        )
                    })?;
                let name = item
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        TinyAgentsError::Model("Perplexity function call omitted its name".into())
                    })?;
                let arguments = item
                    .get("arguments")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        TinyAgentsError::Model(
                            "Perplexity function call omitted its arguments".into(),
                        )
                    })?;
                let arguments: Value = serde_json::from_str(arguments).map_err(|_| {
                    TinyAgentsError::Model(
                        "Perplexity function call returned invalid JSON arguments".into(),
                    )
                })?;
                if !arguments.is_object() {
                    return Err(TinyAgentsError::Model(
                        "Perplexity function arguments must be a JSON object".into(),
                    ));
                }
                tool_calls.push(ToolCall::new(id, name, arguments));
            }
            _ => {}
        }
    }
    if text.is_empty()
        && let Some(output_text) = value.get("output_text").and_then(Value::as_str)
    {
        text.push_str(output_text);
    }
    if text.is_empty() && tool_calls.is_empty() {
        return Err(TinyAgentsError::Model(
            "Perplexity response contained no message or function call".into(),
        ));
    }
    let usage = parse_usage(value.get("usage"));
    let content = if text.is_empty() {
        Vec::new()
    } else {
        vec![ContentBlock::Text(text)]
    };
    Ok(ModelResponse {
        message: AssistantMessage {
            id: value.get("id").and_then(Value::as_str).map(str::to_owned),
            content,
            tool_calls,
            usage,
        },
        usage,
        finish_reason: value
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .or_else(|| Some("stop".into())),
        raw: Some(value.clone()),
        resolved_model: None,
        continue_turn: None,
        served_from_cache: false,
    })
}

fn parse_usage(value: Option<&Value>) -> Option<Usage> {
    let value = value?;
    let input_tokens = value
        .get("input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let output_tokens = value
        .get("output_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Some(Usage {
        input_tokens,
        output_tokens,
        total_tokens: value
            .get("total_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(input_tokens.saturating_add(output_tokens)),
        cache_read_tokens: value
            .pointer("/input_tokens_details/cache_read_tokens")
            .or_else(|| value.pointer("/input_tokens_details/cached_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_creation_tokens: value
            .pointer("/input_tokens_details/cache_creation_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reasoning_tokens: value
            .pointer("/output_tokens_details/reasoning_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

fn provider_transport_error(model: &str, error: reqwest::Error) -> TinyAgentsError {
    TinyAgentsError::Provider(Box::new(ProviderError {
        provider: "perplexity".into(),
        model: Some(model.into()),
        status: error.status().map(|status| status.as_u16()),
        code: None,
        message: error.to_string(),
        retryable: error.is_timeout() || error.is_connect(),
        retry_after_ms: None,
        raw: None,
    }))
}

async fn provider_http_error(model: &str, response: Response) -> ProviderError {
    let status = response.status();
    let retry_after_ms = retry_after_ms(response.headers());
    let body = read_limited_body(response, MAX_BODY_BYTES).await;
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
        .and_then(|value| {
            value
                .pointer("/error/code")
                .or_else(|| value.pointer("/error/type"))
        })
        .and_then(Value::as_str)
        .map(str::to_owned);
    ProviderError {
        provider: "perplexity".into(),
        model: Some(model.into()),
        status: Some(status.as_u16()),
        code,
        message,
        retryable: status == StatusCode::REQUEST_TIMEOUT
            || status == StatusCode::TOO_MANY_REQUESTS
            || status.is_server_error(),
        retry_after_ms,
        raw,
    }
}

fn retry_after_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    let value = headers.get(reqwest::header::RETRY_AFTER)?.to_str().ok()?;
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(seconds.saturating_mul(1_000));
    }
    let at = chrono::DateTime::parse_from_rfc2822(value).ok()?;
    let delay = at.with_timezone(&chrono::Utc) - chrono::Utc::now();
    Some(delay.num_milliseconds().max(0) as u64)
}

fn parse_model_catalog(value: &Value) -> AgentResult<HashSet<String>> {
    let entries = value.get("data").and_then(Value::as_array).ok_or_else(|| {
        AgentError::Validation("Perplexity model catalogue response is invalid".into())
    })?;
    let models = entries
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect::<HashSet<_>>();
    if models.is_empty() {
        return Err(AgentError::Validation(
            "Perplexity model catalogue is empty".into(),
        ));
    }
    Ok(models)
}

fn validate_catalog<'a>(
    catalog: &HashSet<String>,
    models: impl IntoIterator<Item = &'a str>,
) -> AgentResult<()> {
    for model in models {
        if !catalog.contains(model) {
            return Err(AgentError::Validation(format!(
                "Perplexity model is not available: {model}"
            )));
        }
    }
    Ok(())
}

async fn read_limited_body(response: reqwest::Response, limit: usize) -> String {
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
    use std::sync::Arc;

    use super::*;
    use async_trait::async_trait;
    use serde_json::json;
    use sqlx::postgres::PgPoolOptions;
    use tinyagents::harness::context::RunConfig;
    use tinyagents::harness::message::{ImageRef, Message, ToolMessage, UserMessage};
    use tinyagents::harness::model::{ResponseFormat, ToolChoice};
    use tinyagents::harness::runtime::AgentHarness;
    use tinyagents::harness::tool::{Tool, ToolPolicy, ToolResult, ToolSchema};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use crate::service::agents::{AgentActor, AgentMessageContext, AgentScope, AgentStore};
    use crate::service::db::Db;

    type MockHeaders = Vec<(&'static str, &'static str)>;
    type MockResponse = (u16, MockHeaders, String);

    struct SmokeLookup;

    #[async_trait]
    impl Tool<AgentRuntimeState> for SmokeLookup {
        fn name(&self) -> &str {
            "smoke_lookup"
        }

        fn description(&self) -> &str {
            "Returns one fixed read-only smoke value."
        }

        fn schema(&self) -> ToolSchema {
            ToolSchema::new(
                self.name(),
                self.description(),
                json!({"type":"object","properties":{},"additionalProperties":false}),
            )
        }

        fn policy(&self) -> ToolPolicy {
            ToolPolicy::read_only()
        }

        async fn call(
            &self,
            _state: &AgentRuntimeState,
            call: ToolCall,
        ) -> tinyagents::Result<ToolResult> {
            Ok(ToolResult::text(call.id, self.name(), "SMOKE_TOOL_OK"))
        }
    }

    fn runtime_state() -> AgentRuntimeState {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@127.0.0.1:1/unused")
            .unwrap();
        AgentRuntimeState {
            db: Arc::new(Db::from_pool(pool.clone())),
            store: AgentStore::new(pool),
            r2: None,
            knowledge: None,
            actor: AgentActor {
                user_id: "smoke-user".into(),
                clerk_id: "smoke-clerk".into(),
            },
            scope: AgentScope {
                workspace_id: "smoke-workspace".into(),
            },
            message_context: AgentMessageContext::default(),
            run_id: "smoke-run".into(),
            cancellation: tinyagents::CancellationToken::new(),
        }
    }

    async fn serve_http(
        responses: Vec<MockResponse>,
    ) -> (String, tokio::task::JoinHandle<Vec<String>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let mut requests = Vec::new();
            for (status, headers, body) in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                loop {
                    let mut chunk = [0u8; 4096];
                    let read = socket.read(&mut chunk).await.unwrap();
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..read]);
                    let text = String::from_utf8_lossy(&request);
                    let Some(header_end) = text.find("\r\n\r\n") else {
                        continue;
                    };
                    let content_length = text[..header_end]
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|value| value.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
                requests.push(String::from_utf8_lossy(&request).into_owned());
                let reason = if status == 200 {
                    "OK"
                } else if status == 429 {
                    "Too Many Requests"
                } else {
                    "Error"
                };
                let mut response = format!(
                    "HTTP/1.1 {status} {reason}\r\ncontent-length: {}\r\nconnection: close\r\n",
                    body.len()
                );
                for (name, value) in headers {
                    response.push_str(&format!("{name}: {value}\r\n"));
                }
                response.push_str("\r\n");
                response.push_str(&body);
                socket.write_all(response.as_bytes()).await.unwrap();
            }
            requests
        });
        (format!("http://{address}"), server)
    }

    #[test]
    fn model_catalog_is_deduplicated_and_requires_every_configured_id() {
        let catalog = parse_model_catalog(&json!({
            "object": "list",
            "data": [
                {"id": "openai/gpt-5.4", "object": "model", "owned_by": "openai"},
                {"id": "openai/gpt-5.4", "object": "model", "owned_by": "openai"},
                {"id": "openai/gpt-5.4-mini", "object": "model", "owned_by": "openai"}
            ]
        }))
        .unwrap();
        assert_eq!(catalog.len(), 2);
        assert!(validate_catalog(&catalog, ["openai/gpt-5.4"]).is_ok());
        assert!(
            validate_catalog(&catalog, ["anthropic/claude-sonnet-4-6"])
                .unwrap_err()
                .to_string()
                .contains("anthropic/claude-sonnet-4-6")
        );
    }

    #[test]
    fn request_preserves_tools_results_schema_and_images() {
        let request = ModelRequest {
            messages: vec![
                Message::system("Stay grounded."),
                Message::User(UserMessage {
                    content: vec![
                        ContentBlock::Text("Review this".into()),
                        ContentBlock::Image(ImageRef {
                            url: "data:image/png;base64,aGVsbG8=".into(),
                            mime_type: Some("image/png".into()),
                        }),
                    ],
                }),
                Message::Assistant(AssistantMessage {
                    id: None,
                    content: Vec::new(),
                    tool_calls: vec![ToolCall::new("call-1", "lookup", json!({"id": "trade-1"}))],
                    usage: None,
                }),
                Message::Tool(ToolMessage {
                    tool_call_id: "call-1".into(),
                    content: vec![ContentBlock::Text("done".into())],
                    trusted_verbatim: false,
                    artifact: Some(json!({"ok": true})),
                }),
            ],
            tools: vec![ToolSchema::new(
                "lookup",
                "Lookup an owned record",
                json!({
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                    "required": ["id"]
                }),
            )],
            tool_choice: ToolChoice::Tool("lookup".into()),
            response_format: Some(ResponseFormat::JsonSchema {
                name: "trade_answer".into(),
                schema: json!({
                    "type": "object",
                    "properties": {"ok": {"type": "boolean"}},
                    "required": ["ok"],
                    "additionalProperties": false
                }),
            }),
            ..Default::default()
        };

        let body = build_request_body("openai/gpt-5.4", &request, false).unwrap();
        assert_eq!(body["instructions"], "Stay grounded.");
        assert_eq!(body["input"][0]["content"][1]["type"], "input_image");
        assert_eq!(body["input"][1]["type"], "function_call");
        assert_eq!(body["input"][2]["type"], "function_call_output");
        assert_eq!(body["tools"][0]["name"], "lookup");
        assert_eq!(body["tool_choice"]["name"], "lookup");
        assert_eq!(
            body["response_format"]["json_schema"]["name"],
            "tradeanswer"
        );
        assert!(body.get("models").is_none());
    }

    #[test]
    fn provider_extensions_are_rejected_before_http() {
        let request = ModelRequest {
            messages: vec![Message::User(UserMessage {
                content: vec![ContentBlock::ProviderExtension(json!({
                    "gemini_file_data": {"mime_type": "video/mp4", "file_uri": "secret"}
                }))],
            })],
            ..Default::default()
        };
        assert!(build_request_body("openai/gpt-5.4", &request, false).is_err());
    }

    #[test]
    fn response_parses_text_function_calls_and_usage() {
        let response = parse_response_value(
            "openai/gpt-5.4",
            &json!({
                "id": "resp-1",
                "status": "completed",
                "model": "openai/gpt-5.4",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": "hello"}]},
                    {"type": "function_call", "call_id": "call-1", "name": "lookup", "arguments": "{\"id\":\"trade-1\"}"},
                    {"type": "search_results", "results": [{"url": "https://example.com"}]}
                ],
                "usage": {
                    "input_tokens": 4,
                    "output_tokens": 3,
                    "total_tokens": 7,
                    "input_tokens_details": {"cache_read_tokens": 2},
                    "output_tokens_details": {"reasoning_tokens": 1}
                }
            }),
        )
        .unwrap();
        assert_eq!(response.text(), "hello");
        assert_eq!(response.message.tool_calls[0].name, "lookup");
        assert_eq!(response.message.tool_calls[0].arguments["id"], "trade-1");
        assert_eq!(response.usage.unwrap().cache_read_tokens, 2);
        assert_eq!(response.usage.unwrap().reasoning_tokens, 1);
    }

    #[test]
    fn fragmented_sse_emits_text_tools_usage_and_authoritative_completion() {
        let mut parser = SseParser::default();
        assert!(
            parser
                .push("event: response.output_text.delta\r\ndata: {\"delta\":\"hel")
                .unwrap()
                .is_empty()
        );
        let mut frames = parser
            .push("lo\"}\r\n\r\nevent: response.output_item.added\ndata: {\"item\":{\"type\":\"function_call\",\"id\":\"fc-1\",\"call_id\":\"call-1\",\"name\":\"lookup\"}}\n\n")
            .unwrap();
        frames.extend(
            parser
                .push("data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc-1\",\"delta\":\"{\\\"id\\\":\\\"x\\\"}\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"hello\"}]},{\"type\":\"function_call\",\"call_id\":\"call-1\",\"name\":\"lookup\",\"arguments\":\"{\\\"id\\\":\\\"x\\\"}\"}],\"usage\":{\"input_tokens\":2,\"output_tokens\":1,\"total_tokens\":3}}}\n\n")
                .unwrap(),
        );

        let mut state = PerplexityStreamState::new("openai/gpt-5.4".into());
        let items = frames
            .iter()
            .flat_map(|frame| state.apply(frame))
            .collect::<Vec<_>>();
        assert!(matches!(
            &items[0],
            ModelStreamItem::MessageDelta(delta) if delta.text == "hello"
        ));
        assert!(items.iter().any(|item| matches!(
            item,
            ModelStreamItem::ToolCallDelta(delta)
                if delta.call_id == "call-1" && delta.tool_name.as_deref() == Some("lookup")
        )));
        assert!(items.iter().any(|item| matches!(
            item,
            ModelStreamItem::UsageDelta(usage) if usage.total_tokens == 3
        )));
        assert!(items.iter().any(|item| matches!(
            item,
            ModelStreamItem::Completed(response)
                if response.message.tool_calls[0].name == "lookup"
        )));
    }

    #[tokio::test]
    async fn catalogue_and_unary_calls_use_the_authenticated_http_boundary() {
        let (base_url, server) = serve_http(vec![
            (
                200,
                vec![("content-type", "application/json")],
                json!({"object":"list","data":[{"id":"openai/gpt-5.4"}]}).to_string(),
            ),
            (
                200,
                vec![("content-type", "application/json")],
                json!({
                    "id":"resp-1",
                    "status":"completed",
                    "output":[{"type":"message","content":[{"type":"output_text","text":"ok"}]}],
                    "usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}
                })
                .to_string(),
            ),
        ])
        .await;
        let provider = PerplexityProvider::at("secret-key", &base_url).unwrap();
        provider.validate_models(["openai/gpt-5.4"]).await.unwrap();
        let model = provider.model("openai/gpt-5.4").unwrap();
        let response = model
            .send_unary(ModelRequest {
                messages: vec![Message::user("ping")],
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(response.text(), "ok");

        let requests = server.await.unwrap();
        assert!(requests[0].starts_with("GET /models HTTP/1.1"));
        assert!(requests[1].starts_with("POST /agent HTTP/1.1"));
        assert!(
            requests
                .iter()
                .all(|request| request.contains("authorization: Bearer secret-key"))
        );
        assert!(requests[1].contains("\"model\":\"openai/gpt-5.4\""));
        assert!(!requests[1].contains("web_search"));
    }

    #[tokio::test]
    async fn rate_limit_preserves_retry_after_for_tinyagents_fallback() {
        let (base_url, server) = serve_http(vec![(
            429,
            vec![("content-type", "application/json"), ("retry-after", "3")],
            json!({"error":{"code":"rate_limit","message":"slow down"}}).to_string(),
        )])
        .await;
        let model = PerplexityProvider::at("secret-key", &base_url)
            .unwrap()
            .model("openai/gpt-5.4")
            .unwrap();
        let error = model
            .send_unary(ModelRequest {
                messages: vec![Message::user("ping")],
                ..Default::default()
            })
            .await
            .unwrap_err();
        let TinyAgentsError::Provider(error) = error else {
            panic!("expected provider error")
        };
        assert_eq!(error.status, Some(429));
        assert!(error.retryable);
        assert_eq!(error.retry_after_ms, Some(3_000));
        assert_eq!(error.code.as_deref(), Some("rate_limit"));
        server.await.unwrap();
    }

    #[tokio::test]
    async fn streaming_http_boundary_emits_real_incremental_events() {
        let stream_body = concat!(
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"ok\"}]}],\"usage\":{\"input_tokens\":1,\"output_tokens\":1,\"total_tokens\":2}}}\n\n"
        );
        let (base_url, server) = serve_http(vec![(
            200,
            vec![("content-type", "text/event-stream")],
            stream_body.into(),
        )])
        .await;
        let model = PerplexityProvider::at("secret-key", &base_url)
            .unwrap()
            .model("openai/gpt-5.4")
            .unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        model
            .drive_stream(
                ModelRequest {
                    messages: vec![Message::user("ping")],
                    ..Default::default()
                },
                tx,
            )
            .await;
        let mut items = Vec::new();
        while let Ok(item) = rx.try_recv() {
            items.push(item);
        }
        assert!(matches!(items[0], ModelStreamItem::Started));
        assert!(matches!(
            &items[1],
            ModelStreamItem::MessageDelta(delta) if delta.text == "ok"
        ));
        assert!(items.iter().any(|item| matches!(
            item,
            ModelStreamItem::Completed(response) if response.text() == "ok"
        )));
        let requests = server.await.unwrap();
        assert!(requests[0].contains("\"stream\":true"));
    }

    #[tokio::test]
    async fn tinyagents_loop_round_trips_a_local_function_call() {
        let (base_url, server) = serve_http(vec![
            (
                200,
                vec![("content-type", "application/json")],
                json!({
                    "id":"resp-tool",
                    "status":"completed",
                    "output":[{"type":"function_call","call_id":"call-smoke","name":"smoke_lookup","arguments":"{}"}],
                    "usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}
                })
                .to_string(),
            ),
            (
                200,
                vec![("content-type", "application/json")],
                json!({
                    "id":"resp-final",
                    "status":"completed",
                    "output":[{"type":"message","content":[{"type":"output_text","text":"SMOKE_FINAL_OK"}]}],
                    "usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4}
                })
                .to_string(),
            ),
        ])
        .await;
        let model = PerplexityProvider::at("secret-key", &base_url)
            .unwrap()
            .model("openai/gpt-5.4")
            .unwrap();
        let mut harness = AgentHarness::new();
        harness
            .register_model("perplexity", Arc::new(model))
            .set_default_model("perplexity")
            .register_tool(Arc::new(SmokeLookup));
        let result = harness
            .invoke(
                &runtime_state(),
                (),
                RunConfig::new("smoke-run")
                    .with_max_model_calls(2)
                    .with_max_tool_calls(1),
                vec![Message::user(
                    "Use smoke_lookup, then return SMOKE_FINAL_OK",
                )],
            )
            .await
            .unwrap();
        assert_eq!(result.text().as_deref(), Some("SMOKE_FINAL_OK"));
        let requests = server.await.unwrap();
        assert!(requests[1].contains("function_call_output"));
        assert!(requests[1].contains("SMOKE_TOOL_OK"));
        assert!(!requests[1].contains("web_search"));
    }
}
