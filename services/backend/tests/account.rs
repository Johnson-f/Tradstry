use std::sync::Arc;

use async_graphql::{Request, Response};
use chrono::{Duration, Utc};
use serde_json::{Value, json};
use sqlx::PgPool;

use tradstry::{
    auth::{
        AuthClaims, TokenVerifier,
        stytch::fake::FakeStytch,
        test_jwt::{self, PROJECT},
    },
    graphql::build_schema,
};

const USER: &str = "user-test-1";
const CURRENT: &str = "session-current";
const OTHER: &str = "session-laptop";

fn session_claims(factor_age: Duration) -> Value {
    let now = Utc::now();
    json!({
        "iss": format!("stytch.com/{PROJECT}"),
        "sub": USER,
        "aud": [PROJECT],
        "iat": now.timestamp(),
        "nbf": now.timestamp() - 10,
        "exp": now.timestamp() + 300,
        "https://stytch.com/session": {
            "id": CURRENT,
            "authentication_factors": [
                {"type": "password", "last_authenticated_at": (now - factor_age).to_rfc3339()},
            ],
        },
    })
}

async fn claims(token_claims: &Value) -> AuthClaims {
    let verifier: TokenVerifier = test_jwt::test_verifier();
    verifier
        .verify(&test_jwt::sign(token_claims))
        .await
        .unwrap()
}

async fn run(pool: &PgPool, stytch: Arc<FakeStytch>, claims: AuthClaims, query: &str) -> Response {
    build_schema(pool.clone(), stytch, None)
        .execute(Request::new(query).data(claims))
        .await
}

fn error_code(response: &Response) -> Option<String> {
    let error = response.errors.first()?;
    let value = error.extensions.as_ref()?.get("code")?;
    Some(value.to_string().trim_matches('"').to_owned())
}

fn stytch() -> Arc<FakeStytch> {
    Arc::new(FakeStytch::with_sessions(USER, &[CURRENT, OTHER]))
}

#[sqlx::test]
async fn sessions_are_listed_with_the_current_one_marked(pool: PgPool) {
    let caller = claims(&session_claims(Duration::hours(2))).await;
    let response = run(
        &pool,
        stytch(),
        caller,
        "{ authSessions { id current ipAddress } }",
    )
    .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(
        response.data.into_json().unwrap()["authSessions"],
        json!([
            {"id": CURRENT, "current": true, "ipAddress": "203.0.113.7"},
            {"id": OTHER, "current": false, "ipAddress": "203.0.113.7"},
        ])
    );
}

#[sqlx::test]
async fn signing_out_another_device_needs_a_recent_sign_in(pool: PgPool) {
    let stytch = stytch();
    let stale = claims(&session_claims(Duration::hours(2))).await;
    let mutation = format!(r#"mutation {{ revokeAuthSession(id: "{OTHER}") }}"#);

    let response = run(&pool, stytch.clone(), stale, &mutation).await;
    assert_eq!(error_code(&response).as_deref(), Some("REAUTH_REQUIRED"));
    assert!(stytch.revoked().is_empty());

    let fresh = claims(&session_claims(Duration::minutes(1))).await;
    let response = run(&pool, stytch.clone(), fresh, &mutation).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(stytch.revoked(), [OTHER]);
}

#[sqlx::test]
async fn the_current_session_can_always_sign_out(pool: PgPool) {
    let stytch = stytch();
    let stale = claims(&session_claims(Duration::hours(2))).await;
    let mutation = format!(r#"mutation {{ revokeAuthSession(id: "{CURRENT}") }}"#);
    let response = run(&pool, stytch.clone(), stale, &mutation).await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(stytch.revoked(), [CURRENT]);
}

#[sqlx::test]
async fn sessions_of_other_users_cannot_be_revoked(pool: PgPool) {
    let stytch = stytch();
    let fresh = claims(&session_claims(Duration::minutes(1))).await;
    let response = run(
        &pool,
        stytch.clone(),
        fresh,
        r#"mutation { revokeAuthSession(id: "session-of-someone-else") }"#,
    )
    .await;
    assert_eq!(error_code(&response).as_deref(), Some("NOT_FOUND"));
    assert!(stytch.revoked().is_empty());
}

#[sqlx::test]
async fn connected_app_tokens_cannot_manage_sessions(pool: PgPool) {
    let now = Utc::now().timestamp();
    let app = claims(&json!({
        "iss": format!("stytch.com/{PROJECT}"),
        "sub": USER,
        "aud": [PROJECT],
        "iat": now,
        "exp": now + 300,
        "client_id": "connected-app-1",
        "scope": "openid",
    }))
    .await;
    let response = run(&pool, stytch(), app, "{ authSessions { id } }").await;
    assert_eq!(error_code(&response).as_deref(), Some("SESSION_REQUIRED"));
}
