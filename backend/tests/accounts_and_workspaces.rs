use std::sync::Arc;

use async_graphql::{Request, Response};
use axum::{
    body::Body,
    http::{Request as HttpRequest, StatusCode},
};
use chrono::{Duration, Utc};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

use tradstry::{
    app::{self, AppState},
    auth::{
        AuthClaims,
        stytch::fake::FakeStytch,
        test_jwt::{self, PROJECT},
    },
    graphql::{RequestUser, build_schema},
    users::{self, Provisioning},
    webhooks::svix,
};

const STYTCH_USER: &str = "user-test-1";
const WEBHOOK_SECRET: &str = "whsec_dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ=";

fn session_claims(factor_age: Duration) -> Value {
    let now = Utc::now();
    json!({
        "iss": format!("stytch.com/{PROJECT}"),
        "sub": STYTCH_USER,
        "aud": [PROJECT],
        "iat": now.timestamp(),
        "nbf": now.timestamp() - 10,
        "exp": now.timestamp() + 300,
        "https://stytch.com/session": {
            "id": "session-1",
            "authentication_factors": [
                {"type": "password", "last_authenticated_at": (now - factor_age).to_rfc3339()},
            ],
        },
        "full_name": "Ada Trader",
        "emails": ["ada@example.com"],
    })
}

async fn claims(token_claims: &Value) -> AuthClaims {
    test_jwt::test_verifier()
        .verify(&test_jwt::sign(token_claims))
        .await
        .unwrap()
}

async fn run(pool: &PgPool, stytch: &Arc<FakeStytch>, claims: AuthClaims, query: &str) -> Response {
    build_schema(pool.clone(), stytch.clone(), None)
        .execute(
            Request::new(query)
                .data(claims)
                .data(RequestUser::default()),
        )
        .await
}

fn code(response: &Response) -> Option<String> {
    let error = response.errors.first()?;
    Some(
        error
            .extensions
            .as_ref()?
            .get("code")?
            .to_string()
            .trim_matches('"')
            .to_owned(),
    )
}

fn data(response: Response) -> Value {
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    response.data.into_json().unwrap()
}

