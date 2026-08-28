use serde::{Deserialize, Serialize};

use crate::service::agents::AgentClaim;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SpecialistKind {
    Performance,
    TradeReview,
    MarketResearch,
    Knowledge,
}

impl SpecialistKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Performance => "performance",
            Self::TradeReview => "trade_review",
            Self::MarketResearch => "market_research",
            Self::Knowledge => "knowledge",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpecialistFinding {
    pub specialist: SpecialistKind,
    pub summary: String,
    pub claims: Vec<AgentClaim>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub missing_information: Vec<String>,
}
