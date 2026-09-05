use std::collections::HashMap;

use sha2::{Digest, Sha256};
use sqlx::Row;
use tinyagents::harness::message::{ContentBlock, Message};

use super::AgentStore;
use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone, Debug, PartialEq)]
pub struct AgentRunItem {
    pub id: String,
    pub run_id: String,
    pub sequence: i64,
    pub item_key: String,
    pub kind: String,
    pub message: Message,
}

impl AgentStore {
    pub async fn append_run_item(
        &self,
        run_id: &str,
        message: &Message,
    ) -> AgentResult<AgentRunItem> {
        let (kind, message) = persisted_projection(message)?;
        let item_key = item_key(&message)?;
        let message_json = serde_json::to_value(&message).map_err(|_| AgentError::Internal)?;
        let mut tx = self.pool().begin().await?;
        let run =
            sqlx::query("SELECT user_id, workspace_id FROM agent_runs WHERE id = $1 FOR UPDATE")
                .bind(run_id)
                .fetch_optional(&mut *tx)
                .await?;
        let Some(run) = run else {
            return Err(AgentError::NotFound);
        };
        let sequence: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_run_items WHERE run_id = $1",
        )
        .bind(run_id)
        .fetch_one(&mut *tx)
        .await?;
        let row = sqlx::query(
            "INSERT INTO agent_run_items
             (id, run_id, user_id, workspace_id, sequence, item_key, kind, message_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (run_id, item_key) DO UPDATE SET item_key = EXCLUDED.item_key
             RETURNING id, run_id, sequence, item_key, kind, message_json",
        )
        .bind(crate::ids::new_uuid_v7().to_string())
        .bind(run_id)
        .bind(run.try_get::<String, _>("user_id")?)
        .bind(run.try_get::<String, _>("workspace_id")?)
        .bind(sequence)
        .bind(&item_key)
        .bind(kind)
        .bind(message_json)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        run_item_from_row(&row)
    }

    pub async fn resumable_run_messages(&self, run_id: &str) -> AgentResult<Vec<Message>> {
        let rows = sqlx::query(
            "SELECT id, run_id, sequence, item_key, kind, message_json
             FROM agent_run_items WHERE run_id = $1 ORDER BY sequence",
        )
        .bind(run_id)
        .fetch_all(self.pool())
        .await?;
        let items = rows
            .iter()
            .map(run_item_from_row)
            .collect::<AgentResult<Vec<_>>>()?;
        Ok(stable_prefix(items))
    }
}

fn run_item_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentRunItem> {
    Ok(AgentRunItem {
        id: row.try_get("id")?,
        run_id: row.try_get("run_id")?,
        sequence: row.try_get("sequence")?,
        item_key: row.try_get("item_key")?,
        kind: row.try_get("kind")?,
        message: serde_json::from_value(row.try_get("message_json")?)
            .map_err(|_| AgentError::Internal)?,
    })
}

fn persisted_projection(message: &Message) -> AgentResult<(&'static str, Message)> {
    match message {
        Message::Assistant(assistant) => {
            let mut assistant = assistant.clone();
            assistant.content = assistant
                .content
                .into_iter()
                .filter_map(|block| match block {
                    ContentBlock::Thinking { signature, .. } if signature.is_some() => {
                        Some(ContentBlock::Thinking {
                            text: String::new(),
                            signature,
                        })
                    }
                    ContentBlock::Thinking { .. } | ContentBlock::RedactedThinking { .. } => None,
                    block => Some(block),
                })
                .collect();
            Ok(("assistant", Message::Assistant(assistant)))
        }
        Message::Tool(tool) => {
            let mut tool = tool.clone();
            tool.artifact = None;
            Ok(("tool", Message::Tool(tool)))
        }
        Message::System(_) | Message::User(_) => Err(AgentError::Validation(
            "run items accept only assistant and tool messages".into(),
        )),
    }
}

fn item_key(message: &Message) -> AgentResult<String> {
    match message {
        Message::Assistant(assistant) => {
            if let Some(id) = assistant.id.as_deref().filter(|id| !id.trim().is_empty()) {
                return Ok(format!("assistant:{id}"));
            }
            if let Some(call) = assistant.tool_calls.first() {
                return Ok(format!("assistant-tool:{}", call.id));
            }
            let bytes = serde_json::to_vec(message).map_err(|_| AgentError::Internal)?;
            Ok(format!("assistant:{:x}", Sha256::digest(bytes)))
        }
        Message::Tool(tool) => Ok(format!("tool:{}", tool.tool_call_id)),
        Message::System(_) | Message::User(_) => Err(AgentError::Validation(
            "run item key requires assistant or tool message".into(),
        )),
    }
}

fn stable_prefix(items: Vec<AgentRunItem>) -> Vec<Message> {
    let mut output = Vec::new();
    let mut index = 0;
    while index < items.len() {
        let Message::Assistant(assistant) = &items[index].message else {
            break;
        };
        if assistant.tool_calls.is_empty() {
            output.push(items[index].message.clone());
            index += 1;
            continue;
        }
        let mut results = HashMap::new();
        let mut cursor = index + 1;
        while cursor < items.len() {
            match &items[cursor].message {
                Message::Tool(tool) => {
                    results.insert(tool.tool_call_id.clone(), items[cursor].message.clone());
                    cursor += 1;
                }
                Message::Assistant(_) | Message::System(_) | Message::User(_) => break,
            }
        }
        if assistant
            .tool_calls
            .iter()
            .any(|call| !results.contains_key(&call.id))
        {
            break;
        }
        output.push(items[index].message.clone());
        for call in &assistant.tool_calls {
            output.push(results.remove(&call.id).expect("tool result checked above"));
        }
        index = cursor;
    }
    output
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tinyagents::harness::message::{AssistantMessage, ToolMessage};
    use tinyagents::harness::tool::ToolCall;

    use super::*;

    fn item(sequence: i64, message: Message) -> AgentRunItem {
        AgentRunItem {
            id: sequence.to_string(),
            run_id: "run".into(),
            sequence,
            item_key: sequence.to_string(),
            kind: match message {
                Message::Tool(_) => "tool",
                _ => "assistant",
            }
            .into(),
            message,
        }
    }

    #[test]
    fn resume_keeps_only_complete_tool_cycles_in_call_order() {
        let assistant = Message::Assistant(AssistantMessage {
            id: None,
            content: Vec::new(),
            tool_calls: vec![
                ToolCall::new("a", "first", json!({})),
                ToolCall::new("b", "second", json!({})),
            ],
            usage: None,
        });
        let tool = |id: &str| {
            Message::Tool(ToolMessage {
                tool_call_id: id.into(),
                content: vec![ContentBlock::Text(id.into())],
                trusted_verbatim: false,
                artifact: None,
            })
        };
        let complete = stable_prefix(vec![
            item(1, assistant.clone()),
            item(2, tool("b")),
            item(3, tool("a")),
        ]);
        assert_eq!(complete, vec![assistant.clone(), tool("a"), tool("b")]);
        assert!(stable_prefix(vec![item(1, assistant), item(2, tool("a"))]).is_empty());
    }
}
