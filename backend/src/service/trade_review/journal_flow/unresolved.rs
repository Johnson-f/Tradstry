use super::{grouping::SavedGroup, source};
use crate::service::trade_review::types::{
    EpisodeDirection, ExecutionSide, FillAllocation, FillRole, TradeEpisodeDraft,
};
use anyhow::{Result, anyhow, ensure};
use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::{PgConnection, Row};

pub(super) async fn selected(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    row: &sqlx::postgres::PgRow,
) -> Result<SavedGroup> {
    let sources = source::load(connection, user, workspace).await?;
    let legacy = row.try_get::<String, _>("source_kind")? == "manual";
    if legacy {
        let linked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM journal_brokerage_links WHERE journal_entry_id=$1)",
        )
        .bind(row.try_get::<String, _>("id")?)
        .fetch_one(&mut *connection)
        .await?;
        ensure!(
            !linked,
            "This older entry already has execution links; resolve those links before adopting it"
        );
    }
    let issue: Value = if legacy {
        let symbol: String = row.try_get("symbol")?;
        let currency: String = row.try_get("currency")?;
        let candidates = sources
            .iter()
            .filter(|s| s.symbol.eq_ignore_ascii_case(&symbol) && s.currency == currency)
            .collect::<Vec<_>>();
        ensure!(
            candidates.len() == 1,
            "Choose an existing entry with the same exact instrument and currency"
        );
        serde_json::json!({"instrument_key":candidates[0].key,"source_ids":[]})
    } else {
        row.try_get("issue_json")?
    };
    let source = sources
        .iter()
        .find(|s| Some(s.key.as_str()) == issue["instrument_key"].as_str())
        .ok_or_else(|| anyhow!("Broker history is unavailable"))?;
    ensure!(
        source.can_confirm(),
        "Sync corrected instrument, price, date or corporate-action history before resolving this trade"
    );
    let ids = issue["source_ids"]
        .as_array()
        .ok_or_else(|| anyhow!("Execution history is unavailable"))?;
    let allocated = sqlx::query("SELECT f.brokerage_transaction_id,sum(f.quantity) AS quantity,sum(f.fee) AS fee FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL GROUP BY f.brokerage_transaction_id")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    let direction = source
        .fills
        .first()
        .map(|f| {
            if f.side == ExecutionSide::Buy {
                EpisodeDirection::Long
            } else {
                EpisodeDirection::Short
            }
        })
        .ok_or_else(|| anyhow!("No executions to resolve"))?;
    let mut fills = Vec::new();
    for fill in &source.fills {
        if !ids
            .iter()
            .any(|id| id.as_str() == Some(&fill.transaction_id))
        {
            continue;
        }
        let used = allocated
            .iter()
            .find(|r| r.get::<String, _>("brokerage_transaction_id") == fill.transaction_id);
        let quantity = fill.quantity
            - used
                .map(|r| r.get::<Decimal, _>("quantity"))
                .unwrap_or_default();
        if quantity <= Decimal::ZERO {
            continue;
        }
        let entry = matches!(
            (direction, fill.side),
            (EpisodeDirection::Long, ExecutionSide::Buy)
                | (EpisodeDirection::Short, ExecutionSide::Sell)
        );
        fills.push(FillAllocation {
            transaction_id: fill.transaction_id.clone(),
            role: if entry {
                FillRole::Entry
            } else {
                FillRole::Exit
            },
            quantity,
            price: fill.price,
            fee: fill.fee - used.map(|r| r.get::<Decimal, _>("fee")).unwrap_or_default(),
            executed_at: fill.executed_at,
        });
    }
    fills.sort_by_key(|f| f.executed_at);
    ensure!(
        legacy || !fills.is_empty(),
        "These executions are already assigned; refresh the journal"
    );
    let opened_at = fills
        .first()
        .map(|fill| fill.executed_at)
        .unwrap_or(source.fills[0].executed_at);
    let remaining = fills
        .iter()
        .map(|f| {
            if f.role == FillRole::Entry {
                f.quantity
            } else {
                -f.quantity
            }
        })
        .sum();
    let id: String = row.try_get("id")?;
    Ok(SavedGroup {
        unresolved: Some(issue),
        legacy_snapshot: if legacy {
            Some(row.try_get("legacy_snapshot")?)
        } else {
            None
        },
        entry_id: id.clone(),
        episode_id: id,
        record_version: row.try_get("record_version")?,
        context_version: row.try_get("context_version")?,
        updated_at: row.try_get("updated_at")?,
        grouping_source: "manual".into(),
        currency: source.currency.clone(),
        draft: TradeEpisodeDraft {
            instrument: source.fills[0].instrument.clone(),
            direction,
            opened_at,
            closed_at: None,
            current_quantity: remaining,
            fingerprint: String::new(),
            allocations: fills,
        },
    })
}

pub(super) async fn restore(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    group: &SavedGroup,
    issue: &Value,
) -> Result<()> {
    sqlx::query("DELETE FROM trade_episode_fills WHERE episode_id=$1 AND EXISTS(SELECT 1 FROM trade_episodes WHERE id=$1 AND user_id=$2 AND workspace_id=$3)").bind(&group.episode_id).bind(user).bind(workspace).execute(&mut *connection).await?;
    sqlx::query("UPDATE trade_episodes SET retired_at=now(),fingerprint='retired:'||id,record_version=record_version+1 WHERE id=$1 AND user_id=$2 AND workspace_id=$3").bind(&group.episode_id).bind(user).bind(workspace).execute(&mut *connection).await?;
    sqlx::query("DELETE FROM journal_brokerage_links WHERE journal_entry_id=$1 AND user_id=$2")
        .bind(&group.entry_id)
        .bind(user)
        .execute(&mut *connection)
        .await?;
    if let Some(snapshot) = &group.legacy_snapshot {
        sqlx::query("UPDATE journal_entries j SET source_kind='manual',episode_id=NULL,retired_at=NULL,successor_id=NULL,trade_type=old.trade_type,lifecycle_state=old.lifecycle_state,outcome=old.outcome,open_date=old.open_date,close_date=old.close_date,entry_price=old.entry_price,exit_price=old.exit_price,position_size=old.position_size,remaining_quantity=old.remaining_quantity,realized_net=old.realized_net,fees_paid=old.fees_paid,currency=old.currency,status=old.status,total_pl=old.total_pl,net_roi=old.net_roi,duration=old.duration,contract_multiplier=old.contract_multiplier,issue_json=old.issue_json,materialized_revision=j.materialized_revision+1,record_version=j.record_version+1 FROM jsonb_populate_record(NULL::journal_entries,$4) old WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3")
            .bind(&group.entry_id).bind(user).bind(workspace).bind(snapshot).execute(connection).await?;
        return Ok(());
    }
    sqlx::query("UPDATE journal_entries SET episode_id=NULL,retired_at=NULL,successor_id=NULL,trade_type='unknown',lifecycle_state='incomplete',outcome='unknown',open_date=NULL,close_date=NULL,entry_price=NULL,exit_price=NULL,position_size=NULL,remaining_quantity=NULL,realized_net=NULL,fees_paid=NULL,status=NULL,total_pl=NULL,net_roi=NULL,duration=NULL,issue_json=$4,materialized_revision=materialized_revision+1,record_version=record_version+1 WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
        .bind(&group.entry_id).bind(user).bind(workspace).bind(issue).execute(connection).await?;
    Ok(())
}
