use serde_json::Value;

use super::AgentActivityMetadata;

pub(super) fn bounded(value: &str, max: usize) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(max).collect())
}

pub(super) fn safe_symbol(value: &Value) -> Option<String> {
    let value = value.as_str()?.trim().to_ascii_uppercase();
    if value.is_empty()
        || value.len() > 20
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '^')
        })
    {
        return None;
    }
    Some(value)
}

pub(super) fn safe_metadata(payload: &Value) -> AgentActivityMetadata {
    AgentActivityMetadata {
        symbol: payload.get("symbol").and_then(safe_symbol),
        record_count: payload
            .get("recordCount")
            .and_then(Value::as_i64)
            .filter(|value| *value >= 0),
        date_range_label: payload
            .get("dateRangeLabel")
            .and_then(Value::as_str)
            .and_then(|value| bounded(value, 80)),
        source_count: payload
            .get("sourceCount")
            .and_then(Value::as_i64)
            .filter(|value| *value >= 0),
        retryable: payload.get("retryable").and_then(Value::as_bool),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn metadata_is_allowlisted_and_bounded() {
        let value = json!({
            "symbol":"cbrs",
            "recordCount":5,
            "dateRangeLabel":"x".repeat(200),
            "retryable":true,
            "prompt":"secret",
            "apiKey":"secret",
            "runId":"internal"
        });
        let metadata = safe_metadata(&value);
        assert_eq!(metadata.symbol.as_deref(), Some("CBRS"));
        assert_eq!(metadata.record_count, Some(5));
        assert_eq!(
            metadata.date_range_label.as_ref().unwrap().chars().count(),
            80
        );
        assert_eq!(metadata.retryable, Some(true));
        let serialized = serde_json::to_string(&metadata).unwrap();
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("runId"));
    }
}
