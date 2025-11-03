use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandleData {
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(rename = "adjClose")]
    pub adj_close: Option<f64>,
    pub volume: Option<u64>,
}

/// Historical data response format from the API
/// The API returns epoch timestamps as keys mapping to candle data
pub type HistoricalResponse = HashMap<String, CandleData>;

/// Convert the API response format to our internal format with candles array
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalCandle {
    pub time: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(rename = "adjClose")]
    pub adj_close: Option<f64>,
    pub volume: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalResponseConverted {
    pub symbol: String,
    pub interval: Option<String>,
    pub candles: Vec<HistoricalCandle>,
}

pub async fn get_historical(
    client: &MarketClient,
    symbol: &str,
    range: Option<&str>,
    interval: Option<&str>,
) -> Result<HistoricalResponseConverted> {
    let mut params: Vec<(&str, String)> = vec![
        ("symbol", symbol.to_string()),
        ("epoch", "true".to_string()),
    ];
    if let Some(r) = range { params.push(("range", r.to_string())); }
    if let Some(i) = interval { params.push(("interval", i.to_string())); }
    
    let resp = client.get("/v1/historical", Some(&params)).await?;
    let body = resp.json::<HistoricalResponse>().await?;
    
    // Convert the HashMap format to candles array format
    let mut candles: Vec<HistoricalCandle> = body
        .into_iter()
        .map(|(time, data)| HistoricalCandle {
            time,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            adj_close: data.adj_close,
            volume: data.volume,
        })
        .collect();
    
    // Sort by timestamp
    candles.sort_by_key(|c| c.time.clone());
    
    Ok(HistoricalResponseConverted {
        symbol: symbol.to_string(),
        interval: interval.map(|s| s.to_string()),
        candles,
    })
}

