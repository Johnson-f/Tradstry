use std::sync::Arc;

use async_graphql::Request;
use axum::body::Body;
use axum::http::{Request as HttpRequest, StatusCode};
use base64::Engine;
use chrono::{Duration, NaiveDate, Utc};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::{Value, json};
use sha2::Sha256;
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use tradstry::app::{self, AppState};
use tradstry::auth::stytch::fake::FakeStytch;
use tradstry::auth::test_jwt::{self, PROJECT};
use tradstry::brokerage::history::ImportMode;
use tradstry::brokerage::import::ImportError;
use tradstry::brokerage::linking::Selection;
use tradstry::brokerage::{Brokerage, store};
use tradstry::graphql::{RequestUser, build_schema};
use tradstry::snaptrade::fake::{self, FakeAccount, FakeSnapTrade};
use tradstry::users::{self, Provisioning};

struct Linked {
    snaptrade: FakeSnapTrade,
    brokerage: Arc<Brokerage>,
    user_id: Uuid,
    connection_id: Uuid,
    account: store::Account,
}

fn activity(id: &str, day: NaiveDate, kind: &str) -> Value {
    json!({
        "id": id, "type": kind, "units": 1, "price": 10.0, "amount": -10.0,
        "currency": {"code": "USD"}, "trade_date": format!("{day}T00:00:00Z"),
        "symbol": {"id": "sym-1", "symbol": "AAPL"},
    })
}

