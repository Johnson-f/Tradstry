use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstitutionalHolder {
    pub holder: String,
    pub shares: u64,
    #[serde(rename = "date_reported")]
    pub date_reported: String,
    #[serde(rename = "percent_out")]
    pub percent_out: Option<f64>,
    pub value: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutualFundHolder {
    pub holder: String,
    pub shares: u64,
    #[serde(rename = "date_reported")]
    pub date_reported: String,
    #[serde(rename = "percent_out")]
    pub percent_out: Option<f64>,
    pub value: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsiderTransaction {
    pub insider: String,
    pub transaction_type: String,
    pub shares: i64,
    pub price: Option<f64>,
    pub date: String,
    pub value: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum HolderType {
    #[serde(rename = "institutional")]
    Institutional,
    #[serde(rename = "mutualfund")]
    MutualFund,
    #[serde(rename = "insider_transactions")]
    InsiderTransactions,
    #[serde(rename = "insider_purchases")]
    InsiderPurchases,
    #[serde(rename = "insider_roster")]
    InsiderRoster,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoldersResponse {
    pub symbol: String,
    #[serde(rename = "holder_type")]
    pub holder_type: String,
    #[serde(rename = "major_breakdown")]
    pub major_breakdown: Option<serde_json::Value>,
    #[serde(rename = "institutional_holders")]
    pub institutional_holders: Option<Vec<InstitutionalHolder>>,
    #[serde(rename = "mutualfund_holders")]
    pub mutualfund_holders: Option<Vec<MutualFundHolder>>,
    #[serde(rename = "insider_transactions")]
    pub insider_transactions: Option<Vec<InsiderTransaction>>,
    #[serde(rename = "insider_purchases")]
    pub insider_purchases: Option<Vec<InsiderTransaction>>,
    #[serde(rename = "insider_roster")]
    pub insider_roster: Option<Vec<serde_json::Value>>,
}

pub async fn get_holders(
    client: &MarketClient,
    symbol: &str,
    holder_type: Option<&str>,
) -> Result<HoldersResponse> {
    let mut params: Vec<(&str, String)> = Vec::new();
    
    let h_type = holder_type.unwrap_or("institutional");
    params.push(("holder_type", h_type.to_string()));
    
    let path = format!("/v1/holders/{}", symbol);
    let resp = client.get(&path, Some(&params)).await?;
    let body = resp.json::<HoldersResponse>().await?;
    Ok(body)
}
