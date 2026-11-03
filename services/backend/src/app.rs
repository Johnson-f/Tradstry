use axum::{
    Json, Router,
    extract::FromRef,
    http::{
        HeaderValue, Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::{MethodRouter, get, post},
};
use serde_json::{Value, json};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    auth::{TokenVerifier, stytch::StytchApi},
    brokerage::Brokerage,
    graphql::{self, AppSchema},
    mcp::{self, McpSettings},
    webhooks,
};

/// What the app needs from the outside world. Tests build it with fakes.
pub struct Services {
    pub verifier: TokenVerifier,
    pub pool: PgPool,
    pub stytch: Arc<dyn StytchApi>,
    pub stytch_webhook_secret: Option<String>,
    pub brokerage: Option<Arc<Brokerage>>,
    /// The MCP endpoint is off without a Connected Apps issuer.
    pub mcp: Option<McpSettings>,
}

#[derive(Clone)]
pub struct AppState {
    pub verifier: TokenVerifier,
    pub schema: AppSchema,
    pub pool: PgPool,
    pub stytch: Arc<dyn StytchApi>,
    pub stytch_webhook_secret: Option<Arc<str>>,
    pub brokerage: Option<Arc<Brokerage>>,
    pub mcp: Option<McpSettings>,
}

impl AppState {
    pub fn new(services: Services) -> Self {
        Self {
            schema: graphql::build_schema(
                services.pool.clone(),
                services.stytch.clone(),
                services.brokerage.clone(),
            ),
            verifier: services.verifier,
            pool: services.pool,
            stytch: services.stytch,
            stytch_webhook_secret: services.stytch_webhook_secret.map(Arc::from),
            brokerage: services.brokerage,
            mcp: services.mcp,
        }
    }
}

/// Services for tests: the test token verifier, an empty fake Stytch, and the
/// given pool. Never use outside a test process.
#[doc(hidden)]
pub fn test_services(pool: PgPool) -> Services {
    Services {
        verifier: crate::auth::test_jwt::test_verifier(),
        pool,
        stytch: Arc::new(crate::auth::stytch::fake::FakeStytch::default()),
        stytch_webhook_secret: Some("whsec_dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ=".to_owned()),
        brokerage: None,
        mcp: None,
    }
}

impl FromRef<AppState> for TokenVerifier {
    fn from_ref(state: &AppState) -> Self {
        state.verifier.clone()
    }
}

pub fn router(state: AppState, cors_allowed_origins: Vec<HeaderValue>) -> Router {
    let mcp = state
        .mcp
        .clone()
        .map(|settings| mcp::router(state.pool.clone(), settings))
        .unwrap_or_default();
    Router::new()
        .route("/health", get(health))
        .route("/graphql", graphql_route())
        .route("/graphql/ws", get(graphql::graphql_ws_handler))
        .route("/webhooks/stytch", post(webhooks::stytch::stytch_webhook))
        .route(
            "/oauth/snaptrade/callback",
            get(webhooks::snaptrade_oauth::snaptrade_oauth_callback),
        )
        .route(
            "/webhooks/snaptrade",
            post(webhooks::snaptrade::snaptrade_webhook),
        )
        .layer(cors(cors_allowed_origins))
        .with_state(state)
        .merge(mcp)
        .layer(TraceLayer::new_for_http())
}

/// GraphiQL is a development aid, so release builds answer only POST.
fn graphql_route() -> MethodRouter<AppState> {
    let route = post(graphql::graphql_handler);
    if cfg!(debug_assertions) {
        route.get(graphql::graphiql)
    } else {
        route
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// Browsers send the session JWT as a Bearer header, so credentials (cookies)
/// stay disallowed cross-origin until the API sits behind the auth domain.
fn cors(origins: Vec<HeaderValue>) -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE])
        .max_age(std::time::Duration::from_secs(3600))
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    use super::*;

    fn app() -> Router {
        // These routes never touch the database, so the pool never connects.
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://unused@localhost/unused")
            .unwrap();
        let state = AppState::new(test_services(pool));
        router(
            state,
            vec![HeaderValue::from_static("http://localhost:5173")],
        )
    }

    #[tokio::test]
    async fn health_is_public() {
        let response = app()
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn cors_allows_only_listed_origins() {
        let preflight = |origin: &'static str| {
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/health")
                .header("origin", origin)
                .header("access-control-request-method", "POST")
                .header("access-control-request-headers", "authorization")
                .body(Body::empty())
                .unwrap()
        };

        let allowed = app()
            .oneshot(preflight("http://localhost:5173"))
            .await
            .unwrap();
        assert_eq!(
            allowed.headers()["access-control-allow-origin"],
            "http://localhost:5173"
        );

        let denied = app()
            .oneshot(preflight("https://evil.example"))
            .await
            .unwrap();
        assert!(!denied.headers().contains_key("access-control-allow-origin"));
    }
}
