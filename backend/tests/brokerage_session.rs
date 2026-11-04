use chrono::{Duration, Utc};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use tradstry::{
    brokerage::{
        Auth, Brokerage, SessionError,
        store::{self, AuthorizedTokens},
    },
    snaptrade::{
        Connection, SnapTradeError,
        fake::{self, FakeSnapTrade},
    },
    users::{self, Provisioning},
};

const PERSONAL: &str = "personal-1";

struct Setup {
    snaptrade: FakeSnapTrade,
    brokerage: Brokerage,
    grant_id: Uuid,
}

/// A user who completed SnapTrade OAuth for a Personal account with one connection.
async fn setup(pool: PgPool, access_token_ttl_seconds: i64) -> Setup {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.set_access_token_ttl(access_token_ttl_seconds);
    snaptrade.personal_connection(PERSONAL, "conn-1", &["acct-1"]);
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let user = users::load_user(&pool, "user-1", "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap();

    let verifier = "a-verifier-long-enough-to-be-realistic-0123456789-abcdef";
    let challenge = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        <sha2::Sha256 as sha2::Digest>::digest(verifier.as_bytes()),
    );
    let url = brokerage
        .client
        .authorization_url("state", &challenge, &["read"])
        .await
        .unwrap();
    let tokens = brokerage
        .client
        .exchange_code(&snaptrade.approve(PERSONAL, &url), verifier)
        .await
        .unwrap();
    let grant = store::store_authorized_grant(
        &pool,
        user.id,
        fake::OAUTH_CLIENT_ID,
        AuthorizedTokens {
            personal_user_id: &tokens.personal_user_id,
            access_token_encrypted: &brokerage.secrets.encrypt(&tokens.access_token).unwrap(),
            refresh_token_encrypted: &brokerage.secrets.encrypt(&tokens.refresh_token).unwrap(),
            expires_at: Utc::now() + Duration::seconds(tokens.expires_in),
            scopes: &tokens.scopes,
        },
    )
    .await
    .unwrap();
    Setup {
        snaptrade,
        brokerage,
        grant_id: grant.id,
    }
}

async fn list(brokerage: &Brokerage, grant_id: Uuid) -> Result<Vec<Connection>, SessionError> {
    let auth = brokerage.oauth_auth(grant_id).await?;
    brokerage
        .session(auth)
        .run(|client, auth| async move { client.list_connections(auth.credentials()).await })
        .await
}

async fn grant_status(pool: &PgPool, grant_id: Uuid) -> (String, bool) {
    let grant = store::grant(pool, grant_id).await.unwrap().unwrap();
    (
        grant.status,
        grant.access_token_encrypted.is_some() || grant.refresh_token_encrypted.is_some(),
    )
}

#[sqlx::test]
async fn a_valid_token_is_used_without_refreshing(pool: PgPool) {
    let s = setup(pool, 36_000).await;
    assert_eq!(
        list(&s.brokerage, s.grant_id).await.unwrap()[0].id,
        "conn-1"
    );
    assert_eq!(
        s.snaptrade.requests_to("/oauth/token"),
        1,
        "only the original code exchange"
    );
}

#[sqlx::test]
async fn a_token_about_to_expire_is_refreshed_first(pool: PgPool) {
    let s = setup(pool, 60).await;
    list(&s.brokerage, s.grant_id).await.unwrap();
    assert_eq!(s.snaptrade.requests_to("/oauth/token"), 2);
    assert_eq!(
        s.snaptrade.requests_to("/authorizations"),
        1,
        "no failed call before the refresh"
    );
}

