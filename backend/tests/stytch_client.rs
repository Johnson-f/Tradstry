//! Runs the real `StytchClient` against a local stand-in for the Stytch API,
//! so request paths, Basic auth, and response parsing are checked without
//! credentials or network access.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post},
};
use base64::Engine as _;
use serde_json::{Value, json};
use sqlx::PgPool;
use tokio::net::TcpListener;

use tradstry::{
    app::{self, AppState, Services},
    auth::{
        stytch::{StytchApi, StytchClient},
        test_jwt,
    },
};

const PROJECT: &str = "project-test-123";
const SECRET: &str = "secret-test-456";

const DEFAULT_ROLE: &str = "stytch_user";

#[derive(Clone, Default)]
struct Seen {
    requests: Arc<Mutex<Vec<String>>>,
    roles: Arc<Mutex<HashMap<String, Vec<String>>>>,
    failed_role_updates: Arc<Mutex<usize>>,
}

impl Seen {
    fn record(&self, headers: &HeaderMap, what: String) {
        let expected = format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(format!("{PROJECT}:{SECRET}"))
        );
        assert_eq!(headers["authorization"], expected.as_str());
        self.requests.lock().unwrap().push(what);
    }
}

fn user_response(user_id: &str, roles: &[String]) -> Value {
    json!({
        "request_id": "request-user", "status_code": 200, "user_id": user_id,
        "status": "active", "emails": [], "phone_numbers": [], "crypto_wallets": [],
        "webauthn_registrations": [], "providers": [], "totps": [],
        "biometric_registrations": [], "is_locked": false, "roles": roles,
    })
}

async fn get_user(
    State(seen): State<Seen>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> Json<Value> {
    seen.record(&headers, format!("get {user_id}"));
    let roles = seen.roles.lock().unwrap();
    // Like Stytch, report the project's default role on every user.
    let mut listed = roles.get(&user_id).cloned().unwrap_or_default();
    listed.push(DEFAULT_ROLE.to_owned());
    Json(user_response(&user_id, &listed))
}

async fn update_user(
    State(seen): State<Seen>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    seen.record(&headers, format!("update {user_id}"));
    let mut failures = seen.failed_role_updates.lock().unwrap();
    if *failures > 0 {
        *failures -= 1;
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "request_id": "request-role-failed", "status_code": 503,
                "error_type": "internal_server_error", "error_message": "try again",
                "error_url": "https://stytch.com/docs/api/errors",
            })),
        );
    }
    let roles: Vec<String> = serde_json::from_value(body["roles"].clone()).unwrap();
    if roles.iter().any(|role| role == DEFAULT_ROLE) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "request_id": "request-default-role", "status_code": 400,
                "error_type": "cannot_assign_default_rbac_role_id",
                "error_message": "The default role is implicitly assigned to all members in the project and cannot be explicitly assigned.",
                "error_url": "https://stytch.com/docs/api/errors",
            })),
        );
    }
    seen.roles
        .lock()
        .unwrap()
        .insert(user_id.clone(), roles.clone());
    (
        StatusCode::OK,
        Json(json!({
            "request_id": "request-update", "status_code": 200, "user_id": user_id,
            "emails": [], "phone_numbers": [], "crypto_wallets": [],
            "user": user_response(&user_id, &roles),
        })),
    )
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
        .route(
            "/v1/users/{user_id}",
            delete(delete_user).get(get_user).put(update_user),
        )
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
        *seen.requests.lock().unwrap(),
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

async fn signup_server(pool: PgPool, stytch_url: &str) -> String {
    let services = Services {
        verifier: test_jwt::connected_app_verifier(),
        stytch: Arc::new(StytchClient::new(PROJECT, SECRET, Some(stytch_url)).unwrap()),
        ..app::test_services(pool)
    };
    let router = app::router(AppState::new(services), vec![]);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    origin
}

const ACCOUNT: &str = "{ me { id email } workspaces { id name } }";