/// A user with one imported Commercial account, before its first sync runs.
async fn linked(pool: &PgPool, mode: ImportMode, custom: Option<NaiveDate>) -> Linked {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Arc::new(Brokerage::for_tests(pool.clone(), &snaptrade));
    let user_id = users::load_user(pool, "user-1", "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id;
    brokerage.start_commercial(user_id, None).await.unwrap();
    snaptrade.complete_portal(
        &user_id.to_string(),
        "conn-1",
        vec![FakeAccount::investment("acct-1", "Margin")],
    );
    let choices = brokerage
        .complete_commercial(user_id, "conn-1")
        .await
        .unwrap();
    let connection_id = choices[0].connection_id;
    let account = brokerage
        .finalize_accounts(
            user_id,
            vec![Selection {
                connection_id,
                snaptrade_account_id: "acct-1".into(),
                mode,
                custom_start_date: custom,
            }],
        )
        .await
        .unwrap()
        .remove(0);
    Linked {
        snaptrade,
        brokerage,
        user_id,
        connection_id,
        account,
    }
}

async fn make_due(pool: &PgPool) {
    sqlx::query("UPDATE sync_jobs SET due_at = now() - interval '1 second', leased_until = NULL")
        .execute(pool)
        .await
        .unwrap();
}

async fn jobs(pool: &PgPool) -> Vec<(String, chrono::DateTime<Utc>)> {
    sqlx::query_as("SELECT kind, due_at FROM sync_jobs ORDER BY kind")
        .fetch_all(pool)
        .await
        .unwrap()
}

async fn count(pool: &PgPool, table: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
        .fetch_one(pool)
        .await
        .unwrap()
}

fn day(value: &str) -> NaiveDate {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
}

// ── Importing ───────────────────────────────────────────────────────────────

#[sqlx::test]
async fn the_initial_import_pages_through_history_from_the_chosen_start(pool: PgPool) {
    let l = linked(&pool, ImportMode::Custom, Some(day("2025-01-01"))).await;
    let mut history: Vec<Value> = (0..1500)
        .map(|n| {
            activity(
                &format!("act-{n}"),
                day("2025-02-01") + Duration::days(n % 300),
                "BUY",
            )
        })
        .collect();
    history.push(activity("too-old", day("2024-06-01"), "SELL"));
    history.push(activity(
        "odd-type",
        day("2025-03-01"),
        "BROKERAGE_SPECIFIC_THING",
    ));
    l.snaptrade.set_activities("acct-1", history);
    l.snaptrade.set_orders(
        "acct-1",
        vec![json!({ "brokerage_order_id": "ord-1", "status": "EXECUTED", "action": "BUY" })],
    );

    assert_eq!(
        jobs(&pool)
            .await
            .iter()
            .map(|(k, _)| k.as_str())
            .collect::<Vec<_>>(),
        ["initial"]
    );
    assert_eq!(l.brokerage.run_due_jobs(10).await.unwrap(), 1);

    assert_eq!(
        count(&pool, "brokerage_activities").await,
        1501,
        "every page, nothing before the start"
    );
    let odd: String = sqlx::query_scalar(
        "SELECT type FROM brokerage_activities WHERE snaptrade_activity_id = 'odd-type'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        odd, "BROKERAGE_SPECIFIC_THING",
        "unknown types are stored as sent"
    );
    assert_eq!(count(&pool, "brokerage_orders").await, 1);
    assert_eq!(count(&pool, "brokerage_snapshots").await, 1);

    let state = l.brokerage.sync_state(l.account.id).await.unwrap();
    assert!(state.initial_import_completed_at.is_some());
    assert!(state.holdings_synced_at.is_some());
    let scheduled = jobs(&pool).await;
    let kinds: Vec<&str> = scheduled.iter().map(|(k, _)| k.as_str()).collect();
    assert_eq!(kinds, ["holdings", "transactions"]);
    let now = Utc::now();
    assert!(
        scheduled[0].1 > now + Duration::hours(5),
        "holdings at most four times a day"
    );
    assert!(
        scheduled[1].1 > now + Duration::hours(23) && scheduled[1].1 <= now + Duration::hours(24),
        "transactions a day later: never sooner, and no longer"
    );
}

#[sqlx::test]
async fn repeated_syncs_update_rows_without_duplicating_them(pool: PgPool) {
    let l = linked(&pool, ImportMode::All, None).await;
    let today = Utc::now().date_naive();
    l.snaptrade.set_activities(
        "acct-1",
        vec![activity("act-1", today - Duration::days(2), "BUY")],
    );
    l.brokerage.run_due_jobs(10).await.unwrap();

    let mut corrected = activity("act-1", today - Duration::days(2), "BUY");
    corrected["units"] = json!(3);
    l.snaptrade.set_activities(
        "acct-1",
        vec![
            corrected,
            activity("act-2", today - Duration::days(1), "DIVIDEND"),
        ],
    );
    make_due(&pool).await;
    l.brokerage.run_due_jobs(10).await.unwrap();
    make_due(&pool).await;
    l.brokerage.run_due_jobs(10).await.unwrap();

    assert_eq!(count(&pool, "brokerage_activities").await, 2);
    let units: f64 = sqlx::query_scalar(
        "SELECT units FROM brokerage_activities WHERE snaptrade_activity_id = 'act-1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(units, 3.0, "a corrected transaction is updated in place");
}

#[sqlx::test]
async fn history_only_extends_further_back(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    let later = l
        .brokerage
        .expand_history(
            l.user_id,
            l.account.id,
            ImportMode::Custom,
            Some(Utc::now().date_naive()),
        )
        .await;
    assert!(matches!(later, Err(ImportError::InvalidRange(_))));
    let wider = l
        .brokerage
        .expand_history(l.user_id, l.account.id, ImportMode::All, None)
        .await
        .unwrap();
    assert_eq!(
        (wider.import_mode.as_str(), wider.import_start_date),
        ("all", None)
    );
    let other = users::load_user(&pool, "user-2", "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id;
    assert!(matches!(
        l.brokerage
            .expand_history(other, l.account.id, ImportMode::All, None)
            .await,
        Err(ImportError::NotFound)
    ));
}

#[sqlx::test]
async fn blocked_accounts_wait_and_unlinked_ones_stop(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    sqlx::query("UPDATE brokerage_connections SET disabled = true")
        .execute(&pool)
        .await
        .unwrap();
    l.brokerage.run_due_jobs(10).await.unwrap();
    let (_, due) = jobs(&pool).await.remove(0);
    assert!(
        due > Utc::now() + Duration::hours(5),
        "a disabled connection is retried later"
    );
    assert_eq!(l.snaptrade.requests_to("/accounts/acct-1"), 0);

    sqlx::query("UPDATE brokerage_connections SET disabled = false")
        .execute(&pool)
        .await
        .unwrap();
    store::unlink_connection(&pool, l.connection_id)
        .await
        .unwrap();
    make_due(&pool).await;
    l.brokerage.run_due_jobs(10).await.unwrap();
    assert!(
        jobs(&pool).await.is_empty(),
        "unlinked accounts stop syncing"
    );
}

#[sqlx::test]
async fn concurrent_schedulers_run_each_job_once(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    let rounds = (0..4).map(|_| {
        let brokerage = l.brokerage.clone();
        async move { brokerage.run_due_jobs(10).await.unwrap() }
    });
    let ran: usize = futures_util::future::join_all(rounds)
        .await
        .into_iter()
        .sum();
    assert_eq!(ran, 1);
    assert_eq!(l.snaptrade.requests_to("/accounts/acct-1/activities"), 1);
}

#[sqlx::test]
async fn manual_holding_refreshes_are_throttled(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    l.brokerage
        .refresh_holdings(l.user_id, l.account.id)
        .await
        .unwrap();
    l.brokerage.run_due_jobs(10).await.unwrap();
    assert!(matches!(
        l.brokerage.refresh_holdings(l.user_id, l.account.id).await,
        Err(ImportError::TooSoon)
    ));
}

// ── Webhooks ────────────────────────────────────────────────────────────────

fn signed(body: &Value) -> (String, String) {
    let text = body.to_string();
    let mut mac = Hmac::<Sha256>::new_from_slice(fake::CONSUMER_KEY.as_bytes()).unwrap();
    mac.update(text.as_bytes());
    (
        text,
        base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes()),
    )
}

async fn post(
    brokerage: Option<Arc<Brokerage>>,
    pool: &PgPool,
    body: &Value,
    signature: Option<&str>,
) -> StatusCode {
    let mut services = app::test_services(pool.clone());
    services.brokerage = brokerage;
    let router = app::router(AppState::new(services), vec![]);
    let (text, valid) = signed(body);
    let request = HttpRequest::post("/webhooks/snaptrade")
        .header("content-type", "application/json")
        .header("signature", signature.unwrap_or(&valid))
        .body(Body::from(text))
        .unwrap();
    router.oneshot(request).await.unwrap().status()
}

fn event(id: &str, kind: &str, user: &str, extra: Value) -> Value {
    let mut body = json!({ "webhookId": id, "eventType": kind, "eventTimestamp": Utc::now().to_rfc3339(), "userId": user });
    body.as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    body
}

async fn settle(brokerage: &Brokerage) {
    // The route processes in the background; drain anything still pending.
    for _ in 0..50 {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        let pending: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM snaptrade_webhook_events WHERE processed_at IS NULL",
        )
        .fetch_one(&brokerage.pool)
        .await
        .unwrap();
        if pending == 0 {
            return;
        }
    }
    brokerage.process_pending_webhooks().await.unwrap();
}

async fn outcome(pool: &PgPool, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT outcome FROM snaptrade_webhook_events WHERE webhook_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn the_webhook_route_verifies_dedupes_and_acknowledges(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    let snaptrade_user = l.user_id.to_string();
    let broken = event(
        "hook-1",
        "CONNECTION_BROKEN",
        &snaptrade_user,
        json!({ "brokerageAuthorizationId": "conn-1" }),
    );

    assert_eq!(
        post(None, &pool, &broken, None).await,
        StatusCode::SERVICE_UNAVAILABLE
    );
    let brokerage = Some(l.brokerage.clone());
    assert_eq!(
        post(brokerage.clone(), &pool, &broken, Some("bm9wZQ==")).await,
        StatusCode::UNAUTHORIZED
    );
    let mut stale = broken.clone();
    stale["eventTimestamp"] = json!((Utc::now() - Duration::hours(30)).to_rfc3339());
    assert_eq!(
        post(brokerage.clone(), &pool, &stale, None).await,
        StatusCode::BAD_REQUEST
    );

    assert_eq!(
        post(brokerage.clone(), &pool, &broken, None).await,
        StatusCode::OK
    );
    assert_eq!(
        post(brokerage, &pool, &broken, None).await,
        StatusCode::OK,
        "a resend is acknowledged"
    );
    settle(&l.brokerage).await;
    assert_eq!(count(&pool, "snaptrade_webhook_events").await, 1);
    assert_eq!(
        outcome(&pool, "hook-1").await.as_deref(),
        Some("connection_disabled")
    );
    let connection = store::connection_for_user(&pool, l.user_id, l.connection_id)
        .await
        .unwrap()
        .unwrap();
    assert!(connection.disabled);
}

#[sqlx::test]
async fn connection_and_account_events_update_state(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    let user = l.user_id.to_string();
    let conn = json!({ "brokerageAuthorizationId": "conn-1" });
    let cases = [
        (
            event(
                "h-new",
                "NEW_ACCOUNT_AVAILABLE",
                &user,
                json!({ "brokerageAuthorizationId": "conn-1", "accountId": "acct-new" }),
            ),
            "new_accounts_flagged",
        ),
        (
            event(
                "h-tx",
                "ACCOUNT_TRANSACTIONS_UPDATED",
                &user,
                json!({ "accountId": "acct-1" }),
            ),
            "sync_queued",
        ),
        (
            event(
                "h-unknown",
                "ACCOUNT_HOLDINGS_UPDATED",
                &user,
                json!({ "accountId": "acct-other" }),
            ),
            "ignored_unknown_account",
        ),
        (
            event("h-reg", "USER_REGISTERED", &user, json!({})),
            "ignored",
        ),
        (
            event(
                "h-stranger",
                "CONNECTION_BROKEN",
                "someone-else",
                conn.clone(),
            ),
            "ignored_unknown_user",
        ),
        (
            event(
                "h-removed",
                "ACCOUNT_REMOVED",
                &user,
                json!({ "accountId": "acct-1" }),
            ),
            "account_unlinked",
        ),
        (
            event("h-deleted", "CONNECTION_DELETED", &user, conn.clone()),
            "connection_unlinked",
        ),
    ];
    for (body, _) in &cases {
        assert_eq!(
            post(Some(l.brokerage.clone()), &pool, body, None).await,
            StatusCode::OK
        );
        settle(&l.brokerage).await;
    }
    for (body, expected) in &cases {
        assert_eq!(
            outcome(&pool, body["webhookId"].as_str().unwrap())
                .await
                .as_deref(),
            Some(*expected)
        );
    }
    let connection = store::connection_for_user(&pool, l.user_id, l.connection_id)
        .await
        .unwrap()
        .unwrap();
    assert!(connection.new_accounts_available && connection.unlinked_at.is_some());
}

#[sqlx::test]
async fn oauth_events_route_through_the_matching_grant(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.personal_connection("personal-1", "conn-9", &["acct-9"]);
    let brokerage = Arc::new(Brokerage::for_tests(pool.clone(), &snaptrade));
    let owner = users::load_user(&pool, "user-1", "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id;
    let started = brokerage.start_oauth(owner, "connect").await.unwrap();
    let url = reqwest::Url::parse(&started.authorization_url).unwrap();
    let state = url
        .query_pairs()
        .find(|(k, _)| k == "state")
        .unwrap()
        .1
        .into_owned();
    let code = snaptrade.approve("personal-1", &started.authorization_url);
    brokerage
        .oauth_callback(&state, Some(&code), None)
        .await
        .unwrap();
    let choices = brokerage
        .oauth_account_choices(owner, started.attempt_id)
        .await
        .unwrap();

    let oauth = |id: &str, client: &str| {
        json!({
            "schemaVersion": "oauth_v1", "webhookId": id, "oauthClientId": client,
            "eventTimestamp": Utc::now().to_rfc3339(), "userId": "personal-1",
            "eventType": "CONNECTION_BROKEN", "connectionId": "conn-9",
        })
    };
    assert_eq!(
        post(
            Some(brokerage.clone()),
            &pool,
            &oauth("o-other", "another-app"),
            None
        )
        .await,
        StatusCode::OK
    );
    assert_eq!(
        post(
            Some(brokerage.clone()),
            &pool,
            &oauth("o-ours", fake::OAUTH_CLIENT_ID),
            None
        )
        .await,
        StatusCode::OK
    );
    settle(&brokerage).await;
    assert_eq!(
        outcome(&pool, "o-other").await.as_deref(),
        Some("ignored_unknown_user")
    );
    assert_eq!(
        outcome(&pool, "o-ours").await.as_deref(),
        Some("connection_disabled")
    );
    let connection = store::connection_for_user(&pool, owner, choices[0].connection_id)
        .await
        .unwrap()
        .unwrap();
    assert!(connection.disabled);

    brokerage.revoke_oauth(owner).await.unwrap();
    assert_eq!(
        post(
            Some(brokerage.clone()),
            &pool,
            &oauth("o-after", fake::OAUTH_CLIENT_ID),
            None
        )
        .await,
        StatusCode::OK
    );
    settle(&brokerage).await;
    assert_eq!(
        outcome(&pool, "o-after").await.as_deref(),
        Some("ignored_unknown_user"),
        "revoked grants get nothing"
    );
}

#[sqlx::test]
async fn the_sweeper_processes_events_left_unprocessed(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    let body = event(
        "hook-late",
        "CONNECTION_BROKEN",
        &l.user_id.to_string(),
        json!({ "brokerageAuthorizationId": "conn-1" }),
    );
    let (text, signature) = signed(&body);
    let parsed = tradstry::brokerage::webhooks::verify(
        text.as_bytes(),
        &signature,
        fake::CONSUMER_KEY,
        Utc::now(),
    )
    .unwrap();
    assert!(
        tradstry::brokerage::webhooks::record(&pool, &parsed)
            .await
            .unwrap()
    );
    assert_eq!(l.brokerage.process_pending_webhooks().await.unwrap(), 1);
    assert_eq!(
        outcome(&pool, "hook-late").await.as_deref(),
        Some("connection_disabled")
    );
}

// ── GraphQL ─────────────────────────────────────────────────────────────────

#[sqlx::test]
async fn imported_data_is_read_per_workspace(pool: PgPool) {
    let l = linked(&pool, ImportMode::All, None).await;
    let today = Utc::now().date_naive();
    l.snaptrade.set_activities(
        "acct-1",
        vec![
            activity("act-1", today - Duration::days(3), "BUY"),
            activity("act-2", today - Duration::days(1), "SELL"),
        ],
    );
    l.brokerage.run_due_jobs(10).await.unwrap();
    let workspace = l.account.workspace_id.unwrap();

    let now = Utc::now().timestamp();
    let token = json!({
        "iss": format!("stytch.com/{PROJECT}"), "sub": "user-1", "aud": [PROJECT], "iat": now, "exp": now + 300,
        "https://stytch.com/session": {"id": "session-1"},
    });
    let claims = test_jwt::test_verifier()
        .verify(&test_jwt::sign(&token))
        .await
        .unwrap();
    let query = format!(
        r#"{{ brokerageActivities(workspaceId: "{workspace}", limit: 1) {{ total items {{ id type }} }}
             brokerageSyncStatus(workspaceId: "{workspace}") {{ initialImportCompletedAt account {{ name }} }}
             brokerageHoldings(workspaceId: "{workspace}") {{ balances }} }}"#
    );
    let response = build_schema(
        pool.clone(),
        Arc::new(FakeStytch::default()),
        Some(l.brokerage.clone()),
    )
    .execute(
        Request::new(query)
            .data(claims)
            .data(RequestUser::default()),
    )
    .await;
    assert!(response.errors.is_empty(), "{:?}", response.errors);
    let data = response.data.into_json().unwrap();
    assert_eq!(data["brokerageActivities"]["total"], 2);
    assert_eq!(
        data["brokerageActivities"]["items"],
        json!([{ "id": "act-2", "type": "SELL" }]),
        "newest first"
    );
    assert!(data["brokerageSyncStatus"]["initialImportCompletedAt"].is_string());
    assert_eq!(data["brokerageSyncStatus"]["account"]["name"], "Margin");
    assert_eq!(
        data["brokerageHoldings"]["balances"][0]["currency"]["code"],
        "USD"
    );
}

#[sqlx::test]
async fn holdings_still_sync_when_the_brokerage_has_no_orders_api(pool: PgPool) {
    let l = linked(&pool, ImportMode::OneYear, None).await;
    l.brokerage.run_due_jobs(10).await.unwrap();
    let before = count(&pool, "brokerage_snapshots").await;

    l.snaptrade.fail_next(
        "/accounts/acct-1/orders",
        501,
        json!({ "detail": "Orders are not supported for this brokerage" }),
    );
    make_due(&pool).await;
    l.brokerage.run_due_jobs(10).await.unwrap();
    assert_eq!(count(&pool, "brokerage_snapshots").await, before + 1);
    let errors: Vec<Option<String>> =
        sqlx::query_scalar("SELECT last_error FROM sync_jobs WHERE kind = 'holdings'")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(errors, [None]);
}
