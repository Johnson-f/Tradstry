use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectorPerformanceItem {
    pub sector: String,
    pub performance: Option<String>,
}

pub async fn get_sectors(client: &MarketClient) -> Result<Vec<SectorPerformanceItem>> {
    let resp = client.get("/v1/sectors", None).await?;
    let body = resp.json::<Vec<SectorPerformanceItem>>().await?;
    Ok(body)
}

