mod knowledge;
mod market_research;
mod performance;
pub mod prompts;
mod trade_review;
pub mod types;

pub use types::*;

use crate::service::agents::runtime::ModelRole;
use crate::service::agents::tools::AgentToolKind;

#[derive(Clone, Debug)]
pub struct SpecialistDefinition {
    pub kind: SpecialistKind,
    pub display_name: &'static str,
    pub purpose: &'static str,
    pub prompt: &'static str,
    pub model_role: ModelRole,
    pub tools: Vec<AgentToolKind>,
    pub max_model_calls: usize,
    pub max_tool_calls: usize,
    pub timeout_ms: u64,
}

pub struct SpecialistRegistry;

impl SpecialistRegistry {
    pub fn definition(kind: SpecialistKind, uses_media: bool) -> SpecialistDefinition {
        match kind {
            SpecialistKind::Performance => performance::definition(),
            SpecialistKind::TradeReview => trade_review::definition(),
            SpecialistKind::MarketResearch => market_research::definition(),
            SpecialistKind::Knowledge => knowledge::definition(uses_media),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(kind: SpecialistKind) -> Vec<&'static str> {
        SpecialistRegistry::definition(kind, false)
            .tools
            .into_iter()
            .map(AgentToolKind::name)
            .collect()
    }

    #[test]
    fn specialists_receive_only_owned_tools() {
        assert_eq!(names(SpecialistKind::Performance), ["trading_performance"]);
        assert_eq!(
            names(SpecialistKind::TradeReview),
            ["journal_records", "playbook_context"]
        );
        assert_eq!(
            names(SpecialistKind::MarketResearch),
            [
                "market_price",
                "market_news",
                "market_company",
                "market_financials",
                "market_earnings"
            ]
        );
        assert_eq!(
            names(SpecialistKind::Knowledge),
            ["knowledge_search", "memory_recall", "notebook_media"]
        );
    }

    #[test]
    fn specialist_allowlists_never_contain_orchestration_or_write_tools() {
        for kind in [
            SpecialistKind::Performance,
            SpecialistKind::TradeReview,
            SpecialistKind::MarketResearch,
            SpecialistKind::Knowledge,
        ] {
            for name in names(kind) {
                assert!(!name.contains("supervisor"));
                assert!(!name.contains("verifier"));
                assert!(!name.contains("specialist"));
                assert!(!name.starts_with("create_"));
                assert!(!name.starts_with("update_"));
                assert!(!name.starts_with("delete_"));
            }
        }
    }

    #[test]
    fn knowledge_uses_vision_only_for_owned_media_context() {
        assert_eq!(
            SpecialistRegistry::definition(SpecialistKind::Knowledge, false).model_role,
            ModelRole::Reasoning
        );
        assert_eq!(
            SpecialistRegistry::definition(SpecialistKind::Knowledge, true).model_role,
            ModelRole::Vision
        );
    }
}
