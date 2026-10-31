//! Loading a user's engine inputs and writing its results.

use std::collections::HashMap;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::{PgConnection, Postgres, QueryBuilder};
use uuid::Uuid;

use super::decisions::{Decision, DecisionKind};
use super::instrument::Alias;
use super::measure::{self, Metrics};
use super::model::{Instrument, Intent, Side, TaxStatus, Trade, TradeKind, WorkspaceInfo};
use super::normalize::{ActivityRow, ManualFill, OpeningPosition};
use super::positions::HoldingsSnapshot;
use super::{ENGINE_VERSION, EngineInput, EngineOutput};
use crate::brokerage::account_types::{self, AccountType, CashOrMargin, TaxTreatment};

const CHUNK: usize = 500;

fn text<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

/// Account capabilities from what the brokerage reports: cash accounts and
/// IRAs cannot short; tax-advantaged accounts report no gains.
pub fn workspace_info(
    id: Uuid,
    cash_or_margin: Option<&str>,
    raw_type: Option<&str>,
    name: Option<&str>,
) -> WorkspaceInfo {
    let Some(name) = name else {
        return WorkspaceInfo {
            id,
            can_short: true,
            tax: TaxStatus::Taxable,
            is_ira: false,
        };
    };
    let account_type = account_types::classify(raw_type, name);
    let is_ira = matches!(
        account_type,
        AccountType::TraditionalIra
            | AccountType::RolloverIra
            | AccountType::SepIra
            | AccountType::SimpleIra
            | AccountType::RothIra
    );
    let sheltered = matches!(
        account_type.tax_treatment(),
        TaxTreatment::TaxDeferred | TaxTreatment::TaxFree
    );
    WorkspaceInfo {
        id,
        can_short: CashOrMargin::parse(cash_or_margin) != CashOrMargin::Cash && !sheltered,
        tax: if sheltered {
            TaxStatus::Sheltered
        } else {
            TaxStatus::Taxable
        },
        is_ira,
    }
}

pub struct Loaded {
    pub input: EngineInput,
    pub snapshots: Vec<HoldingsSnapshot>,
}