async fn graphql(origin: &str, token: &str, query: &str) -> Value {
    reqwest::Client::new()
        .post(format!("{origin}/graphql"))
        .bearer_auth(token)
        .json(&json!({ "query": query }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap()
}

#[sqlx::test]
async fn website_signup_assigns_trader_once_without_removing_other_roles(pool: PgPool) {
    let (url, seen) = fake_stytch().await;
    seen.roles
        .lock()
        .unwrap()
        .insert("user-new".into(), vec!["admin".into()]);
    let origin = signup_server(pool, &url).await;
    let token = test_jwt::session_token("user-new", "ada@example.com", "Ada");
    let first = graphql(&origin, &token, ACCOUNT).await;
    assert!(first["errors"].is_null(), "{first}");
    assert_eq!(seen.roles.lock().unwrap()["user-new"], ["admin", "trader"]);
    assert_eq!(first["data"]["workspaces"].as_array().unwrap().len(), 1);
    let again = graphql(&origin, &token, ACCOUNT).await;
    assert_eq!(again["data"], first["data"]);
    assert_eq!(
        *seen.requests.lock().unwrap(),
        ["get user-new", "update user-new"]
    );
}

#[sqlx::test]
async fn failed_role_assignment_leaves_signup_retryable(pool: PgPool) {
    let (url, seen) = fake_stytch().await;
    *seen.failed_role_updates.lock().unwrap() = 1;
    let origin = signup_server(pool.clone(), &url).await;
    let token = test_jwt::session_token("user-new", "ada@example.com", "Ada");
    let failed = graphql(&origin, &token, "{ me { id } }").await;
    assert!(!failed["errors"].as_array().unwrap().is_empty(), "{failed}");
    assert!(
        tradstry::users::find_by_stytch_id(&pool, "user-new")
            .await
            .unwrap()
            .is_none()
    );

    let retried = graphql(&origin, &token, ACCOUNT).await;
    assert!(retried["errors"].is_null(), "{retried}");
    assert_eq!(retried["data"]["workspaces"].as_array().unwrap().len(), 1);
    assert_eq!(seen.roles.lock().unwrap()["user-new"], ["trader"]);
    let again = graphql(&origin, &token, ACCOUNT).await;
    assert_eq!(again["data"], retried["data"]);
    assert_eq!(
        *seen.requests.lock().unwrap(),
        [
            "get user-new",
            "update user-new",
            "get user-new",
            "update user-new",
        ]
    );
}

#[sqlx::test]
async fn concurrent_signup_requests_create_one_account_with_the_trader_role(pool: PgPool) {
    let (url, seen) = fake_stytch().await;
    seen.roles
        .lock()
        .unwrap()
        .insert("user-new".into(), vec!["admin".into()]);
    let origin = signup_server(pool, &url).await;
    let token = test_jwt::session_token("user-new", "ada@example.com", "Ada");
    let results =
        futures_util::future::join_all((0..8).map(|_| graphql(&origin, &token, ACCOUNT))).await;
    for response in &results {
        assert!(response["errors"].is_null(), "{response}");
        assert_eq!(response["data"], results[0]["data"]);
        assert_eq!(response["data"]["workspaces"].as_array().unwrap().len(), 1);
    }
    assert_eq!(seen.roles.lock().unwrap()["user-new"], ["admin", "trader"]);
}

#[sqlx::test]
async fn connected_apps_and_existing_accounts_do_not_assign_roles(pool: PgPool) {
    let (url, seen) = fake_stytch().await;
    let origin = signup_server(pool, &url).await;
    let connected = test_jwt::connected_app_token("user-new", "tradstry:read tradstry:write");
    let refused = graphql(&origin, &connected, "{ me { id } }").await;
    assert_eq!(
        refused["errors"][0]["extensions"]["code"],
        "ACCOUNT_REQUIRED"
    );
    assert!(seen.requests.lock().unwrap().is_empty());

    let website = test_jwt::session_token("user-new", "ada@example.com", "Ada");
    let created = graphql(&origin, &website, ACCOUNT).await;
    assert!(created["errors"].is_null(), "{created}");
    seen.roles.lock().unwrap().insert("user-new".into(), vec![]);
    seen.requests.lock().unwrap().clear();
    for token in [&connected, &website] {
        let response = graphql(&origin, token, ACCOUNT).await;
        assert_eq!(response["data"], created["data"]);
    }
    assert!(
        seen.roles.lock().unwrap()["user-new"].is_empty(),
        "a removed role must stay removed"
    );
    assert!(seen.requests.lock().unwrap().is_empty());
}

#[tokio::test]
async fn assigning_an_existing_role_does_not_update_the_user() {
    let (url, seen) = fake_stytch().await;
    seen.roles
        .lock()
        .unwrap()
        .insert("user-1".into(), vec!["admin".into(), "trader".into()]);
    let client = StytchClient::new(PROJECT, SECRET, Some(&url)).unwrap();
    client.assign_role("user-1", "trader").await.unwrap();
    assert_eq!(*seen.requests.lock().unwrap(), ["get user-1"]);
    assert_eq!(seen.roles.lock().unwrap()["user-1"], ["admin", "trader"]);
}
