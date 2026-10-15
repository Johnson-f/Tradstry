use anyhow::{Context, Result};
use reqwest::{Method, StatusCode, Url};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};

use super::api_base;

#[derive(Debug, thiserror::Error)]
pub enum StytchError {
    #[error("stytch request failed: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("stytch returned {status} {error_type}: {message}")]
    Api {
        status: u16,
        error_type: String,
        message: String,
    },
}

impl StytchError {
    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Api { status, .. } => Some(*status),
            Self::Transport(_) => None,
        }
    }

    pub fn is_not_found(&self) -> bool {
        self.status() == Some(StatusCode::NOT_FOUND.as_u16())
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    #[serde(default)]
    error_type: String,
    #[serde(default)]
    error_message: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct SessionAttributes {
    #[serde(default)]
    pub ip_address: String,
    #[serde(default)]
    pub user_agent: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Session {
    pub session_id: String,
    #[serde(default)]
    pub user_id: String,
    pub started_at: String,
    pub last_accessed_at: String,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub attributes: SessionAttributes,
}

#[derive(Deserialize)]
struct SessionsResponse {
    sessions: Vec<Session>,
}

#[derive(Clone)]
pub struct StytchClient {
    http: reqwest::Client,
    base: Url,
    project_id: String,
    secret: String,
}

impl StytchClient {
    pub fn new(project_id: &str, secret: &str, api_url: Option<&str>) -> Result<Self> {
        let base = Url::parse(&api_base(project_id, api_url)).context("invalid Stytch API URL")?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .context("build the Stytch HTTP client")?;
        Ok(Self {
            http,
            base,
            project_id: project_id.to_owned(),
            secret: secret.to_owned(),
        })
    }

    pub fn from_env() -> Result<Self> {
        let project_id = required_env("STYTCH_PROJECT_ID")?;
        let secret = required_env("STYTCH_SECRET")?;
        let api_url = std::env::var("STYTCH_API_URL").ok();
        Self::new(&project_id, &secret, api_url.as_deref())
    }

    pub async fn delete_user(&self, user_id: &str) -> Result<(), StytchError> {
        self.send::<Value>(Method::DELETE, &["v1", "users", user_id], None, None)
            .await
            .map(drop)
    }

    pub async fn list_sessions(&self, user_id: &str) -> Result<Vec<Session>, StytchError> {
        let response: SessionsResponse = self
            .send(
                Method::GET,
                &["v1", "sessions"],
                Some(("user_id", user_id)),
                None,
            )
            .await?;
        Ok(response.sessions)
    }

    pub async fn revoke_session(&self, session_id: &str) -> Result<(), StytchError> {
        self.send::<Value>(
            Method::POST,
            &["v1", "sessions", "revoke"],
            None,
            Some(json!({ "session_id": session_id })),
        )
        .await
        .map(drop)
    }

    async fn send<T: DeserializeOwned>(
        &self,
        method: Method,
        segments: &[&str],
        query: Option<(&str, &str)>,
        body: Option<Value>,
    ) -> Result<T, StytchError> {
        let mut url = self.base.clone();
        url.path_segments_mut()
            .expect("the Stytch API URL is a base URL")
            .pop_if_empty()
            .extend(segments);
        if let Some((key, value)) = query {
            url.query_pairs_mut().append_pair(key, value);
        }

        let mut request = self
            .http
            .request(method, url)
            .basic_auth(&self.project_id, Some(&self.secret));
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await?;
        let status = response.status();
        if status.is_success() {
            return Ok(response.json().await?);
        }

        let text = response.text().await.unwrap_or_default();
        let parsed = serde_json::from_str::<ErrorBody>(&text).ok();
        Err(StytchError::Api {
            status: status.as_u16(),
            error_type: parsed
                .as_ref()
                .map(|body| body.error_type.clone())
                .unwrap_or_default(),
            message: parsed.map_or(text, |body| body.error_message),
        })
    }
}

fn required_env(name: &str) -> Result<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .with_context(|| format!("{name} must be set"))
}
