use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsItem {
    pub symbol: Option<String>,
    pub title: String,
    pub link: String,
    pub source: Option<String>,
    pub img: Option<String>,
    pub time: String,
}

pub async fn get_news(client: &MarketClient, symbol: Option<&str>, limit: Option<u32>) -> Result<Vec<NewsItem>> {
    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(s) = symbol { params.push(("symbol", s.to_string())); }
    if let Some(l) = limit { params.push(("limit", l.to_string())); }
    let resp = client.get("/v1/news", Some(&params)).await?;
    let body = resp.json::<Vec<NewsItem>>().await?;
    Ok(body)
}

