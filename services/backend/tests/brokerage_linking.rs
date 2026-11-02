use std::sync::Arc;

use async_graphql::{Request, Response};
use axum::{
    body::Body,
    http::{Request as HttpRequest, StatusCode},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use tradstry::{
    app::{self, AppState},
    auth::{
        stytch::fake::FakeStytch,
        test_jwt::{self, PROJECT},
    },
    brokerage::{
        Brokerage, SessionError,
        history::ImportMode,
        linking::{LinkError, Selection},
        store,
    },
    graphql::{RequestUser, build_schema},
    snaptrade::fake::{FakeAccount, FakeSnapTrade},
    users::{self, Provisioning},
};

async fn user(pool: &PgPool, stytch_id: &str) -> Uuid {
    users::load_user(pool, stytch_id, "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id
}

fn select(connection_id: Uuid, account: &str) -> Selection {
    Selection {
        connection_id,
        snaptrade_account_id: account.to_owned(),
        mode: ImportMode::OneYear,
        custom_start_date: None,
    }
}

fn param(url: &str, name: &str) -> String {
    reqwest::Url::parse(url)
        .unwrap()
        .query_pairs()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
        .unwrap_or_default()
}

async fn workspace_names(pool: &PgPool, user_id: Uuid) -> Vec<String> {
    sqlx::query_scalar("SELECT name FROM workspaces WHERE user_id = $1 ORDER BY created_at")
        .bind(user_id)
        .fetch_all(pool)
        .await
        .unwrap()
}

/// Links a Commercial connection through the (fake) portal and returns its Tradstry ID.
async fn link_commercial(
    brokerage: &Brokerage,
    snaptrade: &FakeSnapTrade,
    owner: Uuid,
    connection: &str,
) -> Uuid {
    brokerage.start_commercial(owner, None).await.unwrap();
    snaptrade.complete_portal(
        &owner.to_string(),
        connection,
        vec![
            FakeAccount::investment(&format!("{connection}-acct"), "Individual Margin"),
            FakeAccount::of_kind(&format!("{connection}-bank"), "deposit"),
        ],
    );
    let choices = brokerage
        .complete_commercial(owner, connection)
        .await
        .unwrap();
    choices[0].connection_id
}

/// Runs SnapTrade OAuth for a Personal user and returns the attempt's outcome.
async fn authorize(
    brokerage: &Brokerage,
    snaptrade: &FakeSnapTrade,
    owner: Uuid,
    personal: &str,
    intent: &str,
) -> (Uuid, String) {
    let started = brokerage.start_oauth(owner, intent).await.unwrap();
    let code = snaptrade.approve(personal, &started.authorization_url);
    let state = param(&started.authorization_url, "state");
    let outcome = brokerage
        .oauth_callback(&state, Some(&code), None)
        .await
        .unwrap();
    assert_eq!(outcome.attempt_id, Some(started.attempt_id));
    (started.attempt_id, outcome.status)
}

// ── Commercial ──────────────────────────────────────────────────────────────

#[sqlx::test]
async fn selecting_a_broker_opens_that_broker_and_rejects_unknown_slugs(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    brokerage
        .start_commercial_for_broker(owner, "ROBINHOOD")
        .await
        .unwrap();
    let body = snaptrade
        .requests()
        .into_iter()
        .find(|request| request.path == "/snapTrade/login")
        .unwrap()
        .body
        .unwrap();
    assert_eq!(body["broker"], "ROBINHOOD");
    assert_eq!(body["connectionType"], "read");
    assert!(matches!(
        brokerage
            .start_commercial_for_broker(owner, "NOT-A-BROKER")
            .await,
        Err(LinkError::BrokerUnavailable)
    ));
    assert_eq!(snaptrade.requests_to("/snapTrade/login"), 1);
}

#[sqlx::test]
async fn disabled_and_maintenance_brokers_do_not_create_registrations(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.set_brokerages(vec![
        json!({ "slug": "DISABLED", "name": "Disabled", "enabled": false, "maintenance_mode": false }),
        json!({ "slug": "MAINTENANCE", "name": "Maintenance", "enabled": true, "maintenance_mode": true }),
    ]);
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    for slug in ["DISABLED", "MAINTENANCE"] {
        assert!(matches!(
            brokerage.start_commercial_for_broker(owner, slug).await,
            Err(LinkError::BrokerUnavailable)
        ));
    }
    assert!(snaptrade.registered_users().is_empty());
    assert_eq!(snaptrade.requests_to("/snapTrade/login"), 0);
}

#[sqlx::test]
async fn the_portal_registers_once_and_returns_to_the_website(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;

    let starts = (0..4).map(|_| brokerage.start_commercial(owner, None));
    for url in futures_util::future::join_all(starts).await {
        assert!(
            url.unwrap()
                .starts_with("https://connect.snaptrade.test/portal")
        );
    }
    assert_eq!(snaptrade.requests_to("/snapTrade/registerUser"), 1);
    assert_eq!(snaptrade.registered_users(), [owner.to_string()]);
    let body = snaptrade
        .requests()
        .into_iter()
        .rev()
        .find(|r| r.path == "/snapTrade/login")
        .unwrap()
        .body
        .unwrap();
    assert_eq!(
        body["customRedirect"],
        "http://localhost:5173/brokerage/callback"
    );
    assert_eq!(body["connectionType"], "read");
}

#[sqlx::test]
async fn completing_a_connection_offers_only_its_investment_accounts(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    brokerage.start_commercial(owner, None).await.unwrap();

    assert!(matches!(
        brokerage.complete_commercial(owner, "not-mine").await,
        Err(LinkError::NotFound)
    ));

    snaptrade.complete_portal(
        &owner.to_string(),
        "conn-1",
        vec![
            FakeAccount::investment("acct-1", "Margin"),
            FakeAccount::of_kind("bank-1", "deposit"),
        ],
    );
    let choices = brokerage
        .complete_commercial(owner, "conn-1")
        .await
        .unwrap();
    let ids: Vec<&str> = choices
        .iter()
        .map(|c| c.snaptrade_account_id.as_str())
        .collect();
    assert_eq!(ids, ["acct-1"]);
    assert_eq!(choices[0].institution_name, "Sandbox");
    assert!(choices[0].linked_workspace_id.is_none());
}

#[sqlx::test]
async fn chosen_accounts_become_workspaces_once(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let connection = link_commercial(&brokerage, &snaptrade, owner, "conn-1").await;

    let imported = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();
    assert_eq!(imported[0].import_mode, "one_year");
    assert!(imported[0].import_start_date.is_some());
    let again = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();
    assert_eq!(
        again[0].id, imported[0].id,
        "repeating a choice is harmless"
    );
    assert_eq!(
        workspace_names(&pool, owner).await,
        ["Main Workspace", "Individual Margin"]
    );

    let deposit = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-bank")])
        .await;
    assert!(matches!(deposit, Err(LinkError::InvalidSelection(_))));
    let mut future = select(connection, "conn-1-acct");
    future.mode = ImportMode::Custom;
    future.custom_start_date = Some(chrono::NaiveDate::from_ymd_opt(2999, 1, 1).unwrap());
    assert!(matches!(
        brokerage.finalize_accounts(owner, vec![future]).await,
        Err(LinkError::InvalidImportRange(_))
    ));
    let other = user(&pool, "user-2").await;
    assert!(matches!(
        brokerage
            .finalize_accounts(other, vec![select(connection, "conn-1-acct")])
            .await,
        Err(LinkError::NotFound)
    ));
}

#[sqlx::test]
async fn stale_credentials_heal_by_registering_again(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let connection = link_commercial(&brokerage, &snaptrade, owner, "conn-1").await;
    brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();
    let before = store::registration(&pool, owner).await.unwrap().unwrap();

    snaptrade.forget_user(&owner.to_string());
    brokerage
        .start_commercial(owner, Some(connection))
        .await
        .unwrap();

    let after = store::registration(&pool, owner).await.unwrap().unwrap();
    assert_ne!(after.user_secret_encrypted, before.user_secret_encrypted);
    let old = store::connection_for_user(&pool, owner, connection)
        .await
        .unwrap()
        .unwrap();
    assert!(
        old.unlinked_at.is_some(),
        "connections of the dead registration are unlinked"
    );
    assert_eq!(
        workspace_names(&pool, owner).await.len(),
        2,
        "their workspaces and data stay"
    );
    let login = snaptrade
        .requests()
        .into_iter()
        .rev()
        .find(|r| r.path == "/snapTrade/login")
        .unwrap();
    assert!(
        login.body.unwrap().get("reconnect").is_none(),
        "the gone connection is not repaired"
    );
}

#[sqlx::test]
async fn reconnecting_targets_only_the_users_own_commercial_connections(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let connection = link_commercial(&brokerage, &snaptrade, owner, "conn-1").await;

    brokerage
        .start_commercial(owner, Some(connection))
        .await
        .unwrap();
    let login = snaptrade
        .requests()
        .into_iter()
        .rev()
        .find(|r| r.path == "/snapTrade/login")
        .unwrap();
    assert_eq!(login.body.unwrap()["reconnect"], "conn-1");

    let other = user(&pool, "user-2").await;
    assert!(matches!(
        brokerage.start_commercial(other, Some(connection)).await,
        Err(LinkError::NotFound)
    ));

    snaptrade.personal_connection("personal-1", "conn-oauth", &["acct-9"]);
    let (attempt, _) = authorize(&brokerage, &snaptrade, owner, "personal-1", "connect").await;
    let choices = brokerage
        .oauth_account_choices(owner, attempt)
        .await
        .unwrap();
    let oauth_connection = choices[0].connection_id;
    assert!(matches!(
        brokerage
            .start_commercial(owner, Some(oauth_connection))
            .await,
        Err(LinkError::RepairInSnapTrade)
    ));
}

#[sqlx::test]
async fn choosing_an_unlinked_account_again_restores_its_workspace(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let connection = link_commercial(&brokerage, &snaptrade, owner, "conn-1").await;
    let imported = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();

    store::unlink_account(&pool, imported[0].id).await.unwrap();
    let choices = brokerage
        .connection_account_choices(owner, connection)
        .await
        .unwrap();
    assert!(choices[0].previously_linked);

    let restored = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();
    assert_eq!(restored[0].id, imported[0].id);
    assert!(restored[0].unlinked_at.is_none());
    assert_eq!(restored[0].workspace_id, imported[0].workspace_id);
}

#[sqlx::test]
async fn importing_again_after_deleting_the_workspace_gives_the_account_a_new_one(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let connection = link_commercial(&brokerage, &snaptrade, owner, "conn-1").await;
    let imported = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();
    let old_workspace = imported[0].workspace_id.unwrap();

    tradstry::workspace::delete(&pool, owner, old_workspace)
        .await
        .unwrap();
    let choices = brokerage
        .connection_account_choices(owner, connection)
        .await
        .unwrap();
    assert_eq!(choices[0].linked_workspace_id, None);

    let again = brokerage
        .finalize_accounts(owner, vec![select(connection, "conn-1-acct")])
        .await
        .unwrap();
    assert_eq!(again[0].id, imported[0].id, "history is kept");
    let new_workspace = again[0].workspace_id.expect("a workspace again");
    assert_ne!(new_workspace, old_workspace);
    assert_eq!(
        workspace_names(&pool, owner).await,
        ["Main Workspace", "Individual Margin"]
    );
}

#[sqlx::test]
async fn sub_accounts_are_classified_and_keep_snaptrades_cash_or_margin(pool: PgPool) {
    use tradstry::brokerage::account_types::{AccountType, CashOrMargin};

    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    brokerage.start_commercial(owner, None).await.unwrap();
    snaptrade.complete_portal(
        &owner.to_string(),
        "conn-1",
        vec![
            FakeAccount::typed("margin", "Individual", "INDIVIDUAL", "margin"),
            FakeAccount::typed("roth", "Retirement", "ROTH", "cash"),
            FakeAccount::typed("odd", "****8443", "RO", "portfolio"),
        ],
    );
    let choices = brokerage
        .complete_commercial(owner, "conn-1")
        .await
        .unwrap();
    let summary: Vec<(String, AccountType, CashOrMargin)> = choices
        .iter()
        .map(|choice| {
            (
                choice.snaptrade_account_id.clone(),
                tradstry::brokerage::account_types::classify(
                    choice.raw_type.as_deref(),
                    &choice.name,
                ),
                choice.cash_or_margin,
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            ("margin".into(), AccountType::Taxable, CashOrMargin::Margin),
            ("roth".into(), AccountType::RothIra, CashOrMargin::Cash),
            ("odd".into(), AccountType::Unknown, CashOrMargin::Unknown),
        ]
    );

    let connection = choices[0].connection_id;
    let imported = brokerage
        .finalize_accounts(owner, vec![select(connection, "roth")])
        .await
        .unwrap();
    assert_eq!(imported[0].cash_or_margin, "cash");
    assert_eq!(imported[0].raw_type.as_deref(), Some("ROTH"));
}

// ── OAuth ───────────────────────────────────────────────────────────────────

#[sqlx::test]
async fn oauth_links_a_personal_users_accounts(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.personal_connection("personal-1", "conn-9", &["acct-9"]);
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;

    let started = brokerage.start_oauth(owner, "connect").await.unwrap();
    assert_eq!(param(&started.authorization_url, "scope"), "read webhook");
    assert!(matches!(
        brokerage
            .oauth_account_choices(owner, started.attempt_id)
            .await,
        Err(LinkError::AuthorizationIncomplete)
    ));
    let code = snaptrade.approve("personal-1", &started.authorization_url);
    let state = param(&started.authorization_url, "state");
    let outcome = brokerage
        .oauth_callback(&state, Some(&code), None)
        .await
        .unwrap();
    assert_eq!(outcome.status, "authorized");

    let attempt = brokerage
        .oauth_status(owner, started.attempt_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.status, "authorized");
    let other = user(&pool, "user-2").await;
    assert!(
        brokerage
            .oauth_status(other, started.attempt_id)
            .await
            .unwrap()
            .is_none()
    );

    let choices = brokerage
        .oauth_account_choices(owner, started.attempt_id)
        .await
        .unwrap();
    assert_eq!(choices.len(), 1);
    let imported = brokerage
        .finalize_accounts(owner, vec![select(choices[0].connection_id, "acct-9")])
        .await
        .unwrap();
    assert!(imported[0].workspace_id.is_some());
    let connection = store::connection_for_user(&pool, owner, choices[0].connection_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(connection.auth_mode, "oauth");

    let replay = brokerage
        .oauth_callback(&state, Some(&code), None)
        .await
        .unwrap();
    assert_eq!(
        (replay.attempt_id, replay.status.as_str()),
        (None, "invalid")
    );
}

#[sqlx::test]
async fn every_failed_callback_records_why(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let run = |code: Option<&'static str>, error: Option<&'static str>| {
        let brokerage = &brokerage;
        async move {
            let started = brokerage.start_oauth(owner, "connect").await.unwrap();
            let state = param(&started.authorization_url, "state");
            let outcome = brokerage.oauth_callback(&state, code, error).await.unwrap();
            let attempt = brokerage
                .oauth_status(owner, started.attempt_id)
                .await
                .unwrap()
                .unwrap();
            (outcome.status, attempt.status, attempt.error_code)
        }
    };
    assert_eq!(
        run(None, Some("access_denied")).await,
        (
            "denied".into(),
            "denied".into(),
            Some("access_denied".into())
        )
    );
    assert_eq!(
        run(None, None).await,
        (
            "failed".into(),
            "failed".into(),
            Some("missing_code".into())
        )
    );
    assert_eq!(
        run(Some("forged-code"), None).await,
        (
            "failed".into(),
            "failed".into(),
            Some("token_exchange_failed".into())
        )
    );
    assert_eq!(
        brokerage
            .oauth_callback("", None, None)
            .await
            .unwrap()
            .status,
        "invalid"
    );
}

#[sqlx::test]
async fn a_different_personal_identity_is_refused_while_accounts_are_linked(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.personal_connection("personal-1", "conn-1", &["acct-1"]);
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let (attempt, _) = authorize(&brokerage, &snaptrade, owner, "personal-1", "connect").await;
    let choices = brokerage
        .oauth_account_choices(owner, attempt)
        .await
        .unwrap();
    brokerage
        .finalize_accounts(owner, vec![select(choices[0].connection_id, "acct-1")])
        .await
        .unwrap();

    let (mismatch, status) =
        authorize(&brokerage, &snaptrade, owner, "personal-2", "reauthorize").await;
    assert_eq!(status, "failed");
    let attempt = brokerage
        .oauth_status(owner, mismatch)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.error_code.as_deref(), Some("identity_mismatch"));
    assert_eq!(
        snaptrade.revoked_tokens().len(),
        1,
        "the unwanted tokens are revoked upstream"
    );

    let other = user(&pool, "user-2").await;
    let (in_use, _) = authorize(&brokerage, &snaptrade, other, "personal-1", "connect").await;
    let attempt = brokerage
        .oauth_status(other, in_use)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(attempt.error_code.as_deref(), Some("identity_in_use"));
}

#[sqlx::test]
async fn revoking_always_clears_local_access(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.personal_connection("personal-1", "conn-1", &["acct-1"]);
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let (attempt, _) = authorize(&brokerage, &snaptrade, owner, "personal-1", "connect").await;
    let choices = brokerage
        .oauth_account_choices(owner, attempt)
        .await
        .unwrap();
    brokerage
        .finalize_accounts(owner, vec![select(choices[0].connection_id, "acct-1")])
        .await
        .unwrap();

    snaptrade.fail_next("/oauth/revoke", 500, json!({ "error": "server_error" }));
    let revocation = brokerage.revoke_oauth(owner).await.unwrap();
    assert!(revocation.revoked && !revocation.upstream_confirmed);
    assert_eq!(revocation.unlinked_connections, 1);
    let grant = store::grant_for_user(&pool, owner, "oauth-client-test")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(grant.status, "revoked");
    assert!(grant.access_token_encrypted.is_none() && grant.refresh_token_encrypted.is_none());
    assert_eq!(
        workspace_names(&pool, owner).await.len(),
        2,
        "unlinking keeps the workspace"
    );

    let (_, status) = authorize(&brokerage, &snaptrade, owner, "personal-1", "connect").await;
    assert_eq!(
        status, "authorized",
        "the user can authorize again after revoking"
    );
}

// ── Connection management ───────────────────────────────────────────────────

#[sqlx::test]
async fn health_refresh_disconnect_and_account_deletion(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let first = link_commercial(&brokerage, &snaptrade, owner, "conn-1").await;
    let second = link_commercial(&brokerage, &snaptrade, owner, "conn-2").await;
    brokerage
        .finalize_accounts(owner, vec![select(first, "conn-1-acct")])
        .await
        .unwrap();
    sqlx::query("UPDATE brokerage_connections SET checked_at = NULL")
        .execute(&pool)
        .await
        .unwrap();

    snaptrade.set_disabled("conn-1", true);
    let views = brokerage.connections(owner, true).await.unwrap();
    let health: Vec<(String, bool)> = views
        .iter()
        .map(|v| {
            (
                v.connection.snaptrade_connection_id.clone(),
                v.connection.disabled,
            )
        })
        .collect();
    assert_eq!(
        health,
        [("conn-1".to_owned(), true), ("conn-2".to_owned(), false)]
    );
    assert_eq!(views[0].accounts.len(), 1);

    brokerage.disconnect(owner, second).await.unwrap();
    assert!(
        !snaptrade.connection_ids().contains(&"conn-2".to_owned()),
        "a Commercial connection is removed upstream"
    );
    assert!(
        store::connection_for_user(&pool, owner, second)
            .await
            .unwrap()
            .unwrap()
            .unlinked_at
            .is_some()
    );

    brokerage.cleanup_user(owner).await;
    assert!(
        snaptrade.registered_users().is_empty(),
        "account deletion removes the SnapTrade user"
    );
}

// ── HTTP and GraphQL ────────────────────────────────────────────────────────

#[sqlx::test]
async fn the_callback_route_redirects_to_the_website_without_secrets(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let mut services = app::test_services(pool.clone());
    services.brokerage = Some(Arc::new(Brokerage::for_tests(pool, &snaptrade)));
    let router = app::router(AppState::new(services), vec![]);
    let response = router
        .oneshot(
            HttpRequest::get("/oauth/snaptrade/callback?state=forged&code=abc")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let location = response.headers()["location"].to_str().unwrap();
    assert_eq!(
        location,
        "http://localhost:5173/brokerage/oauth/callback?status=invalid"
    );
}

async fn graphql(
    pool: &PgPool,
    brokerage: Option<Arc<Brokerage>>,
    token: Value,
    query: &str,
) -> Response {
    let claims = test_jwt::test_verifier()
        .verify(&test_jwt::sign(&token))
        .await
        .unwrap();
    build_schema(pool.clone(), Arc::new(FakeStytch::default()), brokerage)
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

#[sqlx::test]
async fn graphql_guards_brokerage_actions(pool: PgPool) {
    let now = chrono::Utc::now().timestamp();
    let session = json!({
        "iss": format!("stytch.com/{PROJECT}"), "sub": "user-1", "aud": [PROJECT], "iat": now, "exp": now + 300,
        "https://stytch.com/session": {"id": "session-1"},
    });
    let app = json!({
        "iss": format!("stytch.com/{PROJECT}"), "sub": "user-1", "aud": [PROJECT], "iat": now, "exp": now + 300,
        "client_id": "connected-app-1",
    });
    let unavailable = graphql(
        &pool,
        None,
        session.clone(),
        "mutation { startBrokerageConnection { url } }",
    )
    .await;
    assert_eq!(code(&unavailable).as_deref(), Some("BROKERAGE_UNAVAILABLE"));
    let status = graphql(
        &pool,
        None,
        session.clone(),
        "{ brokerageStatus { available oauthAvailable } }",
    )
    .await;
    assert_eq!(
        status.data.into_json().unwrap()["brokerageStatus"],
        json!({"available": false, "oauthAvailable": false})
    );

    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Some(Arc::new(Brokerage::for_tests(pool.clone(), &snaptrade)));
    user(&pool, "user-1").await;
    let refused = graphql(
        &pool,
        brokerage.clone(),
        app,
        "mutation { startBrokerageConnection { url } }",
    )
    .await;
    assert_eq!(code(&refused).as_deref(), Some("SESSION_REQUIRED"));
    let providers = graphql(
        &pool,
        brokerage.clone(),
        session.clone(),
        "{ brokerageProviders { slug name logoUrl enabled maintenanceMode } }",
    )
    .await;
    assert!(providers.errors.is_empty(), "{:?}", providers.errors);
    assert_eq!(
        providers.data.into_json().unwrap()["brokerageProviders"],
        json!([{
            "slug": "ROBINHOOD", "name": "Robinhood", "logoUrl": "https://example.test/robinhood-square.png",
            "enabled": true, "maintenanceMode": false,
        }])
    );
    let started = graphql(
        &pool,
        brokerage,
        session,
        "mutation { startBrokerageConnection(brokerSlug: \"ROBINHOOD\") { url } }",
    )
    .await;
    assert!(started.errors.is_empty(), "{:?}", started.errors);
    let body = snaptrade
        .requests()
        .into_iter()
        .find(|request| request.path == "/snapTrade/login")
        .unwrap()
        .body
        .unwrap();
    assert_eq!(body["broker"], "ROBINHOOD");
}

#[sqlx::test]
async fn reauthorization_surfaces_as_a_code(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.personal_connection("personal-1", "conn-1", &["acct-1"]);
    let brokerage = Brokerage::for_tests(pool.clone(), &snaptrade);
    let owner = user(&pool, "user-1").await;
    let (attempt, _) = authorize(&brokerage, &snaptrade, owner, "personal-1", "connect").await;
    let choices = brokerage
        .oauth_account_choices(owner, attempt)
        .await
        .unwrap();
    snaptrade.expire_access_tokens();
    snaptrade.invalidate_refresh_tokens();
    let error = brokerage
        .connection_account_choices(owner, choices[0].connection_id)
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        LinkError::Session(SessionError::ReauthorizationRequired)
    ));
}
