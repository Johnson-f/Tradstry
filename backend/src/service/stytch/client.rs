use anyhow::{Context, Result};
use reqwest::{Method, StatusCode, Url};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
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

    pub fn error_type(&self) -> Option<&str> {
        match self {
            Self::Api { error_type, .. } => Some(error_type),
            Self::Transport(_) => None,
        }
    }

    pub fn is_not_found(&self) -> bool {
        self.status() == Some(StatusCode::NOT_FOUND.as_u16())
    }

    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Transport(_) => true,
            Self::Api { status, .. } => *status == 429 || *status >= 500,
        }
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

#[derive(Clone, Debug, Default, Serialize)]
pub struct PersonName {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub first_name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub last_name: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct MigratePassword {
    pub email: String,
    pub hash: String,
    pub hash_type: String,
    pub external_id: String,
    pub name: PersonName,
    pub set_email_verified: bool,
    pub trusted_metadata: Value,
}

#[derive(Clone, Debug, Serialize)]
pub struct CreateUser {
    pub email: String,
    pub external_id: String,
    pub name: PersonName,
    pub trusted_metadata: Value,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StytchUser {
    pub user_id: String,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub emails: Vec<StytchEmail>,
}

impl StytchUser {
    pub fn has_verified_email(&self, email: &str) -> bool {
        self.emails
            .iter()
            .any(|item| item.verified && item.email.eq_ignore_ascii_case(email))
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct StytchEmail {
    pub email: String,
    #[serde(default)]
    pub verified: bool,
}

#[derive(Deserialize)]
struct SearchUsersResponse {
    results: Vec<StytchUser>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MigrateResponse {
    pub user_id: String,
    #[serde(default)]
    pub user_created: bool,
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

    /// `None` when `STYTCH_PROJECT_ID` is unset, so Stytch is not configured.
    pub fn from_env() -> Result<Option<Self>> {
        let Some(project_id) = std::env::var("STYTCH_PROJECT_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
        else {
            return Ok(None);
        };
        let secret = std::env::var("STYTCH_SECRET")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .context("STYTCH_SECRET must be set when STYTCH_PROJECT_ID is")?;
        let api_url = std::env::var("STYTCH_API_URL").ok();
        Self::new(project_id.trim(), secret.trim(), api_url.as_deref()).map(Some)
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

    pub async fn migrate_password(
        &self,
        request: &MigratePassword,
    ) -> Result<MigrateResponse, StytchError> {
        self.send(
            Method::POST,
            &["v1", "passwords", "migrate"],
            None,
            Some(json!(request)),
        )
        .await
    }

    pub async fn create_user(&self, request: &CreateUser) -> Result<StytchUser, StytchError> {
        self.send(Method::POST, &["v1", "users"], None, Some(json!(request)))
            .await
    }

    /// Accepts a Stytch user ID or an external ID.
    pub async fn get_user(&self, id: &str) -> Result<StytchUser, StytchError> {
        self.send(Method::GET, &["v1", "users", id], None, None)
            .await
    }

    pub async fn find_user_by_email(&self, email: &str) -> Result<Option<StytchUser>, StytchError> {
        let query = json!({
            "limit": 1,
            "query": {
                "operator": "AND",
                "operands": [{ "filter_name": "email_address", "filter_value": [email] }],
            },
        });
        let response: SearchUsersResponse = self
            .send(Method::POST, &["v1", "users", "search"], None, Some(query))
            .await?;
        Ok(response.results.into_iter().next())
    }

    pub async fn set_external_id(
        &self,
        user_id: &str,
        external_id: &str,
    ) -> Result<(), StytchError> {
        self.send::<Value>(
            Method::PUT,
            &["v1", "users", user_id],
            None,
            Some(json!({ "external_id": external_id })),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_verified_matching_email_counts() {
        let user: StytchUser = serde_json::from_value(json!({
            "user_id": "user-test-1",
            "external_id": "",
            "emails": [
                { "email": "Ada@Example.com", "verified": true },
                { "email": "other@example.com", "verified": false },
            ],
        }))
        .unwrap();
        assert!(user.has_verified_email("ada@example.com"));
        assert!(!user.has_verified_email("other@example.com"));
        assert!(!user.has_verified_email("missing@example.com"));
    }
}
