//! OAuth for the MCP endpoint, as the MCP authorization spec asks of a
//! resource server: publish protected resource metadata (RFC 9728), answer
//! unauthenticated calls with a `401` challenge that points at it, and accept
//! only Stytch Connected App tokens issued to this project.

use std::sync::Arc;

use axum::{
    Json,
    extract::{Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::{TokenKind, TokenVerifier},
    users::{self, AccountRequired, Provisioning},
};

pub const READ_SCOPE: &str = "tradstry:read";
pub const WRITE_SCOPE: &str = "tradstry:write";
pub const METADATA_PATH: &str = "/.well-known/oauth-protected-resource";

/// What the auth layer hands each tool call: who is calling, and what they may do.
#[derive(Clone, Debug)]
pub struct McpCaller {
    pub user_id: Uuid,
    pub can_write: bool,
}

pub struct McpAuth {
    pub pool: PgPool,
    pub verifier: TokenVerifier,
    /// The Connected Apps issuer: the Stytch custom domain.
    pub issuer: String,
    /// The canonical MCP URL, e.g. `https://mcp.tradstry.com/mcp`.
    pub resource: String,
    /// Where the protected resource metadata for `resource` is served.
    pub metadata_url: String,
}

impl McpAuth {
    pub fn metadata(&self) -> Value {
        json!({
            "resource": self.resource,
            "authorization_servers": [self.issuer],
            // Writes are asked for when first needed, and refresh tokens are the client's business.
            "scopes_supported": [READ_SCOPE],
            "bearer_methods_supported": ["header"],
            "resource_name": "Tradstry",
        })
    }

    fn challenge(&self, status: StatusCode, error: Option<(&str, &str)>, scope: &str) -> Response {
        let mut value = format!(
            r#"Bearer resource_metadata="{}", scope="{scope}""#,
            self.metadata_url
        );
        if let Some((code, description)) = error {
            value.push_str(&format!(
                r#", error="{code}", error_description="{description}""#
            ));
        }
        let mut response = (
            status,
            Json(json!({ "error": error.map(|(code, _)| code).unwrap_or("unauthorized") })),
        )
            .into_response();
        if let Ok(header_value) = HeaderValue::from_str(&value) {
            response
                .headers_mut()
                .insert(header::WWW_AUTHENTICATE, header_value);
        }
        response
    }

    fn unauthorized(&self, description: Option<&str>) -> Response {
        self.challenge(
            StatusCode::UNAUTHORIZED,
            description.map(|text| ("invalid_token", text)),
            READ_SCOPE,
        )
    }
}

pub async fn protected_resource_metadata(State(auth): State<Arc<McpAuth>>) -> Json<Value> {
    Json(auth.metadata())
}

fn bearer(request: &Request) -> Option<&str> {
    request
        .headers()
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|token| !token.is_empty())
}

/// Runs before every MCP request. Website session tokens share the project's
/// audience, so the token kind and issuer are what bind a token to this server.
pub async fn authenticate(
    State(auth): State<Arc<McpAuth>>,
    mut request: Request,
    next: Next,
) -> Response {
    let Some(token) = bearer(&request) else {
        return auth.unauthorized(None);
    };
    let claims = match auth.verifier.verify(token).await {
        Ok(claims) => claims,
        Err(error) => {
            tracing::warn!(reason = %error, "rejected an MCP token");
            return auth.unauthorized(Some("The access token is invalid or expired"));
        }
    };
    if claims.kind != TokenKind::ConnectedApp || claims.iss.trim_end_matches('/') != auth.issuer {
        return auth.unauthorized(Some(
            "Connect Tradstry through your AI app to get an access token",
        ));
    }
    let scopes: Vec<&str> = claims.scopes().collect();
    if !scopes.contains(&READ_SCOPE) {
        return auth.challenge(
            StatusCode::FORBIDDEN,
            Some((
                "insufficient_scope",
                "Reading your Tradstry data needs the tradstry:read permission",
            )),
            READ_SCOPE,
        );
    }
    let can_write = scopes.contains(&WRITE_SCOPE);
    tracing::debug!(
        aud = %claims.other.get("aud").map(ToString::to_string).unwrap_or_default(),
        client_id = claims.other.get("client_id").and_then(|id| id.as_str()).unwrap_or(""),
        scope = %scopes.join(" "),
        "accepted an MCP token"
    );
    let user = match users::load_user(
        &auth.pool,
        &claims.sub,
        claims.full_name(),
        claims.email(),
        Provisioning::ExistingOnly,
    )
    .await
    {
        Ok(user) => user,
        Err(error) if error.is::<AccountRequired>() => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "account_required", "error_description": "Create your Tradstry account on the website first" })),
            )
                .into_response();
        }
        Err(error) => {
            tracing::error!(%error, "could not load the MCP caller");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    request.extensions_mut().insert(McpCaller {
        user_id: user.id,
        can_write,
    });
    next.run(request).await
}
