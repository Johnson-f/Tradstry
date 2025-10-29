use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
}

pub async fn get_health(client: &MarketClient) -> Result<HealthStatus> {
    let resp = client.get("/health", None).await?;
    let body = resp.json::<HealthStatus>().await?;
    Ok(body)
}

