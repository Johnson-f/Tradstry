use super::{SpecialistDefinition, SpecialistKind};
use crate::service::agents::runtime::ModelRole;
use crate::service::agents::tools::AgentToolKind;

pub fn definition(uses_media: bool) -> SpecialistDefinition {
    SpecialistDefinition {
        kind: SpecialistKind::Knowledge,
        display_name: "Knowledge researcher",
        purpose: "Finds relevant owned notes, memories, and authenticated notebook media.",
        prompt: super::prompts::KNOWLEDGE,
        model_role: if uses_media {
            ModelRole::Vision
        } else {
            ModelRole::Reasoning
        },
        tools: vec![
            AgentToolKind::KnowledgeSearch,
            AgentToolKind::MemoryRecall,
            AgentToolKind::NotebookMedia,
        ],
        max_model_calls: 6,
        max_tool_calls: 8,
        timeout_ms: 90_000,
    }
}
