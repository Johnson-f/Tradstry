use super::{results, source::SourceGroup};
use crate::service::trade_review::types::{EpisodeDirection, FillRole, TradeEpisodeDraft};
use anyhow::{Result, ensure};
use rust_decimal::{Decimal, prelude::ToPrimitive};
use serde_json::json;
use sqlx::PgConnection;

pub(super) struct WriteScope<'a> {
    pub user: &'a str,
    pub workspace: &'a str,
    pub source_revision: i64,
}

pub(super) async fn unassigned_entry(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    group: &SourceGroup,
    source_ids: &[String],
) -> Result<Option<String>> {
    // Instrument keys can change when incomplete metadata is corrected. Source
    // identities are stable. Require the entire placeholder history to belong to
    // this group, so unrelated instruments or user-owned entries cannot be taken.
    let entries: Vec<String> = sqlx::query_scalar("SELECT id FROM journal_entries WHERE user_id=$1 AND workspace_id=$2 AND source_kind='broker' AND lifecycle_state='incomplete' AND episode_id IS NULL AND retired_at IS NULL AND deleted_at IS NULL AND (issue_json->'source_ids') ?| $3::text[] AND (issue_json->'source_ids') <@ $4::jsonb ORDER BY created_at,id LIMIT 2")
        .bind(user).bind(workspace).bind(source_ids).bind(json!(group.source_ids))
        .fetch_all(connection).await?;
    ensure!(
        entries.len() <= 1,
        "Multiple unresolved entries claim the same execution history"
    );
    Ok(entries.into_iter().next())
}

