use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};

pub const STYTCH_SESSION_CLAIM: &str = "https://stytch.com/session";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthProvider {
    Clerk,
    Stytch,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenKind {
    Session,
    ConnectedApp,
}

#[derive(Clone, Debug)]
pub struct AuthClaims {
    pub sub: String,
    pub iss: String,
    pub provider: AuthProvider,
    pub kind: TokenKind,
    pub other: Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StytchSession {
    pub id: String,
    #[serde(default)]
    pub authentication_factors: Vec<AuthenticationFactor>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AuthenticationFactor {
    #[serde(default)]
    pub last_authenticated_at: Option<String>,
}

impl StytchSession {
    pub fn authenticated_within(&self, window: Duration, now: DateTime<Utc>) -> bool {
        self.authentication_factors.iter().any(|factor| {
            factor
                .last_authenticated_at
                .as_deref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .is_some_and(|at| now.signed_duration_since(at) <= window)
        })
    }
}

impl AuthClaims {
    fn str_claim(&self, name: &str) -> Option<&str> {
        self.other.get(name).and_then(Value::as_str)
    }

    pub fn full_name(&self) -> &str {
        self.str_claim("full_name").unwrap_or("")
    }

    pub fn email(&self) -> &str {
        match self.provider {
            AuthProvider::Clerk => self.str_claim("email"),
            AuthProvider::Stytch => self
                .other
                .get("emails")
                .and_then(Value::as_array)
                .and_then(|emails| emails.first())
                .and_then(Value::as_str),
        }
        .unwrap_or("")
    }

    pub fn clerk_id(&self) -> Option<&str> {
        match self.provider {
            AuthProvider::Stytch => self.str_claim("clerk_id").filter(|id| !id.is_empty()),
            AuthProvider::Clerk => None,
        }
    }

    pub fn stytch_session(&self) -> Option<StytchSession> {
        let claim = self.other.get(STYTCH_SESSION_CLAIM)?;
        serde_json::from_value(claim.clone()).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn claims(provider: AuthProvider, other: Value) -> AuthClaims {
        AuthClaims {
            sub: "sub".into(),
            iss: "iss".into(),
            provider,
            kind: TokenKind::Session,
            other: other.as_object().unwrap().clone(),
        }
    }

    #[test]
    fn reads_the_email_each_provider_puts_in_the_token() {
        let clerk = claims(AuthProvider::Clerk, json!({"email": "a@x.com"}));
        assert_eq!(clerk.email(), "a@x.com");
        let stytch = claims(
            AuthProvider::Stytch,
            json!({"emails": ["b@x.com", "c@x.com"], "email": "ignored@x.com"}),
        );
        assert_eq!(stytch.email(), "b@x.com");
        assert_eq!(claims(AuthProvider::Stytch, json!({})).email(), "");
    }

    #[test]
    fn an_empty_clerk_id_is_absent() {
        let empty = claims(AuthProvider::Stytch, json!({"clerk_id": ""}));
        assert_eq!(empty.clerk_id(), None);
        let set = claims(AuthProvider::Stytch, json!({"clerk_id": "user_1"}));
        assert_eq!(set.clerk_id(), Some("user_1"));
        let clerk = claims(AuthProvider::Clerk, json!({"clerk_id": "user_1"}));
        assert_eq!(clerk.clerk_id(), None);
    }

    #[test]
    fn recent_authentication_factors_are_found() {
        let now = Utc::now();
        let session = |at: DateTime<Utc>| {
            claims(
                AuthProvider::Stytch,
                json!({STYTCH_SESSION_CLAIM: {
                    "id": "session-1",
                    "authentication_factors": [
                        {"type": "oauth", "last_authenticated_at": at.to_rfc3339()},
                    ],
                }}),
            )
            .stytch_session()
            .unwrap()
        };
        let window = Duration::minutes(5);
        assert!(session(now - Duration::minutes(1)).authenticated_within(window, now));
        assert!(!session(now - Duration::minutes(6)).authenticated_within(window, now));
    }
}
