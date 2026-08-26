use anyhow::Result;
use serde_json::{Map, Value};
use sqlx::PgPool;

/// `(key, sql)` pairs rather than interpolated table names: sqlx 0.9 only accepts
/// `&'static str` queries, which also makes the table list injection-proof by construction.
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
        "notebook_images",
        "SELECT to_jsonb(t) FROM notebook_images t WHERE t.user_id = $1",
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
        "agent_checkpoints",
        "SELECT to_jsonb(t) FROM agent_checkpoints t WHERE t.user_id = $1",
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
    let rows = sqlx::query_scalar::<_, Value>(sql)
        .bind(user_id)
        .fetch_all(pool)
        .await?;
    Ok(Value::Array(rows))
}

pub async fn build_export(pool: &PgPool, user_id: &str) -> Result<Value> {
    let mut out = Map::new();

    let user = sqlx::query_scalar::<_, Value>("SELECT to_jsonb(u) FROM users u WHERE u.id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    out.insert("user".into(), user.unwrap_or(Value::Null));

    for (key, sql) in USER_SCOPED.iter().chain(JOINED) {
        out.insert((*key).into(), fetch(pool, sql, user_id).await?);
    }

    if let Some(checkpoints) = out
        .get_mut("agent_checkpoints")
        .and_then(Value::as_array_mut)
    {
        for checkpoint in checkpoints {
            if let Some(state) = checkpoint.get_mut("state_json") {
                sanitize_agent_checkpoint_for_export(state);
            }
        }
    }

    Ok(Value::Object(out))
}

fn sanitize_agent_checkpoint_for_export(value: &mut Value) {
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
            ] {
                object.remove(key);
            }
            for child in object.values_mut() {
                sanitize_agent_checkpoint_for_export(child);
            }
        }
        Value::Array(array) => {
            for child in array {
                sanitize_agent_checkpoint_for_export(child);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::sanitize_agent_checkpoint_for_export;

    #[test]
    fn checkpoint_export_removes_provider_opaque_fields_recursively() {
        let mut value = json!({
            "messages": [{
                "text": "visible",
                "thoughtSignature": "secret-signature",
                "nested": {"provider_extension": {"opaque": true}}
            }]
        });
        sanitize_agent_checkpoint_for_export(&mut value);
        assert_eq!(value["messages"][0]["text"], "visible");
        assert!(value["messages"][0].get("thoughtSignature").is_none());
        assert!(
            value["messages"][0]["nested"]
                .get("provider_extension")
                .is_none()
        );
    }
}
