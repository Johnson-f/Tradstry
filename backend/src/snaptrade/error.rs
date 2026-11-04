use std::time::Duration;

use serde_json::Value;

/// SnapTrade's code for a Commercial `userId`/`userSecret` pair it no longer
/// recognises: the user was deleted upstream or the client ID changed.
pub const STALE_CREDENTIALS_CODE: &str = "1083";

#[derive(Debug, thiserror::Error)]
pub enum SnapTradeError {
    #[error("SnapTrade returned {status}{}{}", code.as_deref().map(|c| format!(" ({c})")).unwrap_or_default(), request_id.as_deref().map(|id| format!(" [request {id}]")).unwrap_or_default())]
    Api {
        status: u16,
        /// SnapTrade's `code` (for example `1083`) or an OAuth `error`
        /// (for example `invalid_grant`).
        code: Option<String>,
        detail: String,
        request_id: Option<String>,
    },
    #[error("SnapTrade is rate limiting requests; retry in {}s", retry_after.as_secs())]
    RateLimited { retry_after: Duration },
    #[error("SnapTrade request failed: {0}")]
    Transport(String),
    #[error("unexpected SnapTrade response: {0}")]
    Decode(String),
    #[error("{0} is not configured")]
    NotConfigured(&'static str),
}

impl SnapTradeError {
    pub fn from_response(status: u16, body: &[u8], request_id: Option<String>) -> Self {
        let parsed: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
        let text = |key: &str| match parsed.get(key) {
            Some(Value::String(value)) => Some(value.clone()),
            Some(Value::Number(value)) => Some(value.to_string()),
            _ => None,
        };
        Self::Api {
            status,
            code: text("code").or_else(|| text("error")),
            detail: text("detail")
                .or_else(|| text("error_description"))
                .unwrap_or_default(),
            request_id,
        }
    }

    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Api { status, .. } => Some(*status),
            Self::RateLimited { .. } => Some(429),
            _ => None,
        }
    }

    fn code(&self) -> Option<&str> {
        match self {
            Self::Api { code, .. } => code.as_deref(),
            _ => None,
        }
    }

    pub fn is_not_found(&self) -> bool {
        self.status() == Some(404)
    }

    /// A Commercial request whose stored credentials SnapTrade no longer knows.
    /// SnapTrade answers 501 for data a brokerage does not offer, e.g. orders.
    pub fn is_not_supported(&self) -> bool {
        self.status() == Some(501)
    }

    pub fn is_stale_credentials(&self) -> bool {
        self.code() == Some(STALE_CREDENTIALS_CODE)
    }

    /// An OAuth data request rejected for authentication. Only this triggers a
    /// token refresh; other 4xx responses are about the request, not the token.
    pub fn is_oauth_authentication_failure(&self) -> bool {
        self.status() == Some(401) || self.code() == Some("invalid_token")
    }

    /// A refresh that can never succeed: the user must authorize again.
    pub fn is_terminal_refresh_failure(&self) -> bool {
        self.status() == Some(401) || matches!(self.code(), Some("invalid_grant" | "invalid_token"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_snaptrade_and_oauth_error_bodies() {
        let stale = SnapTradeError::from_response(
            401,
            br#"{"detail":"Invalid userID or userSecret provided","status_code":401,"code":"1083"}"#,
            Some("req-1".into()),
        );
        assert!(stale.is_stale_credentials());
        assert!(stale.to_string().contains("1083"));

        let numeric = SnapTradeError::from_response(400, br#"{"code":1083}"#, None);
        assert!(numeric.is_stale_credentials());

        let grant = SnapTradeError::from_response(400, br#"{"error":"invalid_grant"}"#, None);
        assert!(grant.is_terminal_refresh_failure());
        assert!(!grant.is_oauth_authentication_failure());
    }

    #[test]
    fn only_authentication_failures_trigger_refresh() {
        let unauthorized = SnapTradeError::from_response(401, b"{}", None);
        assert!(unauthorized.is_oauth_authentication_failure());
        let bad_request = SnapTradeError::from_response(400, br#"{"detail":"bad account"}"#, None);
        assert!(!bad_request.is_oauth_authentication_failure());
        assert!(!bad_request.is_terminal_refresh_failure());
        assert!(SnapTradeError::from_response(404, b"not json", None).is_not_found());
    }
}
