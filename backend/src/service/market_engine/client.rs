use anyhow::{anyhow, Result};
use reqwest::{Client, Response};
use std::time::Duration;

use crate::turso::config::FinanceQueryConfig;

#[derive(Clone)]
pub struct MarketClient {
    pub base_url: String,
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
            base_url: config.base_url.trim_end_matches('/').to_string(),
            api_key: config.api_key.clone(),
            http,
        })
    }

    pub async fn get(&self, path: &str, query: Option<&[(&str, String)]>) -> Result<Response> {
        let url = format!("{}{}{}",
            self.base_url,
            if path.starts_with('/') { "" } else { "/" },
            path
        );

        let mut req = self.http.get(&url);
        
        // Only add x-api-key header if API key is configured
        if let Some(key) = &self.api_key {
            req = req.header("x-api-key", key);
        }
        
        if let Some(q) = query {
            req = req.query(q);
        }

        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Upstream error {}: {}", status, text));
        }
        Ok(resp)
    }
}

