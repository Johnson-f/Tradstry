use crate::service::db::raw::{PgPool, query_scalar};
use anyhow::Result;
use serde_json::{Map, Value};

/// Static `(key, sql)` pairs keep the table list injection-proof.
const USER_SCOPED: &[(&str, &str)] = &[
    (
        "workspaces",
        "SELECT to_jsonb(t) FROM workspaces t WHERE t.user_id = $1",
    ),
    (
        "brokerage_connections",
        "SELECT to_jsonb(t) - 'snaptrade_user_secret_encrypted' FROM brokerage_connections t WHERE t.user_id = $1",
    ),
    (
        "snaptrade_oauth_grants",
        "SELECT to_jsonb(t) - 'access_token_encrypted' - 'refresh_token_encrypted' FROM snaptrade_oauth_grants t WHERE t.user_id = $1",
    ),
    (
        "journal_entries",
        "SELECT to_jsonb(t) FROM journal_entries t WHERE t.user_id = $1",
    ),
    (
        "playbooks",
        "SELECT to_jsonb(t) FROM playbooks t WHERE t.user_id = $1",
    ),
    (
        "trading_principles",
        "SELECT to_jsonb(t) FROM trading_principles t WHERE t.user_id = $1",
    ),
    (
        "tags",
        "SELECT to_jsonb(t) FROM tags t WHERE t.user_id = $1",
    ),
    (
        "tag_categories",
        "SELECT to_jsonb(t) FROM tag_categories t WHERE t.user_id = $1",
    ),
    (
        "notebook_folders",
        "SELECT to_jsonb(t) FROM notebook_folders t WHERE t.user_id = $1",
    ),
    (
        "notebook_notes",
        "SELECT to_jsonb(t) FROM notebook_notes t WHERE t.user_id = $1",
    ),
    (
        "notebook_media",
        "SELECT to_jsonb(media) FROM (
             SELECT reference.id,reference.note_id,reference.workspace_id,
                    reference.original_filename,reference.created_at,
                    blob.content_hash,blob.object_key,blob.content_type,blob.media_type,
                    blob.format,blob.bytes,blob.width,blob.height,blob.duration_seconds
             FROM notebook_media_references reference
             JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
             WHERE reference.user_id=$1
         ) media",
    ),
    (
        "brokerage_transactions",
        "SELECT to_jsonb(t) FROM brokerage_transactions t WHERE t.user_id = $1",
    ),
    (
        "brokerage_holdings",
        "SELECT to_jsonb(t) FROM brokerage_holdings t WHERE t.user_id = $1",
    ),
    (
        "brokerage_balances",
        "SELECT to_jsonb(t) FROM brokerage_balances t WHERE t.user_id = $1",
    ),
    (
        "journal_brokerage_links",
        "SELECT to_jsonb(t) FROM journal_brokerage_links t WHERE t.user_id = $1",
    ),
    (
        "account_equity_history",
        "SELECT to_jsonb(t) FROM account_equity_history t WHERE t.user_id = $1",
    ),
    (
        "position_calculator_rules",
        "SELECT to_jsonb(t) FROM position_calculator_rules t WHERE t.user_id = $1",
    ),
    (
        "position_calculator_history",
        "SELECT to_jsonb(t) FROM position_calculator_history t WHERE t.user_id = $1",
    ),
    (
        "position_calculator_plans",
        "SELECT to_jsonb(t) FROM position_calculator_plans t WHERE t.user_id = $1",
    ),
    (
        "user_prompts",
        "SELECT to_jsonb(t) FROM user_prompts t WHERE t.user_id = $1",
    ),
    (
        "agent_conversations",
        "SELECT to_jsonb(t) FROM agent_conversations t WHERE t.user_id = $1",
    ),
    (
        "agent_messages",
        "SELECT to_jsonb(t) FROM agent_messages t WHERE t.user_id = $1",
    ),
    (
        "agent_runs",
        "SELECT to_jsonb(t) FROM agent_runs t WHERE t.user_id = $1",
    ),
    (
        "agent_run_events",
        "SELECT to_jsonb(t) FROM agent_run_events t WHERE t.user_id = $1",
    ),
    (
        "agent_run_items",
        "SELECT to_jsonb(t) FROM agent_run_items t WHERE t.user_id = $1",
    ),
    (
        "agent_tool_calls",
        "SELECT to_jsonb(t) FROM agent_tool_calls t WHERE t.user_id = $1",
    ),
    (
        "agent_evidence",
        "SELECT to_jsonb(t) - 'payload_json' FROM agent_evidence t WHERE t.user_id = $1",
    ),
    (
        "agent_claims",
        "SELECT to_jsonb(t) FROM agent_claims t WHERE t.user_id = $1",
    ),
    (
        "agent_conversation_summary_jobs",
        "SELECT to_jsonb(t) FROM agent_conversation_summary_jobs t WHERE t.user_id = $1",
    ),
    (
        "agent_memories",
        "SELECT to_jsonb(t) - 'embedding' - 'search_vector' FROM agent_memories t WHERE t.user_id = $1",
    ),
    (
        "agent_memory_jobs",
        "SELECT to_jsonb(t) FROM agent_memory_jobs t WHERE t.user_id = $1",
    ),
    (
        "agent_knowledge_passages",
        "SELECT to_jsonb(t) - 'embedding' - 'search_vector' FROM agent_knowledge_passages t WHERE t.user_id = $1",
    ),
    (
        "agent_index_outbox",
        "SELECT to_jsonb(t) FROM agent_index_outbox t WHERE t.user_id = $1",
    ),
    (
        "agent_action_proposals",
        "SELECT to_jsonb(t) FROM agent_action_proposals t WHERE t.user_id = $1",
    ),
    (
        "agent_action_executions",
        "SELECT to_jsonb(t) FROM agent_action_executions t WHERE t.user_id = $1",
    ),
    (
        "agent_assistance_requests",
        "SELECT to_jsonb(t) FROM agent_assistance_requests t WHERE t.user_id = $1",
    ),
];

