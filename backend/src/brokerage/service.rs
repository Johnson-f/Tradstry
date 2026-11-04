use std::sync::Arc;

use reqwest::Url;
use sqlx::PgPool;

use super::crypto::{self, SecretBox};
use crate::snaptrade::SnapTradeClient;

/// Everything brokerage features need. Absent from the app when SnapTrade is
/// not configured.
pub struct Brokerage {
    pub pool: PgPool,
    pub client: Arc<SnapTradeClient>,
    pub secrets: SecretBox,
    /// The website's origin, where SnapTrade sends users back to.
    pub website_url: Url,
    /// The OAuth app's client ID, when SnapTrade OAuth is configured.
    pub oauth_client_id: Option<String>,
    /// The SnapTrade consumer key, which also signs webhooks.
    pub consumer_key: String,
}

impl Brokerage {
    /// Brokerage features on the fake SnapTrade with the test encryption key.
    /// Never use outside a test process.
    #[doc(hidden)]
    pub fn for_tests(pool: PgPool, snaptrade: &crate::snaptrade::fake::FakeSnapTrade) -> Self {
        Self {
            pool,
            client: Arc::new(snaptrade.client()),
            secrets: crypto::test_secret_box(),
            website_url: Url::parse("http://localhost:5173").expect("static URL"),
            oauth_client_id: Some(crate::snaptrade::fake::OAUTH_CLIENT_ID.to_owned()),
            consumer_key: crate::snaptrade::fake::CONSUMER_KEY.to_owned(),
        }
    }

    pub fn website_page(&self, path: &str) -> String {
        let mut url = self.website_url.clone();
        url.set_path(path);
        url.to_string()
    }
}
