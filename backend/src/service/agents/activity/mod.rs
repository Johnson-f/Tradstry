mod projector;
mod redaction;
mod reducer;

use serde::{Deserialize, Serialize};

use super::{AgentRunEvent, AgentRunStatus};

pub use projector::project_event;
pub use reducer::fold_events;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentActivityCategory {
    Model,
    Tool,
    Subagent,
    System,
}

impl AgentActivityCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Model => "model",
            Self::Tool => "tool",
            Self::Subagent => "subagent",
            Self::System => "system",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentActivityStatus {
    Started,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl AgentActivityStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Started => "started",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivityMetadata {
    pub symbol: Option<String>,
    pub record_count: Option<i64>,
    pub date_range_label: Option<String>,
    pub source_count: Option<i64>,
    pub retryable: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivityEntry {
    pub sequence: i64,
    pub activity_id: String,
    pub parent_activity_id: Option<String>,
    pub category: AgentActivityCategory,
    pub status: AgentActivityStatus,
    pub label: String,
    pub detail: Option<String>,
    pub duration_ms: Option<i64>,
    pub metadata: AgentActivityMetadata,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivitySummary {
    pub message_id: String,
    pub status: AgentRunStatus,
    pub duration_ms: Option<i64>,
    pub model_calls: i64,
    pub tool_calls: i64,
    pub subagent_count: i64,
    pub source_count: i64,
    pub has_failures: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessageActivity {
    pub summary: AgentActivitySummary,
    pub entries: Vec<AgentActivityEntry>,
}

pub fn projected_entries(
    events: &[AgentRunEvent],
    run_status: &AgentRunStatus,
) -> Vec<AgentActivityEntry> {
    fold_events(events, run_status)
}
