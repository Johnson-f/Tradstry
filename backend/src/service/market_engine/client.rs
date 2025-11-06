use anyhow::{anyhow, Result};
use reqwest::{Client, Response};
use std::time::Duration;

use crate::turso::config::FinanceQueryConfig;

#[derive(Clone)]
pub struct MarketClient {
    pub base_url: String,
    // Secondary upstream for failover
    secondary_url: String,
    api_key: Option<String>,
    http: Client,
}

impl MarketClient {
    pub fn new(config: &FinanceQueryConfig) -> Result<Self> {
        let http = Client::builder()
            .pool_max_idle_per_host(8)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(8))
            .build()?;

        Ok(Self {
            // Hardcode upstreams with explicit order for failover
            // Primary
            base_url: "https://finance-query.onrender.com".to_string(),
            // Secondary
            secondary_url: "https://finance-query-uzbi.onrender.com".to_string(),
            api_key: config.api_key.clone(),
            http,
        })
    }

    pub async fn get(&self, path: &str, query: Option<&[(&str, String)]>) -> Result<Response> {
        // Try primary first, then secondary on ANY error (network or non-2xx status)
        let candidates = [self.base_url.as_str(), self.secondary_url.as_str()];
        let mut last_err: Option<anyhow::Error> = None;

        for base in candidates.iter() {
            let url = format!(
                "{}{}{}",
                base,
                if path.starts_with('/') { "" } else { "/" },
                path
            );

            let mut req = self.http.get(&url);

            if let Some(key) = &self.api_key {
                req = req.header("x-api-key", key);
            }
            if let Some(q) = query {
                req = req.query(q);
            }

            match req.send().await {
                Ok(resp) => {
                    if resp.status().is_success() {
                        return Ok(resp);
                    } else {
                        let status = resp.status();
                        let text = resp.text().await.unwrap_or_default();
                        last_err = Some(anyhow!("Upstream error {} from {}: {}", status, base, text));
                        continue;
                    }
                }
                Err(e) => {
                    last_err = Some(anyhow!("Request error from {}: {}", base, e));
                    continue;
                }
            }
        }

        Err(last_err.unwrap_or_else(|| anyhow!("All upstreams failed")))
    }
}

