mod pg_support;

use chrono::{Duration, Utc};
use pg_support::{reset_schema, seed_user_workspace, test_pool};
use tradstry_backend::service::db::schema::tables::snaptrade_oauth_table::{
    self, CreateAttempt, StoreGrant,
};

fn grant<'a>(
    user_id: &'a str,
    snaptrade_user_id: &'a str,
    access_token: &'a str,
    refresh_token: &'a str,
) -> StoreGrant<'a> {
    StoreGrant {
        user_id,
        oauth_client_id: "oauth-client",
        snaptrade_user_id,
        access_token_encrypted: access_token,
        refresh_token_encrypted: refresh_token,
        access_token_expires_at: Utc::now() + Duration::hours(10),
        scopes: &[],
    }
}

#[tokio::test]
async fn same_identity_rotates_tokens_but_different_identity_is_rejected() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, _) = seed_user_workspace(&pool).await;

    let original = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-a", "access-a", "refresh-a"),
    )
    .await
    .unwrap();
    let rotated = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-a", "access-b", "refresh-b"),
    )
    .await
    .unwrap();

    assert_eq!(rotated.id, original.id);
    assert_eq!(rotated.access_token_encrypted.as_deref(), Some("access-b"));
    assert_eq!(
        rotated.refresh_token_encrypted.as_deref(),
        Some("refresh-b")
    );

    let error = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-b", "access-c", "refresh-c"),
    )
    .await
    .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("different SnapTrade Personal account")
    );

    let stored = snaptrade_oauth_table::find_grant(&pool, &user_id, &original.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.snaptrade_user_id, "personal-a");
    assert_eq!(stored.access_token_encrypted.as_deref(), Some("access-b"));
}

#[tokio::test]
async fn reauthorization_required_clears_all_usable_credentials() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, _) = seed_user_workspace(&pool).await;
    let stored = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-a", "access-a", "refresh-a"),
    )
    .await
    .unwrap();

    snaptrade_oauth_table::clear_grant_credentials(&pool, &stored.id, "reauthorization_required")
        .await
        .unwrap();

    let cleared = snaptrade_oauth_table::find_grant(&pool, &user_id, &stored.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cleared.status, "reauthorization_required");
    assert!(cleared.access_token_encrypted.is_none());
    assert!(cleared.refresh_token_encrypted.is_none());
    assert!(cleared.access_token_expires_at.is_none());
}

#[tokio::test]
async fn authorized_attempt_keeps_its_workspace_and_intent() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    let stored = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-a", "access-a", "refresh-a"),
    )
    .await
    .unwrap();
    let scopes = vec!["read".to_string()];
    let attempt_id = snaptrade_oauth_table::create_attempt(
        &pool,
        CreateAttempt {
            user_id: &user_id,
            workspace_id: &workspace_id,
            state_hash: "state-hash",
            code_verifier_encrypted: "encrypted-verifier",
            requested_scopes: &scopes,
            platform: "desktop",
            intent: "reauthorize",
            expires_at: Utc::now() + Duration::minutes(10),
        },
    )
    .await
    .unwrap();
    snaptrade_oauth_table::claim_attempt(&pool, "state-hash")
        .await
        .unwrap();
    snaptrade_oauth_table::finish_attempt(&pool, &attempt_id, "authorized", None, Some(&stored.id))
        .await
        .unwrap();

    let attempt = snaptrade_oauth_table::authorized_attempt(&pool, &user_id, &attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.grant_id, stored.id);
    assert_eq!(attempt.workspace_id, workspace_id);
    assert_eq!(attempt.intent, "reauthorize");
}

#[tokio::test]
async fn local_revocation_clears_tokens_and_unlinks_every_oauth_workspace() {
    let pool = test_pool().await;
    let _guard = reset_schema(&pool).await;
    tradstry_backend::service::db::schema::pg::migrate(&pool)
        .await
        .unwrap();
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    let stored = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-a", "access-a", "refresh-a"),
    )
    .await
    .unwrap();
    tradstry_backend::service::db::schema::tables::workspaces_table::prepare_snaptrade_oauth_connection(
        &pool,
        &workspace_id,
        &user_id,
        &stored.id,
        "connection-a",
    )
    .await
    .unwrap();

    let unlinked = snaptrade_oauth_table::revoke_grant_locally(&pool, &user_id, &stored.id)
        .await
        .unwrap();

    assert_eq!(unlinked, 1);
    let revoked = snaptrade_oauth_table::find_grant(&pool, &user_id, &stored.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(revoked.status, "revoked");
    assert!(revoked.access_token_encrypted.is_none());
    assert!(revoked.refresh_token_encrypted.is_none());
    let workspace =
        tradstry_backend::service::db::schema::tables::workspaces_table::find_workspace(
            &pool,
            &workspace_id,
            &user_id,
        )
        .await
        .unwrap()
        .unwrap();
    assert!(workspace.snaptrade_connection_id.is_none());
    assert!(workspace.snaptrade_oauth_grant_id.is_none());

    let replacement = snaptrade_oauth_table::store_grant(
        &pool,
        grant(&user_id, "personal-b", "access-b", "refresh-b"),
    )
    .await
    .unwrap();
    assert_eq!(replacement.id, stored.id);
    assert_eq!(replacement.snaptrade_user_id, "personal-b");
}
