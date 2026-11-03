//! What every tool needs: the caller, the workspace they named, and how
//! errors and money read to an assistant.

use axum::http::request::Parts;
use rmcp::{
    ErrorData,
    model::{CallToolResult, ContentBlock},
};
use rust_decimal::Decimal;
use uuid::Uuid;

use super::TradstryMcp;
use crate::mcp::auth::McpCaller;

pub(super) struct Workspace {
    pub id: Uuid,
    pub name: String,
}

pub(super) fn caller(parts: &Parts) -> Result<&McpCaller, ErrorData> {
    parts
        .extensions
        .get::<McpCaller>()
        .ok_or_else(|| ErrorData::internal_error("the request was not authenticated", None))
}

pub(super) fn internal(error: impl std::fmt::Display) -> ErrorData {
    tracing::error!(%error, "an MCP tool failed");
    ErrorData::internal_error("Tradstry could not answer that just now. Try again.", None)
}

/// A tool error the assistant can act on, such as an unknown workspace.
pub(super) fn tool_error(message: impl Into<String>) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message.into())])
}

pub(super) fn money(value: Decimal) -> String {
    let rounded = value.round_dp(2);
    let sign = if rounded.is_sign_negative() && !rounded.is_zero() {
        "−"
    } else {
        ""
    };
    format!("{sign}${:.2}", rounded.abs())
}

pub(super) fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

impl TradstryMcp {
    /// The named workspace, or every workspace when none is named. An unknown
    /// name comes back as a message listing the user's workspaces.
    pub(super) async fn workspace(
        &self,
        user_id: Uuid,
        wanted: Option<&str>,
    ) -> Result<Result<Option<Workspace>, String>, ErrorData> {
        let Some(wanted) = wanted.map(str::trim).filter(|w| !w.is_empty()) else {
            return Ok(Ok(None));
        };
        let all: Vec<(Uuid, String)> = sqlx::query_as(
            "SELECT id, name FROM workspaces WHERE user_id = $1 ORDER BY created_at",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(internal)?;
        let found = all
            .iter()
            .find(|(id, name)| id.to_string() == wanted || name.eq_ignore_ascii_case(wanted));
        Ok(match found {
            Some((id, name)) => Ok(Some(Workspace {
                id: *id,
                name: name.clone(),
            })),
            None => Err(format!(
                "No workspace called \"{wanted}\". Your workspaces: {}.",
                all.iter()
                    .map(|(_, name)| name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
        })
    }
}
