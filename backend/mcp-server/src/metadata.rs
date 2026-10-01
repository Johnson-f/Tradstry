//! OAuth 2.0 Protected Resource Metadata (RFC 9728)
//!
//! Serves the RFC 9728 protected-resource document at both the origin-level
//! and path-specific well-known URLs, since MCP clients differ on which form they
//! probe. Each names the resource its URL was derived from: the origin for the
//! root document and the `/mcp` endpoint for the path-specific one.

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::sync::Arc;

use crate::app_state::AppState;

pub const ROOT_METADATA_PATH: &str = "/.well-known/oauth-protected-resource";
pub const MCP_METADATA_PATH: &str = "/.well-known/oauth-protected-resource/mcp";
pub const OPENAI_APPS_CHALLENGE_PATH: &str = "/.well-known/openai-apps-challenge";
/// Where the MCP service is mounted; the protected resource clients connect to.
pub const MCP_PATH: &str = "/mcp";

/// Build the RFC 9728 Protected Resource Metadata document.
///
/// - `resource`    — the canonical URL of this resource server (from `MCP_PUBLIC_URL`).
/// - `auth_server` — the Clerk issuer URL (from `CLERK_ISSUER`).
pub fn protected_resource_metadata(resource: &str, auth_server: &str) -> Value {
    json!({
        "resource": resource,
        "authorization_servers": [auth_server],
        "bearer_methods_supported": ["header"],
        "scopes_supported": ["openid", "profile", "email", "offline_access"]
    })
}

fn discovery_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Authorization, Content-Type, MCP-Protocol-Version"),
    );
    headers
}

/// Origin-level discovery. CORS is included because some MCP clients fetch
/// well-known metadata from a browser context before starting OAuth.
pub async fn root_handler(State(state): State<Arc<AppState>>) -> Response {
    discovery_response(&state.public_url, &state.clerk_issuer)
}

/// Path-specific discovery for the `/mcp` endpoint, the document the 401
/// challenge points clients at.
pub async fn mcp_handler(State(state): State<Arc<AppState>>) -> Response {
    discovery_response(&mcp_resource(&state.public_url), &state.clerk_issuer)
}

pub fn mcp_resource(public_url: &str) -> String {
    format!("{}{MCP_PATH}", public_url.trim_end_matches('/'))
}

fn discovery_response(resource: &str, auth_server: &str) -> Response {
    (
        discovery_headers(),
        Json(protected_resource_metadata(resource, auth_server)),
    )
        .into_response()
}

/// OpenAI's plugin portal fetches this to verify domain ownership and expects the
/// bare token as the whole body, not JSON.
pub async fn openai_apps_challenge_handler(State(state): State<Arc<AppState>>) -> Response {
    openai_apps_challenge_response(state.openai_apps_challenge.as_deref())
}

fn openai_apps_challenge_response(token: Option<&str>) -> Response {
    match token {
        Some(token) => (
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            token.to_owned(),
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// CORS preflight for both protected-resource discovery URLs.
pub async fn options_handler() -> Response {
    (StatusCode::NO_CONTENT, discovery_headers()).into_response()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advertises_clerk_as_auth_server() {
        let doc =
            protected_resource_metadata("https://mcp.tradstry.com", "https://clerk.tradstry.com");
        assert_eq!(doc["resource"], "https://mcp.tradstry.com");
        assert_eq!(
            doc["authorization_servers"][0],
            "https://clerk.tradstry.com"
        );
        assert_eq!(doc["bearer_methods_supported"][0], "header");
        assert_eq!(
            doc["scopes_supported"],
            json!(["openid", "profile", "email", "offline_access"])
        );
    }

    #[test]
    fn path_specific_document_names_the_mcp_endpoint() {
        assert_eq!(
            mcp_resource("https://mcp.tradstry.com"),
            "https://mcp.tradstry.com/mcp"
        );
        assert_eq!(
            mcp_resource("https://mcp.tradstry.com/"),
            "https://mcp.tradstry.com/mcp"
        );
    }

    #[test]
    fn exposes_origin_and_path_specific_discovery_locations() {
        assert_eq!(ROOT_METADATA_PATH, "/.well-known/oauth-protected-resource");
        assert_eq!(
            MCP_METADATA_PATH,
            "/.well-known/oauth-protected-resource/mcp"
        );
    }

    #[tokio::test]
    async fn openai_challenge_serves_the_bare_token() {
        let response = openai_apps_challenge_response(Some("abc123"));
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/plain; charset=utf-8"
        );
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .unwrap();
        assert_eq!(&body[..], b"abc123");
    }

    #[test]
    fn openai_challenge_is_absent_until_configured() {
        assert_eq!(
            openai_apps_challenge_response(None).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn discovery_allows_browser_preflight() {
        let headers = discovery_headers();
        assert_eq!(headers[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
        assert_eq!(
            headers[header::ACCESS_CONTROL_ALLOW_METHODS],
            "GET, OPTIONS"
        );
        assert!(
            headers[header::ACCESS_CONTROL_ALLOW_HEADERS]
                .to_str()
                .unwrap()
                .contains("MCP-Protocol-Version")
        );
    }
}
