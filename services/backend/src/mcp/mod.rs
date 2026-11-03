//! Tradstry as a remote MCP server for ChatGPT and Claude, served from the
//! backend at `/mcp` and signed in through Stytch Connected Apps. See
//! `docs/plans/2026-11-02-feature-mcp-server-plan.md`.

mod auth;
mod period;
mod tools;

use std::sync::Arc;

use axum::{Router, middleware, routing::get};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use sqlx::PgPool;

use auth::{METADATA_PATH, McpAuth};
pub use auth::{McpCaller, READ_SCOPE, WRITE_SCOPE};
pub use tools::TradstryMcp;

use crate::auth::TokenVerifier;

/// Where the MCP server is reached and who signs its users in.
#[derive(Clone)]
pub struct McpSettings {
    /// The public origin, e.g. `https://mcp.tradstry.com`. The endpoint is `{origin}/mcp`.
    pub public_origin: String,
    /// The Connected Apps issuer: the Stytch custom domain.
    pub issuer: String,
    /// Verifies tokens locally; never falls back to Stytch's session API.
    pub verifier: TokenVerifier,
}

/// `/mcp` plus its protected resource metadata, at both paths clients probe.
pub fn router(pool: PgPool, settings: McpSettings) -> Router {
    let origin = settings.public_origin.trim_end_matches('/').to_owned();
    let auth = Arc::new(McpAuth {
        pool: pool.clone(),
        verifier: settings.verifier,
        issuer: settings.issuer.trim_end_matches('/').to_owned(),
        resource: format!("{origin}/mcp"),
        metadata_url: format!("{origin}{METADATA_PATH}/mcp"),
    });
    // rmcp only accepts loopback Host headers unless told otherwise.
    let mut allowed_hosts = vec!["localhost".to_owned(), "127.0.0.1".to_owned()];
    if let Some(host) = reqwest::Url::parse(&origin).ok().and_then(|url| {
        url.host_str().map(|host| {
            url.port()
                .map_or(host.to_owned(), |port| format!("{host}:{port}"))
        })
    }) {
        allowed_hosts.push(host);
    }
    let config = StreamableHttpServerConfig::default()
        .with_json_response(true)
        .with_allowed_hosts(allowed_hosts);
    let service = StreamableHttpService::new(
        move || Ok(TradstryMcp::new(pool.clone())),
        LocalSessionManager::default().into(),
        config,
    );
    Router::new()
        .route(METADATA_PATH, get(auth::protected_resource_metadata))
        .route(
            &format!("{METADATA_PATH}/mcp"),
            get(auth::protected_resource_metadata),
        )
        .with_state(auth.clone())
        .merge(
            Router::new()
                .nest_service("/mcp", service)
                .route_layer(middleware::from_fn_with_state(auth, auth::authenticate)),
        )
}