async fn user_count(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn me_creates_the_account_with_its_main_workspace(pool: PgPool) {
    let stytch = Arc::new(FakeStytch::default());
    let caller = claims(&session_claims(Duration::hours(1))).await;
    let me = data(
        run(
            &pool,
            &stytch,
            caller.clone(),
            "{ me { id email } workspaces { name } }",
        )
        .await,
    );
    assert_eq!(me["me"]["email"], "ada@example.com");
    assert_eq!(me["workspaces"], json!([{"name": "Main Workspace"}]));
    assert_eq!(user_count(&pool).await, 1);
    assert_eq!(
        stytch.assigned_roles(),
        [(STYTCH_USER.to_owned(), "trader".to_owned())]
    );
}

#[sqlx::test]
async fn connected_apps_need_an_existing_account(pool: PgPool) {
    let stytch = Arc::new(FakeStytch::default());
    let now = Utc::now().timestamp();
    let app = claims(&json!({
        "iss": format!("stytch.com/{PROJECT}"), "sub": STYTCH_USER, "aud": [PROJECT],
        "iat": now, "exp": now + 300, "client_id": "connected-app-1", "scope": "openid",
    }))
    .await;
    let response = run(&pool, &stytch, app.clone(), "{ me { id } }").await;
    assert_eq!(code(&response).as_deref(), Some("ACCOUNT_REQUIRED"));
    assert_eq!(user_count(&pool).await, 0);

    users::load_user(&pool, STYTCH_USER, "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap();
    data(run(&pool, &stytch, app, "{ me { id } }").await);
    assert!(stytch.assigned_roles().is_empty());
}

#[sqlx::test]
async fn workspace_errors_carry_codes(pool: PgPool) {
    let stytch = Arc::new(FakeStytch::default());
    let caller = claims(&session_claims(Duration::hours(1))).await;
    let created = data(
        run(
            &pool,
            &stytch,
            caller.clone(),
            r#"mutation { createWorkspace(name: "Swing") { id name } }"#,
        )
        .await,
    );
    let id = created["createWorkspace"]["id"]
        .as_str()
        .unwrap()
        .to_owned();

    let blank = run(
        &pool,
        &stytch,
        caller.clone(),
        &format!(r#"mutation {{ renameWorkspace(id: "{id}", name: " ") {{ id }} }}"#),
    )
    .await;
    assert_eq!(code(&blank).as_deref(), Some("INVALID_NAME"));
    let missing = run(
        &pool,
        &stytch,
        caller.clone(),
        r#"mutation { deleteWorkspace(id: "not-a-uuid") }"#,
    )
    .await;
    assert_eq!(code(&missing).as_deref(), Some("NOT_FOUND"));

    data(
        run(
            &pool,
            &stytch,
            caller.clone(),
            &format!(r#"mutation {{ deleteWorkspace(id: "{id}") }}"#),
        )
        .await,
    );
    let workspaces = data(run(&pool, &stytch, caller.clone(), "{ workspaces { id } }").await);
    let last = workspaces["workspaces"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let refused = run(
        &pool,
        &stytch,
        caller,
        &format!(r#"mutation {{ deleteWorkspace(id: "{last}") }}"#),
    )
    .await;
    assert_eq!(code(&refused).as_deref(), Some("LAST_WORKSPACE"));
}

#[sqlx::test]
async fn deleting_the_account_needs_a_recent_sign_in(pool: PgPool) {
    let stytch = Arc::new(FakeStytch::default());
    let stale = claims(&session_claims(Duration::hours(1))).await;
    data(run(&pool, &stytch, stale.clone(), "{ me { id } }").await);

    let refused = run(&pool, &stytch, stale, "mutation { deleteAccount }").await;
    assert_eq!(code(&refused).as_deref(), Some("REAUTH_REQUIRED"));
    assert_eq!(user_count(&pool).await, 1);

    let fresh = claims(&session_claims(Duration::minutes(1))).await;
    data(run(&pool, &stytch, fresh, "mutation { deleteAccount }").await);
    assert_eq!(user_count(&pool).await, 0);
    assert_eq!(stytch.deleted_users(), [STYTCH_USER]);
}

async fn post_webhook(pool: &PgPool, body: &str, signature: Option<String>) -> StatusCode {
    let router = app::router(AppState::new(app::test_services(pool.clone())), vec![]);
    let now = Utc::now().timestamp().to_string();
    let signature =
        signature.unwrap_or_else(|| svix::sign(WEBHOOK_SECRET, "msg_1", &now, body.as_bytes()));
    let request = HttpRequest::post("/webhooks/stytch")
        .header("svix-id", "msg_1")
        .header("svix-timestamp", now)
        .header("svix-signature", signature)
        .body(Body::from(body.to_owned()))
        .unwrap();
    router.oneshot(request).await.unwrap().status()
}

#[sqlx::test]
async fn the_stytch_deletion_webhook_purges_the_account(pool: PgPool) {
    users::load_user(&pool, STYTCH_USER, "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap();
    let body = json!({"object_type": "user", "action": "DELETE", "id": STYTCH_USER}).to_string();

    assert_eq!(
        post_webhook(&pool, &body, Some("v1,bm9wZQ==".into())).await,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(user_count(&pool).await, 1);

    assert_eq!(post_webhook(&pool, &body, None).await, StatusCode::OK);
    assert_eq!(user_count(&pool).await, 0);

    // A retry, or a user Tradstry never saw, is a no-op.
    assert_eq!(post_webhook(&pool, &body, None).await, StatusCode::OK);
}

#[sqlx::test]
async fn other_stytch_events_change_nothing(pool: PgPool) {
    users::load_user(&pool, STYTCH_USER, "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap();
    let body = json!({"object_type": "user", "action": "UPDATE", "id": STYTCH_USER}).to_string();
    assert_eq!(post_webhook(&pool, &body, None).await, StatusCode::OK);
    assert_eq!(user_count(&pool).await, 1);
}
