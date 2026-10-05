use super::{
    commands, results, source,
    storage::{WriteScope, materialize},
};
use crate::service::trade_review::types::{
    EpisodeDirection, ExecutionSide, FillAllocation, FillRole, TradeEpisodeDraft,
};
use anyhow::{Result, anyhow, ensure};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::InputObject)]
#[graphql(name = "JournalAllocationInputV2", rename_fields = "camelCase")]
pub struct AllocationInput {
    pub transaction_id: String,
    pub quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::InputObject)]
#[graphql(name = "JournalGroupInputV2", rename_fields = "camelCase")]
pub struct GroupInput {
    pub entry_id: Option<String>,
    pub allocations: Vec<AllocationInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::InputObject)]
#[graphql(name = "JournalGroupingInputV2", rename_fields = "camelCase")]
pub struct GroupingInput {
    pub entry_ids: Vec<String>,
    pub groups: Vec<GroupInput>,
    pub direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalGroupingPreviewV2", rename_fields = "camelCase")]
pub struct GroupingPreview {
    pub token: String,
    pub entry_ids: Vec<String>,
    pub realized_net: Vec<Option<String>>,
    pub before_groups: Vec<PreviewGroup>,
    pub groups: Vec<PreviewGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalPreviewAllocationV2", rename_fields = "camelCase")]
pub struct PreviewAllocation {
    pub transaction_id: String,
    pub role: String,
    pub quantity: String,
    pub price: String,
    pub fee: Option<String>,
    pub executed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalPreviewGroupV2", rename_fields = "camelCase")]
pub struct PreviewGroup {
    pub entry_id: String,
    pub direction: String,
    pub remaining_quantity: String,
    pub entered_quantity: String,
    pub fees_paid: Option<String>,
    pub realized_net: Option<String>,
    pub allocations: Vec<PreviewAllocation>,
}

pub(super) fn preview_groups(groups: &[SavedGroup], fees_known: bool) -> Result<Vec<PreviewGroup>> {
    groups
        .iter()
        .map(|group| {
            let result = results::calculate(&group.draft).ok();
            Ok(PreviewGroup {
                entry_id: group.entry_id.clone(),
                direction: if group.draft.direction == EpisodeDirection::Long {
                    "long"
                } else {
                    "short"
                }
                .into(),
                remaining_quantity: group.draft.current_quantity.normalize().to_string(),
                entered_quantity: result
                    .as_ref()
                    .map(|r| r.entered.normalize().to_string())
                    .unwrap_or_default(),
                fees_paid: result
                    .as_ref()
                    .filter(|_| fees_known && group.unresolved.is_none())
                    .map(|r| r.fees.normalize().to_string()),
                realized_net: result
                    .as_ref()
                    .filter(|_| fees_known && group.unresolved.is_none())
                    .map(|r| r.realized.normalize().to_string()),
                allocations: group
                    .draft
                    .allocations
                    .iter()
                    .map(|fill| PreviewAllocation {
                        transaction_id: fill.transaction_id.clone(),
                        role: if fill.role == FillRole::Entry {
                            "entry"
                        } else {
                            "exit"
                        }
                        .into(),
                        quantity: fill.quantity.normalize().to_string(),
                        price: fill.price.normalize().to_string(),
                        fee: fees_known.then(|| fill.fee.normalize().to_string()),
                        executed_at: fill.executed_at.to_rfc3339(),
                    })
                    .collect(),
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, async_graphql::SimpleObject)]
#[graphql(name = "JournalGroupingResultV2", rename_fields = "camelCase")]
pub struct GroupingResult {
    pub operation_id: String,
    pub entry_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct SavedGroup {
    #[serde(default)]
    pub unresolved: Option<Value>,
    #[serde(default)]
    pub legacy_snapshot: Option<Value>,
    pub entry_id: String,
    pub episode_id: String,
    pub record_version: i64,
    pub context_version: i64,
    pub updated_at: String,
    pub grouping_source: String,
    pub currency: String,
    pub draft: TradeEpisodeDraft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Proposal {
    groups: Vec<SavedGroup>,
    retired_entry_ids: Vec<String>,
    source_key: String,
    #[serde(default)]
    origin_suggestion: Option<String>,
    #[serde(default)]
    adjusted: bool,
}

pub(super) async fn selected(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    ids: &[String],
) -> Result<Vec<SavedGroup>> {
    ensure!(
        !ids.is_empty()
            && ids.len() <= 100
            && ids.iter().collect::<HashSet<_>>().len() == ids.len(),
        "Select between one and 100 distinct trades"
    );
    let rows=sqlx::query("SELECT j.id,j.episode_id,j.record_version,j.updated_at::text,j.lifecycle_state,coalesce(j.currency,(SELECT currency FROM workspaces WHERE id=j.workspace_id)) AS currency,coalesce(c.record_version,0) AS context_version,j.source_kind,j.symbol,to_jsonb(j) AS legacy_snapshot,
        j.issue_json,e.grouping_source,e.instrument_json,e.direction,e.opened_at,e.closed_at,e.current_quantity,e.fingerprint
        FROM journal_entries j LEFT JOIN trade_episodes e ON e.id=j.episode_id AND e.user_id=j.user_id AND e.workspace_id=j.workspace_id
        LEFT JOIN journal_trade_context c ON c.entry_id=j.id
        WHERE j.user_id=$1 AND j.workspace_id=$2 AND j.id=ANY($3) AND j.deleted_at IS NULL AND j.retired_at IS NULL ORDER BY j.id FOR UPDATE OF j")
        .bind(user).bind(workspace).bind(ids).fetch_all(&mut *connection).await?;
    ensure!(
        rows.len() == ids.len(),
        "One or more broker trades are unavailable"
    );
    let mut groups = Vec::new();
    for row in rows {
        let episode_id: Option<String> = row.try_get("episode_id")?;
        let Some(episode_id) = episode_id else {
            groups.push(super::unresolved::selected(connection, user, workspace, &row).await?);
            continue;
        };
        let fills=sqlx::query("SELECT brokerage_transaction_id,role,quantity,price,fee,executed_at FROM trade_episode_fills WHERE episode_id=$1 ORDER BY executed_at,allocation_order,id")
            .bind(&episode_id).fetch_all(&mut *connection).await?;
        let allocations = fills
            .into_iter()
            .map(|fill| {
                Ok(FillAllocation {
                    transaction_id: fill.try_get("brokerage_transaction_id")?,
                    role: if fill.try_get::<String, _>("role")? == "entry" {
                        FillRole::Entry
                    } else {
                        FillRole::Exit
                    },
                    quantity: fill.try_get("quantity")?,
                    price: fill.try_get("price")?,
                    fee: fill.try_get("fee")?,
                    executed_at: fill.try_get("executed_at")?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        groups.push(SavedGroup {
            unresolved: None,
            legacy_snapshot: None,
            entry_id: row.try_get("id")?,
            episode_id,
            record_version: row.try_get("record_version")?,
            context_version: row.try_get("context_version")?,
            updated_at: row.try_get("updated_at")?,
            grouping_source: row.try_get("grouping_source")?,
            currency: row.try_get("currency")?,
            draft: TradeEpisodeDraft {
                instrument: serde_json::from_value(row.try_get("instrument_json")?)?,
                direction: if row.try_get::<String, _>("direction")? == "long" {
                    EpisodeDirection::Long
                } else {
                    EpisodeDirection::Short
                },
                allocations,
                opened_at: row.try_get("opened_at")?,
                closed_at: row.try_get("closed_at")?,
                current_quantity: row.try_get("current_quantity")?,
                fingerprint: row.try_get("fingerprint")?,
            },
        });
    }
    Ok(groups)
}

pub(super) fn versions(groups: &[SavedGroup]) -> Value {
    Value::Object(groups.iter().map(|g|(g.entry_id.clone(),json!({"entry":g.record_version,"context":g.context_version,"updatedAt":g.updated_at}))).collect())
}

pub async fn preview(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: GroupingInput,
) -> Result<GroupingPreview> {
    let mut tx = pool.begin().await?;
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    let mut before = selected(&mut tx, user, workspace, &input.entry_ids).await?;
    if before.iter().any(|g| g.unresolved.is_some()) {
        let direction = match input.direction.as_deref() {
            Some("long") => EpisodeDirection::Long,
            Some("short") => EpisodeDirection::Short,
            _ => return Err(anyhow!("Confirm the direction of these executions")),
        };
        for group in before.iter_mut().filter(|g| g.unresolved.is_some()) {
            group.draft.direction = direction;
        }
    }
    let first = &before[0];
    if let Some(direction) = input.direction.as_deref() {
        ensure!(
            before
                .iter()
                .filter(|group| group.unresolved.is_none())
                .all(|group| matches!(
                    (direction, group.draft.direction),
                    ("long", EpisodeDirection::Long) | ("short", EpisodeDirection::Short)
                )),
            "The chosen direction must match the existing position"
        );
    }
    ensure!(
        before
            .iter()
            .all(|g| g.draft.instrument == first.draft.instrument
                && g.draft.direction == first.draft.direction
                && g.currency == first.currency),
        "Trades must share the account, instrument, currency and direction"
    );
    ensure!(
        !input.groups.is_empty() && input.groups.len() <= 100,
        "Choose between one and 100 resulting trades"
    );
    let source_key = format!("{}|{}", first.draft.instrument.key(), first.currency);
    let sources = source::load(&mut tx, user, workspace).await?;
    let source = sources
        .iter()
        .find(|s| s.key == source_key)
        .ok_or_else(|| anyhow!("Broker executions are unavailable"))?;
    ensure!(
        source.can_confirm(),
        "Correct missing instrument, price, date or corporate-action history at the source before grouping"
    );
    let mut budgets = BTreeMap::<String, (Decimal, Decimal)>::new();
    for group in &before {
        for fill in &group.draft.allocations {
            let budget = budgets.entry(fill.transaction_id.clone()).or_default();
            budget.0 += fill.quantity;
            budget.1 += fill.fee;
        }
    }
    for (id, (quantity, _)) in &budgets {
        ensure!(
            source
                .fills
                .iter()
                .any(|fill| &fill.transaction_id == id && fill.quantity >= *quantity),
            "REPREVIEW_REQUIRED: source quantities changed"
        );
    }
    let mut used_ids = HashSet::new();
    let mut groups = vec![];
    let mut realized_net = vec![];
    for input_group in input.groups {
        ensure!(
            !input_group.allocations.is_empty() && input_group.allocations.len() <= 10000,
            "Each trade needs execution allocations"
        );
        let existing = if let Some(id) = &input_group.entry_id {
            Some(
                before
                    .iter()
                    .find(|g| &g.entry_id == id)
                    .ok_or_else(|| anyhow!("The target trade was not selected"))?,
            )
        } else {
            None
        };
        let entry_id = existing
            .map(|g| g.entry_id.clone())
            .unwrap_or_else(|| crate::ids::new_uuid_v7().to_string());
        ensure!(
            used_ids.insert(entry_id.clone()),
            "A trade can appear only once in the proposal"
        );
        let episode_id = existing
            .map(|g| g.episode_id.clone())
            .unwrap_or_else(|| crate::ids::new_uuid_v7().to_string());
        let mut requests = Vec::new();
        let mut requested_ids = HashSet::new();
        for allocation in input_group.allocations {
            ensure!(
                requested_ids.insert(allocation.transaction_id.clone()),
                "Combine repeated quantities for the same execution"
            );
            let quantity = allocation.quantity.parse::<Decimal>()?;
            ensure!(
                quantity > Decimal::ZERO,
                "Allocation quantities must be positive"
            );
            let fill = source
                .fills
                .iter()
                .find(|f| f.transaction_id == allocation.transaction_id)
                .ok_or_else(|| {
                    anyhow!("Execution does not belong to this instrument and account")
                })?;
            let budget = budgets
                .get_mut(&allocation.transaction_id)
                .ok_or_else(|| anyhow!("Execution is outside the selected trades"))?;
            ensure!(quantity <= budget.0, "Execution quantity is over-allocated");
            let fee = if quantity == budget.0 {
                budget.1
            } else {
                budget.1 * quantity / budget.0
            };
            budget.0 -= quantity;
            budget.1 -= fee;
            requests.push((fill, quantity, fee));
        }
        requests.sort_by_key(|(fill, _, _)| fill.executed_at);
        let mut remaining = Decimal::ZERO;
        let mut allocations = Vec::new();
        for (fill, quantity, fee) in requests {
            let entry = matches!(
                (first.draft.direction, fill.side),
                (EpisodeDirection::Long, ExecutionSide::Buy)
                    | (EpisodeDirection::Short, ExecutionSide::Sell)
            );
            if entry {
                remaining += quantity;
            } else {
                remaining -= quantity;
            }
            ensure!(
                remaining >= Decimal::ZERO,
                "An exit cannot precede or exceed its opening quantity"
            );
            allocations.push(FillAllocation {
                transaction_id: fill.transaction_id.clone(),
                role: if entry {
                    FillRole::Entry
                } else {
                    FillRole::Exit
                },
                quantity,
                price: fill.price,
                fee,
                executed_at: fill.executed_at,
            });
        }
        let mut draft = TradeEpisodeDraft {
            instrument: first.draft.instrument.clone(),
            direction: first.draft.direction,
            opened_at: allocations[0].executed_at,
            closed_at: if remaining == Decimal::ZERO {
                allocations.last().map(|f| f.executed_at)
            } else {
                None
            },
            current_quantity: remaining,
            fingerprint: String::new(),
            allocations,
        };
        draft.fingerprint = format!(
            "manual:{entry_id}:{}",
            commands::hash(&serde_json::to_value(&draft)?)?
        );
        let calculation = results::calculate(&draft)?;
        realized_net.push(
            source
                .fees_known
                .then(|| calculation.realized.normalize().to_string()),
        );
        groups.push(SavedGroup {
            unresolved: None,
            legacy_snapshot: None,
            entry_id,
            episode_id,
            record_version: existing.map_or(0, |g| g.record_version),
            context_version: existing.map_or(0, |g| g.context_version),
            updated_at: String::new(),
            grouping_source: "manual".into(),
            currency: first.currency.clone(),
            draft,
        });
    }
    ensure!(
        budgets
            .values()
            .all(|(quantity, fee)| *quantity == Decimal::ZERO && *fee == Decimal::ZERO),
        "Every selected quantity must remain allocated"
    );
    ensure!(
        groups.iter().any(|g| input.entry_ids.contains(&g.entry_id)),
        "Keep one original trade identity in the resulting groups"
    );
    let retired_entry_ids = input
        .entry_ids
        .iter()
        .filter(|id| !used_ids.contains(*id))
        .cloned()
        .collect();
    let proposal = Proposal {
        groups,
        retired_entry_ids,
        source_key,
        origin_suggestion: None,
        adjusted: false,
    };
    let token = crate::ids::new_uuid_v7().to_string();
    let kind = if proposal.groups.len() > before.len() {
        "split"
    } else if proposal.groups.len() < before.len() {
        "merge"
    } else {
        "regroup"
    };
    sqlx::query("INSERT INTO journal_grouping_operations(id,user_id,workspace_id,kind,source_revision,grouping_revision,expected_versions,before_json,proposal_json,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '10 minutes')")
        .bind(&token).bind(user).bind(workspace).bind(kind).bind(version.source).bind(version.grouping).bind(versions(&before)).bind(serde_json::to_value(&before)?).bind(serde_json::to_value(&proposal)?).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(GroupingPreview {
        token,
        entry_ids: proposal.groups.iter().map(|g| g.entry_id.clone()).collect(),
        realized_net,
        before_groups: preview_groups(&before, source.fees_known)?,
        groups: preview_groups(&proposal.groups, source.fees_known)?,
    })
}

pub async fn confirm(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    token: &str,
    client: &str,
    mutation: &str,
) -> Result<GroupingResult> {
    let payload = json!({"kind":"confirm_grouping","workspace":workspace,"token":token});
    let mut tx = pool.begin().await?;
    if let Some(result) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(result)?);
    }
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    let operation=sqlx::query("SELECT state,source_revision,grouping_revision,expected_versions,before_json,proposal_json,expires_at>now() AS valid,undo_of FROM journal_grouping_operations WHERE id=$1 AND user_id=$2 AND workspace_id=$3 FOR UPDATE")
        .bind(token).bind(user).bind(workspace).fetch_optional(&mut *tx).await?.ok_or_else(||anyhow!("Grouping preview not found"))?;
    ensure!(
        operation.try_get::<String, _>("state")? == "preview",
        "PREVIEW_ALREADY_USED"
    );
    ensure!(
        operation.try_get::<bool, _>("valid")?
            && operation.try_get::<i64, _>("source_revision")? == version.source
            && operation.try_get::<i64, _>("grouping_revision")? == version.grouping,
        "REPREVIEW_REQUIRED: the preview expired or the trades changed"
    );
    let before: Vec<SavedGroup> = serde_json::from_value(operation.try_get("before_json")?)?;
    let current = selected(
        &mut tx,
        user,
        workspace,
        &before
            .iter()
            .map(|g| g.entry_id.clone())
            .collect::<Vec<_>>(),
    )
    .await?;
    ensure!(
        versions(&current) == operation.try_get::<Value, _>("expected_versions")?,
        "REPREVIEW_REQUIRED: trade context changed"
    );
    let proposal: Proposal = serde_json::from_value(operation.try_get("proposal_json")?)?;
    let sources = source::load(&mut tx, user, workspace).await?;
    let source = sources
        .iter()
        .find(|s| s.key == proposal.source_key)
        .ok_or_else(|| anyhow!("Broker executions are unavailable"))?;
    let target_ids = proposal
        .groups
        .iter()
        .map(|g| g.entry_id.clone())
        .collect::<Vec<_>>();
    let successor = current
        .iter()
        .find(|g| target_ids.contains(&g.entry_id))
        .map(|g| g.entry_id.as_str())
        .unwrap_or(&target_ids[0]);
    for target in proposal
        .groups
        .iter()
        .filter(|g| !current.iter().any(|old| old.entry_id == g.entry_id))
    {
        if let Some(row)=sqlx::query("SELECT user_id,workspace_id,record_version,retired_at IS NOT NULL AS retired,deleted_at IS NULL AS available,coalesce((SELECT record_version FROM journal_trade_context WHERE entry_id=journal_entries.id),0) AS context_version FROM journal_entries WHERE id=$1 FOR UPDATE")
            .bind(&target.entry_id).fetch_optional(&mut *tx).await? {
            ensure!(row.try_get::<String,_>("user_id")?==user && row.try_get::<String,_>("workspace_id")?==workspace && row.try_get::<bool,_>("retired")? && row.try_get::<bool,_>("available")? && row.try_get::<i64,_>("record_version")?==target.record_version+1 && row.try_get::<i64,_>("context_version")?==target.context_version,"REPREVIEW_REQUIRED: a trade being restored has changed");
        } else {ensure!(target.record_version==0,"REPREVIEW_REQUIRED: original trade is unavailable");}
    }
    for group in &current {
        if !target_ids.contains(&group.entry_id) {
            sqlx::query("UPDATE trade_episodes SET retired_at=now(),fingerprint='retired:'||id||':'||fingerprint,record_version=record_version+1 WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
                .bind(&group.episode_id).bind(user).bind(workspace).execute(&mut *tx).await?;
            sqlx::query("UPDATE journal_entries SET retired_at=now(),successor_id=$4,record_version=record_version+1 WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
                .bind(&group.entry_id).bind(user).bind(workspace).bind(successor).execute(&mut *tx).await?;
        }
    }
    for group in &proposal.groups {
        if let Some(issue) = &group.unresolved {
            super::unresolved::restore(&mut tx, user, workspace, group, issue).await?;
            continue;
        }
        materialize(
            &mut tx,
            &WriteScope {
                user,
                workspace,
                source_revision: version.source,
            },
            source,
            &group.draft,
            &group.episode_id,
            Some(&group.entry_id),
        )
        .await?;
        sqlx::query("UPDATE trade_episodes SET grouping_source=$2,retired_at=NULL WHERE id=$1 AND user_id=$3 AND workspace_id=$4")
            .bind(&group.episode_id).bind(&group.grouping_source).bind(user).bind(workspace).execute(&mut *tx).await?;
        sqlx::query("UPDATE journal_entries SET retired_at=NULL,successor_id=NULL WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
            .bind(&group.entry_id).bind(user).bind(workspace).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE journal_workspace_state SET grouping_revision=grouping_revision+1,updated_at=now() WHERE workspace_id=$1 AND user_id=$2")
        .bind(workspace).bind(user).execute(&mut *tx).await?;
    let result = GroupingResult {
        operation_id: token.into(),
        entry_ids: target_ids,
    };
    let after = selected(&mut tx, user, workspace, &result.entry_ids).await?;
    sqlx::query("UPDATE journal_grouping_operations SET state='committed',committed_at=now(),after_json=$2 WHERE id=$1")
        .bind(token).bind(json!({"result":result,"groups":after})).execute(&mut *tx).await?;
    if let Some(undo_of) = operation.try_get::<Option<String>, _>("undo_of")? {
        sqlx::query("UPDATE journal_grouping_operations SET state='undone' WHERE id=$1 AND user_id=$2 AND workspace_id=$3").bind(&undo_of).bind(user).bind(workspace).execute(&mut *tx).await?;
        sqlx::query("UPDATE journal_grouping_feedback SET revoked_at=now() WHERE operation_id=$1 AND user_id=$2 AND workspace_id=$3 AND revoked_at IS NULL").bind(&undo_of).bind(user).bind(workspace).execute(&mut *tx).await?;
    } else if before.iter().all(|g| g.unresolved.is_none()) {
        let child = proposal.groups.iter().find(|group| {
            group.draft.closed_at.is_some()
                && !before.iter().any(|old| old.entry_id == group.entry_id)
        });
        super::suggestions::confirmed(
            &mut tx,
            user,
            workspace,
            super::suggestions::Confirmation {
                operation: token,
                origin: proposal.origin_suggestion.as_deref(),
                adjusted: proposal.adjusted,
            },
            &before[0].draft,
            child.map(|group| &group.draft),
        )
        .await?;
    }
    commands::changed(
        &mut tx,
        user,
        workspace,
        "grouping",
        serde_json::to_value(&result)?,
    )
    .await?;
    sqlx::query("INSERT INTO journal_projection_jobs(workspace_id,user_id,requested_revision,state) VALUES ($1,$2,$3,'pending') ON CONFLICT(workspace_id) DO UPDATE SET state=CASE WHEN journal_projection_jobs.state='running' THEN 'running' ELSE 'pending' END,available_at=now()")
        .bind(workspace).bind(user).bind(version.source).execute(&mut *tx).await?;
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &serde_json::to_value(&result)?,
    )
    .await?;
    tx.commit().await?;
    Ok(result)
}

pub async fn preview_undo(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    operation_id: &str,
) -> Result<GroupingPreview> {
    let mut tx = pool.begin().await?;
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    let operation=sqlx::query("SELECT state,source_revision,grouping_revision,before_json,after_json,proposal_json FROM journal_grouping_operations WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
        .bind(operation_id).bind(user).bind(workspace).fetch_optional(&mut *tx).await?.ok_or_else(||anyhow!("Grouping operation not found"))?;
    ensure!(
        operation.try_get::<String, _>("state")? == "committed",
        "This operation has already been undone or was never applied"
    );
    ensure!(
        operation.try_get::<i64, _>("source_revision")? == version.source
            && operation.try_get::<i64, _>("grouping_revision")? + 1 == version.grouping,
        "REPREVIEW_REQUIRED: newer executions or grouping changes need a new grouping preview"
    );
    let original: Vec<SavedGroup> = serde_json::from_value(operation.try_get("before_json")?)?;
    let after: Value = operation.try_get("after_json")?;
    let after_groups: Vec<SavedGroup> = serde_json::from_value(after["groups"].clone())?;
    let current = selected(
        &mut tx,
        user,
        workspace,
        &after_groups
            .iter()
            .map(|g| g.entry_id.clone())
            .collect::<Vec<_>>(),
    )
    .await?;
    ensure!(
        current.iter().all(|group| after_groups
            .iter()
            .any(|after| after.entry_id == group.entry_id && after.draft == group.draft)),
        "REPREVIEW_REQUIRED: trade allocations changed after grouping"
    );
    let prior: Proposal = serde_json::from_value(operation.try_get("proposal_json")?)?;
    let restored_ids = original
        .iter()
        .map(|g| g.entry_id.clone())
        .collect::<Vec<_>>();
    let retired_entry_ids = current
        .iter()
        .filter(|g| !restored_ids.contains(&g.entry_id))
        .map(|g| g.entry_id.clone())
        .collect();
    let mut realized_net = Vec::new();
    let sources = source::load(&mut tx, user, workspace).await?;
    let known = sources
        .iter()
        .find(|s| s.key == prior.source_key)
        .is_some_and(|s| s.fees_known);
    for group in &original {
        realized_net.push(
            (known && group.unresolved.is_none())
                .then(|| {
                    results::calculate(&group.draft).map(|r| r.realized.normalize().to_string())
                })
                .transpose()?,
        );
    }
    let proposal = Proposal {
        groups: original,
        retired_entry_ids,
        source_key: prior.source_key,
        origin_suggestion: None,
        adjusted: false,
    };
    let token = crate::ids::new_uuid_v7().to_string();
    sqlx::query("INSERT INTO journal_grouping_operations(id,user_id,workspace_id,kind,source_revision,grouping_revision,expected_versions,before_json,proposal_json,undo_of,expires_at) VALUES ($1,$2,$3,'undo',$4,$5,$6,$7,$8,$9,now()+interval '10 minutes')")
        .bind(&token).bind(user).bind(workspace).bind(version.source).bind(version.grouping).bind(versions(&current)).bind(serde_json::to_value(&current)?).bind(serde_json::to_value(&proposal)?).bind(operation_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(GroupingPreview {
        token,
        entry_ids: restored_ids,
        realized_net,
        before_groups: preview_groups(&current, known)?,
        groups: preview_groups(&proposal.groups, known)?,
    })
}
