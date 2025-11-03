use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoverItem {
    pub symbol: String,
    pub name: Option<String>,
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

/// Get all movers (gainers, losers, most active) combined
pub async fn get_movers(client: &MarketClient) -> Result<MoversResponse> {
    // Fetch all three endpoints in parallel
    let (gainers_res, losers_res, actives_res) = tokio::join!(
        get_gainers(client, Some(25)),
        get_losers(client, Some(25)),
        get_most_active(client, Some(25)),
    );
    
    Ok(MoversResponse {
        gainers: gainers_res.unwrap_or_default(),
        losers: losers_res.unwrap_or_default(),
        most_active: actives_res.unwrap_or_default(),
    })
}

/// Get top gainers
pub async fn get_gainers(client: &MarketClient, count: Option<u32>) -> Result<Vec<MoverItem>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(c) = count {
        params.push(("count", c.to_string()));
    }
    let resp = client.get("/v1/gainers", Some(&params)).await?;
    let body = resp.json::<Vec<MoverItem>>().await?;
    Ok(body)
}

/// Get top losers
pub async fn get_losers(client: &MarketClient, count: Option<u32>) -> Result<Vec<MoverItem>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(c) = count {
        params.push(("count", c.to_string()));
    }
    let resp = client.get("/v1/losers", Some(&params)).await?;
    let body = resp.json::<Vec<MoverItem>>().await?;
    Ok(body)
}

/// Get most active stocks
pub async fn get_most_active(client: &MarketClient, count: Option<u32>) -> Result<Vec<MoverItem>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(c) = count {
        params.push(("count", c.to_string()));
    }
    let resp = client.get("/v1/actives", Some(&params)).await?;
    let body = resp.json::<Vec<MoverItem>>().await?;
    Ok(body)
}

