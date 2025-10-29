use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketHours {
    #[serde(rename = "isOpen")]
    pub is_open: bool,
    #[serde(rename = "nextOpen")]
    pub next_open: Option<String>,
    #[serde(rename = "nextClose")]
    pub next_close: Option<String>,
}

pub async fn get_hours(client: &MarketClient) -> Result<MarketHours> {
    let resp = client.get("/hours", None).await?;
    let body = resp.json::<MarketHours>().await?;
    Ok(body)
}

