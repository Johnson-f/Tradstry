//! Runs the real `StytchClient` against a local stand-in for the Stytch API,
//! so request paths, Basic auth, and response parsing are checked without
//! credentials or network access.

use std::sync::{Arc, Mutex};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use base64::Engine as _;
use serde_json::{Value, json};
use tokio::net::TcpListener;

use tradstry::stytch::{StytchApi, StytchClient};

const PROJECT: &str = "project-test-123";
const SECRET: &str = "secret-test-456";

#[derive(Clone, Default)]
struct Seen(Arc<Mutex<Vec<String>>>);

impl Seen {
    fn record(&self, headers: &HeaderMap, what: String) {
        let expected = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(format!("{PROJECT}:{SECRET}"))
        );
        assert_eq!(headers["authorization"], expected.as_str());
        self.0.lock().unwrap().push(what);
    }
}

async fn list_sessions(
    State(seen): State<Seen>,
    headers: HeaderMap,
    Query(query): Query<Value>,
) -> Json<Value> {
    seen.record(&headers, format!("list {}", query["user_id"]));
    Json(json!({
        "request_id": "request-1",
        "status_code": 200,
        "sessions": [{
            "session_id": "session-1",
            "user_id": "user-1",
            "authentication_factors": [],
            "roles": [],
            "started_at": "2026-10-27T10:00:00Z",
            "last_accessed_at": "2026-10-27T11:00:00Z",
            "expires_at": "2026-11-26T10:00:00Z",
            "attributes": {"ip_address": "203.0.113.7", "user_agent": ""},
        }],
    }))
}

async fn revoke(
    State(seen): State<Seen>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Json<Value> {
    seen.record(&headers, format!("revoke {}", body["session_id"]));
    Json(json!({ "request_id": "request-2", "status_code": 200 }))
}

async fn delete_user(
    State(seen): State<Seen>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> (StatusCode, Json<Value>) {
    seen.record(&headers, format!("delete {user_id}"));
    let status = if user_id == "user-gone" { 404 } else { 500 };
    (
        StatusCode::from_u16(status).unwrap(),
        Json(json!({
            "status_code": status,
            "request_id": "request-3",
            "error_type": if status == 404 { "user_not_found" } else { "internal_server_error" },
            "error_message": "nope",
            "error_url": "https://stytch.com/docs/api/errors",
        })),
    )
}

async fn fake_stytch() -> (String, Seen) {
    let seen = Seen::default();
    let router = Router::new()
        .route("/v1/sessions", get(list_sessions))
        .route("/v1/sessions/revoke", post(revoke))
        .route("/v1/users/{user_id}", delete(delete_user))
        .with_state(seen.clone());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    (url, seen)
}

#[tokio::test]
async fn sessions_are_listed_and_revoked_through_the_api() {
    let (url, seen) = fake_stytch().await;
    let client = StytchClient::new(PROJECT, SECRET, Some(&url)).unwrap();

    let sessions = client.list_sessions("user-1").await.unwrap();
    assert_eq!(sessions.len(), 1);
    let session = &sessions[0];
    assert_eq!(session.session_id, "session-1");
    assert_eq!(
        session.expires_at.unwrap().to_rfc3339(),
        "2026-11-26T10:00:00+00:00"
    );
    assert_eq!(session.ip_address.as_deref(), Some("203.0.113.7"));
    assert_eq!(session.user_agent, None, "blank attributes become None");

    client.revoke_session("session-1").await.unwrap();
    assert_eq!(
        *seen.0.lock().unwrap(),
        [r#"list "user-1""#, r#"revoke "session-1""#]
    );
}

#[tokio::test]
async fn deleting_a_missing_user_succeeds_but_other_errors_surface() {
    let (url, _) = fake_stytch().await;
    let client = StytchClient::new(PROJECT, SECRET, Some(&url)).unwrap();

    client.delete_user("user-gone").await.unwrap();
    let error = client.delete_user("user-broken").await.unwrap_err();
    assert!(error.to_string().contains("500"), "{error}");
}
