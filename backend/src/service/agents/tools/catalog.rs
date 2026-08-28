use std::collections::HashSet;
use std::sync::Arc;

use tinyagents::harness::tool::Tool;

use super::ContextualTool;
use super::adapters::{
    JournalRecordsTool, KnowledgeSearchTool, MarketTool, MarketToolKind, MemoryRecallTool,
    NotebookMediaTool, PlaybookContextTool, TradingPerformanceTool,
};
use super::proposals::ActionProposalTool;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AgentToolKind {
    TradingPerformance,
    JournalRecords,
    PlaybookContext,
    MarketPrice,
    MarketNews,
    MarketCompany,
    MarketFinancials,
    MarketEarnings,
    KnowledgeSearch,
    MemoryRecall,
    NotebookMedia,
    ActionProposal,
}

impl AgentToolKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::TradingPerformance => "trading_performance",
            Self::JournalRecords => "journal_records",
            Self::PlaybookContext => "playbook_context",
            Self::MarketPrice => "market_price",
            Self::MarketNews => "market_news",
            Self::MarketCompany => "market_company",
            Self::MarketFinancials => "market_financials",
            Self::MarketEarnings => "market_earnings",
            Self::KnowledgeSearch => "knowledge_search",
            Self::MemoryRecall => "memory_recall",
            Self::NotebookMedia => "notebook_media",
            Self::ActionProposal => "propose_action",
        }
    }
}

pub struct ToolCatalog;

impl ToolCatalog {
    pub fn build_turn(include_media: bool) -> AgentResult<Vec<Arc<dyn Tool<AgentRuntimeState>>>> {
        let mut kinds = vec![
            AgentToolKind::TradingPerformance,
            AgentToolKind::JournalRecords,
            AgentToolKind::PlaybookContext,
            AgentToolKind::MarketPrice,
            AgentToolKind::MarketNews,
            AgentToolKind::MarketCompany,
            AgentToolKind::MarketFinancials,
            AgentToolKind::MarketEarnings,
            AgentToolKind::KnowledgeSearch,
            AgentToolKind::MemoryRecall,
            AgentToolKind::ActionProposal,
        ];
        if include_media {
            kinds.push(AgentToolKind::NotebookMedia);
        }
        Self::build(&kinds)
    }

    pub fn build(kinds: &[AgentToolKind]) -> AgentResult<Vec<Arc<dyn Tool<AgentRuntimeState>>>> {
        let mut names = HashSet::new();
        let mut tools = Vec::<Arc<dyn Tool<AgentRuntimeState>>>::new();
        for kind in kinds {
            if !names.insert(kind.name()) {
                return Err(AgentError::Validation(format!(
                    "duplicate agent tool {}",
                    kind.name()
                )));
            }
            let tool: Arc<dyn Tool<AgentRuntimeState>> = match kind {
                AgentToolKind::TradingPerformance => Arc::new(TradingPerformanceTool),
                AgentToolKind::JournalRecords => Arc::new(JournalRecordsTool),
                AgentToolKind::PlaybookContext => Arc::new(PlaybookContextTool),
                AgentToolKind::MarketPrice => Arc::new(MarketTool(MarketToolKind::Price)),
                AgentToolKind::MarketNews => Arc::new(MarketTool(MarketToolKind::News)),
                AgentToolKind::MarketCompany => Arc::new(MarketTool(MarketToolKind::Company)),
                AgentToolKind::MarketFinancials => Arc::new(MarketTool(MarketToolKind::Financials)),
                AgentToolKind::MarketEarnings => Arc::new(MarketTool(MarketToolKind::Earnings)),
                AgentToolKind::KnowledgeSearch => Arc::new(KnowledgeSearchTool),
                AgentToolKind::MemoryRecall => Arc::new(MemoryRecallTool),
                AgentToolKind::NotebookMedia => Arc::new(NotebookMediaTool),
                AgentToolKind::ActionProposal => Arc::new(ActionProposalTool),
            };
            if !tool.policy().classified {
                return Err(AgentError::Validation(format!(
                    "agent tool {} is unclassified",
                    tool.name()
                )));
            }
            tools.push(Arc::new(ContextualTool::new(tool)));
        }
        Ok(tools)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schemas_never_expose_actor_or_workspace() {
        let tools = ToolCatalog::build(&[
            AgentToolKind::TradingPerformance,
            AgentToolKind::JournalRecords,
            AgentToolKind::PlaybookContext,
            AgentToolKind::MarketPrice,
            AgentToolKind::MarketNews,
            AgentToolKind::MarketCompany,
            AgentToolKind::MarketFinancials,
            AgentToolKind::MarketEarnings,
        ])
        .unwrap();
        for tool in tools {
            let schema = tool.schema().parameters.to_string();
            assert!(!schema.contains("user_id"));
            assert!(!schema.contains("workspace_id"));
            assert!(tool.policy().classified);
        }
    }

    #[test]
    fn duplicate_tool_kind_is_rejected() {
        assert!(
            ToolCatalog::build(&[
                AgentToolKind::TradingPerformance,
                AgentToolKind::TradingPerformance
            ])
            .is_err()
        );
    }

    #[test]
    fn every_tool_schema_is_provider_portable() {
        let tools = ToolCatalog::build(&[
            AgentToolKind::TradingPerformance,
            AgentToolKind::JournalRecords,
            AgentToolKind::PlaybookContext,
            AgentToolKind::MarketPrice,
            AgentToolKind::MarketNews,
            AgentToolKind::MarketCompany,
            AgentToolKind::MarketFinancials,
            AgentToolKind::MarketEarnings,
            AgentToolKind::KnowledgeSearch,
            AgentToolKind::MemoryRecall,
            AgentToolKind::NotebookMedia,
            AgentToolKind::ActionProposal,
        ])
        .unwrap();
        for tool in tools {
            crate::service::agents::runtime::provider_contract::compile_schema(
                &tool.schema().parameters,
            )
            .unwrap_or_else(|error| panic!("{}: {error}", tool.name()));
        }
    }
}
