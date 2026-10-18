use anyhow::{Result, anyhow, ensure};
use async_graphql::SimpleObject;
use chrono::{Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool};

use super::{
    action_notes, commands, opening,
    source::{self, SourceGroup},
};
use crate::service::trade_review::types::{ExecutionFill, ExecutionInstrument, ExecutionSide};

const CONTINUATION_WINDOW_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalHoldingsMismatchV2", rename_fields = "camelCase")]
pub struct HoldingsMismatch {
    pub instrument_key: String,
    pub symbol: String,
    pub held: String,
    pub imported: String,
    pub message: String,
    pub entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalBrokenJoinV2", rename_fields = "camelCase")]
pub struct BrokenJoin {
    pub join_id: String,
    pub entry_id: String,
    pub symbol: String,
    pub execution_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalContinuationSuggestionV2", rename_fields = "camelCase")]
pub struct ContinuationSuggestion {
    pub from_symbol: String,
    pub to_symbol: String,
    pub quantity: String,
    pub execution_id: String,
    pub opening_execution_id: String,
    pub executed_at: String,
    pub explanation: String,
}

/// Instruments whose imported history doesn't add up to what the broker holds.
pub async fn holdings_mismatches(
    pool: &PgPool,
    user: &str,
    workspace: &str,
) -> Result<Vec<HoldingsMismatch>> {
    let mut connection = pool.acquire().await?;
    let groups = source::load(&mut connection, user, workspace).await?;
    let mut mismatches = vec![];
    for group in groups {
        let (Some(message), source::Holdings::Held(held)) =
            (group.holdings_mismatch(), group.holdings)
        else {
            continue;
        };
        mismatches.push(HoldingsMismatch {
            entry_id: latest_entry(&mut connection, user, workspace, &group.key).await?,
            instrument_key: group.key.clone(),
            symbol: group.symbol.clone(),
            held: held.normalize().to_string(),
            imported: group.net_imported().normalize().to_string(),
            message,
        });
    }
    Ok(mismatches)
}

async fn latest_entry(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    key: &str,
) -> Result<Option<String>> {
    Ok(sqlx::query_scalar("SELECT j.id FROM journal_entries j LEFT JOIN trade_episodes e ON e.id=j.episode_id AND e.user_id=j.user_id AND e.workspace_id=j.workspace_id
        WHERE j.user_id=$1 AND j.workspace_id=$2 AND j.source_kind='broker' AND j.deleted_at IS NULL AND j.retired_at IS NULL
          AND coalesce(j.issue_json->>'instrument_key',e.instrument_key||'|'||j.currency)=$3
        ORDER BY coalesce(e.opened_at,j.created_at) DESC,j.id LIMIT 1")
        .bind(user).bind(workspace).bind(key).fetch_optional(connection).await?)
}

/// Fills the user combined that no longer sit side by side on one side of a
/// trade, usually because a sync moved one of them.
pub async fn broken_joins(pool: &PgPool, user: &str, workspace: &str) -> Result<Vec<BrokenJoin>> {
    let mut connection = pool.acquire().await?;
    let rows: Vec<(String, String, Vec<String>)> = sqlx::query_as("SELECT DISTINCT ON (k.id,j.id) k.id,j.id,k.execution_ids FROM journal_action_joins k
        JOIN trade_episode_fills f ON coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id)=ANY(k.execution_ids)
        JOIN trade_episodes e ON e.id=f.episode_id AND e.user_id=k.user_id AND e.workspace_id=k.workspace_id AND e.retired_at IS NULL
        JOIN journal_entries j ON j.episode_id=e.id AND j.user_id=e.user_id AND j.deleted_at IS NULL AND j.retired_at IS NULL
        WHERE k.user_id=$1 AND k.workspace_id=$2 AND k.revoked_at IS NULL")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    let mut broken = vec![];
    for (join_id, entry_id, execution_ids) in rows {
        let Some(draft) =
            action_notes::entry_draft(&mut connection, user, workspace, &entry_id).await?
        else {
            continue;
        };
        if action_notes::timeline(&mut connection, user, workspace, &draft)
            .await?
            .broken_joins
            .contains(&join_id)
        {
            let symbol: String =
                sqlx::query_scalar("SELECT symbol FROM journal_entries WHERE id=$1")
                    .bind(&entry_id)
                    .fetch_one(&mut *connection)
                    .await?;
            broken.push(BrokenJoin {
                join_id,
                entry_id,
                symbol,
                execution_ids,
            });
        }
    }
    Ok(broken)
}

/// Possible ticker changes: one stock's position is left open and, soon after,
/// a different ticker starts with an execution that would close exactly that
/// position. Only the user can say they are the same holding.
pub async fn continuation_suggestions(
    pool: &PgPool,
    user: &str,
    workspace: &str,
) -> Result<Vec<ContinuationSuggestion>> {
    let mut connection = pool.acquire().await?;
    let groups = source::load(&mut connection, user, workspace).await?;
    let dismissed = dismissed(&mut connection, user, workspace).await?;
    Ok(continuation_candidates(&groups)
        .into_iter()
        .filter(|candidate| {
            !dismissed.iter().any(|(execution, opening)| {
                execution == &candidate.execution_id && opening == &candidate.opening_execution_id
            })
        })
        .collect())
}

async fn dismissed(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<Vec<(String, String)>> {
    let rows: Option<Value> = sqlx::query_scalar("SELECT opening_inventory->'dismissed_continuations' FROM journal_workspace_state WHERE user_id=$1 AND workspace_id=$2")
        .bind(user).bind(workspace).fetch_optional(connection).await?.flatten();
    Ok(rows
        .and_then(|rows| rows.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|row| {
            Some((
                row["execution_id"].as_str()?.to_owned(),
                row["opening_execution_id"].as_str()?.to_owned(),
            ))
        })
        .collect())
}

fn is_stock(group: &SourceGroup) -> bool {
    group.issue.is_none()
        && !group.fills.is_empty()
        && group.fills.iter().all(|fill| {
            matches!(&fill.instrument, ExecutionInstrument::Equity { symbol }
                if !symbol.to_ascii_lowercase().contains("unresolved:"))
        })
}

fn signed(fill: &ExecutionFill) -> Decimal {
    match fill.side {
        ExecutionSide::Buy => fill.quantity,
        ExecutionSide::Sell => -fill.quantity,
    }
}

/// The position left open at the end of the history, read from flat, and the
/// execution that opened it.
fn open_position(group: &SourceGroup) -> Option<(Decimal, &ExecutionFill)> {
    let mut position = Decimal::ZERO;
    let mut opened_by = None;
    for fill in &group.fills {
        let next = position + signed(fill);
        if position == Decimal::ZERO || position.is_sign_negative() != next.is_sign_negative() {
            opened_by = Some(fill);
        }
        position = next;
    }
    if position == Decimal::ZERO {
        return None;
    }
    opened_by.map(|fill| (position, fill))
}

fn similar_names(left: &SourceGroup, right: &SourceGroup) -> bool {
    let normalize = |text: &str| {
        text.chars()
            .filter(char::is_ascii_alphanumeric)
            .collect::<String>()
            .to_ascii_lowercase()
    };
    let (left_name, right_name) = (normalize(&left.description), normalize(&right.description));
    (!left_name.is_empty() && left_name == right_name)
        || right.symbol.starts_with(&left.symbol)
        || left.symbol.starts_with(&right.symbol)
}

fn continuation_candidates(groups: &[SourceGroup]) -> Vec<ContinuationSuggestion> {
    let mut candidates = vec![];
    for target in groups.iter().filter(|group| is_stock(group)) {
        let Some((position, opened_by)) = open_position(target) else {
            continue;
        };
        let Some(last) = target.fills.iter().map(|fill| fill.executed_at).max() else {
            continue;
        };
        for source in groups.iter().filter(|group| {
            is_stock(group)
                && group.key != target.key
                && group.currency == target.currency
                && similar_names(target, group)
        }) {
            let Some(first) = source
                .fills
                .iter()
                .min_by_key(|fill| (fill.executed_at, &fill.transaction_id))
            else {
                continue;
            };
            let closes = (position > Decimal::ZERO && first.side == ExecutionSide::Sell)
                || (position < Decimal::ZERO && first.side == ExecutionSide::Buy);
            if closes
                && first.quantity == position.abs()
                && first.executed_at > last
                && first.executed_at - last <= Duration::days(CONTINUATION_WINDOW_DAYS)
            {
                candidates.push(ContinuationSuggestion {
                    from_symbol: target.symbol.clone(),
                    to_symbol: source.symbol.clone(),
                    quantity: first.quantity.normalize().to_string(),
                    execution_id: first.transaction_id.clone(),
                    opening_execution_id: opened_by.transaction_id.clone(),
                    executed_at: first.executed_at.to_rfc3339(),
                    explanation: format!(
                        "{} {} was left open, and the first {} execution closes exactly that amount. Did the ticker change from {} to {}?",
                        position.abs().normalize(),
                        target.symbol,
                        source.symbol,
                        target.symbol,
                        source.symbol
                    ),
                });
            }
        }
    }
    candidates
}

pub struct ContinuationInput<'a> {
    pub execution_id: &'a str,
    pub opening_execution_id: &'a str,
}

/// Records the user's answer to a continuation suggestion. Confirming joins the
/// two tickers' position; dismissing hides the suggestion.
pub async fn answer_continuation(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: ContinuationInput<'_>,
    confirmed: bool,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":if confirmed {"confirm_continuation"} else {"dismiss_continuation"},"workspace":workspace,"execution":input.execution_id,"opening":input.opening_execution_id});
    let mut tx = pool.begin().await?;
    if let Some(result) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(result)?);
    }
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    let groups = source::load(&mut tx, user, workspace).await?;
    let candidate = continuation_candidates(&groups)
        .into_iter()
        .find(|candidate| {
            candidate.execution_id == input.execution_id
                && candidate.opening_execution_id == input.opening_execution_id
        })
        .ok_or_else(|| anyhow!("This suggestion no longer matches the broker history"))?;
    let list = if confirmed {
        "confirmed_continuations"
    } else {
        "dismissed_continuations"
    };
    let record = json!([{
        "execution_id": candidate.execution_id,
        "opening_execution_id": candidate.opening_execution_id,
        "provenance": "user_confirmed",
        "recorded_at": Utc::now().to_rfc3339(),
        "note": format!("User answered that {} and {} are {}the same position", candidate.from_symbol, candidate.to_symbol, if confirmed {""} else {"not "}),
    }]);
    let updated = sqlx::query("UPDATE journal_workspace_state SET opening_inventory=jsonb_set(coalesce(opening_inventory,'{}'::jsonb),ARRAY[$3::text],coalesce(opening_inventory->$3,'[]'::jsonb)||$4::jsonb),updated_at=now() WHERE user_id=$1 AND workspace_id=$2")
        .bind(user).bind(workspace).bind(list).bind(record).execute(&mut *tx).await?;
    ensure!(updated.rows_affected() == 1, "Journal workspace not found");
    if confirmed {
        opening::queue_projection(&mut tx, user, workspace, &version).await?;
    }
    commands::changed(
        &mut tx,
        user,
        workspace,
        "continuation",
        json!({"executionId":candidate.execution_id,"confirmed":confirmed}),
    )
    .await?;
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &json!(true),
    )
    .await?;
    tx.commit().await?;
    if confirmed {
        opening::project_now(pool, user, workspace).await;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, TimeZone};

