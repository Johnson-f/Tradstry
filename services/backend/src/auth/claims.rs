use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::{Map, Value};

pub const STYTCH_SESSION_CLAIM: &str = "https://stytch.com/session";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenKind {
    Session,
    ConnectedApp,
}

#[derive(Clone, Debug)]
pub struct AuthClaims {
    pub sub: String,
    pub iss: String,
    pub kind: TokenKind,
    pub other: Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StytchSession {
    pub id: String,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub authentication_factors: Vec<AuthenticationFactor>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AuthenticationFactor {
    #[serde(default)]
    pub last_authenticated_at: Option<String>,
}

impl StytchSession {
    pub fn expires_at(&self) -> Option<DateTime<Utc>> {
        self.expires_at
            .as_deref()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|at| at.with_timezone(&Utc))
    }

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
        self.other
            .get("emails")
            .and_then(Value::as_array)
            .and_then(|emails| emails.first())
            .and_then(Value::as_str)
            .unwrap_or("")
    }

    pub fn stytch_session(&self) -> Option<StytchSession> {
        let claim = self.other.get(STYTCH_SESSION_CLAIM)?;
        serde_json::from_value(claim.clone()).ok()
    }

    /// When a long-lived connection opened with this token must end. A web
    /// session outlives its five-minute JWT, so its own expiry is the bound;
    /// connected-app tokens carry no session and end at the token's `exp`.
    pub fn access_ends_at(&self) -> Option<DateTime<Utc>> {
        match self.kind {
            TokenKind::Session => self.stytch_session()?.expires_at(),
            TokenKind::ConnectedApp => self
                .other
                .get("exp")
                .and_then(Value::as_i64)
                .and_then(|exp| DateTime::from_timestamp(exp, 0)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn claims(other: Value) -> AuthClaims {
        AuthClaims {
            sub: "sub".into(),
            iss: "iss".into(),
            kind: TokenKind::Session,
            other: other.as_object().unwrap().clone(),
        }
    }

    #[test]
    fn reads_the_first_email_in_the_token() {
        let token = claims(json!({"emails": ["b@x.com", "c@x.com"], "email": "ignored@x.com"}));
        assert_eq!(token.email(), "b@x.com");
        assert_eq!(claims(json!({})).email(), "");
    }

    #[test]
    fn session_expiry_is_read_when_present() {
        let session = |extra: Value| {
            let mut claim = json!({"id": "session-1"});
            claim
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            claims(json!({ STYTCH_SESSION_CLAIM: claim }))
                .stytch_session()
                .unwrap()
        };
        let at = session(json!({"expires_at": "2026-11-26T12:00:00Z"}))
            .expires_at()
            .unwrap();
        assert_eq!(at.to_rfc3339(), "2026-11-26T12:00:00+00:00");
        assert!(session(json!({})).expires_at().is_none());
        assert!(
            session(json!({"expires_at": "soon"}))
                .expires_at()
                .is_none()
        );
    }

    #[test]
    fn access_ends_with_the_session_or_the_connected_app_token() {
        let session = claims(json!({STYTCH_SESSION_CLAIM: {
            "id": "session-1",
            "expires_at": "2026-11-26T12:00:00Z",
        }, "exp": 1}));
        assert_eq!(
            session.access_ends_at().unwrap().to_rfc3339(),
            "2026-11-26T12:00:00+00:00"
        );

        let mut app = claims(json!({"client_id": "c", "exp": 1_800_000_000}));
        app.kind = TokenKind::ConnectedApp;
        assert_eq!(app.access_ends_at().unwrap().timestamp(), 1_800_000_000);

        assert!(claims(json!({})).access_ends_at().is_none());
    }

    #[test]
    fn recent_authentication_factors_are_found() {
        let now = Utc::now();
        let session = |at: DateTime<Utc>| {
            claims(json!({STYTCH_SESSION_CLAIM: {
                "id": "session-1",
                "authentication_factors": [
                    {"type": "oauth", "last_authenticated_at": at.to_rfc3339()},
                ],
            }}))
            .stytch_session()
            .unwrap()
        };
        let window = Duration::minutes(5);
        assert!(session(now - Duration::minutes(1)).authenticated_within(window, now));
        assert!(!session(now - Duration::minutes(6)).authenticated_within(window, now));
    }
}
