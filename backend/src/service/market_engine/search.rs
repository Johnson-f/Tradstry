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

pub async fn search(
    client: &MarketClient,
    query: &str,
    hits: Option<u32>,
    yahoo: Option<bool>,
) -> Result<Vec<SearchItem>> {
    let mut params: Vec<(&str, String)> = vec![("query", query.to_string())];
    
    // Default hits to 10 if not specified
    let hits_value = hits.unwrap_or(10);
    params.push(("hits", hits_value.to_string()));
    
    // Default yahoo to true if not specified
    let yahoo_value = yahoo.unwrap_or(true);
    params.push(("yahoo", yahoo_value.to_string()));
    
    let resp = client.get("/v1/search", Some(&params)).await?;
    let body = resp.json::<Vec<SearchItem>>().await?;
    Ok(body)
}

