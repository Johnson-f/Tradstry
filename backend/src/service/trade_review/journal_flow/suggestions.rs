use super::{
    commands,
    grouping::{self, AllocationInput, GroupInput, GroupingInput, GroupingPreview},
};
use crate::service::trade_review::types::{
    EpisodeDirection, FillAllocation, FillRole, TradeEpisodeDraft,
};
use anyhow::{Result, anyhow, ensure};
use async_graphql::SimpleObject;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalGroupingSuggestionV2", rename_fields = "camelCase")]
pub struct Suggestion {
    pub id: String,
    pub entry_id: String,
    pub explanation: String,
    pub previous_confirmations: i32,
}

fn features(
    instrument: &str,
    direction: &str,
    seconds: i64,
    quantity: Decimal,
    baseline: Decimal,
) -> Value {
    let ratio = if baseline > Decimal::ZERO {
        quantity / baseline
    } else {
        Decimal::ONE
    };
    json!({"instrument":instrument,"assetClass":if instrument.starts_with("option:"){"option"}else{"equity"},"direction":direction,"duration":if seconds<86400{"intraday"}else if seconds<604800{"week"}else{"longer"},"size":if ratio<=Decimal::new(25,2){"small"}else if ratio<=Decimal::new(5,1){"medium"}else{"large"}})
}

