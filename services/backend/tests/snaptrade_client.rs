use chrono::NaiveDate;
use serde_json::json;

use tradstry::snaptrade::{
    ActivityQuery, Credentials, PortalOptions, SnapTradeClient,
    fake::{self, FakeAccount, FakeSnapTrade},
};

fn commercial<'a>(user_id: &'a str, user_secret: &'a str) -> Credentials<'a> {
    Credentials::Commercial {
        user_id,
        user_secret,
    }
}

fn day(value: &str) -> NaiveDate {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
}

#[tokio::test]
async fn broker_catalog_uses_signed_client_info_and_reuses_its_cache() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    let brokers = client.brokerages().await.unwrap();
    assert_eq!(brokers[0].slug, "ROBINHOOD");
    assert!(brokers[0].enabled);
    assert!(!brokers[0].maintenance_mode);
    assert_eq!(
        brokers[0].aws_s3_square_logo_url.as_deref(),
        Some("https://example.test/robinhood-square.png")
    );
    client.brokerages().await.unwrap();
    assert_eq!(snaptrade.requests_to("/snapTrade/partners"), 1);
    let request = snaptrade.requests().pop().unwrap();
    assert_eq!(request.query["clientId"], fake::CLIENT_ID);
    assert!(!request.query.contains_key("userId"));
    assert!(snaptrade.registered_users().is_empty());
}

#[tokio::test]
async fn commercial_requests_are_signed_and_scoped_to_the_user() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    let registration = client.register_user("tradstry-user-1").await.unwrap();
    assert_eq!(registration.user_id, "tradstry-user-1");

    let credentials = commercial(&registration.user_id, &registration.user_secret);
    assert!(
        client
            .list_connections(credentials)
            .await
            .unwrap()
            .is_empty()
    );

    let request = snaptrade.requests().pop().unwrap();
    assert_eq!(request.path, "/authorizations");
    assert_eq!(request.query["clientId"], fake::CLIENT_ID);
    assert_eq!(request.query["userId"], "tradstry-user-1");
    assert!(request.query.contains_key("timestamp"));
}

#[tokio::test]
async fn the_portal_asks_for_read_access_and_passes_its_options() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    let registration = client.register_user("user-1").await.unwrap();
    let url = client
        .connection_portal_url(
            &registration.user_id,
            &registration.user_secret,
            &PortalOptions {
                broker: Some("SANDBOX"),
                reconnect: Some("connection-1"),
                custom_redirect: Some("http://localhost:5173/brokerage/callback"),
            },
        )
        .await
        .unwrap();
    assert!(url.starts_with("https://connect.snaptrade.test/portal"));
    let body = snaptrade.requests().pop().unwrap().body.unwrap();
    assert_eq!(
        body,
        json!({
            "connectionType": "read", "immediateRedirect": true, "broker": "SANDBOX",
            "reconnect": "connection-1", "customRedirect": "http://localhost:5173/brokerage/callback",
        })
    );
}

#[tokio::test]
async fn unknown_commercial_credentials_are_reported_as_stale() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    let registration = client.register_user("user-1").await.unwrap();
    snaptrade.forget_user("user-1");
    let error = client
        .list_connections(commercial(&registration.user_id, &registration.user_secret))
        .await
        .unwrap_err();
    assert!(error.is_stale_credentials(), "{error}");
    assert!(!error.to_string().contains(&registration.user_secret));
}

#[tokio::test]
async fn deleting_users_and_connections_is_idempotent() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    let registration = client.register_user("user-1").await.unwrap();
    snaptrade.complete_portal(
        "user-1",
        "connection-1",
        vec![FakeAccount::investment("account-1", "Brokerage")],
    );
    let (user, secret) = (&registration.user_id, &registration.user_secret);
    client
        .delete_connection(user, secret, "connection-1")
        .await
        .unwrap();
    client
        .delete_connection(user, secret, "connection-1")
        .await
        .unwrap();
    client.delete_user(user).await.unwrap();
    client.delete_user(user).await.unwrap();
    assert!(snaptrade.registered_users().is_empty());
}

