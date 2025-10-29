use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quote {
    pub symbol: String,
    pub name: Option<String>,
    pub price: Option<String>,
    pub change: Option<String>,
    #[serde(rename = "percentChange")]
    pub percent_change: Option<String>,
    #[serde(rename = "marketCap")]
    pub market_cap: Option<String>,
    pub sector: Option<String>,
    pub industry: Option<String>,
}

pub async fn get_quotes(client: &MarketClient, symbols: &[String]) -> Result<Vec<Quote>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if !symbols.is_empty() {
        params.push(("symbols", symbols.join(",")));
    }
    let resp = client.get("/v1/quotes", Some(&params)).await?;
    let body = resp.json::<Vec<Quote>>().await?;
    Ok(body)
}

