use axum::{
    Json,
    extract::{FromRef, FromRequestParts, OptionalFromRequestParts},
    http::{
        HeaderMap, StatusCode,
        header::{AUTHORIZATION, COOKIE},
        request::Parts,
    },
    response::{IntoResponse, Response},
};
use serde_json::json;

use super::{AuthClaims, AuthError, TokenVerifier};

const SESSION_COOKIE: &str = "stytch_session_jwt";

#[derive(Debug)]
pub enum AuthRejection {
    MissingToken,
    Rejected(AuthError),
}

impl AuthRejection {
    pub fn code(&self) -> &'static str {
        match self {
            Self::MissingToken => "missing_token",
            Self::Rejected(AuthError::Unauthorized(_)) => "invalid_token",
            Self::Rejected(AuthError::Expired) => "token_expired",
            Self::Rejected(AuthError::Unavailable(_)) => "keys_unavailable",
        }
    }

    fn status(&self) -> StatusCode {
        match self {
            Self::Rejected(AuthError::Unavailable(_)) => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::UNAUTHORIZED,
        }
    }

    fn message(&self) -> String {
        match self {
            Self::MissingToken => "No Authorization header or session cookie".to_owned(),
            Self::Rejected(error) => error.to_string(),
        }
    }
}

impl IntoResponse for AuthRejection {
    fn into_response(self) -> Response {
        let body = json!({ "error": self.code(), "message": self.message() });
        (self.status(), Json(body)).into_response()
    }
}

/// Expired tokens are routine (clients refresh and retry), so only the rest is logged.
fn log_rejection(error: &AuthError) {
    if !matches!(error, AuthError::Expired) {
        tracing::warn!(reason = %error, "rejected a session token");
    }
}

/// The Authorization header wins whenever it is present, so a malformed header
/// is rejected rather than silently replaced by whatever cookie rides along.
pub fn request_token(headers: &HeaderMap) -> Option<String> {
    let token = match headers.get(AUTHORIZATION) {
        Some(value) => value
            .to_str()
            .ok()
            .map(|value| value.trim().trim_start_matches("Bearer ").trim().to_owned()),
        None => session_cookie(headers),
    };
    token.filter(|token| !token.is_empty())
}

fn session_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .find_map(|pair| {
            let (name, value) = pair.trim().split_once('=')?;
            (name == SESSION_COOKIE).then(|| value.to_owned())
        })
}

impl<S> FromRequestParts<S> for AuthClaims
where
    TokenVerifier: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AuthRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let token = request_token(&parts.headers).ok_or(AuthRejection::MissingToken)?;
        TokenVerifier::from_ref(state)
            .verify(&token)
            .await
            .inspect_err(log_rejection)
            .map_err(AuthRejection::Rejected)
    }
}

/// No token means an anonymous caller. A token that fails verification is
/// still rejected, so an expired session surfaces instead of quietly
/// downgrading the request to anonymous.
impl<S> OptionalFromRequestParts<S> for AuthClaims
where
    TokenVerifier: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AuthRejection;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> Result<Option<Self>, Self::Rejection> {
        let Some(token) = request_token(&parts.headers) else {
            return Ok(None);
        };
        TokenVerifier::from_ref(state)
            .verify(&token)
            .await
            .inspect_err(log_rejection)
            .map(Some)
            .map_err(AuthRejection::Rejected)
    }
}

#[cfg(test)]
mod tests {
    use axum::{Router, body::Body, http::Request, routing::get};
    use http_body_util::BodyExt;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    use super::*;
    use crate::auth::test_jwt::{self, PROJECT};

    async fn whoami(claims: AuthClaims) -> String {
        claims.sub
    }

    async fn maybe(claims: Option<AuthClaims>) -> String {
        claims.map_or_else(|| "anonymous".to_owned(), |claims| claims.sub)
    }

    fn app() -> Router {
        Router::new()
            .route("/me", get(whoami))
            .route("/maybe", get(maybe))
            .with_state(test_jwt::test_verifier())
    }

    async fn call(path: &str, headers: &[(&str, &str)]) -> (StatusCode, String) {
        let mut request = Request::get(path);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        let response = app()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8(body.to_vec()).unwrap())
    }

    fn error_code(body: &str) -> String {
        serde_json::from_str::<Value>(body).unwrap()["error"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    fn token() -> String {
        test_jwt::session_token("user-test-1", "ada@example.com", "Ada Trader")
    }

    fn expired_token() -> String {
        let now = chrono::Utc::now().timestamp();
        test_jwt::sign(&json!({
            "iss": format!("stytch.com/{PROJECT}"),
            "sub": "user-test-1",
            "aud": [PROJECT],
            "iat": now - 900,
            "nbf": now - 900,
            "exp": now - 600,
            "https://stytch.com/session": {"id": "session-1"},
        }))
    }

    #[tokio::test]
    async fn a_bearer_token_reaches_the_handler() {
        let bearer = format!("Bearer {}", token());
        let (status, body) = call("/me", &[("authorization", &bearer)]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "user-test-1");
    }

    #[tokio::test]
    async fn the_session_cookie_is_read_when_there_is_no_header() {
        let cookie = format!("theme=dark; {SESSION_COOKIE}={}; other=1", token());
        let (status, body) = call("/me", &[("cookie", &cookie)]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "user-test-1");
    }

    #[tokio::test]
    async fn a_request_without_a_token_is_rejected() {
        let (status, body) = call("/me", &[]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(error_code(&body), "missing_token");
    }

    #[tokio::test]
    async fn garbage_and_expired_tokens_get_distinct_codes() {
        let (status, body) = call("/me", &[("authorization", "Bearer not-a-jwt")]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(error_code(&body), "invalid_token");

        let bearer = format!("Bearer {}", expired_token());
        let (status, body) = call("/me", &[("authorization", &bearer)]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(error_code(&body), "token_expired");
    }

    #[tokio::test]
    async fn a_bad_header_does_not_fall_back_to_the_cookie() {
        let cookie = format!("{SESSION_COOKIE}={}", token());
        let (status, body) = call(
            "/me",
            &[("authorization", "Bearer not-a-jwt"), ("cookie", &cookie)],
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(error_code(&body), "invalid_token");
    }

    #[tokio::test]
    async fn optional_claims_allow_anonymous_but_reject_bad_tokens() {
        let (status, body) = call("/maybe", &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "anonymous");

        let bearer = format!("Bearer {}", token());
        let (_, body) = call("/maybe", &[("authorization", &bearer)]).await;
        assert_eq!(body, "user-test-1");

        let (status, _) = call("/maybe", &[("authorization", "Bearer not-a-jwt")]).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
}