pub(super) async fn materialize(
    connection: &mut PgConnection,
    scope: &WriteScope<'_>,
    group: &SourceGroup,
    draft: &TradeEpisodeDraft,
    episode_id: &str,
    entry_id: Option<&str>,
) -> Result<()> {
    sqlx::query("SELECT set_config('tradstry.journal_writer','on',true)")
        .execute(&mut *connection)
        .await?;
    let result = results::calculate(draft)?;
    let direction = if draft.direction == EpisodeDirection::Long {
        "long"
    } else {
        "short"
    };
    sqlx::query("INSERT INTO trade_episodes(id,user_id,workspace_id,fingerprint,instrument_key,instrument_json,direction,opened_at,closed_at,current_quantity,source_revision,record_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1) ON CONFLICT(id) DO UPDATE SET status='ready',block_reason=NULL,fingerprint=EXCLUDED.fingerprint,instrument_key=EXCLUDED.instrument_key,instrument_json=EXCLUDED.instrument_json,direction=EXCLUDED.direction,opened_at=EXCLUDED.opened_at,closed_at=EXCLUDED.closed_at,current_quantity=EXCLUDED.current_quantity,source_revision=EXCLUDED.source_revision,record_version=trade_episodes.record_version+1,updated_at=now()")
        .bind(episode_id).bind(scope.user).bind(scope.workspace).bind(&draft.fingerprint).bind(draft.instrument.key()).bind(serde_json::to_value(&draft.instrument)?).bind(direction).bind(draft.opened_at).bind(draft.closed_at).bind(draft.current_quantity).bind(scope.source_revision).execute(&mut *connection).await?;
    sqlx::query("DELETE FROM trade_episode_fills WHERE episode_id=$1")
        .bind(episode_id)
        .execute(&mut *connection)
        .await?;
    for (order, fill) in draft.allocations.iter().enumerate() {
        sqlx::query("INSERT INTO trade_episode_fills(id,episode_id,brokerage_transaction_id,role,quantity,price,fee,executed_at,allocation_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)")
            .bind(crate::ids::new_uuid_v7().to_string()).bind(episode_id).bind(&fill.transaction_id).bind(if fill.role==FillRole::Entry {"entry"} else {"exit"}).bind(fill.quantity).bind(fill.price).bind(fill.fee).bind(fill.executed_at).bind(i32::try_from(order)?).execute(&mut *connection).await?;
    }
    let repaired: Option<String> = if entry_id.is_none() {
        let source_ids = draft
            .allocations
            .iter()
            .map(|fill| fill.transaction_id.clone())
            .collect::<Vec<_>>();
        unassigned_entry(connection, scope.user, scope.workspace, group, &source_ids).await?
    } else {
        None
    };
    let id = entry_id
        .map(str::to_owned)
        .or(repaired)
        .unwrap_or_else(|| crate::ids::new_uuid_v7().to_string());
    let closed = draft.closed_at.is_some();
    let outcome = if !closed || !group.fees_known {
        "unknown"
    } else if result.realized > Decimal::ZERO {
        "profit"
    } else if result.realized < Decimal::ZERO {
        "loss"
    } else {
        "breakeven"
    };
    let legacy_status = match outcome {
        "unknown" => None,
        "breakeven" => Some("profit"),
        value => Some(value),
    };
    let issue = if group.fees_known {
        None
    } else {
        Some(json!({"code":"unknown_fees","message":"Fees unavailable; net result is unknown"}))
    };
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,source_kind,episode_id,lifecycle_state,outcome,remaining_quantity,realized_net,fees_paid,currency,materialized_revision,record_version,open_date,close_date,entry_price,exit_price,position_size,status,total_pl,net_roi,duration,contract_multiplier,issue_json)
        VALUES ($1,$2,$3,$4,$5,$6,'broker',$7,$8,$9,$10,$11,$12,$13,$14,1,$15,$16,$17,$18,$19,$20,$21,$21,$22,$23,$24)
        ON CONFLICT(id) DO UPDATE SET source_kind='broker',trade_type=EXCLUDED.trade_type,episode_id=EXCLUDED.episode_id,lifecycle_state=EXCLUDED.lifecycle_state,outcome=EXCLUDED.outcome,remaining_quantity=EXCLUDED.remaining_quantity,realized_net=EXCLUDED.realized_net,fees_paid=EXCLUDED.fees_paid,currency=EXCLUDED.currency,materialized_revision=journal_entries.materialized_revision+1,record_version=journal_entries.record_version+1,open_date=EXCLUDED.open_date,close_date=EXCLUDED.close_date,entry_price=EXCLUDED.entry_price,exit_price=EXCLUDED.exit_price,position_size=EXCLUDED.position_size,status=EXCLUDED.status,total_pl=EXCLUDED.total_pl,net_roi=EXCLUDED.net_roi,duration=EXCLUDED.duration,contract_multiplier=EXCLUDED.contract_multiplier,issue_json=EXCLUDED.issue_json,updated_at=now()")
        .bind(&id).bind(scope.user).bind(scope.workspace).bind(&group.symbol).bind(&group.description).bind(direction).bind(episode_id).bind(if closed {"closed"} else {"open"}).bind(outcome).bind(draft.current_quantity)
        .bind(group.fees_known.then_some(result.realized)).bind(group.fees_known.then_some(result.fees)).bind(&group.currency).bind(1_i64).bind(draft.opened_at).bind(draft.closed_at)
        .bind(result.entry_price.to_f64()).bind(result.exit_price.and_then(|p|p.to_f64())).bind(result.entered.to_f64()).bind(legacy_status).bind(result.percent.filter(|_|group.fees_known).and_then(|p|p.to_f64()))
        .bind(draft.closed_at.map(|closed|(closed-draft.opened_at).num_seconds())).bind(draft.instrument.multiplier().to_f64()).bind(issue).execute(&mut *connection).await?;
    sqlx::query("DELETE FROM journal_brokerage_links WHERE journal_entry_id=$1 AND user_id=$2")
        .bind(&id)
        .bind(scope.user)
        .execute(&mut *connection)
        .await?;
    sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id,allocated_quantity)
        SELECT uuidv7()::text,$1,brokerage_transaction_id,$2,sum(quantity) FROM trade_episode_fills WHERE episode_id=$3 GROUP BY brokerage_transaction_id")
        .bind(&id).bind(scope.user).bind(episode_id).execute(&mut *connection).await?;
    sqlx::query("INSERT INTO journal_trade_reviews(id,entry_id,user_id,workspace_id,review_version,entry_revision,context_revision,takeaway,choice_ids,snapshot_json,created_at)
        SELECT v.id,j.id,j.user_id,j.workspace_id,1,0,0,coalesce(nullif(v.reflection_json->>'lesson',''),v.reflection_json->>'notes',''),'[]',jsonb_build_object('legacyReview',to_jsonb(v),'provenance','imported_final_review'),coalesce(v.finalized_at,p.created_at)
        FROM journal_entries j JOIN trade_review_publications p ON p.journal_entry_id=j.id JOIN trade_review_versions v ON v.id=p.review_version_id AND v.user_id=j.user_id AND v.workspace_id=j.workspace_id
        WHERE j.id=$1 AND j.user_id=$2 AND v.stage='final' AND NOT EXISTS(SELECT 1 FROM journal_trade_reviews WHERE entry_id=j.id) ON CONFLICT DO NOTHING")
        .bind(&id).bind(scope.user).execute(connection).await?;
    Ok(())
}
