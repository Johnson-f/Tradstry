use axum::extract::FromRef;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
use axum::http::{HeaderValue, Method};
use axum::routing::{MethodRouter, get, post};
use axum::{Json, Router};
use serde_json::{Value, json};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use std::sync::Arc;

use crate::auth::TokenVerifier;
use crate::graphql::{self, AppSchema};
use crate::stytch::StytchApi;

#[derive(Clone)]
pub struct AppState {
    pub verifier: TokenVerifier,
    pub schema: AppSchema,
}

impl AppState {
    pub fn new(verifier: TokenVerifier, stytch: Arc<dyn StytchApi>) -> Self {
        Self {
            verifier,
            schema: graphql::build_schema(stytch),
        }
    }
}

impl FromRef<AppState> for TokenVerifier {
    fn from_ref(state: &AppState) -> Self {
        state.verifier.clone()
    }
}

pub fn router(state: AppState, cors_allowed_origins: Vec<HeaderValue>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/graphql", graphql_route())
        .route("/graphql/ws", get(graphql::graphql_ws_handler))
        .layer(cors(cors_allowed_origins))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
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
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    use super::*;
    use crate::auth::test_jwt;

    fn app() -> Router {
        let state = AppState::new(
            test_jwt::test_verifier(),
            Arc::new(crate::stytch::fake::FakeStytch::default()),
        );
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
