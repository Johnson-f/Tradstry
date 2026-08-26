use serde::{Deserialize, Serialize};

use crate::service::agents::{AgentDateRange, AgentEvidenceRef};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeSourceType {
    JournalEntry,
    NotebookNote,
    Playbook,
}

impl KnowledgeSourceType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::JournalEntry => "journal_entry",
            Self::NotebookNote => "notebook_note",
            Self::Playbook => "playbook",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "journal_entry" => Some(Self::JournalEntry),
            "notebook_note" => Some(Self::NotebookNote),
            "playbook" => Some(Self::Playbook),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct SourceVersion(pub String);

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRelationships {
    pub trade_ids: Vec<String>,
    pub playbook_ids: Vec<String>,
    pub note_ids: Vec<String>,
    pub symbols: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct KnowledgePassage {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub source_type: KnowledgeSourceType,
    pub source_id: String,
    pub source_version: SourceVersion,
    pub chunk_index: i32,
    pub title: String,
    pub excerpt: String,
    pub search_text: String,
    pub embedding: Option<Vec<f32>>,
    pub relationships: KnowledgeRelationships,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub content_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct KnowledgeOutboxRecord {
    pub id: i64,
    pub user_id: String,
    pub workspace_id: String,
    pub source_type: KnowledgeSourceType,
    pub source_id: String,
    pub operation: String,
    pub status: String,
    pub attempt_count: i32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct KnowledgeSearchRequest {
    pub workspace_id: String,
    pub query: String,
    pub date_range: Option<AgentDateRange>,
    pub symbols: Vec<String>,
    pub trade_ids: Vec<String>,
    pub playbook_ids: Vec<String>,
    pub note_ids: Vec<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct KnowledgeHit {
    pub source_type: KnowledgeSourceType,
    pub source_id: String,
    pub source_version: SourceVersion,
    pub title: String,
    pub excerpt: String,
    pub relationships: KnowledgeRelationships,
    pub evidence: AgentEvidenceRef,
}
