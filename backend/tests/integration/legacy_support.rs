//! Data the retired brokerage review flow left behind in older workspaces:
//! automatic episodes built before the journal was turned on, and broker trades
//! it published to the journal. The journal must keep adopting both.

use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use sqlx::{PgPool, Row};
use tradstry_backend::service::trade_review::{
    build_episodes,
    types::{ExecutionFill, ExecutionInstrument, ExecutionSide, FillRole},
};

/// Builds the automatic episodes the old flow stored for every broker fill not
/// already grouped by hand.
pub(crate) async fn legacy_episodes(pool: &PgPool, user: &str, workspace: &str) {
    let rows = sqlx::query("SELECT b.id,b.symbol,b.transaction_type,b.price,b.units,b.fee,b.trade_date,NULLIF(btrim(b.underlying_symbol),'') AS underlying_symbol,NULLIF(btrim(b.option_kind),'') AS option_kind,b.strike_price,NULLIF(btrim(b.option_expiration),'') AS option_expiration,b.contract_multiplier
        FROM brokerage_transactions b WHERE b.user_id=$1 AND b.workspace_id=$2
          AND NOT EXISTS(SELECT 1 FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id WHERE e.grouping_source='manual' AND f.brokerage_transaction_id=b.id)
        ORDER BY b.trade_date,b.id")
        .bind(user).bind(workspace).fetch_all(pool).await.unwrap();
    let fills = rows.into_iter().filter_map(|row| {
        let kind = row
            .get::<String, _>("transaction_type")
            .to_ascii_uppercase();
        let side = if kind.starts_with("BUY") {
            ExecutionSide::Buy
        } else if kind.starts_with("SELL") {
            ExecutionSide::Sell
        } else {
            return None;
        };
        let symbol: String = row.get("symbol");
        let decimal = |value: f64| Decimal::from_f64(value).unwrap();
        let instrument = match (
            row.get::<Option<String>, _>("underlying_symbol"),
            row.get::<Option<String>, _>("option_kind"),
            row.get::<Option<f64>, _>("strike_price"),
            row.get::<Option<String>, _>("option_expiration"),
        ) {
            (Some(underlying), Some(option_kind), Some(strike), Some(expiration)) => {
                ExecutionInstrument::Option {
                    underlying,
                    expiration: expiration.parse().unwrap(),
                    strike: decimal(strike),
                    option_kind,
                    multiplier: decimal(row.get("contract_multiplier")),
                }
            }
            _ => ExecutionInstrument::Equity { symbol },
        };
        Some(ExecutionFill {
            transaction_id: row.get("id"),
            instrument,
            side,
            price: decimal(row.get("price")),
            quantity: decimal(row.get::<f64, _>("units").abs()),
            fee: decimal(row.get("fee")),
            executed_at: row.get("trade_date"),
        })
    });
    for episode in build_episodes(fills).unwrap() {
        let id: String = sqlx::query_scalar("INSERT INTO trade_episodes(id,user_id,workspace_id,fingerprint,instrument_key,instrument_json,direction,opened_at,closed_at,current_quantity)
            VALUES (uuidv7()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT(user_id,workspace_id,fingerprint) DO UPDATE SET closed_at=EXCLUDED.closed_at RETURNING id")
            .bind(user).bind(workspace).bind(&episode.fingerprint).bind(episode.instrument.key())
            .bind(serde_json::to_value(&episode.instrument).unwrap())
            .bind(if episode.direction == tradstry_backend::service::trade_review::types::EpisodeDirection::Long { "long" } else { "short" })
            .bind(episode.opened_at).bind(episode.closed_at).bind(episode.current_quantity)
            .fetch_one(pool).await.unwrap();
        for (order, fill) in episode.allocations.iter().enumerate() {
            sqlx::query("INSERT INTO trade_episode_fills(id,episode_id,brokerage_transaction_id,role,quantity,price,fee,executed_at,allocation_order) VALUES (uuidv7()::text,$1,$2,$3,$4,$5,$6,$7,$8)")
                .bind(&id).bind(&fill.transaction_id).bind(if fill.role == FillRole::Entry { "entry" } else { "exit" })
                .bind(fill.quantity).bind(fill.price).bind(fill.fee).bind(fill.executed_at).bind(order as i32)
                .execute(pool).await.unwrap();
        }
    }
}

/// A closed episode the old flow published as a journal entry with notes.
pub(crate) async fn legacy_publication(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    episode: &str,
    notes: &str,
) -> String {
    let id = format!("{workspace}:published");
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,stop_loss,notes)
        SELECT $1,e.user_id,e.workspace_id,e.instrument_json->>'symbol',e.instrument_json->>'symbol',e.direction,e.opened_at,e.closed_at,
            (SELECT sum(price*quantity)/sum(quantity) FROM trade_episode_fills WHERE episode_id=e.id AND role='entry')::float8,
            (SELECT sum(price*quantity)/sum(quantity) FROM trade_episode_fills WHERE episode_id=e.id AND role='exit')::float8,
            (SELECT sum(quantity) FROM trade_episode_fills WHERE episode_id=e.id AND role='entry')::float8,95,$3
        FROM trade_episodes e WHERE e.id=$2")
        .bind(&id).bind(episode).bind(notes).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) SELECT DISTINCT ON (brokerage_transaction_id) uuidv7()::text,$1,brokerage_transaction_id,$2 FROM trade_episode_fills WHERE episode_id=$3")
        .bind(&id).bind(user).bind(episode).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO brokerage_episode_publications(episode_id,user_id,workspace_id,journal_entry_id) VALUES ($1,$2,$3,$4)")
        .bind(episode).bind(user).bind(workspace).bind(&id).execute(pool).await.unwrap();
    id
}
