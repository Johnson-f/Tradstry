//! Accounts are created only by signing up on the web app. Connected apps, such
//! as MCP clients holding Clerk OAuth access tokens, act for existing accounts.

use async_graphql::{Request, Schema};
use std::sync::Arc;
use tradstry_backend::graphql::{Mutation, Query, Subscription};
use tradstry_backend::service::auth::{AuthClaims, AuthProvider, Subject, TokenKind};
use tradstry_backend::service::db::Db;
use tradstry_backend::service::read_service::users::{
    AccountRequired, Provisioning, ensure_user, load_user,
};

use crate::pg_support::TestDb;

fn claims(subject: &str) -> AuthClaims {
    AuthClaims {
        sub: subject.to_string(),
        iss: "test".into(),
        provider: AuthProvider::Clerk,
        kind: TokenKind::Session,
        other: Default::default(),
    }
}

async fn user_rows(db: &Db, clerk_uuid: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM users WHERE clerk_uuid = $1")
        .bind(clerk_uuid)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_connected_app_cannot_create_an_account() {
    let test_db = TestDb::new().await;
    let db = Db::from_pool(test_db.pool());
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();

    let err = load_user(
        &db,
        &Subject::Clerk(clerk_uuid.clone()),
        "Ada",
        "ada@example.com",
        Provisioning::ExistingOnly,
    )
    .await
    .unwrap_err();

    assert!(err.is::<AccountRequired>());
    assert_eq!(user_rows(&db, &clerk_uuid).await, 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_connected_app_acts_for_an_account_created_on_the_web() {
    let test_db = TestDb::new().await;
    let db = Db::from_pool(test_db.pool());
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();
    let signed_up = ensure_user(
        &db,
        &Subject::Clerk(clerk_uuid.clone()),
        "Ada",
        "ada@example.com",
    )
    .await
    .unwrap();

    let user = load_user(
        &db,
        &Subject::Clerk(clerk_uuid.clone()),
        "",
        "",
        Provisioning::ExistingOnly,
    )
    .await
    .unwrap();

    assert_eq!(user.id, signed_up.id);
}

#[tokio::test(flavor = "multi_thread")]
async fn graphql_refuses_unknown_users_unless_the_request_may_sign_up() {
    let test_db = TestDb::new().await;
    let db = Arc::new(Db::from_pool(test_db.pool()));
    let schema = Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .data(db.clone())
    .finish();
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();
    let me = || Request::new("{ me { id } }").data(claims(&clerk_uuid));

    for request in [me(), me().data(Provisioning::ExistingOnly)] {
        let response = schema.execute(request).await;
        let code = response.errors[0]
            .extensions
            .as_ref()
            .and_then(|ext| ext.get("code"))
            .cloned();
        assert_eq!(code, Some(async_graphql::Value::from("ACCOUNT_REQUIRED")));
        assert_eq!(user_rows(&db, &clerk_uuid).await, 0);
    }

    let response = schema
        .execute(me().data(Provisioning::CreateIfMissing))
        .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    assert_eq!(user_rows(&db, &clerk_uuid).await, 1);
}
