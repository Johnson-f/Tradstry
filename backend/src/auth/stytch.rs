//! The only place that talks to the Stytch API. Everything else depends on the
//! [`StytchApi`] trait, so the `stytch` crate can be swapped without touching
//! callers and tests can use a fake.

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};

use super::verifier::{AuthError, SessionAuthenticator};

const TEST_API: &str = "https://test.stytch.com";
const LIVE_API: &str = "https://api.stytch.com";
const STYTCH_DEFAULT_ROLE: &str = "stytch_user";

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
    /// Adds a role without removing existing roles; already having it succeeds.
    async fn assign_role(&self, user_id: &str, role: &str) -> Result<(), StytchError>;
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
impl SessionAuthenticator for StytchClient {
    async fn authenticate_session_jwt(&self, jwt: &str) -> Result<String, AuthError> {
        let response = self
            .client
            .sessions
            .authenticate(::stytch::consumer::sessions::AuthenticateRequest {
                session_jwt: Some(jwt.to_owned()),
                ..Default::default()
            })
            .await
            .map_err(StytchError::from);
        match response {
            Ok(response) => Ok(response.session_jwt),
            Err(StytchError::Api {
                status, error_type, ..
            }) if status < 500 => Err(AuthError::Unauthorized(format!(
                "Error: Invalid JWT! Stytch did not accept the session: {error_type}"
            ))),
            Err(error) => Err(AuthError::Unavailable(format!(
                "Error: Could not reach Stytch: {error}"
            ))),
        }
    }
}

#[async_trait]
impl StytchApi for StytchClient {
    async fn assign_role(&self, user_id: &str, role: &str) -> Result<(), StytchError> {
        let mut roles = self
            .client
            .users
            .get(::stytch::consumer::users::GetRequest {
                user_id: user_id.to_owned(),
            })
            .await?
            .roles;
        if roles.iter().any(|existing| existing == role) {
            return Ok(());
        }
        // Stytch lists its default role on every user but rejects updates that name it.
        roles.retain(|existing| existing != STYTCH_DEFAULT_ROLE);
        roles.push(role.to_owned());
        self.client
            .users
            .update(::stytch::consumer::users::UpdateRequest {
                user_id: user_id.to_owned(),
                roles: Some(roles),
                ..Default::default()
            })
            .await?;
        Ok(())
    }

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
    use std::{collections::HashMap, sync::Mutex};

    use super::*;

    #[derive(Default)]
    pub struct FakeStytch {
        sessions: Mutex<HashMap<String, Vec<Session>>>,
        assigned_roles: Mutex<Vec<(String, String)>>,
        revoked: Mutex<Vec<String>>,
        deleted_users: Mutex<Vec<String>>,
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
                assigned_roles: Mutex::default(),
                revoked: Mutex::default(),
                deleted_users: Mutex::default(),
            }
        }

        pub fn revoked(&self) -> Vec<String> {
            self.revoked.lock().unwrap().clone()
        }

        pub fn assigned_roles(&self) -> Vec<(String, String)> {
            self.assigned_roles.lock().unwrap().clone()
        }

        pub fn deleted_users(&self) -> Vec<String> {
            self.deleted_users.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl StytchApi for FakeStytch {
        async fn assign_role(&self, user_id: &str, role: &str) -> Result<(), StytchError> {
            self.assigned_roles
                .lock()
                .unwrap()
                .push((user_id.to_owned(), role.to_owned()));
            Ok(())
        }

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
            self.deleted_users.lock().unwrap().push(user_id.to_owned());
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
