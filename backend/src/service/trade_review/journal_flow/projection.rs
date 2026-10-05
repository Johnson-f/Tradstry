use std::collections::{BTreeMap, HashSet};

use anyhow::Result;
use rust_decimal::Decimal;
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};

use super::{
    commands, results,
    source::{self, SourceGroup},
    storage::{WriteScope, materialize, unassigned_entry},
};
use crate::service::trade_review::types::{
    EpisodeDirection, FillAllocation, FillRole, TradeEpisodeDraft,
};

struct Stored {
    episode_id: String,
    entry_id: Option<String>,
    fingerprint: String,
    anchor: Option<String>,
    sources: Vec<String>,
    manual: bool,
    blocked: bool,
    manual_draft: Option<TradeEpisodeDraft>,
    fees_known: bool,
}

struct Snapshot {
    user: String,
    workspace: String,
    source_revision: i64,
    grouping_revision: i64,
    lease: String,
    inventory: Value,
    groups: Vec<SourceGroup>,
    existing: Vec<Stored>,
}

pub async fn run_worker(pool: PgPool, mut shutdown: tokio::sync::watch::Receiver<bool>) {
    let owner = format!("journal-worker-{}", crate::ids::new_uuid_v7());
    loop {
        if *shutdown.borrow() {
            return;
        }
        if let Err(error) = process_once(&pool, &owner).await {
            log::error!("journal projection worker failed: {error:#}");
        }
        tokio::select! {
            _=tokio::time::sleep(std::time::Duration::from_secs(3))=>{},
            result=shutdown.changed()=>{if result.is_err() || *shutdown.borrow(){return;}}
        }
    }
}

