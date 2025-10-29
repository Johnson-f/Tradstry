use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchItem {
    pub symbol: String,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub exchange: Option<String>,
}

pub async fn search(client: &MarketClient, query: &str) -> Result<Vec<SearchItem>> {
    let params = [("q", query.to_string())];
    let resp = client.get("/v1/search", Some(&params)).await?;
    let body = resp.json::<Vec<SearchItem>>().await?;
    Ok(body)
}

