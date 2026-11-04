//! The database itself enforces the brokerage invariants, so a bug in Rust
//! code cannot store an inconsistent state.

use chrono::{Duration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use tradstry::{
    brokerage::store::{self, AuthorizedTokens, ConnectionUpsert, GrantError, NewAccount},
    users::{self, Provisioning},
};

const CLIENT: &str = "oauth-client-test";

async fn user(pool: &PgPool, stytch_id: &str) -> Uuid {
    users::load_user(pool, stytch_id, "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id
}

fn tokens(personal: &str) -> AuthorizedTokens<'_> {
    AuthorizedTokens {
        personal_user_id: personal,
        access_token_encrypted: "enc-access",
        refresh_token_encrypted: "enc-refresh",
        expires_at: Utc::now() + Duration::hours(10),
        scopes: &[],
    }
}

fn connection(user_id: Uuid, grant: Option<Uuid>, snaptrade_id: &str) -> ConnectionUpsert<'_> {
    ConnectionUpsert {
        user_id,
        oauth_grant_id: grant,
        snaptrade_connection_id: snaptrade_id,
        institution_name: "Sandbox",
        institution_slug: Some("SANDBOX"),
        disabled: false,
        disabled_at: None,
        data_freshness_mode: None,
    }
}

fn account(user_id: Uuid, connection_id: Uuid, snaptrade_id: &str) -> NewAccount<'_> {
    NewAccount {
        user_id,
        connection_id,
        snaptrade_account_id: snaptrade_id,
        name: "Margin",
        masked_number: Some("****1234"),
        kind: "investment",
        raw_type: Some("Margin"),
        cash_or_margin: "margin",
        is_paper: false,
        import_mode: "one_year",
        import_start_date: None,
    }
}

#[sqlx::test]
async fn an_active_grant_must_hold_tokens_and_an_inactive_one_none(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let grant = store::store_authorized_grant(&pool, owner, CLIENT, tokens("personal-1"))
        .await
        .unwrap();

    let missing_tokens = sqlx::query(
        "UPDATE snaptrade_oauth_grants SET access_token_encrypted = NULL WHERE id = $1",
    )
    .bind(grant.id)
    .execute(&pool)
    .await;
    assert!(
        missing_tokens.is_err(),
        "an active grant cannot lose its tokens"
    );

    let inactive_with_tokens =
        sqlx::query("UPDATE snaptrade_oauth_grants SET status = 'revoked' WHERE id = $1")
            .bind(grant.id)
            .execute(&pool)
            .await;
    assert!(
        inactive_with_tokens.is_err(),
        "a revoked grant cannot keep tokens"
    );

    store::clear_grant(&pool, grant.id, "revoked")
        .await
        .unwrap();
    let cleared = store::grant(&pool, grant.id).await.unwrap().unwrap();
    assert_eq!(cleared.status, "revoked");
    assert!(cleared.access_token_encrypted.is_none() && cleared.refresh_token_encrypted.is_none());
}

#[sqlx::test]
async fn reauthorizing_rotates_the_grant_but_a_new_identity_needs_unlinking_first(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let first = store::store_authorized_grant(&pool, owner, CLIENT, tokens("personal-1"))
        .await
        .unwrap();
    let again = store::store_authorized_grant(&pool, owner, CLIENT, tokens("personal-1"))
        .await
        .unwrap();
    assert_eq!(again.id, first.id);

    store::upsert_connection(&pool, connection(owner, Some(first.id), "conn-1"))
        .await
        .unwrap();
    let error = store::store_authorized_grant(&pool, owner, CLIENT, tokens("personal-2"))
        .await
        .unwrap_err();
    assert_eq!(
        error.downcast::<GrantError>().unwrap(),
        GrantError::IdentityMismatch
    );

    let linked = store::connections_for_user(&pool, owner).await.unwrap();
    store::unlink_connection(&pool, linked[0].id).await.unwrap();
    let switched = store::store_authorized_grant(&pool, owner, CLIENT, tokens("personal-2"))
        .await
        .unwrap();
    assert_eq!(
        (switched.id, switched.personal_user_id.as_str()),
        (first.id, "personal-2")
    );
}

#[sqlx::test]
async fn one_personal_identity_belongs_to_one_tradstry_user(pool: PgPool) {
    let (first, second) = (user(&pool, "user-1").await, user(&pool, "user-2").await);
    let grant = store::store_authorized_grant(&pool, first, CLIENT, tokens("personal-1"))
        .await
        .unwrap();
    let error = store::store_authorized_grant(&pool, second, CLIENT, tokens("personal-1"))
        .await
        .unwrap_err();
    assert_eq!(
        error.downcast::<GrantError>().unwrap(),
        GrantError::IdentityInUse
    );

    store::clear_grant(&pool, grant.id, "revoked")
        .await
        .unwrap();
    store::store_authorized_grant(&pool, second, CLIENT, tokens("personal-1"))
        .await
        .unwrap();
}

#[sqlx::test]
async fn a_connection_never_mixes_credential_kinds(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let commercial = store::upsert_connection(&pool, connection(owner, None, "conn-1"))
        .await
        .unwrap();
    assert_eq!(commercial.auth_mode, "commercial");
    let mixed = sqlx::query("UPDATE brokerage_connections SET auth_mode = 'oauth' WHERE id = $1")
        .bind(commercial.id)
        .execute(&pool)
        .await;
    assert!(mixed.is_err(), "oauth without a grant is rejected");
}

