use anyhow::Result;
use async_graphql::SimpleObject;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};
use std::str::FromStr;

use super::action_notes::{self, role_name};
use crate::service::trade_review::outcome::{
    ActionPlan, OutcomeInput, ReviewOutcome, review_outcome,
};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalActionOutcomeV2", rename_fields = "camelCase")]
pub struct ActionOutcomeView {
    pub anchor_execution_id: String,
    pub kind: String,
    pub quantity: String,
    pub price: String,
    pub planned_stop: Option<String>,
    pub planned_target: Option<String>,
    pub distance_from_stop_r: Option<String>,
    pub boundary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalReviewOutcomeV2", rename_fields = "camelCase")]
pub struct OutcomeView {
    pub planned_stop: Option<String>,
    pub stop_source: String,
    pub entered_quantity: String,
    pub entry_price: String,
    pub exit_price: Option<String>,
    pub fees: String,
    pub realized_net: Option<String>,
    pub initial_risk: Option<String>,
    pub realized_r: Option<String>,
    pub realized_r_unavailable: Option<String>,
    pub actions: Vec<ActionOutcomeView>,
    pub flags: Vec<String>,
}

fn text(value: Decimal) -> String {
    value.round_dp(8).normalize().to_string()
}

fn name<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default()
}

impl From<ReviewOutcome> for OutcomeView {
    fn from(outcome: ReviewOutcome) -> Self {
        Self {
            planned_stop: outcome.planned_stop.map(text),
            stop_source: name(&outcome.stop_source),
            entered_quantity: text(outcome.entered_quantity),
            entry_price: text(outcome.entry_price),
            exit_price: outcome.exit_price.map(text),
            fees: text(outcome.fees),
            realized_net: outcome.realized_net.map(text),
            initial_risk: outcome.initial_risk.map(text),
            realized_r: outcome.realized_r.map(|r| text(r.round_dp(2))),
            realized_r_unavailable: outcome.realized_r_unavailable.as_ref().map(name),
            actions: outcome
                .actions
                .into_iter()
                .map(|action| ActionOutcomeView {
                    anchor_execution_id: action.anchor_execution_id,
                    kind: action.kind.name().into(),
                    quantity: text(action.quantity),
                    price: text(action.price),
                    planned_stop: action.planned_stop.map(text),
                    planned_target: action.planned_target.map(text),
                    distance_from_stop_r: action.distance_from_stop_r.map(|r| text(r.round_dp(2))),
                    boundary: action.boundary.as_ref().map(name),
                })
                .collect(),
            flags: outcome.flags.iter().map(name).collect(),
        }
    }
}

pub(super) async fn outcome_connection(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<Option<OutcomeView>> {
    let Some(draft) = action_notes::entry_draft(connection, user, workspace, entry).await? else {
        return Ok(None);
    };
    let timeline = action_notes::timeline(connection, user, workspace, &draft).await?;
    let notes = action_notes::notes_for(connection, user, workspace, &draft).await?;
    let plans = timeline
        .actions
        .iter()
        .map(|action| {
            notes
                .iter()
                .find(|(anchor, role, note)| {
                    note.kind == "plan"
                        && role == role_name(action.role)
                        && action.execution_ids.contains(anchor)
                })
                .map(|(_, _, note)| ActionPlan {
                    stop: note
                        .stop_price
                        .as_deref()
                        .and_then(|p| Decimal::from_str(p).ok()),
                    target: note
                        .target_price
                        .as_deref()
                        .and_then(|p| Decimal::from_str(p).ok()),
                })
        })
        .collect::<Vec<_>>();
    let row = sqlx::query("SELECT j.realized_net,CASE WHEN c.stop_state='price' THEN c.stop_price END AS context_stop FROM journal_entries j LEFT JOIN journal_trade_context c ON c.entry_id=j.id WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3")
        .bind(entry).bind(user).bind(workspace).fetch_one(&mut *connection).await?;
    Ok(Some(
        review_outcome(OutcomeInput {
            draft: &draft,
            actions: &timeline.actions,
            plans: &plans,
            context_stop: row.try_get("context_stop")?,
            realized_net: row.try_get("realized_net")?,
        })
        .into(),
    ))
}

pub async fn outcome(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<Option<OutcomeView>> {
    let mut connection = pool.acquire().await?;
    outcome_connection(&mut connection, user, workspace, entry).await
}
