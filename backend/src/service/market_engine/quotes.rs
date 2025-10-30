use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quote {
    pub symbol: String,
    pub name: Option<String>,
    pub price: Option<String>,
    #[serde(rename = "afterHoursPrice")]
    pub after_hours_price: Option<String>,
    pub change: Option<String>,
    #[serde(rename = "percentChange")]
    pub percent_change: Option<String>,
    pub open: Option<String>,
    pub high: Option<String>,
    pub low: Option<String>,
    #[serde(rename = "yearHigh")]
    pub year_high: Option<String>,
    #[serde(rename = "yearLow")]
    pub year_low: Option<String>,
    pub volume: Option<u64>,
    #[serde(rename = "avgVolume")]
    pub avg_volume: Option<u64>,
    #[serde(rename = "marketCap")]
    pub market_cap: Option<String>,
    pub beta: Option<String>,
    pub pe: Option<String>,
    #[serde(rename = "earningsDate")]
    pub earnings_date: Option<String>,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub about: Option<String>,
    pub employees: Option<String>,
    #[serde(rename = "fiveDaysReturn")]
    pub five_days_return: Option<String>,
    #[serde(rename = "oneMonthReturn")]
    pub one_month_return: Option<String>,
    #[serde(rename = "threeMonthReturn")]
    pub three_month_return: Option<String>,
    #[serde(rename = "sixMonthReturn")]
    pub six_month_return: Option<String>,
    #[serde(rename = "ytdReturn")]
    pub ytd_return: Option<String>,
    #[serde(rename = "yearReturn")]
    pub year_return: Option<String>,
    #[serde(rename = "threeYearReturn")]
    pub three_year_return: Option<String>,
    #[serde(rename = "fiveYearReturn")]
    pub five_year_return: Option<String>,
    #[serde(rename = "tenYearReturn")]
    pub ten_year_return: Option<String>,
    #[serde(rename = "maxReturn")]
    pub max_return: Option<String>,
    pub logo: Option<String>,
}

/// Get detailed quotes for symbols
pub async fn get_quotes(client: &MarketClient, symbols: &[String]) -> Result<Vec<Quote>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if !symbols.is_empty() {
        params.push(("symbols", symbols.join(",")));
    }
    let resp = client.get("/v1/quotes", Some(&params)).await?;
    let body = resp.json::<Vec<Quote>>().await?;
    Ok(body)
}

/// Get simple quotes for symbols (summary data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleQuote {
    pub symbol: String,
    pub name: Option<String>,
    pub price: Option<String>,
    #[serde(rename = "afterHoursPrice")]
    pub after_hours_price: Option<String>,
    pub change: Option<String>,
    #[serde(rename = "percentChange")]
    pub percent_change: Option<String>,
    pub logo: Option<String>,
}

pub async fn get_simple_quotes(client: &MarketClient, symbols: &[String]) -> Result<Vec<SimpleQuote>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if !symbols.is_empty() {
        params.push(("symbols", symbols.join(",")));
    }
    let resp = client.get("/v1/simple-quotes", Some(&params)).await?;
    let body = resp.json::<Vec<SimpleQuote>>().await?;
    Ok(body)
}

/// Get similar quotes to a queried symbol
pub async fn get_similar(client: &MarketClient, symbol: &str) -> Result<Vec<SimpleQuote>> {
    let params = vec![("symbol", symbol.to_string())];
    let resp = client.get("/v1/similar", Some(&params)).await?;
    let body = resp.json::<Vec<SimpleQuote>>().await?;
    Ok(body)
}