#[sqlx::test]
async fn accounts_get_one_workspace_and_unlinking_keeps_them(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let linked = store::upsert_connection(&pool, connection(owner, None, "conn-1"))
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    let created =
        store::create_account_with_workspace(&mut tx, account(owner, linked.id, "acct-1"))
            .await
            .unwrap();
    tx.commit().await.unwrap();
    let workspace = created
        .workspace_id
        .expect("a workspace is created with the account");

    let second_binding = sqlx::query("INSERT INTO workspaces (id, user_id, name, brokerage_account_id) VALUES ($1, $2, 'Dup', $3)")
        .bind(Uuid::now_v7())
        .bind(owner)
        .bind(created.id)
        .execute(&pool)
        .await;
    assert!(
        second_binding.is_err(),
        "an account binds to at most one workspace"
    );

    let mut tx = pool.begin().await.unwrap();
    let duplicate =
        store::create_account_with_workspace(&mut tx, account(owner, linked.id, "acct-1")).await;
    assert!(
        duplicate.is_err(),
        "the same SnapTrade account is imported once per user"
    );
    drop(tx);

    store::unlink_connection(&pool, linked.id).await.unwrap();
    let after = store::account_for_user(&pool, owner, created.id)
        .await
        .unwrap()
        .unwrap();
    assert!(after.unlinked_at.is_some());
    assert_eq!(
        after.workspace_id,
        Some(workspace),
        "unlinking keeps the workspace"
    );

    let relinked = store::upsert_connection(&pool, connection(owner, None, "conn-1"))
        .await
        .unwrap();
    assert!(relinked.unlinked_at.is_none());
    assert_eq!(relinked.id, linked.id);
}

#[sqlx::test]
async fn attempts_are_claimed_once_and_expire(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let new = |hash: &'static str, expires| store::NewAttempt {
        user_id: owner,
        state_hash: hash,
        code_verifier_encrypted: "enc-verifier",
        scopes: &[],
        intent: "connect",
        expires_at: expires,
    };
    let id = store::create_attempt(&pool, new("hash-1", Utc::now() + Duration::minutes(10)))
        .await
        .unwrap();
    assert_eq!(
        store::claim_attempt(&pool, "hash-1")
            .await
            .unwrap()
            .unwrap()
            .id,
        id
    );
    assert!(
        store::claim_attempt(&pool, "hash-1")
            .await
            .unwrap()
            .is_none(),
        "a replay claims nothing"
    );

    store::create_attempt(&pool, new("hash-2", Utc::now() - Duration::seconds(1)))
        .await
        .unwrap();
    assert!(
        store::claim_attempt(&pool, "hash-2")
            .await
            .unwrap()
            .is_none(),
        "expired attempts cannot be claimed"
    );

    let bad =
        sqlx::query("UPDATE snaptrade_oauth_attempts SET status = 'authorized' WHERE id = $1")
            .bind(id)
            .execute(&pool)
            .await;
    assert!(bad.is_err(), "an authorized attempt must name its grant");
}

#[sqlx::test]
async fn deleting_a_user_removes_every_brokerage_row(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    store::insert_registration(&pool, owner, "snap-1", "enc")
        .await
        .unwrap();
    let grant = store::store_authorized_grant(&pool, owner, CLIENT, tokens("personal-1"))
        .await
        .unwrap();
    let oauth = store::upsert_connection(&pool, connection(owner, Some(grant.id), "conn-oauth"))
        .await
        .unwrap();
    let commercial = store::upsert_connection(&pool, connection(owner, None, "conn-commercial"))
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    store::create_account_with_workspace(&mut tx, account(owner, oauth.id, "acct-1"))
        .await
        .unwrap();
    store::create_account_with_workspace(&mut tx, account(owner, commercial.id, "acct-2"))
        .await
        .unwrap();
    tx.commit().await.unwrap();

    assert!(users::delete(&pool, owner).await.unwrap());
    for table in [
        "snaptrade_registrations",
        "snaptrade_oauth_grants",
        "brokerage_connections",
        "brokerage_accounts",
        "workspaces",
    ] {
        let left: i64 =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(left, 0, "{table} still has rows");
    }
}

#[sqlx::test]
async fn webhook_events_are_kept_for_a_week(pool: PgPool) {
    use tradstry::brokerage::webhooks::{WebhookEvent, delete_old_events, record};
    for id in ["old", "recent"] {
        let event = WebhookEvent {
            webhook_id: id.into(),
            event_type: "CONNECTION_BROKEN".into(),
            timestamp: Utc::now(),
            snaptrade_user_id: Some("u".into()),
            oauth_client_id: None,
            connection_id: None,
            account_id: None,
            payload: serde_json::json!({ "webhookId": id }),
        };
        assert!(record(&pool, &event).await.unwrap());
    }
    sqlx::query("UPDATE snaptrade_webhook_events SET received_at = now() - interval '8 days' WHERE webhook_id = 'old'")
        .execute(&pool)
        .await
        .unwrap();

    assert_eq!(delete_old_events(&pool).await.unwrap(), 1);
    let left: Vec<String> = sqlx::query_scalar("SELECT webhook_id FROM snaptrade_webhook_events")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(left, ["recent"]);
}
