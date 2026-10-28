//! Talks to the real SnapTrade Test environment. Ignored by default; run with
//! the Test Commercial key in the environment:
//!
//! ```sh
//! SNAPTRADE_CLIENT_ID=… SNAPTRADE_CONSUMER_KEY=… cargo test --test snaptrade_live -- --ignored
//! ```
//!
//! It proves request signing on root paths (no `/api/v1`) and cleans up the
//! throwaway user it creates.

use tradstry::snaptrade::{Credentials, SnapTradeClient, SnapTradeConfig};

#[tokio::test]
#[ignore = "needs SnapTrade Test credentials and network access"]
async fn signed_root_path_requests_work_against_the_test_environment() {
    dotenvy::dotenv().ok();
    let config = SnapTradeConfig {
        client_id: std::env::var("SNAPTRADE_CLIENT_ID").expect("SNAPTRADE_CLIENT_ID"),
        consumer_key: std::env::var("SNAPTRADE_CONSUMER_KEY").expect("SNAPTRADE_CONSUMER_KEY"),
        api_url: None,
        oauth: None,
    };
    let client = SnapTradeClient::new(config).unwrap();
    let user_id = format!("tradstry-live-test-{}", uuid::Uuid::now_v7());

    let registration = client
        .register_user(&user_id)
        .await
        .expect("register a throwaway user");
    let listed = client
        .list_connections(Credentials::Commercial {
            user_id: &registration.user_id,
            user_secret: &registration.user_secret,
        })
        .await;
    let deleted = client.delete_user(&registration.user_id).await;

    assert!(listed.expect("signed GET on a root path").is_empty());
    deleted.expect("delete the throwaway user");
}
