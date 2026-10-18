use anyhow::{Result, anyhow};
use rust_decimal::Decimal;
use sqlx::{PgPool, Row};

use super::types::{
    EpisodeDirection, ExecutionInstrument, FillAllocation, FillRole, TradeEpisodeDraft,
};

/// A trade episode as saved, with its fills.
#[derive(Debug, Clone)]
pub struct StoredEpisode {
    pub id: String,
    pub workspace_id: String,
    pub grouping_source: String,
    pub draft: TradeEpisodeDraft,
}

pub async fn list_workspace_episodes(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<StoredEpisode>> {
    let rows = sqlx::query("SELECT id,workspace_id,grouping_source,instrument_json,direction,opened_at,closed_at,current_quantity,fingerprint FROM trade_episodes WHERE user_id=$1 AND workspace_id=$2 AND retired_at IS NULL ORDER BY opened_at,id")
        .bind(user_id).bind(workspace_id).fetch_all(pool).await?;
    let ids = rows
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<Result<Vec<_>, _>>()?;
    let fills = sqlx::query("SELECT episode_id,coalesce(brokerage_transaction_id,'opening:'||opening_position_id) AS transaction_id,role,quantity,price,fee,executed_at FROM trade_episode_fills WHERE episode_id=ANY($1) ORDER BY episode_id,executed_at,allocation_order,brokerage_transaction_id")
        .bind(&ids).fetch_all(pool).await?;
    let mut episodes = rows
        .into_iter()
        .map(|row| {
            Ok(StoredEpisode {
                id: row.try_get("id")?,
                workspace_id: row.try_get("workspace_id")?,
                grouping_source: row.try_get("grouping_source")?,
                draft: TradeEpisodeDraft {
                    instrument: serde_json::from_value::<ExecutionInstrument>(
                        row.try_get("instrument_json")?,
                    )?,
                    direction: if row.try_get::<String, _>("direction")? == "short" {
                        EpisodeDirection::Short
                    } else {
                        EpisodeDirection::Long
                    },
                    allocations: vec![],
                    opened_at: row.try_get("opened_at")?,
                    closed_at: row.try_get("closed_at")?,
                    current_quantity: row.try_get("current_quantity")?,
                    fingerprint: row.try_get("fingerprint")?,
                },
            })
        })
        .collect::<Result<Vec<_>>>()?;
    for fill in fills {
        let episode_id: String = fill.try_get("episode_id")?;
        let episode = episodes
            .iter_mut()
            .find(|episode| episode.id == episode_id)
            .ok_or_else(|| anyhow!("fill belongs to an unknown episode"))?;
        episode.draft.allocations.push(FillAllocation {
            transaction_id: fill.try_get("transaction_id")?,
            role: if fill.try_get::<String, _>("role")? == "entry" {
                FillRole::Entry
            } else {
                FillRole::Exit
            },
            quantity: fill.try_get("quantity")?,
            price: fill.try_get("price")?,
            fee: fill.try_get("fee")?,
            executed_at: fill.try_get("executed_at")?,
        });
    }
    Ok(episodes)
}

pub(crate) fn weighted_price<'a>(
    fills: impl Iterator<Item = &'a FillAllocation>,
    quantity: Decimal,
) -> Result<Decimal> {
    if quantity <= Decimal::ZERO {
        return Err(anyhow!("execution has no quantity"));
    }
    Ok(fills
        .map(|fill| fill.price * fill.quantity)
        .sum::<Decimal>()
        / quantity)
}

pub(crate) fn direction_str(direction: EpisodeDirection) -> &'static str {
    if direction == EpisodeDirection::Long {
        "long"
    } else {
        "short"
    }
}

/// Net result of the exits against the average entry, after every fee.
pub(crate) fn realized_pnl(
    direction: EpisodeDirection,
    allocations: &[FillAllocation],
    multiplier: Decimal,
) -> Option<Decimal> {
    let entries = allocations
        .iter()
        .filter(|fill| fill.role == FillRole::Entry);
    let entered: Decimal = entries.clone().map(|fill| fill.quantity).sum();
    let entry = weighted_price(entries, entered).ok()?;
    let exits: Vec<_> = allocations
        .iter()
        .filter(|fill| fill.role == FillRole::Exit)
        .collect();
    let exit_quantity: Decimal = exits.iter().map(|fill| fill.quantity).sum();
    if exit_quantity <= Decimal::ZERO {
        return None;
    }
    let exit_value: Decimal = exits.iter().map(|fill| fill.price * fill.quantity).sum();
    let gross = if direction == EpisodeDirection::Long {
        exit_value - entry * exit_quantity
    } else {
        entry * exit_quantity - exit_value
    };
    let fees: Decimal = allocations.iter().map(|fill| fill.fee).sum();
    Some(gross * multiplier - fees)
}
