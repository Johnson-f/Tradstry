use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use reqwest::Client as HttpClient;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

const DEFAULT_BASE_URL: &str = "https://api.voyageai.com/v1";
const DEFAULT_EMBEDDING_MODEL: &str = "voyage-3.5";
const DEFAULT_OUTPUT_DIMENSION: u32 = 2048;
const DEFAULT_RERANKER_MODEL: &str = "rerank-2.5";
const DEFAULT_TIMEOUT_SECS: u64 = 30;
const DEFAULT_RPM: u32 = 2000;
const DEFAULT_TPM: u32 = 8_000_000;
const MAX_ATTEMPTS: u32 = 3;

#[derive(Clone, Debug)]
pub struct VoyageConfig {
    pub api_key: String,
    pub base_url: String,
    pub embedding_model: String,
    pub output_dimension: u32,
    pub reranker_model: String,
    pub timeout_secs: u64,
    pub rpm: u32,
    pub tpm: u32,
}

impl VoyageConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            api_key: required_env("VOYAGE_API_KEY")?,
            base_url: optional_env("VOYAGE_BASE_URL").unwrap_or_else(|| DEFAULT_BASE_URL.into()),
            embedding_model: optional_env("VOYAGE_EMBEDDING_MODEL")
                .unwrap_or_else(|| DEFAULT_EMBEDDING_MODEL.into()),
            output_dimension: optional_env_parse("VOYAGE_OUTPUT_DIMENSION")?
                .unwrap_or(DEFAULT_OUTPUT_DIMENSION),
            reranker_model: optional_env("VOYAGE_RERANKER_MODEL")
                .unwrap_or_else(|| DEFAULT_RERANKER_MODEL.into()),
            timeout_secs: optional_env_parse("VOYAGE_TIMEOUT_SECS")?
                .unwrap_or(DEFAULT_TIMEOUT_SECS),
            rpm: optional_env_parse("VOYAGE_RPM")?.unwrap_or(DEFAULT_RPM),
            tpm: optional_env_parse("VOYAGE_TPM")?.unwrap_or(DEFAULT_TPM),
        })
    }
}

#[derive(Clone)]
struct RateLimiter {
    inner: Arc<Mutex<RateLimiterState>>,
}

struct RateLimiterState {
    rpm: u32,
    tpm: u32,
    requests: VecDeque<Instant>,
    tokens: VecDeque<(Instant, u32)>,
}

impl RateLimiter {
    fn new(rpm: u32, tpm: u32) -> Self {
        Self {
            inner: Arc::new(Mutex::new(RateLimiterState {
                rpm: rpm.max(1),
                tpm: tpm.max(1),
                requests: VecDeque::new(),
                tokens: VecDeque::new(),
            })),
        }
    }

    async fn acquire(&self, estimated_tokens: u32) {
        let window = Duration::from_secs(60);
        loop {
            let sleep_for = {
                let mut state = self.inner.lock().await;
                let now = Instant::now();
                while state
                    .requests
                    .front()
                    .is_some_and(|time| now.duration_since(*time) >= window)
                {
                    state.requests.pop_front();
                }
                while state
                    .tokens
                    .front()
                    .is_some_and(|(time, _)| now.duration_since(*time) >= window)
                {
                    state.tokens.pop_front();
                }
                let request_count = state.requests.len() as u32;
                let token_count: u32 = state.tokens.iter().map(|(_, count)| *count).sum();
                let estimate = estimated_tokens.clamp(1, state.tpm);
                if request_count < state.rpm && token_count + estimate <= state.tpm {
                    state.requests.push_back(now);
                    state.tokens.push_back((now, estimate));
                    return;
                }
                let mut wait = Duration::from_millis(250);
                if request_count >= state.rpm
                    && let Some(time) = state.requests.front()
                {
                    wait = wait.max(window.saturating_sub(now.duration_since(*time)));
                }
                if token_count + estimate > state.tpm
                    && let Some((time, _)) = state.tokens.front()
                {
                    wait = wait.max(window.saturating_sub(now.duration_since(*time)));
                }
                wait + Duration::from_millis(50)
            };
            tokio::time::sleep(sleep_for).await;
        }
    }
}

