use std::sync::Arc;

use serde_json::json;
use tinyagents::harness::events::{AgentEvent, EventListener, EventRecord, EventSink};

use crate::service::agents::{AgentResult, AgentService};

struct ChannelListener {
    tx: tokio::sync::mpsc::UnboundedSender<EventRecord>,
}

impl EventListener for ChannelListener {
    fn on_event(&self, record: &EventRecord) {
        let _ = self.tx.send(record.clone());
    }
}

pub fn event_channel(
    run_id: &str,
) -> (EventSink, tokio::sync::mpsc::UnboundedReceiver<EventRecord>) {
    let sink = EventSink::with_stream_id(run_id);
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    sink.subscribe(Arc::new(ChannelListener { tx }));
    (sink, rx)
}

pub async fn persist_event(
    service: &AgentService,
    root_run_id: &str,
    record: EventRecord,
) -> AgentResult<()> {
    let (kind, payload) = match record.event {
        AgentEvent::RunStarted { .. } => ("turn_started", json!({})),
        AgentEvent::ModelStarted { call_id, model } => (
            "model_started",
            json!({"callId": call_id.as_str(), "model": model}),
        ),
        AgentEvent::ModelCompleted { call_id, usage, .. } => (
            "model_completed",
            json!({
                "callId": call_id.as_str(),
                "inputTokens": usage.as_ref().map(|usage| usage.input_tokens),
                "outputTokens": usage.as_ref().map(|usage| usage.output_tokens),
            }),
        ),
        AgentEvent::ModelFailed { call_id, .. } => (
            "model_failed",
            json!({"callId": call_id.as_str(), "retryable": false}),
        ),
        AgentEvent::ToolStarted { call_id, tool_name } => (
            "tool_started",
            json!({"callId": call_id.as_str(), "tool": tool_name}),
        ),
        AgentEvent::ToolCompleted {
            call_id,
            tool_name,
            duration_ms,
            error,
            ..
        } => (
            if error.is_some() {
                "tool_failed"
            } else {
                "tool_completed"
            },
            json!({
                "callId": call_id.as_str(),
                "tool": tool_name,
                "durationMs": duration_ms,
                "recoverable": error.is_some(),
            }),
        ),
        AgentEvent::ToolFailed {
            call_id,
            tool_name,
            duration_ms,
            ..
        } => (
            "tool_failed",
            json!({
                "callId": call_id.as_str(),
                "tool": tool_name,
                "durationMs": duration_ms,
                "recoverable": false,
            }),
        ),
        AgentEvent::SubAgentStarted { name, depth } => {
            ("subagent_started", json!({"name": name, "depth": depth}))
        }
        AgentEvent::SubAgentCompleted { name, depth } => {
            ("subagent_completed", json!({"name": name, "depth": depth}))
        }
        AgentEvent::SubAgentFailed { name, depth, .. } => {
            ("subagent_failed", json!({"name": name, "depth": depth}))
        }
        AgentEvent::RetryScheduled { call_id, attempt } => (
            "model_retry_scheduled",
            json!({"callId": call_id.as_str(), "attempt": attempt, "retryable": true}),
        ),
        AgentEvent::RateLimitWaited { waited_ms } => (
            "rate_limit_waited",
            json!({"durationMs": waited_ms, "retryable": true}),
        ),
        AgentEvent::FallbackSelected { .. } => {
            ("model_fallback_selected", json!({"retryable": true}))
        }
        AgentEvent::UnknownToolCall { call_id, .. } => (
            "tool_failed",
            json!({"callId": call_id.as_str(), "tool": "unknown", "recoverable": true}),
        ),
        AgentEvent::InvalidToolArgs {
            call_id, tool_name, ..
        } => (
            "tool_failed",
            json!({"callId": call_id.as_str(), "tool": tool_name, "recoverable": true}),
        ),
        AgentEvent::LimitReached { kind } => (
            "run_limit_reached",
            json!({"limit": kind.as_str(), "retryable": false}),
        ),
        _ => return Ok(()),
    };
    service
        .store()
        .append_event(root_run_id, kind, &payload)
        .await?;
    service.wake_handle().notify_waiters();
    Ok(())
}
