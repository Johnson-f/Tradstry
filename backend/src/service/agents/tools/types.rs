use serde::{Deserialize, Serialize};

use crate::service::agents::{AgentDateRange, AgentEvidenceRef};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolScopeApplied {
    pub workspace_id: String,
    pub date_range: Option<AgentDateRange>,
    pub symbols: Vec<String>,
    pub trade_ids: Vec<String>,
    pub playbook_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolUnavailable {
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolEnvelope<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub scope: ToolScopeApplied,
    pub evidence: Vec<AgentEvidenceRef>,
    pub warnings: Vec<String>,
    pub unavailable: Option<ToolUnavailable>,
}