pub async fn process_once(pool: &PgPool, owner: &str) -> Result<usize> {
    let candidates=sqlx::query("SELECT j.workspace_id,j.user_id FROM journal_projection_jobs j JOIN journal_workspace_state s USING(workspace_id,user_id)
        WHERE s.enabled AND s.import_state='idle' AND s.source_revision=s.sealed_revision AND j.available_at<=now()
        AND (j.state='pending' OR (j.state='running' AND j.lease_until<now())) ORDER BY j.available_at,j.workspace_id LIMIT 20")
        .fetch_all(pool).await?;
    let mut done = 0;
    for row in candidates {
        let user: String = row.try_get("user_id")?;
        let workspace: String = row.try_get("workspace_id")?;
        if let Some(snapshot) = claim(pool, &user, &workspace, owner).await? {
            let result = derive_and_commit(pool, &snapshot).await;
            match result {
                Ok(committed) => {
                    done += usize::from(committed);
                    if committed
                        && let Err(error) =
                            super::suggestions::refresh(pool, &user, &workspace).await
                    {
                        log::warn!(
                            "journal suggestions will retry for workspace {workspace}: {error:#}"
                        );
                        sqlx::query("UPDATE journal_projection_jobs SET state='pending',available_at=now()+interval '30 seconds',last_error='suggestions_failed' WHERE workspace_id=$1 AND user_id=$2 AND state='complete'")
                            .bind(&workspace).bind(&user).execute(pool).await?;
                    }
                }
                Err(error) => {
                    log::error!("journal projection failed for workspace {workspace}: {error:#}");
                    sqlx::query("UPDATE journal_projection_jobs SET state='pending',lease_owner=NULL,lease_until=NULL,attempt_count=attempt_count+1,available_at=now()+interval '30 seconds',last_error='projection_failed' WHERE workspace_id=$1 AND user_id=$2 AND lease_owner=$3")
                        .bind(&workspace).bind(&user).bind(&snapshot.lease).execute(pool).await?;
                }
            }
        }
    }
    Ok(done)
}

async fn claim(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    owner: &str,
) -> Result<Option<Snapshot>> {
    let mut tx = pool.begin().await?;
    let state=sqlx::query("SELECT source_revision,grouping_revision,opening_inventory FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2 AND enabled AND import_state='idle' AND source_revision=sealed_revision FOR UPDATE SKIP LOCKED")
        .bind(workspace).bind(user).fetch_optional(&mut *tx).await?;
    let Some(state) = state else {
        return Ok(None);
    };
    let lease = format!("{owner}:{}", crate::ids::new_uuid_v7());
    let job=sqlx::query("UPDATE journal_projection_jobs SET state='running',lease_owner=$3,lease_until=now()+interval '2 minutes',updated_at=now()
        WHERE workspace_id=$1 AND user_id=$2 AND available_at<=now() AND (state='pending' OR (state='running' AND lease_until<now()))")
        .bind(workspace).bind(user).bind(&lease).execute(&mut *tx).await?;
    if job.rows_affected() != 1 {
        return Ok(None);
    }
    let groups = source::load(&mut tx, user, workspace).await?;
    let existing_rows=sqlx::query("SELECT e.id,e.fingerprint,e.grouping_source,e.status,e.instrument_json,e.direction,e.opened_at,e.closed_at,e.current_quantity,j.fees_paid IS NOT NULL AS fees_known,coalesce(j.id,p.journal_entry_id) AS entry_id,
        (SELECT f.brokerage_transaction_id FROM trade_episode_fills f WHERE f.episode_id=e.id AND f.role='entry' ORDER BY f.executed_at,f.allocation_order,f.id LIMIT 1) AS anchor,
        ARRAY(SELECT DISTINCT f.brokerage_transaction_id FROM trade_episode_fills f WHERE f.episode_id=e.id) AS sources
        FROM trade_episodes e LEFT JOIN journal_entries j ON j.episode_id=e.id
        LEFT JOIN brokerage_episode_publications p ON p.episode_id=e.id AND p.user_id=e.user_id AND p.workspace_id=e.workspace_id
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL")
        .bind(user).bind(workspace).fetch_all(&mut *tx).await?;
    let mut existing = existing_rows
        .into_iter()
        .map(|row| {
            Ok(Stored {
                episode_id: row.try_get("id")?,
                entry_id: row.try_get("entry_id")?,
                fingerprint: row.try_get("fingerprint")?,
                anchor: row.try_get("anchor")?,
                sources: row.try_get("sources")?,
                manual: row.try_get::<String, _>("grouping_source")? == "manual",
                blocked: row.try_get::<String, _>("status")? == "blocked",
                fees_known: row.try_get("fees_known")?,
                manual_draft: if row.try_get::<String, _>("grouping_source")? == "manual" {
                    Some(TradeEpisodeDraft {
                        instrument: serde_json::from_value(row.try_get("instrument_json")?)?,
                        direction: if row.try_get::<String, _>("direction")? == "long" {
                            EpisodeDirection::Long
                        } else {
                            EpisodeDirection::Short
                        },
                        allocations: vec![],
                        opened_at: row.try_get("opened_at")?,
                        closed_at: row.try_get("closed_at")?,
                        current_quantity: row.try_get("current_quantity")?,
                        fingerprint: row.try_get("fingerprint")?,
                    })
                } else {
                    None
                },
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let manual_ids = existing
        .iter()
        .filter(|old| old.manual)
        .map(|old| old.episode_id.clone())
        .collect::<Vec<_>>();
    let allocations=sqlx::query("SELECT episode_id,brokerage_transaction_id,role,quantity,price,fee,executed_at FROM trade_episode_fills WHERE episode_id=ANY($1) ORDER BY episode_id,executed_at,allocation_order,id")
        .bind(&manual_ids).fetch_all(&mut *tx).await?;
    for row in allocations {
        if let Some(draft) = existing
            .iter_mut()
            .find(|old| {
                row.try_get::<String, _>("episode_id").ok().as_ref() == Some(&old.episode_id)
            })
            .and_then(|old| old.manual_draft.as_mut())
        {
            draft.allocations.push(FillAllocation {
                transaction_id: row.try_get("brokerage_transaction_id")?,
                role: if row.try_get::<String, _>("role")? == "entry" {
                    FillRole::Entry
                } else {
                    FillRole::Exit
                },
                quantity: row.try_get("quantity")?,
                price: row.try_get("price")?,
                fee: row.try_get("fee")?,
                executed_at: row.try_get("executed_at")?,
            });
        }
    }
    let snapshot = Snapshot {
        user: user.into(),
        workspace: workspace.into(),
        source_revision: state.try_get("source_revision")?,
        grouping_revision: state.try_get("grouping_revision")?,
        inventory: state.try_get("opening_inventory")?,
        lease,
        groups,
        existing,
    };
    tx.commit().await?;
    Ok(Some(snapshot))
}

async fn derive_and_commit(pool: &PgPool, snapshot: &Snapshot) -> Result<bool> {
    let computed = snapshot
        .groups
        .iter()
        .map(|group| Ok((group, group.drafts(&snapshot.inventory)?)))
        .collect::<Result<Vec<_>>>()?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT set_config('tradstry.journal_writer','on',true)")
        .execute(&mut *tx)
        .await?;
    let state=sqlx::query("SELECT source_revision,grouping_revision,sealed_revision,import_state FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2 AND enabled FOR UPDATE")
        .bind(&snapshot.workspace).bind(&snapshot.user).fetch_optional(&mut *tx).await?;
    let Some(state) = state else {
        return Ok(false);
    };
    let valid = state.try_get::<i64, _>("source_revision")? == snapshot.source_revision
        && state.try_get::<i64, _>("sealed_revision")? == snapshot.source_revision
        && state.try_get::<i64, _>("grouping_revision")? == snapshot.grouping_revision
        && state.try_get::<String, _>("import_state")? == "idle";
    if !valid {
        sqlx::query("UPDATE journal_projection_jobs SET state='pending',lease_owner=NULL,lease_until=NULL WHERE workspace_id=$1 AND user_id=$2 AND lease_owner=$3")
            .bind(&snapshot.workspace).bind(&snapshot.user).bind(&snapshot.lease).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok(false);
    }
    let owns_lease:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM journal_projection_jobs WHERE workspace_id=$1 AND user_id=$2 AND lease_owner=$3 AND state='running' AND lease_until>now())")
        .bind(&snapshot.workspace).bind(&snapshot.user).bind(&snapshot.lease).fetch_one(&mut *tx).await?;
    if !owns_lease {
        return Ok(false);
    }
    let mut retained = HashSet::<String>::new();
    for (original, original_drafts) in computed {
        let residual = preserve_manual(&mut tx, snapshot, original, &mut retained).await?;
        let Some(group) = residual.as_ref() else {
            continue;
        };
        let drafts = if group.fills == original.fills {
            original_drafts
        } else {
            group.drafts(&snapshot.inventory)?
        };
        if drafts.is_empty() {
            record_issue(&mut tx, snapshot, group).await?;
            retained.extend(
                snapshot
                    .existing
                    .iter()
                    .filter(|old| old.sources.iter().any(|id| group.source_ids.contains(id)))
                    .map(|old| old.episode_id.clone()),
            );
            continue;
        }
        for draft in drafts {
            let overlaps = snapshot
                .existing
                .iter()
                .filter(|old| {
                    !retained.contains(&old.episode_id)
                        && old.anchor.as_ref().is_some_and(|anchor| {
                            draft.allocations.iter().any(|fill| {
                                &fill.transaction_id == anchor && fill.role == FillRole::Entry
                            }) || (!group
                                .fills
                                .iter()
                                .any(|fill| &fill.transaction_id == anchor)
                                && old.sources.iter().any(|id| {
                                    draft.allocations.iter().any(|f| &f.transaction_id == id)
                                }))
                        })
                })
                .collect::<Vec<_>>();
            if overlaps.iter().any(|old| old.manual) || overlaps.len() > 1 {
                record_issue(&mut tx, snapshot, group).await?;
                retained.extend(overlaps.iter().map(|old| old.episode_id.clone()));
                continue;
            }
            let old = overlaps.first().copied();
            let episode_id = old
                .map(|old| old.episode_id.clone())
                .unwrap_or_else(|| crate::ids::new_uuid_v7().to_string());
            retained.insert(episode_id.clone());
            if old.is_some_and(|old| {
                !old.blocked && old.fingerprint == draft.fingerprint && old.entry_id.is_some()
            }) {
                continue;
            }
            let mut entry_id = old.and_then(|old| old.entry_id.clone());
            if entry_id.is_none() {
                match legacy_link_match(&mut tx, snapshot, &draft).await? {
                    LegacyLinkMatch::Entry(id) => entry_id = Some(id),
                    LegacyLinkMatch::Ambiguous => {
                        let mut ambiguous = group.clone();
                        ambiguous.issue=Some("This broker history overlaps existing journal entries. Compare them before confirming a separate trade.".into());
                        record_issue(&mut tx, snapshot, &ambiguous).await?;
                        continue;
                    }
                    LegacyLinkMatch::None => {}
                }
            }
            materialize(
                &mut tx,
                &WriteScope {
                    user: &snapshot.user,
                    workspace: &snapshot.workspace,
                    source_revision: snapshot.source_revision,
                },
                group,
                &draft,
                &episode_id,
                entry_id.as_deref(),
            )
            .await?;
        }
    }
    for old in &snapshot.existing {
        if !retained.contains(&old.episode_id) && old.manual {
            sqlx::query("UPDATE journal_entries SET lifecycle_state='incomplete',outcome='unknown',remaining_quantity=NULL,realized_net=NULL,fees_paid=NULL,status=NULL,total_pl=NULL,net_roi=NULL,issue_json=jsonb_build_object('code','missing_source','message','A broker execution was removed. Sync the original history to reconcile this trade.'),materialized_revision=materialized_revision+1 WHERE episode_id=$1 AND user_id=$2 AND workspace_id=$3")
                .bind(&old.episode_id).bind(&snapshot.user).bind(&snapshot.workspace).execute(&mut *tx).await?;
        }
        if !retained.contains(&old.episode_id) && !old.manual {
            sqlx::query("UPDATE trade_episodes SET retired_at=now(),record_version=record_version+1,fingerprint='retired:'||id||':'||fingerprint WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
                .bind(&old.episode_id).bind(&snapshot.user).bind(&snapshot.workspace).execute(&mut *tx).await?;
            sqlx::query("UPDATE journal_entries SET retired_at=now(),record_version=record_version+1 WHERE episode_id=$1 AND user_id=$2 AND workspace_id=$3")
                .bind(&old.episode_id).bind(&snapshot.user).bind(&snapshot.workspace).execute(&mut *tx).await?;
        }
    }
    sqlx::query("UPDATE journal_workspace_state SET projection_revision=$3,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND user_id=$2")
        .bind(&snapshot.workspace).bind(&snapshot.user).bind(snapshot.source_revision).execute(&mut *tx).await?;
    sqlx::query("UPDATE journal_projection_jobs SET state='complete',lease_owner=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND lease_owner=$3")
        .bind(&snapshot.workspace).bind(&snapshot.user).bind(&snapshot.lease).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO journal_changes(user_id,workspace_id,kind,payload_json) VALUES ($1,$2,'projection',$3)")
        .bind(&snapshot.user).bind(&snapshot.workspace).bind(json!({"sourceRevision":snapshot.source_revision})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(true)
}

async fn preserve_manual(
    connection: &mut PgConnection,
    snapshot: &Snapshot,
    group: &SourceGroup,
    retained: &mut HashSet<String>,
) -> Result<Option<SourceGroup>> {
    let manual = snapshot
        .existing
        .iter()
        .filter(|old| old.manual && old.sources.iter().any(|id| group.source_ids.contains(id)))
        .collect::<Vec<_>>();
    if manual.is_empty() {
        return Ok(Some(group.clone()));
    }
    retained.extend(manual.iter().map(|old| old.episode_id.clone()));
    if !group.can_confirm() {
        record_issue(connection, snapshot, group).await?;
        return Ok(None);
    }
    let mut budget = group
        .fills
        .iter()
        .map(|fill| (fill.transaction_id.clone(), (fill.quantity, fill.fee)))
        .collect::<BTreeMap<_, _>>();
    let mut updated = vec![];
    for old in &manual {
        let Some(mut draft) = old.manual_draft.clone() else {
            continue;
        };
        for allocation in &mut draft.allocations {
            let Some(source) = group
                .fills
                .iter()
                .find(|fill| fill.transaction_id == allocation.transaction_id)
            else {
                record_issue(connection, snapshot, group).await?;
                return Ok(None);
            };
            let is_entry = matches!(
                (draft.direction, source.side),
                (
                    EpisodeDirection::Long,
                    crate::service::trade_review::types::ExecutionSide::Buy
                ) | (
                    EpisodeDirection::Short,
                    crate::service::trade_review::types::ExecutionSide::Sell
                )
            );
            if is_entry != (allocation.role == FillRole::Entry) {
                record_issue(connection, snapshot, group).await?;
                return Ok(None);
            }
            let remaining = budget
                .get_mut(&allocation.transaction_id)
                .ok_or_else(|| anyhow::anyhow!("Execution quantity budget is unavailable"))?;
            if allocation.quantity > remaining.0 {
                record_issue(connection, snapshot, group).await?;
                return Ok(None);
            }
            allocation.fee = if allocation.quantity == remaining.0 {
                remaining.1
            } else {
                source.fee * allocation.quantity / source.quantity
            };
            allocation.price = source.price;
            allocation.executed_at = source.executed_at;
            remaining.0 -= allocation.quantity;
            remaining.1 -= allocation.fee;
        }
        draft.allocations.sort_by_key(|fill| fill.executed_at);
        if results::calculate(&draft).is_err() {
            record_issue(connection, snapshot, group).await?;
            return Ok(None);
        }
        draft.opened_at = draft.allocations[0].executed_at;
        draft.closed_at = if draft.current_quantity == Decimal::ZERO {
            draft.allocations.last().map(|f| f.executed_at)
        } else {
            None
        };
        let changed = old.blocked
            || old.entry_id.is_none()
            || old.fees_known != group.fees_known
            || old
                .manual_draft
                .as_ref()
                .is_none_or(|before| before.allocations != draft.allocations);
        if changed {
            draft.fingerprint.clear();
            draft.fingerprint = format!(
                "manual:{}:{}",
                old.entry_id.as_deref().unwrap_or(&old.episode_id),
                commands::hash(&serde_json::to_value(&draft)?)?
            );
            updated.push((*old, draft));
        }
    }
    for (old, draft) in updated {
        materialize(
            connection,
            &WriteScope {
                user: &snapshot.user,
                workspace: &snapshot.workspace,
                source_revision: snapshot.source_revision,
            },
            group,
            &draft,
            &old.episode_id,
            old.entry_id.as_deref(),
        )
        .await?;
    }
    let mut residual = group.clone();
    residual.fills.retain_mut(|fill| {
        let remaining = budget[&fill.transaction_id];
        fill.quantity = remaining.0;
        fill.fee = remaining.1;
        remaining.0 > Decimal::ZERO
    });
    residual.source_ids = residual
        .fills
        .iter()
        .map(|fill| fill.transaction_id.clone())
        .collect();
    if residual.fills.is_empty() {
        return Ok(None);
    }
    if manual.iter().any(|old| {
        old.manual_draft
            .as_ref()
            .is_some_and(|draft| draft.current_quantity > Decimal::ZERO)
    }) {
        let new_ids = residual
            .source_ids
            .iter()
            .filter(|id| {
                !snapshot
                    .existing
                    .iter()
                    .any(|old| !old.manual && old.sources.contains(id))
            })
            .cloned()
            .collect::<HashSet<_>>();
        if !new_ids.is_empty() {
            let mut unresolved = residual.clone();
            unresolved
                .fills
                .retain(|fill| new_ids.contains(&fill.transaction_id));
            unresolved.source_ids = new_ids.iter().cloned().collect();
            unresolved.issue =
                Some("Choose how these executions belong to your separated positions".into());
            record_unassigned_issue(connection, snapshot, &unresolved).await?;
            residual
                .fills
                .retain(|fill| !new_ids.contains(&fill.transaction_id));
            residual.source_ids.retain(|id| !new_ids.contains(id));
        }
    }
    Ok((!residual.fills.is_empty()).then_some(residual))
}

enum LegacyLinkMatch {
    None,
    Entry(String),
    Ambiguous,
}

async fn legacy_link_match(
    connection: &mut PgConnection,
    snapshot: &Snapshot,
    draft: &TradeEpisodeDraft,
) -> Result<LegacyLinkMatch> {
    let ids = draft
        .allocations
        .iter()
        .map(|f| f.transaction_id.clone())
        .collect::<Vec<_>>();
    let entries:Vec<String>=sqlx::query_scalar("SELECT DISTINCT j.id FROM journal_entries j JOIN journal_brokerage_links l ON l.journal_entry_id=j.id AND l.user_id=j.user_id
        WHERE j.user_id=$1 AND j.workspace_id=$2 AND j.episode_id IS NULL AND l.brokerage_transaction_id=ANY($3)")
        .bind(&snapshot.user).bind(&snapshot.workspace).bind(&ids).fetch_all(&mut *connection).await?;
    if entries.is_empty() {
        let duplicate:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM journal_entries j WHERE j.user_id=$1 AND j.workspace_id=$2 AND j.source_kind='manual' AND j.deleted_at IS NULL AND j.retired_at IS NULL AND upper(j.symbol)=$3 AND j.open_date::date<=$5::timestamptz::date AND j.close_date::date>=$4::timestamptz::date AND NOT EXISTS(SELECT 1 FROM journal_brokerage_links WHERE journal_entry_id=j.id))")
            .bind(&snapshot.user).bind(&snapshot.workspace).bind(match &draft.instrument {crate::service::trade_review::types::ExecutionInstrument::Equity{symbol}=>symbol.clone(),crate::service::trade_review::types::ExecutionInstrument::Option{underlying,..}=>underlying.clone()}).bind(draft.opened_at).bind(draft.closed_at.unwrap_or(draft.opened_at)).fetch_one(&mut *connection).await?;
        if duplicate {
            return Ok(LegacyLinkMatch::Ambiguous);
        }
        return Ok(LegacyLinkMatch::None);
    }
    if entries.len() != 1 {
        return Ok(LegacyLinkMatch::Ambiguous);
    }
    let links=sqlx::query("SELECT l.brokerage_transaction_id,b.units::text AS quantity FROM journal_brokerage_links l
        LEFT JOIN brokerage_transactions b ON b.id=l.brokerage_transaction_id AND b.user_id=l.user_id AND b.workspace_id=$3
        WHERE l.journal_entry_id=$1 AND l.user_id=$2")
        .bind(&entries[0]).bind(&snapshot.user).bind(&snapshot.workspace).fetch_all(&mut *connection).await?;
    let exact = links.len() == ids.iter().collect::<HashSet<_>>().len()
        && links.iter().all(|row| {
            let Ok(id) = row.try_get::<String, _>("brokerage_transaction_id") else {
                return false;
            };
            let Some(quantity) = row
                .try_get::<Option<String>, _>("quantity")
                .ok()
                .flatten()
                .and_then(|s| s.parse::<Decimal>().ok())
            else {
                return false;
            };
            let allocated = draft
                .allocations
                .iter()
                .filter(|fill| fill.transaction_id == id)
                .map(|fill| fill.quantity)
                .sum::<Decimal>();
            allocated == quantity.abs()
        });
    Ok(if exact {
        LegacyLinkMatch::Entry(entries[0].clone())
    } else {
        LegacyLinkMatch::Ambiguous
    })
}

async fn record_issue(
    connection: &mut PgConnection,
    snapshot: &Snapshot,
    group: &SourceGroup,
) -> Result<()> {
    let affected = snapshot
        .existing
        .iter()
        .filter(|old| old.sources.iter().any(|id| group.source_ids.contains(id)))
        .collect::<Vec<_>>();
    let mut preserved = false;
    for old in affected {
        sqlx::query("UPDATE trade_episodes SET status='blocked',block_reason=$2,record_version=record_version+1 WHERE id=$1 AND user_id=$3 AND workspace_id=$4")
            .bind(&old.episode_id).bind(group.issue.as_deref().unwrap_or("Grouping needs confirmation")).bind(&snapshot.user).bind(&snapshot.workspace).execute(&mut *connection).await?;
        if let Some(id) = &old.entry_id {
            let issue = json!({"code":"source_needs_attention","instrument_key":group.key,"source_ids":group.source_ids,"message":group.issue.as_deref().unwrap_or("Grouping needs confirmation")});
            sqlx::query("UPDATE journal_entries SET lifecycle_state='incomplete',outcome='unknown',open_date=NULL,close_date=NULL,entry_price=NULL,exit_price=NULL,position_size=NULL,remaining_quantity=NULL,realized_net=NULL,fees_paid=NULL,status=NULL,total_pl=NULL,net_roi=NULL,duration=NULL,issue_json=$4,materialized_revision=materialized_revision+1,record_version=record_version+1 WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
                .bind(id).bind(&snapshot.user).bind(&snapshot.workspace).bind(issue).execute(&mut *connection).await?;
            preserved = true;
        }
    }
    if preserved {
        return Ok(());
    }
    record_unassigned_issue(connection, snapshot, group).await
}

async fn record_unassigned_issue(
    connection: &mut PgConnection,
    snapshot: &Snapshot,
    group: &SourceGroup,
) -> Result<()> {
    let existing = unassigned_entry(
        connection,
        &snapshot.user,
        &snapshot.workspace,
        group,
        &group.source_ids,
    )
    .await?;
    let id = existing.unwrap_or_else(|| crate::ids::new_uuid_v7().to_string());
    let duplicates:Vec<String>=sqlx::query_scalar("SELECT id FROM journal_entries WHERE user_id=$1 AND workspace_id=$2 AND source_kind='manual' AND upper(symbol)=upper($3) AND deleted_at IS NULL AND retired_at IS NULL AND open_date::date<=$5::timestamptz::date AND close_date::date>=$4::timestamptz::date ORDER BY id")
        .bind(&snapshot.user).bind(&snapshot.workspace).bind(&group.symbol).bind(group.fills.iter().map(|fill|fill.executed_at).min()).bind(group.fills.iter().map(|fill|fill.executed_at).max()).fetch_all(&mut *connection).await?;
    let issue = json!({"code":"incomplete_history","instrument_key":group.key,"source_ids":group.source_ids,"possible_duplicates":duplicates,"message":group.issue.as_deref().unwrap_or("Confirm opening inventory or grouping before calculating this trade")});
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,source_kind,lifecycle_state,outcome,currency,issue_json,materialized_revision,record_version)
        VALUES ($1,$2,$3,$4,$5,'unknown','broker','incomplete','unknown',$6,$7,$8,1)
        ON CONFLICT(id) DO UPDATE SET issue_json=EXCLUDED.issue_json,materialized_revision=journal_entries.materialized_revision+1,record_version=journal_entries.record_version+1,updated_at=now()")
        .bind(id).bind(&snapshot.user).bind(&snapshot.workspace).bind(&group.symbol).bind(&group.description).bind(&group.currency).bind(issue).bind(snapshot.source_revision).execute(connection).await?;
    Ok(())
}
