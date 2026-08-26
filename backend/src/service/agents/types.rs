use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentLane {
    Instant,
    FastAi,
    Deep,
}

impl AgentLane {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Instant => "instant",
            Self::FastAi => "fast_ai",
            Self::Deep => "deep",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunStatus {
    Queued,
    Running,
    WaitingForApproval,
    Completed,
    Failed,
    Cancelled,
}

impl AgentRunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::WaitingForApproval => "waiting_for_approval",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentIntent {
    PerformanceSnapshot,
    TradeLookup,
    PlaybookLookup,
    MarketQuote,
    MarketNews,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentActor {
    pub user_id: String,
    pub clerk_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentScope {
    pub workspace_id: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentDateRange {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessageContext {
    pub explicit_intent: Option<AgentIntent>,
    pub trade_ids: Vec<String>,
    pub playbook_ids: Vec<String>,
    pub date_range: Option<AgentDateRange>,
    pub market_symbol: Option<String>,
    pub media_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendAgentMessage {
    pub conversation_id: String,
    pub content: String,
    pub context: AgentMessageContext,
    pub idempotency_key: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentConversation {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub title: Option<String>,
    pub summary_text: Option<String>,
    pub summarized_through_sequence: i64,
    pub summary_version: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentMessage {
    pub id: String,
    pub conversation_id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub sequence: i64,
    pub role: String,
    pub content: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentRun {
    pub id: String,
    pub conversation_id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub parent_run_id: Option<String>,
    pub input_message_id: Option<String>,
    pub lane: AgentLane,
    pub status: AgentRunStatus,
    pub stage: String,
    pub model_calls: i64,
    pub tool_calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_input_tokens: i64,
    pub estimated_cost_micros: i64,
    pub error_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentRunHandle {
    pub run_id: String,
    pub conversation_id: String,
    pub status: AgentRunStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentRunEvent {
    pub run_id: String,
    pub sequence: i64,
    pub kind: String,
    pub payload: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvidenceRef {
    pub evidence_id: String,
    pub source_type: String,
    pub source_id: String,
    pub source_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentClaim {
    pub claim_id: String,
    pub text: String,
    pub evidence_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AnswerBlock {
    Paragraph {
        text: String,
    },
    Metric {
        label: String,
        value: String,
    },
    List {
        title: Option<String>,
        items: Vec<String>,
    },
    Warning {
        text: String,
    },
    ActionProposal {
        proposal_id: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnswerDraft {
    pub blocks: Vec<AnswerBlock>,
    pub claims: Vec<AgentClaim>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentCapabilities {
    pub enabled: bool,
    pub runtime_version: String,
    pub lanes: Vec<AgentLane>,
    pub model_roles_ready: bool,
    pub memory: bool,
    pub actions: bool,
    pub notebook_assistance: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMemoryKind {
    Preference,
    Goal,
    Routine,
    Instruction,
}

impl AgentMemoryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Preference => "preference",
            Self::Goal => "goal",
            Self::Routine => "routine",
            Self::Instruction => "instruction",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMemoryStatus {
    PendingReview,
    Active,
    Superseded,
    Deleted,
}

impl AgentMemoryStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PendingReview => "pending_review",
            Self::Active => "active",
            Self::Superseded => "superseded",
            Self::Deleted => "deleted",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentMemoryRecord {
    pub id: String,
    pub user_id: String,
    pub workspace_id: Option<String>,
    pub kind: AgentMemoryKind,
    pub subject_key: String,
    pub text: String,
    pub status: AgentMemoryStatus,
    pub pinned: bool,
    pub source_conversation_id: String,
    pub source_message_id: String,
    pub provenance_excerpt: String,
    pub confidence: f64,
    pub extraction_version: String,
    pub user_edited: bool,
    pub superseded_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentMemoryJob {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub source_conversation_id: String,
    pub source_message_id: String,
    pub run_id: String,
    pub extraction_version: String,
    pub attempt_count: i32,
}