#[derive(Clone)]
pub struct VoyageClient {
    http: HttpClient,
    config: VoyageConfig,
    rate_limiter: RateLimiter,
}

impl VoyageClient {
    pub fn from_env() -> Result<Self> {
        Self::new(VoyageConfig::from_env()?)
    }

    pub fn new(config: VoyageConfig) -> Result<Self> {
        if config.api_key.trim().is_empty()
            || config.base_url.trim().is_empty()
            || config.embedding_model.trim().is_empty()
            || config.reranker_model.trim().is_empty()
            || config.output_dimension == 0
        {
            return Err(anyhow!(
                "Voyage configuration must be non-blank and non-zero"
            ));
        }
        let http = HttpClient::builder()
            .timeout(Duration::from_secs(config.timeout_secs.max(1)))
            .build()
            .context("Failed to create Voyage HTTP client")?;
        let rate_limiter = RateLimiter::new(config.rpm, config.tpm);
        Ok(Self {
            http,
            config,
            rate_limiter,
        })
    }

    pub fn config(&self) -> &VoyageConfig {
        &self.config
    }

    pub async fn embed_text(
        &self,
        input: impl Into<String>,
        input_type: Option<&str>,
    ) -> Result<Vec<f32>> {
        self.embed_texts([input.into()], input_type)
            .await?
            .pop()
            .ok_or_else(|| anyhow!("Voyage returned no embedding for the requested input"))
    }

    pub async fn embed_texts<I, S>(
        &self,
        inputs: I,
        input_type: Option<&str>,
    ) -> Result<Vec<Vec<f32>>>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let input = inputs.into_iter().map(Into::into).collect::<Vec<_>>();
        let estimated_tokens = input
            .iter()
            .map(|value| (value.chars().count() / 4).max(1) as u32)
            .sum::<u32>()
            .max(1);
        self.rate_limiter.acquire(estimated_tokens).await;
        let payload = EmbeddingsRequest {
            model: self.config.embedding_model.clone(),
            input,
            input_type: input_type.map(str::to_owned),
            output_dimension: self.config.output_dimension,
            output_dtype: "float".into(),
        };
        let response = self
            .send_with_retry("embeddings", &payload)
            .await?
            .json::<EmbeddingsResponse>()
            .await
            .context("Failed to deserialize Voyage embeddings response")?;
        Ok(response
            .data
            .into_iter()
            .map(|item| item.embedding)
            .collect())
    }

    pub async fn rerank(
        &self,
        query: impl Into<String>,
        documents: Vec<String>,
        top_k: Option<u32>,
    ) -> Result<Vec<VoyageRerankResult>> {
        let payload = RerankRequest {
            model: self.config.reranker_model.clone(),
            query: query.into(),
            documents,
            top_k,
        };
        let response = self
            .send_with_retry("rerank", &payload)
            .await?
            .json::<RerankResponse>()
            .await
            .context("Failed to deserialize Voyage rerank response")?;
        Ok(response.data)
    }

    async fn send_with_retry<T: Serialize + ?Sized>(
        &self,
        operation: &str,
        payload: &T,
    ) -> Result<reqwest::Response> {
        let url = format!("{}/{operation}", self.config.base_url.trim_end_matches('/'));
        for attempt in 1..=MAX_ATTEMPTS {
            match self
                .http
                .post(&url)
                .bearer_auth(&self.config.api_key)
                .json(payload)
                .send()
                .await
            {
                Ok(response) if response.status().is_success() => return Ok(response),
                Ok(response) => {
                    let status = response.status();
                    let retry_after = response
                        .headers()
                        .get(reqwest::header::RETRY_AFTER)
                        .and_then(|value| value.to_str().ok())
                        .and_then(|value| value.parse::<u64>().ok())
                        .map(Duration::from_secs);
                    let retryable = status.as_u16() == 429 || status.is_server_error();
                    let body = response.text().await.unwrap_or_default();
                    if !retryable || attempt == MAX_ATTEMPTS {
                        return Err(anyhow!("Voyage {operation} API returned {status}: {body}"));
                    }
                    tokio::time::sleep(retry_after.unwrap_or_else(|| backoff_for_attempt(attempt)))
                        .await;
                }
                Err(error) if attempt < MAX_ATTEMPTS => {
                    log::warn!("Voyage {operation} request failed on attempt {attempt}: {error}");
                    tokio::time::sleep(backoff_for_attempt(attempt)).await;
                }
                Err(error) => {
                    return Err(anyhow::Error::new(error).context(format!(
                        "Failed to call Voyage {operation} API after retries"
                    )));
                }
            }
        }
        Err(anyhow!("Voyage {operation} request exhausted retries"))
    }
}

