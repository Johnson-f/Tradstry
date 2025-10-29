use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoverItem {
    pub symbol: String,
    pub price: Option<String>,
    pub change: Option<String>,
    #[serde(rename = "percentChange")]
    pub percent_change: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoversResponse {
    pub gainers: Vec<MoverItem>,
    pub losers: Vec<MoverItem>,
    #[serde(rename = "mostActive")]
    pub most_active: Vec<MoverItem>,
}

pub async fn get_movers(client: &MarketClient) -> Result<MoversResponse> {
    let resp = client.get("/v1/movers", None).await?;
    let body = resp.json::<MoversResponse>().await?;
    Ok(body)
}

