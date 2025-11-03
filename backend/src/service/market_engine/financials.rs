use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialStatementRow {
    #[serde(rename = "Breakdown")]
    pub breakdown: String,
    #[serde(flatten)]
    pub period_data: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialStatement {
    #[serde(flatten)]
    pub rows: HashMap<String, FinancialStatementRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialsResponse {
    pub symbol: String,
    #[serde(rename = "statement_type")]
    pub statement_type: String,
    pub frequency: String,
    pub statement: FinancialStatement,
}

pub async fn get_financials(
    client: &MarketClient,
    symbol: &str,
    statement: Option<&str>,
    frequency: Option<&str>,
) -> Result<FinancialsResponse> {
    let mut params: Vec<(&str, String)> = Vec::new();
    
    let statement_type = statement.unwrap_or("income");
    params.push(("statement", statement_type.to_string()));
    
    let freq = frequency.unwrap_or("annual");
    params.push(("frequency", freq.to_string()));
    
    let path = format!("/v1/financials/{}", symbol);
    let resp = client.get(&path, Some(&params)).await?;
    let body = resp.json::<FinancialsResponse>().await?;
    Ok(body)
}