pub async fn load(conn: &mut PgConnection, user_id: Uuid) -> Result<Loaded> {
    type WorkspaceRow = (Uuid, Option<String>, Option<String>, Option<String>);
    let workspaces: Vec<WorkspaceRow> = sqlx::query_as(
        "SELECT w.id, a.cash_or_margin, a.raw_type, a.name FROM workspaces w
         LEFT JOIN brokerage_accounts a ON a.id = w.brokerage_account_id WHERE w.user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let workspaces = workspaces
        .into_iter()
        .map(|(id, com, raw, name)| {
            workspace_info(id, com.as_deref(), raw.as_deref(), name.as_deref())
        })
        .collect();

    let activities: Vec<(String, Uuid, Value)> = sqlx::query_as(
        "SELECT x.snaptrade_activity_id, w.id, x.raw FROM brokerage_activities x
         JOIN workspaces w ON w.brokerage_account_id = x.account_id WHERE w.user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let activities = activities
        .into_iter()
        .map(|(activity_id, workspace_id, raw)| ActivityRow {
            activity_id,
            workspace_id,
            raw,
        })
        .collect();

    type ManualRow = (
        Uuid,
        Uuid,
        Value,
        String,
        Decimal,
        Decimal,
        Decimal,
        Option<String>,
        DateTime<Utc>,
    );
    let manual: Vec<ManualRow> = sqlx::query_as(
        "SELECT id, workspace_id, instrument, side, quantity, price, fee, intent, executed_at
         FROM manual_fills WHERE user_id = $1 AND deleted_at IS NULL",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let manual_fills = manual
        .into_iter()
        .map(
            |(id, workspace_id, instrument, side, quantity, price, fee, intent, executed_at)| {
                Ok(ManualFill {
                    id,
                    workspace_id,
                    instrument: serde_json::from_value::<Instrument>(instrument)
                        .context("manual fill instrument")?,
                    side: if side == "sell" {
                        Side::Sell
                    } else {
                        Side::Buy
                    },
                    quantity,
                    price,
                    fee,
                    intent: match intent.as_deref() {
                        Some("open") => Some(Intent::Open),
                        Some("close") => Some(Intent::Close),
                        _ => None,
                    },
                    executed_at,
                })
            },
        )
        .collect::<Result<Vec<_>>>()?;

    type OpeningRow = (
        Uuid,
        Uuid,
        Value,
        Decimal,
        Decimal,
        DateTime<Utc>,
        DateTime<Utc>,
    );
    let openings: Vec<OpeningRow> = sqlx::query_as(
        "SELECT id, workspace_id, instrument, quantity, cost_per_unit, acquired_at, as_of
         FROM opening_positions WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let openings = openings
        .into_iter()
        .map(
            |(id, workspace_id, instrument, quantity, cost_per_unit, acquired_at, as_of)| {
                Ok(OpeningPosition {
                    id,
                    workspace_id,
                    instrument: serde_json::from_value(instrument).context("opening instrument")?,
                    quantity,
                    cost_per_unit,
                    acquired_at,
                    as_of,
                })
            },
        )
        .collect::<Result<Vec<_>>>()?;

    let aliases: Vec<(String, String, DateTime<Utc>, String)> = sqlx::query_as(
        "SELECT from_key, to_key, effective_at, status FROM instrument_aliases WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let (confirmed, rejected): (Vec<_>, Vec<_>) =
        aliases.into_iter().partition(|a| a.3 == "confirmed");

    let decisions: Vec<(Uuid, Uuid, DateTime<Utc>, Value)> = sqlx::query_as(
        "SELECT id, workspace_id, created_at, payload FROM trade_decisions WHERE user_id = $1 AND undone_at IS NULL",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let decisions = decisions
        .into_iter()
        .map(|(id, workspace_id, created_at, payload)| {
            Ok(Decision {
                id,
                workspace_id,
                created_at,
                kind: serde_json::from_value::<DecisionKind>(payload)
                    .context("decision payload")?,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let snapshots: Vec<(Uuid, DateTime<Utc>, Value)> = sqlx::query_as(
        "SELECT DISTINCT ON (s.account_id) w.id, s.captured_at, s.positions FROM brokerage_snapshots s
         JOIN workspaces w ON w.brokerage_account_id = s.account_id
         JOIN brokerage_accounts a ON a.id = s.account_id
         WHERE w.user_id = $1 AND a.unlinked_at IS NULL AND a.initial_import_completed_at IS NOT NULL
         ORDER BY s.account_id, s.captured_at DESC",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;

    Ok(Loaded {
        input: EngineInput {
            workspaces,
            activities,
            manual_fills,
            openings,
            aliases: confirmed
                .into_iter()
                .map(|(from_key, to_key, effective_at, _)| Alias {
                    from_key,
                    to_key,
                    effective_at,
                })
                .collect(),
            rejected_aliases: rejected
                .into_iter()
                .map(|(from, to, _, _)| (from, to))
                .collect(),
            decisions,
        },
        snapshots: snapshots
            .into_iter()
            .map(|(workspace_id, captured_at, positions)| HoldingsSnapshot {
                workspace_id,
                captured_at,
                positions,
            })
            .collect(),
    })
}

async fn insert_trades(
    conn: &mut PgConnection,
    user_id: Uuid,
    trades: &[Trade],
    metrics: &HashMap<String, Metrics>,
) -> Result<()> {
    for chunk in trades.chunks(CHUNK) {
        let mut builder: QueryBuilder<Postgres> = QueryBuilder::new(
            "INSERT INTO trades (user_id, id, workspace_id, kind, parent_id, children, instrument_key, instrument,
                asset_class, symbol, underlying, direction, status, opened_at, closed_at, max_quantity, open_quantity,
                avg_entry, avg_exit, gross, fees, net, income, entry_cost, return_pct, holding_seconds, fill_count,
                non_economic, related, decision_id, strategy_label, issues) ",
        );
        builder.push_values(chunk, |mut row, trade| {
            let m = metrics.get(&trade.id).cloned().unwrap_or_default();
            row.push_bind(user_id)
                .push_bind(trade.id.clone())
                .push_bind(trade.workspace_id)
                .push_bind(match trade.kind {
                    TradeKind::Single => "single",
                    TradeKind::Strategy => "strategy",
                })
                .push_bind(trade.parent_id.clone())
                .push_bind(trade.children.clone())
                .push_bind(trade.instrument_key.clone())
                .push_bind(serde_json::to_value(&trade.instrument).unwrap_or(Value::Null))
                .push_bind(text(&trade.instrument.asset_class))
                .push_bind(trade.instrument.symbol.clone())
                .push_bind(trade.underlying().to_owned())
                .push_bind(trade.direction.map(|d| text(&d)))
                .push_bind(text(&trade.status))
                .push_bind(trade.opened_at)
                .push_bind(trade.closed_at)
                .push_bind(m.max_quantity)
                .push_bind(m.open_quantity)
                .push_bind(m.avg_entry)
                .push_bind(m.avg_exit)
                .push_bind(m.gross)
                .push_bind(m.fees)
                .push_bind(m.net)
                .push_bind(trade.income)
                .push_bind(m.entry_cost)
                .push_bind(m.return_pct)
                .push_bind(m.holding_seconds)
                .push_bind(m.fill_count as i32)
                .push_bind(trade.non_economic())
                .push_bind(trade.related.clone())
                .push_bind(trade.decision_id)
                .push_bind(trade.strategy_label.clone())
                .push_bind(serde_json::to_value(&trade.issues).unwrap_or(Value::Null));
        });
        builder.build().execute(&mut *conn).await?;
    }
    Ok(())
}

async fn insert_fills(conn: &mut PgConnection, user_id: Uuid, trades: &[Trade]) -> Result<()> {
    let rows: Vec<(&Trade, usize, &super::model::TradeFill)> = trades
        .iter()
        .flat_map(|t| t.fills.iter().enumerate().map(move |(i, f)| (t, i, f)))
        .collect();
    for chunk in rows.chunks(CHUNK) {
        let mut builder: QueryBuilder<Postgres> = QueryBuilder::new(
            "INSERT INTO trade_fills (user_id, trade_id, seq, fill_key, role, executed_at, quantity, price, fee, derived) ",
        );
        builder.push_values(chunk, |mut row, (trade, seq, fill)| {
            row.push_bind(user_id)
                .push_bind(trade.id.clone())
                .push_bind(*seq as i32)
                .push_bind(fill.key.clone())
                .push_bind(fill.role.to_string())
                .push_bind(fill.at)
                .push_bind(fill.quantity)
                .push_bind(fill.price)
                .push_bind(fill.fee)
                .push_bind(fill.derived);
        });
        builder.build().execute(&mut *conn).await?;
    }
    Ok(())
}

async fn insert_lots(conn: &mut PgConnection, user_id: Uuid, trades: &[Trade]) -> Result<()> {
    let lots: Vec<(&Trade, &super::model::Lot)> = trades
        .iter()
        .flat_map(|t| t.lots.iter().map(move |l| (t, l)))
        .collect();
    for chunk in lots.chunks(CHUNK) {
        let mut builder: QueryBuilder<Postgres> = QueryBuilder::new(
            "INSERT INTO trade_lots (user_id, lot_id, trade_id, workspace_id, instrument_key, direction, opened_by,
                acquired_at, holding_from, original_quantity, quantity, cost_per_unit, fee_per_unit,
                tax_cost_adjustment, wash_basis_adjustment, cost_known) ",
        );
        builder.push_values(chunk, |mut row, (trade, lot)| {
            let wash: Decimal = lot.wash_adjustments.iter().map(|a| a.amount).sum();
            row.push_bind(user_id)
                .push_bind(lot.id.clone())
                .push_bind(trade.id.clone())
                .push_bind(trade.workspace_id)
                .push_bind(trade.instrument_key.clone())
                .push_bind(text(&lot.direction))
                .push_bind(lot.opened_by.clone())
                .push_bind(lot.acquired_at)
                .push_bind(lot.holding_from)
                .push_bind(lot.original_quantity)
                .push_bind(lot.quantity)
                .push_bind(lot.cost_per_unit)
                .push_bind(lot.fee_per_unit)
                .push_bind(lot.tax_cost_adjustment)
                .push_bind(wash)
                .push_bind(lot.cost_known);
        });
        builder.build().execute(&mut *conn).await?;
    }
    let closures: Vec<(&Trade, &super::model::Lot, usize, &super::model::Closure)> = trades
        .iter()
        .flat_map(|t| t.lots.iter().map(move |l| (t, l)))
        .flat_map(|(t, l)| {
            l.closures
                .iter()
                .enumerate()
                .map(move |(i, c)| (t, l, i, c))
        })
        .collect();
    for chunk in closures.chunks(CHUNK) {
        let mut builder: QueryBuilder<Postgres> = QueryBuilder::new(
            "INSERT INTO lot_closures (user_id, lot_id, seq, trade_id, workspace_id, instrument_key, symbol, direction,
                acquired_at, closed_by, closed_at, quantity, exit_price, fee, gross, kind, non_economic, tax_proceeds,
                tax_cost, tax_realized, wash_disallowed, wash_permanent, washed_into, term) ",
        );
        builder.push_values(chunk, |mut row, (trade, lot, seq, closure)| {
            let tax = closure.tax.as_ref();
            row.push_bind(user_id)
                .push_bind(lot.id.clone())
                .push_bind(*seq as i32)
                .push_bind(trade.id.clone())
                .push_bind(trade.workspace_id)
                .push_bind(trade.instrument_key.clone())
                .push_bind(trade.instrument.symbol.clone())
                .push_bind(text(&lot.direction))
                .push_bind(lot.acquired_at)
                .push_bind(closure.closed_by.clone())
                .push_bind(closure.closed_at)
                .push_bind(closure.quantity)
                .push_bind(closure.exit_price)
                .push_bind(closure.fee)
                .push_bind(closure.gross)
                .push_bind(text(&closure.kind))
                .push_bind(closure.non_economic)
                .push_bind(tax.map(|t| t.proceeds))
                .push_bind(tax.map(|t| t.cost))
                .push_bind(tax.map(|t| t.realized))
                .push_bind(tax.map(|t| t.wash_disallowed))
                .push_bind(tax.map(|t| t.wash_permanent))
                .push_bind(tax.map(|t| t.washed_into.clone()))
                .push_bind(tax.and_then(|t| t.term.map(|term| text(&term))));
        });
        builder.build().execute(&mut *conn).await?;
    }
    Ok(())
}

/// Replaces the user's engine output and reattaches the journal to it.
pub async fn write(
    conn: &mut PgConnection,
    user_id: Uuid,
    output: &EngineOutput,
    issues: &[super::model::Issue],
    duration_ms: i32,
) -> Result<()> {
    for table in ["lot_closures", "trade_lots", "trade_fills", "trades"] {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM {table} WHERE user_id = $1"
        )))
        .bind(user_id)
        .execute(&mut *conn)
        .await?;
    }
    let metrics = measure::all(&output.trades);
    insert_trades(conn, user_id, &output.trades, &metrics).await?;
    insert_fills(conn, user_id, &output.trades).await?;
    insert_lots(conn, user_id, &output.trades).await?;
    reattach_annotations(conn, user_id).await?;
    sqlx::query(
        "INSERT INTO trade_engine_state (user_id, engine_version, rebuilt_at, duration_ms, issues, decision_outcomes,
            alias_suggestions, strategy_suggestions, unattributed_income)
         VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO UPDATE SET engine_version = EXCLUDED.engine_version, rebuilt_at = EXCLUDED.rebuilt_at,
            duration_ms = EXCLUDED.duration_ms, issues = EXCLUDED.issues, decision_outcomes = EXCLUDED.decision_outcomes,
            alias_suggestions = EXCLUDED.alias_suggestions, strategy_suggestions = EXCLUDED.strategy_suggestions,
            unattributed_income = EXCLUDED.unattributed_income",
    )
    .bind(user_id)
    .bind(ENGINE_VERSION)
    .bind(duration_ms)
    .bind(serde_json::to_value(issues)?)
    .bind(serde_json::to_value(&output.decision_outcomes)?)
    .bind(serde_json::to_value(&output.alias_suggestions)?)
    .bind(serde_json::to_value(&output.strategy_suggestions)?)
    .bind(serde_json::json!(output
        .unattributed_income
        .iter()
        .map(|i| serde_json::json!({
            "workspaceId": i.workspace_id, "instrumentKey": i.instrument_key, "at": i.at, "amount": i.amount,
        }))
        .collect::<Vec<_>>()))
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// An annotation whose trade vanished follows its anchor fill to the trade
/// that now holds it; one that cannot be placed is kept as orphaned.
async fn reattach_annotations(conn: &mut PgConnection, user_id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE trade_annotations a SET orphaned_at = NULL
         WHERE a.user_id = $1 AND a.orphaned_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM trades t WHERE t.user_id = a.user_id AND t.id = a.trade_id)
           AND NOT EXISTS (SELECT 1 FROM trade_annotations o WHERE o.user_id = a.user_id AND o.trade_id = a.trade_id AND o.orphaned_at IS NULL)",
    )
    .bind(user_id)
    .execute(&mut *conn)
    .await?;
    let detached: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT a.id, a.anchor_fill_key FROM trade_annotations a
         WHERE a.user_id = $1 AND NOT EXISTS (SELECT 1 FROM trades t WHERE t.user_id = a.user_id AND t.id = a.trade_id)
         ORDER BY a.orphaned_at NULLS FIRST, a.updated_at DESC",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    for (id, anchor) in detached {
        let target: Option<String> = sqlx::query_scalar(
            "SELECT f.trade_id FROM trade_fills f JOIN trades t ON t.user_id = f.user_id AND t.id = f.trade_id
             WHERE f.user_id = $1 AND f.fill_key = $2
               AND NOT EXISTS (SELECT 1 FROM trade_annotations o WHERE o.user_id = $1 AND o.trade_id = f.trade_id AND o.orphaned_at IS NULL)
             ORDER BY t.opened_at LIMIT 1",
        )
        .bind(user_id)
        .bind(&anchor)
        .fetch_optional(&mut *conn)
        .await?;
        match target {
            Some(trade_id) => {
                sqlx::query(
                    "UPDATE trade_annotations SET trade_id = $2, orphaned_at = NULL WHERE id = $1",
                )
                .bind(id)
                .bind(trade_id)
                .execute(&mut *conn)
                .await?;
            }
            None => {
                sqlx::query("UPDATE trade_annotations SET orphaned_at = COALESCE(orphaned_at, now()) WHERE id = $1")
                    .bind(id)
                    .execute(&mut *conn)
                    .await?;
            }
        }
    }
    Ok(())
}
