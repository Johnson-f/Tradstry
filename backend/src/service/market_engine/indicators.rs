use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorPoint {
    pub time: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndicatorSeries {
    pub symbol: String,
    pub indicator: String,
    pub interval: Option<String>,
    pub values: Vec<IndicatorPoint>,
}

pub async fn get_indicator(
    client: &MarketClient,
    symbol: &str,
    indicator: &str,
    interval: Option<&str>,
) -> Result<IndicatorSeries> {
    let mut params: Vec<(&str, String)> = vec![
        ("symbol", symbol.to_string()),
        ("indicator", indicator.to_string()),
    ];
    if let Some(i) = interval { params.push(("interval", i.to_string())); }
    let resp = client.get("/v1/indicator", Some(&params)).await?;
    let body = resp.json::<IndicatorSeries>().await?;
    Ok(body)
}

