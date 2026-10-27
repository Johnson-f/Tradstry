//! The only place that talks to the Stytch API. Everything else depends on the
//! [`StytchApi`] trait, so the `stytch` crate can be swapped without touching
//! callers and tests can use a fake.

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};

const TEST_API: &str = "https://test.stytch.com";
const LIVE_API: &str = "https://api.stytch.com";

/// Stytch serves `project-test-*` projects from a separate host. `api_url`
/// overrides the choice, for a local fake or a regional endpoint.
pub fn api_base(project_id: &str, api_url: Option<&str>) -> String {
    match api_url.filter(|url| !url.is_empty()) {
        Some(url) => url.trim_end_matches('/').to_owned(),
        None if project_id.starts_with("project-test-") => TEST_API.to_owned(),
        None => LIVE_API.to_owned(),
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Session {
    pub session_id: String,
    pub started_at: Option<DateTime<Utc>>,
    pub last_accessed_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum StytchError {
    #[error("stytch returned {status} {error_type}: {message}")]
    Api {
        status: u16,
        error_type: String,
        message: String,
    },
    #[error("stytch request failed: {0}")]
    Transport(String),
}

impl StytchError {
    pub fn is_not_found(&self) -> bool {
        matches!(self, Self::Api { status: 404, .. })
    }
}

impl From<::stytch::Error> for StytchError {
    fn from(error: ::stytch::Error) -> Self {
        match error {
            ::stytch::Error::Response(response) => Self::Api {
                status: response.status_code.as_u16(),
                error_type: response.error_type,
                message: response.error_message,
            },
            other => Self::Transport(other.to_string()),
        }
    }
}

#[async_trait]
pub trait StytchApi: Send + Sync {
    async fn list_sessions(&self, user_id: &str) -> Result<Vec<Session>, StytchError>;
    async fn revoke_session(&self, session_id: &str) -> Result<(), StytchError>;
    /// Succeeds when the user is already gone, so retries are safe.
    async fn delete_user(&self, user_id: &str) -> Result<(), StytchError>;
}

pub struct StytchClient {
    client: ::stytch::consumer::client::Client,
}

impl StytchClient {
    pub fn new(project_id: &str, secret: &str, api_url: Option<&str>) -> Result<Self> {
        let client = match api_url.filter(|url| !url.is_empty()) {
            None => ::stytch::consumer::client::Client::new(project_id, secret)
                .context("build the Stytch client")?,
            Some(url) => {
                let base = reqwest::Url::parse(&format!("{}/", api_base(project_id, Some(url))))
                    .context("STYTCH_API_URL must be a URL")?;
                let http = ::stytch::client::Client::new_with_base_url(
                    project_id,
                    secret,
                    base,
                    ::stytch::client::Vertical::Consumer,
                )
                .context("build the Stytch client")?;
                let fraud = ::stytch::client::Client::new_fraud(project_id, secret)
                    .context("build the Stytch fraud client")?;
                ::stytch::consumer::client::Client::new_with_http_client(http, fraud)
            }
        };
        Ok(Self { client })
    }
}

#[async_trait]
impl StytchApi for StytchClient {
    async fn list_sessions(&self, user_id: &str) -> Result<Vec<Session>, StytchError> {
        let response = self
            .client
            .sessions
            .get(::stytch::consumer::sessions::GetRequest {
                user_id: user_id.to_owned(),
            })
            .await?;
        Ok(response
            .sessions
            .into_iter()
            .map(|session| {
                let attributes = session.attributes.unwrap_or_default();
                Session {
                    session_id: session.session_id,
                    started_at: session.started_at,
                    last_accessed_at: session.last_accessed_at,
                    expires_at: session.expires_at,
                    ip_address: attributes.ip_address.filter(|ip| !ip.is_empty()),
                    user_agent: attributes.user_agent.filter(|agent| !agent.is_empty()),
                }
            })
            .collect())
    }

    async fn revoke_session(&self, session_id: &str) -> Result<(), StytchError> {
        self.client
            .sessions
            .revoke(::stytch::consumer::sessions::RevokeRequest {
                session_id: Some(session_id.to_owned()),
                session_token: None,
                session_jwt: None,
            })
            .await?;
        Ok(())
    }

    async fn delete_user(&self, user_id: &str) -> Result<(), StytchError> {
        let request = ::stytch::consumer::users::DeleteRequest {
            user_id: user_id.to_owned(),
        };
        match self
            .client
            .users
            .delete(request)
            .await
            .map_err(StytchError::from)
        {
            Ok(_) => Ok(()),
            Err(error) if error.is_not_found() => Ok(()),
            Err(error) => Err(error),
        }
    }
}

/// An in-memory Stytch for tests. Never wire it into a running server.
#[doc(hidden)]
pub mod fake {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    pub struct FakeStytch {
        sessions: Mutex<HashMap<String, Vec<Session>>>,
        revoked: Mutex<Vec<String>>,
    }

    impl FakeStytch {
        pub fn with_sessions(user_id: &str, session_ids: &[&str]) -> Self {
            let sessions = session_ids
                .iter()
                .map(|id| Session {
                    session_id: (*id).to_owned(),
                    started_at: None,
                    last_accessed_at: None,
                    expires_at: None,
                    ip_address: Some("203.0.113.7".to_owned()),
                    user_agent: Some("Firefox".to_owned()),
                })
                .collect();
            Self {
                sessions: Mutex::new(HashMap::from([(user_id.to_owned(), sessions)])),
                revoked: Mutex::default(),
            }
        }

        pub fn revoked(&self) -> Vec<String> {
            self.revoked.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl StytchApi for FakeStytch {
        async fn list_sessions(&self, user_id: &str) -> Result<Vec<Session>, StytchError> {
            let revoked = self.revoked();
            Ok(self
                .sessions
                .lock()
                .unwrap()
                .get(user_id)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter(|session| !revoked.contains(&session.session_id))
                .collect())
        }

        async fn revoke_session(&self, session_id: &str) -> Result<(), StytchError> {
            self.revoked.lock().unwrap().push(session_id.to_owned());
            Ok(())
        }

        async fn delete_user(&self, user_id: &str) -> Result<(), StytchError> {
            self.sessions.lock().unwrap().remove(user_id);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_host_from_the_project_id() {
        assert_eq!(api_base("project-test-1", None), TEST_API);
        assert_eq!(api_base("project-live-1", None), LIVE_API);
        assert_eq!(
            api_base("project-live-1", Some("http://localhost:9/")),
            "http://localhost:9"
        );
    }

    #[test]
    fn api_errors_keep_their_status() {
        let error = StytchError::Api {
            status: 404,
            error_type: "user_not_found".into(),
            message: "gone".into(),
        };
        assert!(error.is_not_found());
        assert!(!StytchError::Transport("timeout".into()).is_not_found());
    }
}
