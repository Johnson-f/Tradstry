use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectorPerformanceItem {
    pub sector: String,
    #[serde(rename = "dayReturn")]
    pub day_return: Option<String>,
    #[serde(rename = "ytdReturn")]
    pub ytd_return: Option<String>,
    #[serde(rename = "yearReturn")]
    pub year_return: Option<String>,
    #[serde(rename = "threeYearReturn")]
    pub three_year_return: Option<String>,
    #[serde(rename = "fiveYearReturn")]
    pub five_year_return: Option<String>,
}

pub async fn get_sectors(client: &MarketClient) -> Result<Vec<SectorPerformanceItem>> {
    let resp = client.get("/v1/sectors", None).await?;
    let body = resp.json::<Vec<SectorPerformanceItem>>().await?;
    Ok(body)
}

