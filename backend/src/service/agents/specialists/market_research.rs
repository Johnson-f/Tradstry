use super::{SpecialistDefinition, SpecialistKind};
use crate::service::agents::runtime::ModelRole;
use crate::service::agents::tools::AgentToolKind;

pub fn definition() -> SpecialistDefinition {
    SpecialistDefinition {
        kind: SpecialistKind::MarketResearch,
        display_name: "Market researcher",
        purpose: "Retrieves current external price, company, news, financial, and earnings context.",
        prompt: super::prompts::MARKET_RESEARCH,
        model_role: ModelRole::Reasoning,
        tools: vec![
            AgentToolKind::MarketPrice,
            AgentToolKind::MarketNews,
            AgentToolKind::MarketCompany,
            AgentToolKind::MarketFinancials,
            AgentToolKind::MarketEarnings,
        ],
        max_model_calls: 7,
        max_tool_calls: 8,
        timeout_ms: 90_000,
    }
}