pub async fn refresh(pool: &PgPool, user: &str, workspace: &str) -> Result<()> {
    let mut tx = pool.begin().await?;
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    let rows=sqlx::query("SELECT j.id AS entry_id,j.materialized_revision,e.id,e.instrument_key,e.direction,
        (SELECT jsonb_agg(jsonb_build_object('transaction_id',f.brokerage_transaction_id,'role',f.role,'quantity',f.quantity::text,'price',f.price::text,'fee',f.fee::text,'executed_at',f.executed_at) ORDER BY f.executed_at,f.allocation_order,f.id) FROM trade_episode_fills f WHERE f.episode_id=e.id) AS allocations
        FROM trade_episodes e JOIN journal_entries j ON j.episode_id=e.id AND j.user_id=e.user_id AND j.workspace_id=e.workspace_id
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL AND e.status='ready' AND e.grouping_source='automatic' AND j.deleted_at IS NULL AND j.retired_at IS NULL")
        .bind(user).bind(workspace).fetch_all(&mut *tx).await?;
    let mut live_keys = Vec::new();
    for row in rows {
        let entry: String = row.try_get("entry_id")?;
        let episode: String = row.try_get("id")?;
        let allocations: Vec<FillAllocation> = serde_json::from_value(
            row.try_get::<Option<Value>, _>("allocations")?
                .unwrap_or(json!([])),
        )?;
        let mut position = Decimal::ZERO;
        for (index, opening) in allocations.iter().enumerate() {
            let baseline = position;
            match opening.role {
                FillRole::Entry => position += opening.quantity,
                FillRole::Exit => position -= opening.quantity,
            }
            if opening.role != FillRole::Entry
                || baseline <= Decimal::ZERO
                || opening.quantity > baseline
            {
                continue;
            }
            let mut remaining = opening.quantity;
            let mut actual_position = position;
            let mut child = BTreeMap::from([(opening.transaction_id.clone(), opening.quantity)]);
            let mut end = None;
            for exit in allocations.iter().skip(index + 1) {
                if exit.role == FillRole::Entry {
                    break;
                }
                let take = remaining.min(exit.quantity);
                child.insert(exit.transaction_id.clone(), take);
                remaining -= take;
                actual_position -= exit.quantity;
                if remaining == Decimal::ZERO {
                    end = Some(exit.executed_at);
                    break;
                }
            }
            let Some(end) = end else {
                continue;
            };
            if actual_position <= Decimal::ZERO {
                continue;
            }
            let parent = allocations
                .iter()
                .filter_map(|fill| {
                    let quantity = fill.quantity
                        - child.get(&fill.transaction_id).copied().unwrap_or_default();
                    (quantity > Decimal::ZERO).then(|| AllocationInput {
                        transaction_id: fill.transaction_id.clone(),
                        quantity: quantity.normalize().to_string(),
                    })
                })
                .collect();
            let input = GroupingInput {
                direction: None,
                entry_ids: vec![entry.clone()],
                groups: vec![
                    GroupInput {
                        entry_id: Some(entry.clone()),
                        allocations: parent,
                    },
                    GroupInput {
                        entry_id: None,
                        allocations: child
                            .iter()
                            .map(|(id, q)| AllocationInput {
                                transaction_id: id.clone(),
                                quantity: q.normalize().to_string(),
                            })
                            .collect(),
                    },
                ],
            };
            let proposal = serde_json::to_value(&input)?;
            let key = commands::hash(&json!([
                entry,
                row.try_get::<i64, _>("materialized_revision")?,
                proposal
            ]))?;
            live_keys.push(key.clone());
            let pattern = features(
                &row.try_get::<String, _>("instrument_key")?,
                &row.try_get::<String, _>("direction")?,
                (end - opening.executed_at).num_seconds(),
                opening.quantity,
                baseline,
            );
            let explanation = format!(
                "An extra {} units were opened and closed while a position remained open. Were these a separate trading idea?",
                opening.quantity.normalize()
            );
            sqlx::query("INSERT INTO journal_grouping_suggestions(id,user_id,workspace_id,episode_id,source_revision,candidate_key,rule_version,proposal_json,features_json,explanation)
                VALUES ($1,$2,$3,$4,$5,$6,'balanced-extra-v1',$7,$8,$9) ON CONFLICT(user_id,workspace_id,candidate_key) DO UPDATE SET source_revision=EXCLUDED.source_revision")
                .bind(crate::ids::new_uuid_v7().to_string()).bind(user).bind(workspace).bind(&episode).bind(version.source).bind(key).bind(proposal).bind(pattern).bind(explanation).execute(&mut *tx).await?;
        }
    }
    sqlx::query("UPDATE journal_grouping_suggestions SET status='superseded' WHERE user_id=$1 AND workspace_id=$2 AND status='pending' AND NOT(candidate_key=ANY($3))")
        .bind(user).bind(workspace).bind(live_keys).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn list(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: Option<&str>,
    offset: usize,
) -> Result<Vec<Suggestion>> {
    let rows=sqlx::query("SELECT s.id,j.id AS entry_id,s.explanation,s.features_json FROM journal_grouping_suggestions s JOIN journal_entries j ON j.episode_id=s.episode_id AND j.user_id=s.user_id AND j.workspace_id=s.workspace_id WHERE s.user_id=$1 AND s.workspace_id=$2 AND s.status='pending' AND j.retired_at IS NULL AND j.deleted_at IS NULL AND ($3::text IS NULL OR j.id=$3)")
        .bind(user).bind(workspace).bind(entry).fetch_all(pool).await?;
    let feedback=sqlx::query("SELECT disposition,pattern_json FROM journal_grouping_feedback WHERE user_id=$1 AND workspace_id=$2 AND revoked_at IS NULL")
        .bind(user).bind(workspace).fetch_all(pool).await?;
    let mut ranked = Vec::new();
    for row in rows {
        let pattern: Value = row.try_get("features_json")?;
        let mut accepted = 0;
        let mut dismissed = 0;
        let mut exact = 0;
        for record in &feedback {
            let known: Value = record.try_get("pattern_json")?;
            if ["assetClass", "direction", "duration", "size"]
                .iter()
                .any(|key| known[*key] != pattern[*key])
            {
                continue;
            }
            let disposition: String = record.try_get("disposition")?;
            if disposition == "dismissed" {
                dismissed += 1;
            } else if matches!(disposition.as_str(), "accepted" | "adjusted") {
                accepted += 1;
                if known["instrument"] == pattern["instrument"] {
                    exact += 1;
                }
            }
        }
        let mut explanation: String = row.try_get("explanation")?;
        if accepted > 0 {
            explanation.push_str(&format!(
                " You confirmed {accepted} similar splits in this account."
            ));
        }
        ranked.push((
            exact > 0,
            (accepted + 1) as f64 / (accepted + dismissed + 2) as f64,
            Suggestion {
                id: row.try_get("id")?,
                entry_id: row.try_get("entry_id")?,
                explanation,
                previous_confirmations: accepted,
            },
        ));
    }
    ranked.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.total_cmp(&a.1))
            .then_with(|| a.2.id.cmp(&b.2.id))
    });
    Ok(ranked
        .into_iter()
        .skip(offset)
        .take(3)
        .map(|(_, _, suggestion)| suggestion)
        .collect())
}