fn backoff_for_attempt(attempt: u32) -> Duration {
    Duration::from_millis(300 * 2u64.pow(attempt.saturating_sub(1)))
}

#[derive(Debug, Serialize)]
struct EmbeddingsRequest {
    model: String,
    input: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_type: Option<String>,
    output_dimension: u32,
    output_dtype: String,
}

#[derive(Debug, Deserialize)]
struct EmbeddingsResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

#[derive(Debug, Serialize)]
struct RerankRequest {
    model: String,
    query: String,
    documents: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct RerankResponse {
    data: Vec<VoyageRerankResult>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct VoyageRerankResult {
    pub index: usize,
    pub relevance_score: f32,
}

fn required_env(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("{name} environment variable not set"))
}

fn optional_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn optional_env_parse<T>(name: &str) -> Result<Option<T>>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    optional_env(name)
        .map(|value| {
            value
                .parse::<T>()
                .with_context(|| format!("{name} has an invalid value"))
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn config() -> VoyageConfig {
        VoyageConfig {
            api_key: "secret".into(),
            base_url: "http://127.0.0.1:1".into(),
            embedding_model: "embed".into(),
            output_dimension: 3,
            reranker_model: "rerank".into(),
            timeout_secs: 1,
            rpm: 100,
            tpm: 1000,
        }
    }

    #[test]
    fn rejects_empty_or_zero_configuration() {
        let mut value = config();
        value.output_dimension = 0;
        assert!(VoyageClient::new(value).is_err());
    }

    #[tokio::test]
    async fn embedding_and_rerank_use_the_voyage_http_boundary() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let responses = [
                r#"{"data":[{"embedding":[1.0,2.0,3.0]}]}"#,
                r#"{"data":[{"index":0,"relevance_score":0.9}]}"#,
            ];
            let mut paths = Vec::new();
            for body in responses {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = vec![0u8; 4096];
                let read = socket.read(&mut request).await.unwrap();
                let request = String::from_utf8_lossy(&request[..read]);
                paths.push(request.lines().next().unwrap_or_default().to_owned());
                let response = format!(
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                socket.write_all(response.as_bytes()).await.unwrap();
            }
            paths
        });
        let mut value = config();
        value.base_url = format!("http://{address}");
        let client = VoyageClient::new(value).unwrap();

        assert_eq!(
            client.embed_text("journal", Some("query")).await.unwrap(),
            [1.0, 2.0, 3.0]
        );
        let reranked = client
            .rerank("discipline", vec!["waited".into()], Some(1))
            .await
            .unwrap();
        assert_eq!(reranked[0].index, 0);
        assert_eq!(
            server.await.unwrap(),
            ["POST /embeddings HTTP/1.1", "POST /rerank HTTP/1.1"]
        );
    }
}
