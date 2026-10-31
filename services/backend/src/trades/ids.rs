use sha2::{Digest, Sha256};
use uuid::Uuid;

fn hash(parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part.as_bytes());
        hasher.update(b"|");
    }
    hasher
        .finalize()
        .iter()
        .take(16)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Stable as fills are appended: only the first fill names the trade.
pub fn single(workspace_id: Uuid, instrument_key: &str, first_fill: &str) -> String {
    hash(&[
        &workspace_id.to_string(),
        "single",
        instrument_key,
        first_fill,
    ])
}

pub fn from_decision(decision_id: Uuid, part: usize) -> String {
    hash(&["decision", &decision_id.to_string(), &part.to_string()])
}