/// Junction tables carry no user_id, so each needs the join that reaches one. Without
/// these the export silently omits which tags and principles every trade was marked with.
const JOINED: &[(&str, &str)] = &[
    (
        "playbook_workspace_applicability",
        "SELECT to_jsonb(a) FROM playbook_workspace_applicability a
         JOIN playbooks p ON p.id = a.playbook_id WHERE p.user_id = $1",
    ),
    (
        "tag_category_workspace_applicability",
        "SELECT to_jsonb(a) FROM tag_category_workspace_applicability a
         JOIN tag_categories c ON c.id = a.category_id WHERE c.user_id = $1",
    ),
    (
        "trade_tags",
        "SELECT to_jsonb(t) FROM trade_tags t
         JOIN journal_entries j ON j.id = t.journal_entry_id
         WHERE j.user_id = $1",
    ),
    (
        "trade_principle_violations",
        "SELECT to_jsonb(v) FROM trade_principle_violations v
         JOIN journal_entries j ON j.id = v.journal_entry_id
         WHERE j.user_id = $1",
    ),
    (
        "notebook_note_trades",
        "SELECT to_jsonb(nt) FROM notebook_note_trades nt
         JOIN notebook_notes n ON n.id = nt.note_id
         WHERE n.user_id = $1",
    ),
    (
        "agent_claim_evidence",
        "SELECT to_jsonb(ce) FROM agent_claim_evidence ce
         JOIN agent_claims c ON c.id = ce.claim_id
         WHERE c.user_id = $1",
    ),
];

async fn fetch(pool: &PgPool, sql: &'static str, user_id: &str) -> Result<Value> {
    let rows = query_scalar::<Value>(sql)
        .bind(user_id)
        .fetch_all(pool)
        .await?;
    Ok(Value::Array(rows))
}

pub async fn build_export(pool: &PgPool, user_id: &str) -> Result<Value> {
    let mut out = Map::new();

    let user = query_scalar::<Value>("SELECT to_jsonb(u) FROM users u WHERE u.id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    out.insert("user".into(), user.unwrap_or(Value::Null));

    for (key, sql) in USER_SCOPED.iter().chain(JOINED) {
        out.insert((*key).into(), fetch(pool, sql, user_id).await?);
    }

    if let Some(run_items) = out.get_mut("agent_run_items").and_then(Value::as_array_mut) {
        for run_item in run_items {
            if let Some(message) = run_item.get_mut("message_json") {
                sanitize_agent_runtime_value(message);
            }
        }
    }
    if let Some(run_events) = out
        .get_mut("agent_run_events")
        .and_then(Value::as_array_mut)
    {
        for run_event in run_events {
            if let Some(payload) = run_event.get_mut("payload_json") {
                sanitize_agent_runtime_value(payload);
            }
        }
    }

    Ok(Value::Object(out))
}

fn sanitize_agent_runtime_value(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for key in [
                "thoughtSignature",
                "thought_signature",
                "signature",
                "providerExtension",
                "provider_extension",
                "rawProviderPayload",
                "raw_provider_payload",
                "prompt",
                "input",
                "output",
                "arguments",
                "headers",
                "authorization",
                "apiKey",
                "api_key",
                "token",
                "reasoning",
                "thought",
            ] {
                object.remove(key);
            }
            for child in object.values_mut() {
                sanitize_agent_runtime_value(child);
            }
        }
        Value::Array(array) => {
            for child in array {
                sanitize_agent_runtime_value(child);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::sanitize_agent_runtime_value;

    #[test]
    fn run_item_export_removes_provider_opaque_fields_recursively() {
        let mut value = json!({
            "messages": [{
                "text": "visible",
                "thoughtSignature": "secret-signature",
                "nested": {"provider_extension": {"opaque": true}}
            }]
        });
        sanitize_agent_runtime_value(&mut value);
        assert_eq!(value["messages"][0]["text"], "visible");
        assert!(value["messages"][0].get("thoughtSignature").is_none());
        assert!(
            value["messages"][0]["nested"]
                .get("provider_extension")
                .is_none()
        );
    }

    #[test]
    fn activity_export_removes_model_and_tool_payloads() {
        let mut value = json!({
            "kind":"tool_completed",
            "label":"Checked market context",
            "symbol":"CBRS",
            "input":{"apiKey":"secret"},
            "output":{"raw":"secret"},
            "reasoning":"private"
        });
        sanitize_agent_runtime_value(&mut value);
        assert_eq!(value["label"], "Checked market context");
        assert_eq!(value["symbol"], "CBRS");
        assert!(value.get("input").is_none());
        assert!(value.get("output").is_none());
        assert!(value.get("reasoning").is_none());
    }
}