pub async fn preview(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    id: &str,
    adjustment: Option<GroupingInput>,
) -> Result<GroupingPreview> {
    let proposal:Option<Value>=sqlx::query_scalar("SELECT proposal_json FROM journal_grouping_suggestions WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND status='pending'").bind(id).bind(user).bind(workspace).fetch_optional(pool).await?;
    let input: GroupingInput = serde_json::from_value(
        proposal.ok_or_else(|| anyhow!("Suggestion is no longer available"))?,
    )?;
    let adjusted = adjustment.is_some();
    let preview = grouping::preview(pool, user, workspace, adjustment.unwrap_or(input)).await?;
    sqlx::query("UPDATE journal_grouping_operations SET proposal_json=proposal_json||jsonb_build_object('origin_suggestion',$4::text,'adjusted',$5::boolean) WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND state='preview'")
        .bind(&preview.token).bind(user).bind(workspace).bind(id).bind(adjusted).execute(pool).await?;
    Ok(preview)
}

pub(super) struct Confirmation<'a> {
    pub operation: &'a str,
    pub origin: Option<&'a str>,
    pub adjusted: bool,
}

pub(super) async fn confirmed(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    confirmation: Confirmation<'_>,
    before: &TradeEpisodeDraft,
    child: Option<&TradeEpisodeDraft>,
) -> Result<()> {
    let Confirmation {
        operation,
        origin,
        adjusted,
    } = confirmation;
    let Some(child) = child else {
        return Ok(());
    };
    let baseline = before.entry_quantity() - child.entry_quantity();
    if baseline <= Decimal::ZERO {
        return Ok(());
    }
    let pattern = features(
        &child.instrument.key(),
        if child.direction == EpisodeDirection::Long {
            "long"
        } else {
            "short"
        },
        child
            .closed_at
            .map(|end| (end - child.opened_at).num_seconds())
            .unwrap_or(0),
        child.entry_quantity(),
        baseline,
    );
    if let Some(id) = origin {
        let changed=sqlx::query("UPDATE journal_grouping_suggestions SET status=$4 WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND status='pending'")
            .bind(id).bind(user).bind(workspace).bind(if adjusted{"adjusted"}else{"accepted"}).execute(&mut *connection).await?;
        ensure!(
            changed.rows_affected() == 1,
            "REPREVIEW_REQUIRED: suggestion is no longer pending"
        );
    }
    sqlx::query("INSERT INTO journal_grouping_feedback(id,user_id,workspace_id,suggestion_id,operation_id,disposition,pattern_json) VALUES ($1,$2,$3,$4,$5,$6,$7)")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(user).bind(workspace).bind(origin).bind(operation).bind(if adjusted{"adjusted"}else{"accepted"}).bind(pattern).execute(connection).await?;
    Ok(())
}

pub async fn dismiss(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    id: &str,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":"dismiss_suggestion","workspace":workspace,"id":id});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let pattern:Option<Value>=sqlx::query_scalar("UPDATE journal_grouping_suggestions SET status='dismissed' WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND status='pending' RETURNING features_json")
        .bind(id).bind(user).bind(workspace).fetch_optional(&mut *tx).await?;
    if let Some(pattern) = pattern {
        sqlx::query("INSERT INTO journal_grouping_feedback(id,user_id,workspace_id,suggestion_id,disposition,pattern_json) VALUES ($1,$2,$3,$4,'dismissed',$5)").bind(crate::ids::new_uuid_v7().to_string()).bind(user).bind(workspace).bind(id).bind(pattern).execute(&mut *tx).await?;
    }
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
    Ok(true)
}

pub async fn reset_learning(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":"reset_grouping_learning","workspace":workspace});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    sqlx::query("UPDATE journal_grouping_feedback SET revoked_at=now() WHERE user_id=$1 AND workspace_id=$2 AND revoked_at IS NULL").bind(user).bind(workspace).execute(&mut *tx).await?;
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
    Ok(true)
}
