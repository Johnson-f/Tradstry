use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexItem {
    pub name: String,
    pub price: Option<String>,
    pub change: Option<String>,
    #[serde(rename = "percentChange")]
    pub percent_change: Option<String>,
}

pub async fn get_indices(client: &MarketClient) -> Result<Vec<IndexItem>> {
    let resp = client.get("/v1/indices", None).await?;
    let body = resp.json::<Vec<IndexItem>>().await?;
    Ok(body)
}

