//! `sync_targets` maps a SnapTrade webhook to the local connections it refreshes.
//! It aliased `snaptrade_oauth_grants` as `grant`, a reserved word, so the query
//! failed for every webhook in production; these tests run the real SQL.

use sqlx::PgPool;
use tradstry_backend::service::brokerage::webhook::{WebhookEvent, sync_targets};

use crate::pg_support::{seed_user_workspace, test_pool};

const OAUTH_CLIENT: &str = "tradstry-oauth-client";

fn event(snaptrade_user_id: &str, oauth_client_id: Option<&str>) -> WebhookEvent {
    WebhookEvent {
        event_id: tradstry_backend::ids::new_uuid_v7().to_string(),
        event_type: "ACCOUNT_HOLDINGS_UPDATED".into(),
        event_timestamp: "2026-10-01T09:00:00Z".into(),
        user_id: snaptrade_user_id.into(),
        account_id: None,
        connection_id: None,
        oauth_client_id: oauth_client_id.map(str::to_string),
        details: None,
    }
}

async fn commercial_connection(pool: &PgPool, snaptrade_user_id: &str) -> (String, String) {
    let (user_id, workspace_id) = seed_user_workspace(pool).await;
    sqlx::query(
        "INSERT INTO brokerage_connections (workspace_id, user_id, provider, broker, auth_mode, \
         snaptrade_user_id, snaptrade_user_secret_encrypted, snaptrade_connection_id, snaptrade_account_id) \
         VALUES ($1, $2, 'snaptrade', 'Webull', 'commercial', $3, 'encrypted-secret', $4, $5)",
    )
    .bind(&workspace_id)
    .bind(&user_id)
    .bind(snaptrade_user_id)
    .bind(format!("conn-{snaptrade_user_id}"))
    .bind(format!("acct-{snaptrade_user_id}"))
    .execute(pool)
    .await
    .expect("seed commercial connection");
    (user_id, workspace_id)
}

async fn oauth_connection(pool: &PgPool, snaptrade_user_id: &str, status: &str) -> String {
    let (user_id, workspace_id) = seed_user_workspace(pool).await;
    let grant_id: String = if status == "active" {
        sqlx::query_scalar(
            "INSERT INTO snaptrade_oauth_grants (user_id, oauth_client_id, status, snaptrade_user_id, \
             access_token_encrypted, refresh_token_encrypted, access_token_expires_at, authorized_at) \
             VALUES ($1, $2, 'active', $3, 'enc-access', 'enc-refresh', now() + interval '1 hour', now()) \
             RETURNING id",
        )
        .bind(&user_id)
        .bind(OAUTH_CLIENT)
        .bind(snaptrade_user_id)
        .fetch_one(pool)
        .await
    } else {
        sqlx::query_scalar(
            "INSERT INTO snaptrade_oauth_grants (user_id, oauth_client_id, status, snaptrade_user_id) \
             VALUES ($1, $2, $3, $4) RETURNING id",
        )
        .bind(&user_id)
        .bind(OAUTH_CLIENT)
        .bind(status)
        .bind(snaptrade_user_id)
        .fetch_one(pool)
        .await
    }
    .expect("seed oauth grant");
    sqlx::query(
        "INSERT INTO brokerage_connections (workspace_id, user_id, provider, broker, auth_mode, \
         oauth_grant_id, snaptrade_connection_id, snaptrade_account_id) \
         VALUES ($1, $2, 'snaptrade', 'Robinhood', 'oauth', $3, $4, $5)",
    )
    .bind(&workspace_id)
    .bind(&user_id)
    .bind(&grant_id)
    .bind(format!("conn-{snaptrade_user_id}"))
    .bind(format!("acct-{snaptrade_user_id}"))
    .execute(pool)
    .await
    .expect("seed oauth connection");
    workspace_id
}

fn unique(prefix: &str) -> String {
    format!("{prefix}-{}", tradstry_backend::ids::new_uuid_v7().simple())
}

#[tokio::test]
async fn a_commercial_webhook_finds_its_connection() {
    let pool = test_pool().await;
    let snaptrade_user = unique("commercial");
    let (user_id, workspace_id) = commercial_connection(&pool, &snaptrade_user).await;

    let targets = sync_targets(&pool, &event(&snaptrade_user, None))
        .await
        .expect("the targets query must run");

    assert_eq!(targets.len(), 1);
    assert_eq!(targets[0].user_id, user_id);
    assert_eq!(targets[0].workspace_id, workspace_id);
    assert_eq!(targets[0].connection_id, format!("conn-{snaptrade_user}"));
    assert_eq!(targets[0].broker, "Webull");
}

#[tokio::test]
async fn an_oauth_webhook_finds_its_connection_through_an_active_grant() {
    let pool = test_pool().await;
    let snaptrade_user = unique("oauth");
    let workspace_id = oauth_connection(&pool, &snaptrade_user, "active").await;

    let targets = sync_targets(&pool, &event(&snaptrade_user, Some(OAUTH_CLIENT)))
        .await
        .unwrap();
    assert_eq!(
        targets
            .iter()
            .map(|t| t.workspace_id.as_str())
            .collect::<Vec<_>>(),
        [workspace_id.as_str()]
    );

    let other_client = sync_targets(&pool, &event(&snaptrade_user, Some("another-client")))
        .await
        .unwrap();
    assert!(
        other_client.is_empty(),
        "a different OAuth client must not match"
    );
}

#[tokio::test]
async fn an_oauth_webhook_ignores_a_revoked_grant() {
    let pool = test_pool().await;
    let snaptrade_user = unique("revoked");
    oauth_connection(&pool, &snaptrade_user, "revoked").await;

    let targets = sync_targets(&pool, &event(&snaptrade_user, Some(OAUTH_CLIENT)))
        .await
        .unwrap();
    assert!(targets.is_empty());
}

#[tokio::test]
async fn account_and_connection_filters_narrow_the_targets() {
    let pool = test_pool().await;
    let snaptrade_user = unique("filtered");
    commercial_connection(&pool, &snaptrade_user).await;

    let mut wrong_account = event(&snaptrade_user, None);
    wrong_account.account_id = Some("some-other-account".into());
    assert!(
        sync_targets(&pool, &wrong_account)
            .await
            .unwrap()
            .is_empty()
    );

    let mut right_connection = event(&snaptrade_user, None);
    right_connection.connection_id = Some(format!("conn-{snaptrade_user}"));
    assert_eq!(
        sync_targets(&pool, &right_connection).await.unwrap().len(),
        1
    );
}
