use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "input", rename_all = "snake_case")]
pub enum AgentActionPayload {
    CreateNotebookNote(CreateNotebookNoteAction),
    UpdatePlaybook(UpdatePlaybookAction),
    AddTradeTag(TradeTagAction),
    RemoveTradeTag(TradeTagAction),
}

impl AgentActionPayload {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::CreateNotebookNote(_) => "create_notebook_note",
            Self::UpdatePlaybook(_) => "update_playbook",
            Self::AddTradeTag(_) => "add_trade_tag",
            Self::RemoveTradeTag(_) => "remove_trade_tag",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CreateNotebookNoteAction {
    pub title: String,
    pub markdown: String,
    #[serde(default)]
    pub trade_ids: Vec<String>,
    #[serde(default)]
    pub playbook_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct UpdatePlaybookAction {
    pub playbook_id: String,
    pub expected_version: String,
    pub patch: PlaybookActionPatch,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PlaybookActionPatch {
    pub name: Option<String>,
    pub entry_rules: Option<String>,
    pub exit_rules: Option<String>,
    pub position_sizing_rules: Option<String>,
    pub additional_rules: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TradeTagAction {
    pub trade_id: String,
    pub tag_id: String,
    pub expected_trade_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentActionPreview {
    pub title: String,
    pub summary: String,
    pub changes: Vec<AgentActionChange>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentActionChange {
    pub field: String,
    pub before: Option<String>,
    pub after: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AgentActionProposal {
    pub id: String,
    pub run_id: String,
    pub conversation_id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub kind: String,
    pub payload: AgentActionPayload,
    pub preview: AgentActionPreview,
    pub status: String,
    pub expires_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct AgentActionExecutionJob {
    pub id: String,
    pub proposal: AgentActionProposal,
    pub attempt_count: i32,
}
