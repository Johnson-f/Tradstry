use super::{SpecialistDefinition, SpecialistKind};
use crate::service::agents::runtime::ModelRole;
use crate::service::agents::tools::AgentToolKind;

pub fn definition() -> SpecialistDefinition {
    SpecialistDefinition {
        kind: SpecialistKind::TradeReview,
        display_name: "Trade reviewer",
        purpose: "Compares canonical journal records with owned playbook rules.",
        prompt: super::prompts::TRADE_REVIEW,
        model_role: ModelRole::Reasoning,
        tools: vec![
            AgentToolKind::JournalRecords,
            AgentToolKind::PlaybookContext,
        ],
        max_model_calls: 5,
        max_tool_calls: 5,
        timeout_ms: 60_000,
    }
}
