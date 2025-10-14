use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

// Push Request from client to server
#[derive(Debug, Serialize, Deserialize)]
pub struct PushRequest {
    pub client_group_id: String,
    pub mutations: Vec<Mutation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Mutation {
    pub id: u64,
    pub client_id: String,
    pub name: String,
    pub args: serde_json::Value,
    pub timestamp: i64,
}

// Pull Request from client to server
#[derive(Debug, Serialize, Deserialize)]
pub struct PullRequest {
    pub client_group_id: String,
    pub cookie: Option<u64>,
}

// Pull Response from server to client
#[derive(Debug, Serialize, Deserialize)]
pub struct PullResponse {
    pub cookie: u64,
    pub last_mutation_id_changes: std::collections::HashMap<String, u64>,
    pub patch: Vec<PatchOperation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PatchOperation {
    pub op: PatchOp,
    pub key: String,
    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum PatchOp {
    #[serde(rename = "put")]
    Put,
    #[serde(rename = "del")]
    Del,
    #[serde(rename = "clear")]
    Clear,
}

// Client state tracking
#[derive(Debug, Serialize, Deserialize)]
pub struct ClientState {
    pub client_group_id: String,
    pub client_id: String,
    pub last_mutation_id: u64,
    pub last_modified_version: u64,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// Space version tracking
#[derive(Debug, Serialize, Deserialize)]
pub struct SpaceVersion {
    pub id: i32,
    pub version: u64,
}

// Data transformation types for key-value storage
#[derive(Debug, Serialize, Deserialize)]
pub struct StockKV {
    pub id: i64,
    pub user_id: String,
    pub symbol: String,
    pub trade_type: String,
    pub order_type: String,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub stop_loss: f64,
    pub commissions: f64,
    pub number_shares: f64,
    pub take_profit: Option<f64>,
    pub entry_date: String,
    pub exit_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: u64, // For LWW conflict resolution
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OptionKV {
    pub id: i64,
    pub user_id: String,
    pub symbol: String,
    pub strategy_type: String,
    pub trade_direction: String,
    pub number_of_contracts: i32,
    pub option_type: String,
    pub strike_price: f64,
    pub expiration_date: String,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub total_premium: f64,
    pub commissions: f64,
    pub implied_volatility: f64,
    pub entry_date: String,
    pub exit_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub version: u64, // For LWW conflict resolution
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteKV {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub version: u64, // For LWW conflict resolution
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaybookKV {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub version: u64, // For LWW conflict resolution
}

// Mutation processing errors
#[derive(Debug, thiserror::Error)]
pub enum MutationError {
    #[error("Invalid mutation name: {0}")]
    InvalidMutationName(String),
    #[error("Invalid key format: {0}")]
    InvalidKeyFormat(String),
    #[error("Database error: {0}")]
    DatabaseError(#[from] libsql::Error),
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    #[error("Stock not found: {0}")]
    StockNotFound(i64),
    #[error("Option not found: {0}")]
    OptionNotFound(i64),
    #[error("Note not found: {0}")]
    NoteNotFound(String),
    #[error("Playbook not found: {0}")]
    PlaybookNotFound(String),
}

pub type MutationResult<T> = Result<T, MutationError>;
