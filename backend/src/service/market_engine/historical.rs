use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    pub time: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalResponse {
    pub symbol: String,
    pub interval: Option<String>,
    pub candles: Vec<Candle>,
}

pub async fn get_historical(
    client: &MarketClient,
    symbol: &str,
    range: Option<&str>,
    interval: Option<&str>,
) -> Result<HistoricalResponse> {
    let mut params: Vec<(&str, String)> = vec![("symbol", symbol.to_string())];
    if let Some(r) = range { params.push(("range", r.to_string())); }
    if let Some(i) = interval { params.push(("interval", i.to_string())); }
    let resp = client.get("/v1/historical", Some(&params)).await?;
    let body = resp.json::<HistoricalResponse>().await?;
    Ok(body)
}