    use super::*;
    use crate::service::trade_review::types::ExecutionInstrument;

    fn fill(id: &str, symbol: &str, side: ExecutionSide, quantity: i64, day: u32) -> ExecutionFill {
        ExecutionFill {
            transaction_id: id.into(),
            instrument: ExecutionInstrument::Equity {
                symbol: symbol.into(),
            },
            side,
            price: Decimal::ONE,
            quantity: Decimal::new(quantity, 0),
            fee: Decimal::ZERO,
            executed_at: at(day),
        }
    }

    fn at(day: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2025, 12, day, 15, 0, 0).unwrap()
    }

    fn group(symbol: &str, description: &str, fills: Vec<ExecutionFill>) -> SourceGroup {
        SourceGroup::for_test(symbol, description, fills)
    }

    #[test]
    fn suggests_a_ticker_change_that_closes_the_open_position() {
        let groups = [
            group(
                "IRBT",
                "Irobot Corp",
                vec![
                    fill("b1", "IRBT", ExecutionSide::Buy, 100, 19),
                    fill("s1", "IRBT", ExecutionSide::Sell, 100, 19),
                    fill("b2", "IRBT", ExecutionSide::Buy, 150, 19),
                ],
            ),
            group(
                "IRBTQ",
                "IROBOT CORP",
                vec![fill("s2", "IRBTQ", ExecutionSide::Sell, 150, 22)],
            ),
        ];
        let candidates = continuation_candidates(&groups);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].execution_id, "s2");
        assert_eq!(candidates[0].opening_execution_id, "b2");
    }

    #[test]
    fn ignores_unrelated_names_and_wrong_quantities() {
        let open = group(
            "IRBT",
            "Irobot Corp",
            vec![fill("b1", "IRBT", ExecutionSide::Buy, 150, 19)],
        );
        let unrelated = group(
            "ACME",
            "Acme Inc",
            vec![fill("s1", "ACME", ExecutionSide::Sell, 150, 22)],
        );
        let wrong_size = group(
            "IRBTQ",
            "Irobot Corp",
            vec![fill("s2", "IRBTQ", ExecutionSide::Sell, 100, 22)],
        );
        assert!(continuation_candidates(&[open, unrelated, wrong_size]).is_empty());
    }
}