#[tokio::test]
async fn connections_accounts_and_paged_activities_are_read() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    let registration = client.register_user("user-1").await.unwrap();
    snaptrade.complete_portal(
        "user-1",
        "connection-1",
        vec![
            FakeAccount::investment("account-1", "Brokerage"),
            FakeAccount::of_kind("account-2", "deposit"),
        ],
    );
    snaptrade.set_activities(
        "account-1",
        (1..=5)
            .map(|n| json!({ "id": format!("act-{n}"), "type": "BUY", "units": 1, "trade_date": format!("2026-01-0{n}T00:00:00Z") }))
            .collect(),
    );
    let credentials = commercial(&registration.user_id, &registration.user_secret);

    let connection = client
        .get_connection(credentials, "connection-1")
        .await
        .unwrap();
    assert_eq!(connection.institution_name(), "Sandbox");
    assert!(!connection.disabled);

    let accounts = client
        .list_connection_accounts(credentials, "connection-1")
        .await
        .unwrap();
    let investment: Vec<&str> = accounts
        .iter()
        .filter(|a| a.is_investment())
        .map(|a| a.id.as_str())
        .collect();
    assert_eq!(investment, ["account-1"]);

    let page = client
        .activities(
            credentials,
            "account-1",
            ActivityQuery {
                start: Some(day("2026-01-02")),
                end: day("2026-01-05"),
                offset: 1,
                limit: 2,
            },
        )
        .await
        .unwrap();
    assert_eq!(page.total, Some(4));
    let ids: Vec<&str> = page.activities.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(ids, ["act-3", "act-4"]);

    let missing = client
        .get_connection(credentials, "someone-elses")
        .await
        .unwrap_err();
    assert!(missing.is_not_found());
}

#[tokio::test]
async fn oauth_authorizes_reads_rotates_and_revokes() {
    let snaptrade = FakeSnapTrade::start().await;
    snaptrade.personal_connection("personal-1", "connection-9", &["account-9"]);
    let client = snaptrade.client();

    let verifier = "verifier-with-enough-entropy-for-the-test-0123456789";
    let challenge = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        <sha2::Sha256 as sha2::Digest>::digest(verifier.as_bytes()),
    );
    let url = client
        .authorization_url("state-1", &challenge, &["read", "webhook"])
        .await
        .unwrap();
    let parsed = reqwest::Url::parse(&url).unwrap();
    let param = |name: &str| {
        parsed
            .query_pairs()
            .find(|(k, _)| k == name)
            .unwrap()
            .1
            .into_owned()
    };
    assert_eq!(param("client_id"), fake::OAUTH_CLIENT_ID);
    assert_eq!(param("redirect_uri"), fake::OAUTH_REDIRECT_URI);
    assert_eq!(param("scope"), "read webhook");
    assert_eq!(param("code_challenge_method"), "S256");

    let code = snaptrade.approve("personal-1", &url);
    assert!(
        client
            .exchange_code(&code, "wrong-verifier")
            .await
            .unwrap_err()
            .is_terminal_refresh_failure()
    );
    let code = snaptrade.approve("personal-1", &url);
    let tokens = client.exchange_code(&code, verifier).await.unwrap();
    assert_eq!(tokens.personal_user_id, "personal-1");
    assert_eq!(tokens.scopes, ["read", "webhook"]);

    let connections = client
        .list_connections(Credentials::Bearer(&tokens.access_token))
        .await
        .unwrap();
    assert_eq!(connections[0].id, "connection-9");
    let bearer_request = snaptrade.requests().pop().unwrap();
    assert!(
        !bearer_request.query.contains_key("clientId"),
        "bearer calls carry no signing fields"
    );

    snaptrade.expire_access_tokens();
    let expired = client
        .list_connections(Credentials::Bearer(&tokens.access_token))
        .await
        .unwrap_err();
    assert!(expired.is_oauth_authentication_failure());

    let rotated = client.refresh_token(&tokens.refresh_token).await.unwrap();
    assert_ne!(rotated.refresh_token, tokens.refresh_token);
    assert!(
        client
            .refresh_token(&tokens.refresh_token)
            .await
            .unwrap_err()
            .is_terminal_refresh_failure()
    );
    client
        .list_connections(Credentials::Bearer(&rotated.access_token))
        .await
        .unwrap();

    client.revoke_token(&rotated.refresh_token).await.unwrap();
    assert_eq!(
        snaptrade.revoked_tokens(),
        vec![rotated.refresh_token.clone()]
    );
    assert!(
        client
            .list_connections(Credentials::Bearer(&rotated.access_token))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn rate_limited_requests_wait_and_retry() {
    let snaptrade = FakeSnapTrade::start().await;
    let client = snaptrade.client();
    snaptrade.fail_next(
        "/snapTrade/registerUser",
        429,
        json!({ "detail": "Request was throttled. Expected available in 1 seconds.", "status_code": 429 }),
    );
    client.register_user("user-1").await.unwrap();
    assert_eq!(snaptrade.requests_to("/snapTrade/registerUser"), 2);
}

#[tokio::test]
async fn transport_errors_do_not_leak_the_user_secret() {
    let mut config = FakeSnapTrade::start().await.config(true);
    config.api_url = Some("http://127.0.0.1:1".to_owned());
    let client = SnapTradeClient::new(config).unwrap();
    let error = client
        .list_connections(commercial("user-1", "super-secret-value"))
        .await
        .unwrap_err();
    assert!(!error.to_string().contains("super-secret-value"), "{error}");
}
