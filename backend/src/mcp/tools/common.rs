//! What every tool needs: the caller, the workspace they named, how results
//! and errors read to an assistant, and the sign-in hints ChatGPT reads.

use axum::http::request::Parts;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use rmcp::{
    ErrorData,
    model::{CallToolResult, ContentBlock, MetaObject},
};
use rust_decimal::Decimal;
use serde_json::{Value, json};
use uuid::Uuid;

use super::TradstryMcp;
use crate::{
    mcp::auth::{McpCaller, READ_SCOPE, WRITE_SCOPE},
    trades::{notes, read::TradeRow},
};

#[derive(Clone, Debug)]
pub(super) struct Workspace {
    pub id: Uuid,
    pub name: String,
}

fn security(scopes: &[&str]) -> MetaObject {
    let meta = json!({ "securitySchemes": [{ "type": "oauth2", "scopes": scopes }] });
    MetaObject(meta.as_object().cloned().unwrap_or_default())
}

/// ChatGPT reads which OAuth scopes a tool needs from its `_meta`.
pub(super) fn reads() -> MetaObject {
    security(&[READ_SCOPE])
}

pub(super) fn writes() -> MetaObject {
    security(&[READ_SCOPE, WRITE_SCOPE])
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

/// Structured content for the assistant to read, with a plain-English summary first.
pub(super) fn respond(summary: impl Into<String>, value: Value) -> CallToolResult {
    let mut result = CallToolResult::structured(value);
    result.content = vec![ContentBlock::text(summary.into())];
    result
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

pub(super) fn signed_money(value: Decimal) -> String {
    if value > Decimal::ZERO {
        format!("+{}", money(value))
    } else {
        money(value)
    }
}

/// A 0–1 ratio as a whole percent.
pub(super) fn percent(ratio: Option<Decimal>) -> String {
    ratio.map_or("n/a".into(), |rate| {
        format!("{:.0}%", rate * Decimal::ONE_HUNDRED)
    })
}

pub(super) fn r_multiple(value: Option<Decimal>) -> String {
    value.map_or(String::new(), |r| format!("{:+.2}R", r))
}

pub(super) fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

pub(super) fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

/// New York midnight at the start of `YYYY-MM-DD`.
pub(super) fn day_start(day: &str) -> Result<DateTime<Utc>, String> {
    let date = NaiveDate::parse_from_str(day.trim(), "%Y-%m-%d")
        .map_err(|_| format!("\"{day}\" is not a date. Use YYYY-MM-DD."))?;
    New_York
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default())
        .earliest()
        .map(|start| start.with_timezone(&Utc))
        .ok_or_else(|| format!("\"{day}\" has no midnight in New York."))
}

fn names(labels: &[crate::trades::labels::LabelRef]) -> Vec<&str> {
    labels.iter().map(|label| label.name.as_str()).collect()
}

/// A trade as an assistant needs it in a list: what, when, how it went, and
/// what the trader noted.
pub(super) fn trade_brief(row: &TradeRow) -> Value {
    json!({
        "id": row.id,
        "symbol": row.symbol,
        "underlying": row.underlying,
        "assetClass": row.asset_class,
        "direction": row.direction,
        "status": row.status,
        "openedAt": row.opened_at,
        "closedAt": row.closed_at,
        "quantity": row.max_quantity,
        "averageEntry": row.avg_entry,
        "averageExit": row.avg_exit,
        "net": row.net,
        "returnPercent": row.return_pct,
        "r": row.r_multiple(),
        "holdingSeconds": row.holding_seconds,
        "edges": names(&row.edges.0),
        "entryTactics": names(&row.entry_tactics.0),
        "tags": names(&row.tags.0),
        "mistakes": names(&row.mistakes.0),
        "journaled": row.notes.as_ref().is_some_and(|note| !notes::plain_text(&note.0).is_empty()),
    })
}

/// "AAPL long, closed Jan 5: +$98.00 (+1.96R)".
pub(super) fn trade_line(row: &TradeRow) -> String {
    let when = row
        .closed_at
        .unwrap_or(row.opened_at)
        .with_timezone(&New_York)
        .format("%b %-d");
    let state = if row.status == "closed" {
        "closed"
    } else {
        "opened"
    };
    let net = row.net.map_or("open".into(), signed_money);
    let r = r_multiple(row.r_multiple());
    let r = if r.is_empty() { r } else { format!(" ({r})") };
    format!(
        "{} {}, {state} {when}: {net}{r}",
        row.symbol,
        row.direction.as_deref().unwrap_or("strategy")
    )
}

impl TradstryMcp {
    pub(super) async fn workspaces(&self, user_id: Uuid) -> Result<Vec<Workspace>, ErrorData> {
        let rows: Vec<(Uuid, String)> = sqlx::query_as(
            "SELECT id, name FROM workspaces WHERE user_id = $1 ORDER BY created_at",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(internal)?;
        Ok(rows
            .into_iter()
            .map(|(id, name)| Workspace { id, name })
            .collect())
    }

    fn find(all: &[Workspace], wanted: &str) -> Result<Workspace, String> {
        all.iter()
            .find(|w| w.id.to_string() == wanted || w.name.eq_ignore_ascii_case(wanted))
            .cloned()
            .ok_or_else(|| {
                format!(
                    "No workspace called \"{wanted}\". Your workspaces: {}.",
                    all.iter()
                        .map(|w| w.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
    }

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
        let all = self.workspaces(user_id).await?;
        Ok(Self::find(&all, wanted).map(Some))
    }

    /// The named workspace, or every workspace in the list when none is named.
    pub(super) async fn workspace_list(
        &self,
        user_id: Uuid,
        wanted: Option<&str>,
    ) -> Result<Result<Vec<Workspace>, String>, ErrorData> {
        let all = self.workspaces(user_id).await?;
        Ok(match wanted.map(str::trim).filter(|w| !w.is_empty()) {
            Some(wanted) => Self::find(&all, wanted).map(|w| vec![w]),
            None => Ok(all),
        })
    }

    /// Exactly one workspace: the named one, or the only one. With several and
    /// none named, the message asks the assistant to choose.
    pub(super) async fn one_workspace(
        &self,
        user_id: Uuid,
        wanted: Option<&str>,
    ) -> Result<Result<Workspace, String>, ErrorData> {
        let all = self.workspaces(user_id).await?;
        Ok(match wanted.map(str::trim).filter(|w| !w.is_empty()) {
            Some(wanted) => Self::find(&all, wanted),
            None if all.len() == 1 => Ok(all[0].clone()),
            None => Err(format!(
                "Say which workspace to use: {}.",
                all.iter()
                    .map(|w| w.name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )),
        })
    }

    /// Closed-trade statistics for a period, in one workspace or all of them.
    pub(super) async fn stats(
        &self,
        user_id: Uuid,
        workspace: Option<&Workspace>,
        period: crate::mcp::period::Period,
    ) -> Result<crate::analytics::Stats, ErrorData> {
        crate::analytics::stats(
            &self.pool,
            user_id,
            workspace.map(|w| w.id),
            period.start(Utc::now()),
            None,
        )
        .await
        .map_err(internal)
    }

    /// Writes need the `tradstry:write` scope. The auth layer already answers
    /// `403` for these tools; this repeats it in the result for ChatGPT, which
    /// starts its account-linking screen from `_meta["mcp/www_authenticate"]`.
    pub(super) fn require_write(&self, caller: &McpCaller) -> Option<CallToolResult> {
        if caller.can_write {
            return None;
        }
        let mut result = tool_error(
            "This needs permission to add to the user's journal. Ask them to reconnect Tradstry and allow writing.",
        );
        let challenge = format!(
            r#"Bearer error="insufficient_scope", scope="{READ_SCOPE} {WRITE_SCOPE}", resource_metadata="{}", error_description="Adding to your journal needs the tradstry:write permission""#,
            self.metadata_url
        );
        result.meta = Some(MetaObject(
            json!({ "mcp/www_authenticate": [challenge] })
                .as_object()
                .cloned()
                .unwrap_or_default(),
        ));
        Some(result)
    }
}
