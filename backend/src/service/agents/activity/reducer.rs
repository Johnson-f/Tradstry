use std::collections::HashMap;

use super::{
    AgentActivityEntry, AgentActivityStatus, AgentRunEvent, AgentRunStatus, project_event,
};

pub fn fold_events(
    events: &[AgentRunEvent],
    run_status: &AgentRunStatus,
) -> Vec<AgentActivityEntry> {
    let mut entries = Vec::<AgentActivityEntry>::new();
    let mut positions = HashMap::<String, usize>::new();
    for mut projected in events.iter().filter_map(project_event) {
        if projected.category == super::AgentActivityCategory::Subagent
            && projected.parent_activity_id.is_none()
        {
            projected.parent_activity_id = entries
                .iter()
                .rev()
                .find(|entry| {
                    entry.category == super::AgentActivityCategory::Tool
                        && entry.status == AgentActivityStatus::Started
                        && entry.label.to_ascii_lowercase().contains("delegated")
                })
                .map(|entry| entry.activity_id.clone());
        }
        if let Some(position) = positions.get(&projected.activity_id).copied() {
            let existing = &mut entries[position];
            existing.status = projected.status;
            existing.label = projected.label;
            existing.detail = projected.detail.or_else(|| existing.detail.clone());
            existing.duration_ms = projected
                .duration_ms
                .or_else(|| elapsed_ms(&existing.created_at, &projected.created_at))
                .or(existing.duration_ms);
            if projected.metadata != Default::default() {
                existing.metadata = projected.metadata;
            }
        } else {
            positions.insert(projected.activity_id.clone(), entries.len());
            entries.push(projected);
        }
    }
    if !matches!(run_status, AgentRunStatus::Queued | AgentRunStatus::Running) {
        for entry in &mut entries {
            if entry.status == AgentActivityStatus::Started {
                entry.status = match run_status {
                    AgentRunStatus::Cancelled => AgentActivityStatus::Cancelled,
                    _ => AgentActivityStatus::Interrupted,
                };
            }
        }
    }
    entries.sort_by_key(|entry| entry.sequence);
    entries
}

fn elapsed_ms(started_at: &str, completed_at: &str) -> Option<i64> {
    let started = chrono::DateTime::parse_from_rfc3339(started_at).ok()?;
    let completed = chrono::DateTime::parse_from_rfc3339(completed_at).ok()?;
    Some((completed - started).num_milliseconds().max(0))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn event(sequence: i64, kind: &str, payload: serde_json::Value) -> AgentRunEvent {
        AgentRunEvent {
            run_id: "run".into(),
            sequence,
            kind: kind.into(),
            payload,
            created_at: format!("2026-08-28T00:00:0{sequence}Z"),
        }
    }

    #[test]
    fn start_and_completion_fold_without_duplicates() {
        let events = vec![
            event(
                1,
                "tool_started",
                json!({"callId":"c1","tool":"journal_records"}),
            ),
            event(
                2,
                "tool_completed",
                json!({"callId":"c1","tool":"journal_records","durationMs":12}),
            ),
        ];
        let folded = fold_events(&events, &AgentRunStatus::Completed);
        assert_eq!(folded.len(), 1);
        assert_eq!(folded[0].status, AgentActivityStatus::Completed);
        assert_eq!(folded[0].duration_ms, Some(12));
    }

    #[test]
    fn unfinished_activity_becomes_interrupted_for_terminal_run() {
        let events = vec![event(
            1,
            "model_started",
            json!({"callId":"m1","model":"private-provider-model"}),
        )];
        let folded = fold_events(&events, &AgentRunStatus::Failed);
        assert_eq!(folded[0].status, AgentActivityStatus::Interrupted);
        assert!(!folded[0].label.contains("private-provider-model"));
    }

    #[test]
    fn subagent_activity_nests_under_its_delegate_tool() {
        let events = vec![
            event(
                1,
                "tool_started",
                json!({"callId":"delegate-1","tool":"delegate_trade_review"}),
            ),
            event(
                2,
                "subagent_started",
                json!({"name":"delegate_trade_review","depth":1}),
            ),
        ];
        let folded = fold_events(&events, &AgentRunStatus::Running);
        assert_eq!(
            folded[1].parent_activity_id,
            Some(folded[0].activity_id.clone())
        );
    }
}
