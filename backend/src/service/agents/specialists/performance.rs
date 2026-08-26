use super::{SpecialistDefinition, SpecialistKind};
use crate::service::agents::runtime::ModelRole;
use crate::service::agents::tools::AgentToolKind;

pub fn definition() -> SpecialistDefinition {
    SpecialistDefinition {
        kind: SpecialistKind::Performance,
        display_name: "Performance analyst",
        purpose: "Explains canonical performance metrics and patterns.",
        prompt: super::prompts::PERFORMANCE,
        model_role: ModelRole::Reasoning,
        tools: vec![AgentToolKind::TradingPerformance],
        max_model_calls: 4,
        max_tool_calls: 3,
        timeout_ms: 45_000,
    }
}
