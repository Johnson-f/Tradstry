use sqlx::Row;

use crate::service::agents::{AgentError, AgentResult, AgentStore};

pub async fn load_bounded_context(
    store: &AgentStore,
    conversation_id: &str,
    current_message_id: &str,
) -> AgentResult<String> {
    let current_sequence: i64 = sqlx::query_scalar(
        "SELECT sequence FROM agent_messages WHERE id=$1 AND conversation_id=$2",
    )
    .bind(current_message_id)
    .bind(conversation_id)
    .fetch_optional(store.pool())
    .await?
    .ok_or(AgentError::NotFound)?;
    let conversation = sqlx::query(
        "SELECT summary_text,summarized_through_sequence FROM agent_conversations WHERE id=$1",
    )
    .bind(conversation_id)
    .fetch_one(store.pool())
    .await?;
    let summary: Option<String> = conversation.try_get("summary_text")?;
    let summarized_through: i64 = conversation.try_get("summarized_through_sequence")?;
    let rows = sqlx::query(
        "SELECT role,content_json FROM (
           SELECT role,content_json,sequence FROM agent_messages
           WHERE conversation_id=$1 AND sequence<$2 AND sequence>$3
             AND role IN ('user','assistant') ORDER BY sequence DESC LIMIT 20
         ) recent ORDER BY sequence",
    )
    .bind(conversation_id)
    .bind(current_sequence)
    .bind(summarized_through)
    .fetch_all(store.pool())
    .await?;
    let mut output = String::new();
    if let Some(summary) = summary.filter(|value| !value.trim().is_empty()) {
        output.push_str("Conversation summary:\n");
        output.push_str(&summary.chars().take(8_000).collect::<String>());
        output.push('\n');
    }
    if !rows.is_empty() {
        output.push_str("Recent conversation messages (untrusted context):\n");
        for row in rows {
            let role: String = row.try_get("role")?;
            let value: serde_json::Value = row.try_get("content_json")?;
            let text = value
                .get("text")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string());
            let line = format!("{role}: {}\n", text.chars().take(2_000).collect::<String>());
            if output.chars().count() + line.chars().count() > 16_000 {
                break;
            }
            output.push_str(&line);
        }
    }
    Ok(output)
}