#[sqlx::test]
async fn an_authentication_failure_refreshes_once_and_retries(pool: PgPool) {
    let s = setup(pool.clone(), 36_000).await;
    let before = store::grant(&pool, s.grant_id).await.unwrap().unwrap();
    s.snaptrade.expire_access_tokens();
    assert_eq!(
        list(&s.brokerage, s.grant_id).await.unwrap()[0].id,
        "conn-1"
    );
    assert_eq!(s.snaptrade.requests_to("/oauth/token"), 2);
    assert_eq!(s.snaptrade.requests_to("/authorizations"), 2);
    let after = store::grant(&pool, s.grant_id).await.unwrap().unwrap();
    assert_ne!(
        after.refresh_token_encrypted, before.refresh_token_encrypted,
        "the rotated pair is stored"
    );
}

#[sqlx::test]
async fn concurrent_failures_refresh_exactly_once(pool: PgPool) {
    let s = setup(pool, 36_000).await;
    let stale = s.brokerage.oauth_auth(s.grant_id).await.unwrap();
    s.snaptrade.expire_access_tokens();
    let calls = (0..6).map(|_| {
        let mut session = s.brokerage.session(stale.clone());
        async move {
            session
                .run(
                    |client, auth| async move { client.list_connections(auth.credentials()).await },
                )
                .await
        }
    });
    for result in futures_util::future::join_all(calls).await {
        result.unwrap();
    }
    assert_eq!(
        s.snaptrade.requests_to("/oauth/token"),
        2,
        "one exchange and one refresh"
    );
}

#[sqlx::test]
async fn a_second_authentication_failure_clears_the_grant(pool: PgPool) {
    let s = setup(pool.clone(), 36_000).await;
    s.snaptrade
        .fail_next("/authorizations", 401, json!({ "detail": "nope" }));
    s.snaptrade
        .fail_next("/authorizations", 401, json!({ "detail": "still nope" }));
    assert!(matches!(
        list(&s.brokerage, s.grant_id).await,
        Err(SessionError::ReauthorizationRequired)
    ));
    assert_eq!(
        grant_status(&pool, s.grant_id).await,
        ("reauthorization_required".into(), false)
    );
    assert!(matches!(
        list(&s.brokerage, s.grant_id).await,
        Err(SessionError::ReauthorizationRequired)
    ));
}

#[sqlx::test]
async fn an_invalid_refresh_token_clears_the_grant(pool: PgPool) {
    let s = setup(pool.clone(), 36_000).await;
    s.snaptrade.expire_access_tokens();
    s.snaptrade.invalidate_refresh_tokens();
    assert!(matches!(
        list(&s.brokerage, s.grant_id).await,
        Err(SessionError::ReauthorizationRequired)
    ));
    assert_eq!(
        grant_status(&pool, s.grant_id).await,
        ("reauthorization_required".into(), false)
    );
}

#[sqlx::test]
async fn other_errors_leave_the_grant_alone(pool: PgPool) {
    let s = setup(pool.clone(), 36_000).await;
    s.snaptrade
        .fail_next("/authorizations", 400, json!({ "detail": "bad account" }));
    let error = list(&s.brokerage, s.grant_id).await.unwrap_err();
    assert!(matches!(
        error,
        SessionError::SnapTrade(SnapTradeError::Api { status: 400, .. })
    ));
    assert_eq!(
        s.snaptrade.requests_to("/oauth/token"),
        1,
        "no refresh for a bad request"
    );
    assert_eq!(
        grant_status(&pool, s.grant_id).await,
        ("active".into(), true)
    );
}

#[sqlx::test]
async fn stale_commercial_credentials_are_reported(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool, &snaptrade);
    let registration = brokerage.client.register_user("user-1").await.unwrap();
    snaptrade.forget_user("user-1");
    let auth = Auth::Commercial {
        user_id: registration.user_id,
        user_secret: registration.user_secret.clone(),
    };
    let error = brokerage
        .session(auth)
        .run(|client, auth| async move { client.list_connections(auth.credentials()).await })
        .await
        .unwrap_err();
    assert!(matches!(error, SessionError::StaleCredentials));
    assert!(!format!("{error:?}").contains(&registration.user_secret));
}
