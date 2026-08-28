use super::redaction::{bounded, safe_metadata};
use super::{AgentActivityCategory, AgentActivityEntry, AgentActivityStatus, AgentRunEvent};

pub fn project_event(event: &AgentRunEvent) -> Option<AgentActivityEntry> {
    let payload = &event.payload;
    let (activity_id, category, status, label, parent_activity_id) = match event.kind.as_str() {
        "model_started" => (
            call_id(payload, event.sequence, "model"),
            AgentActivityCategory::Model,
            AgentActivityStatus::Started,
            "Planning next step".into(),
            None,
        ),
        "model_completed" => (
            call_id(payload, event.sequence, "model"),
            AgentActivityCategory::Model,
            AgentActivityStatus::Completed,
            "Prepared next step".into(),
            None,
        ),
        "model_failed" | "provider_failed" => (
            call_id(payload, event.sequence, "model"),
            AgentActivityCategory::Model,
            AgentActivityStatus::Failed,
            "Model request failed".into(),
            None,
        ),
        "tool_started" => {
            let tool = payload
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            (
                call_id(payload, event.sequence, "tool"),
                AgentActivityCategory::Tool,
                AgentActivityStatus::Started,
                tool_label(tool),
                None,
            )
        }
        "tool_completed" => {
            let tool = payload
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            (
                call_id(payload, event.sequence, "tool"),
                AgentActivityCategory::Tool,
                AgentActivityStatus::Completed,
                completed_tool_label(tool),
                None,
            )
        }
        "tool_failed" => {
            let tool = payload
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            (
                call_id(payload, event.sequence, "tool"),
                AgentActivityCategory::Tool,
                AgentActivityStatus::Failed,
                format!("{} failed", tool_subject(tool)),
                None,
            )
        }
        "subagent_started" | "subagent_completed" | "subagent_failed" => {
            let name = payload
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            let status = match event.kind.as_str() {
                "subagent_started" => AgentActivityStatus::Started,
                "subagent_completed" => AgentActivityStatus::Completed,
                _ => AgentActivityStatus::Failed,
            };
            (
                bounded_activity_id(name, event.sequence, "subagent"),
                AgentActivityCategory::Subagent,
                status,
                subagent_label(name),
                None,
            )
        }
        "answer_repair_started" => (
            format!("system:repair:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Started,
            "Checking sources".into(),
            None,
        ),
        "answer_validation_failed" => (
            format!("system:validation:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Checking answer format".into(),
            None,
        ),
        "answer_repair_completed" => (
            format!("system:repair:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Answer format corrected".into(),
            None,
        ),
        "answer_repair_exhausted" => (
            format!("system:repair:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Failed,
            "Could not validate answer".into(),
            None,
        ),
        "run_queued" => (
            format!("system:queue:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Queued".into(),
            None,
        ),
        "turn_started" => (
            format!("system:turn:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Started review".into(),
            None,
        ),
        "run_failed" => (
            format!("system:failed:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Failed,
            "Run failed".into(),
            None,
        ),
        "run_cancelled" => (
            format!("system:cancelled:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Cancelled,
            "Run cancelled".into(),
            None,
        ),
        "run_completed" => (
            format!("system:completed:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Answer ready".into(),
            None,
        ),
        "model_retry_scheduled" => (
            format!("system:retry:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Retrying model request".into(),
            None,
        ),
        "model_fallback_selected" => (
            format!("system:fallback:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Trying a fallback model".into(),
            None,
        ),
        "rate_limit_waited" => (
            format!("system:rate-limit:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Waited for model capacity".into(),
            None,
        ),
        "provider_circuit_probe_started" => (
            format!("system:circuit:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Started,
            "Checking model provider recovery".into(),
            None,
        ),
        "provider_circuit_opened" => (
            format!("system:circuit:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Failed,
            "Model provider temporarily paused".into(),
            None,
        ),
        "provider_circuit_closed" => (
            format!("system:circuit:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Completed,
            "Model provider recovered".into(),
            None,
        ),
        "run_limit_reached" => (
            format!("system:limit:{}", event.sequence),
            AgentActivityCategory::System,
            AgentActivityStatus::Failed,
            "Run limit reached".into(),
            None,
        ),
        _ => return None,
    };
    let detail = payload
        .get("detail")
        .and_then(|value| value.as_str())
        .and_then(|value| bounded(value, 120));
    Some(AgentActivityEntry {
        sequence: event.sequence,
        activity_id,
        parent_activity_id,
        category,
        status,
        label,
        detail,
        duration_ms: payload
            .get("durationMs")
            .and_then(|value| value.as_i64())
            .filter(|value| *value >= 0),
        metadata: safe_metadata(payload),
        created_at: event.created_at.clone(),
    })
}

fn call_id(payload: &serde_json::Value, sequence: i64, prefix: &str) -> String {
    payload
        .get("callId")
        .and_then(|value| value.as_str())
        .map(|value| bounded_activity_id(value, sequence, prefix))
        .unwrap_or_else(|| format!("{prefix}:{sequence}"))
}

fn bounded_activity_id(value: &str, sequence: i64, prefix: &str) -> String {
    let value = value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':')
        })
        .take(120)
        .collect::<String>();
    if value.is_empty() {
        format!("{prefix}:{sequence}")
    } else {
        format!("{prefix}:{value}")
    }
}

fn tool_subject(name: &str) -> &'static str {
    match name {
        "trading_performance" => "Trading performance",
        "journal_records" => "Journal review",
        "playbook_context" => "Playbook review",
        "knowledge_search" => "Knowledge search",
        "market_price" | "market_news" | "market_company" | "market_financials"
        | "market_earnings" => "Market research",
        "notebook_media" => "Notebook media review",
        "propose_action" => "Action proposal",
        name if name.starts_with("delegate_") => "Delegated review",
        _ => "Data check",
    }
}

fn tool_label(name: &str) -> String {
    format!("Checking {}", tool_subject(name).to_ascii_lowercase())
}

fn completed_tool_label(name: &str) -> String {
    match name {
        "trading_performance" => "Loaded trading performance".into(),
        "journal_records" => "Reviewed journal records".into(),
        "playbook_context" => "Reviewed playbooks".into(),
        "knowledge_search" => "Searched workspace knowledge".into(),
        "market_price" | "market_news" | "market_company" | "market_financials"
        | "market_earnings" => "Checked market context".into(),
        "notebook_media" => "Reviewed notebook media".into(),
        "propose_action" => "Prepared an action proposal".into(),
        name if name.starts_with("delegate_") => "Completed delegated review".into(),
        _ => "Completed data check".into(),
    }
}

fn subagent_label(name: &str) -> String {
    match name.trim_start_matches("delegate_") {
        "performance" => "Performance agent".into(),
        "trade_review" => "Trade review agent".into(),
        "market_research" => "Market research agent".into(),
        "knowledge" => "Knowledge agent".into(),
        _ => "Specialist agent".into(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn event(kind: &str, payload: serde_json::Value) -> AgentRunEvent {
        AgentRunEvent {
            run_id: "hidden-run".into(),
            sequence: 1,
            kind: kind.into(),
            payload,
            created_at: "2026-08-28T00:00:00Z".into(),
        }
    }

    #[test]
    fn tool_projection_uses_safe_vocabulary_only() {
        let projected = project_event(&event(
            "tool_completed",
            json!({
                "callId":"call-1",
                "tool":"market_company",
                "durationMs":40,
                "symbol":"cbrs",
                "prompt":"do not expose",
                "output":{"secret":true}
            }),
        ))
        .unwrap();
        assert_eq!(projected.label, "Checked market context");
        assert_eq!(projected.metadata.symbol.as_deref(), Some("CBRS"));
        let serialized = serde_json::to_string(&projected).unwrap();
        assert!(!serialized.contains("do not expose"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("hidden-run"));
    }
}
