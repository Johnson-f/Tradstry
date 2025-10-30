use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketHours {
    pub status: String,
    pub reason: Option<String>,
    pub timestamp: String,
}

pub async fn get_hours(client: &MarketClient) -> Result<MarketHours> {
    let resp = client.get("/hours", None).await?;
    let body = resp.json::<MarketHours>().await?;
    Ok(body)
}

