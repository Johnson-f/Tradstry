use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::MarketClient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub symbol: String,
    pub quarter: String,
    pub year: i32,
    pub date: String,
    pub transcript: String,
    pub participants: Vec<String>,
    pub metadata: TranscriptMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptMetadata {
    pub source: String,
    #[serde(rename = "retrieved_at")]
    pub retrieved_at: String,
    #[serde(rename = "transcripts_id")]
    pub transcripts_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsTranscriptsResponse {
    pub symbol: String,
    pub transcripts: Vec<Transcript>,
    pub metadata: ResponseMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseMetadata {
    #[serde(rename = "total_transcripts")]
    pub total_transcripts: u32,
    #[serde(rename = "filters_applied")]
    pub filters_applied: FiltersApplied,
    #[serde(rename = "retrieved_at")]
    pub retrieved_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiltersApplied {
    pub quarter: String,
    pub year: i32,
}

pub async fn get_earnings_transcript(
    client: &MarketClient,
    symbol: &str,
    quarter: Option<&str>,
    year: Option<i32>,
) -> Result<EarningsTranscriptsResponse> {
    let mut params: Vec<(&str, String)> = Vec::new();
    
    if let Some(q) = quarter {
        params.push(("quarter", q.to_string()));
    }
    
    if let Some(y) = year {
        params.push(("year", y.to_string()));
    }
    
    let path = format!("/v1/earnings-transcript/{}", symbol);
    let resp = client.get(&path, Some(&params)).await?;
    let body = resp.json::<EarningsTranscriptsResponse>().await?;
    Ok(body)
}
