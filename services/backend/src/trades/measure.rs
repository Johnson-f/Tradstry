use std::collections::{BTreeSet, HashMap};

use rust_decimal::Decimal;
use serde::Serialize;

use super::model::{FillRole, Trade, TradeKind, TradeStatus};

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Metrics {
    pub max_quantity: Decimal,
    pub open_quantity: Decimal,
    pub avg_entry: Option<Decimal>,
    pub avg_exit: Option<Decimal>,
    pub gross: Decimal,
    pub fees: Decimal,
    /// Realised so far for an open trade; unknown for an incomplete one.
    pub net: Option<Decimal>,
    pub return_pct: Option<Decimal>,
    pub holding_seconds: Option<i64>,
    pub fill_count: usize,
    pub entry_cost: Decimal,
}

fn is_entry(role: FillRole) -> bool {
    matches!(
        role,
        FillRole::Open | FillRole::Add | FillRole::FlipOpen | FillRole::TransferIn
    )
}

fn is_exit(role: FillRole) -> bool {
    matches!(
        role,
        FillRole::Reduce
            | FillRole::Close
            | FillRole::FlipClose
            | FillRole::Expire
            | FillRole::Assign
            | FillRole::Exercise
            | FillRole::TransferOut
            | FillRole::Orphan
    )
}

fn weighted(fills: impl Iterator<Item = (Decimal, Decimal)>) -> Option<Decimal> {
    let (value, quantity) = fills.fold(
        (Decimal::ZERO, Decimal::ZERO),
        |(v, q), (quantity, price)| (v + quantity * price, q + quantity),
    );
    (!quantity.is_zero()).then(|| value / quantity)
}

pub fn single(trade: &Trade) -> Metrics {
    let multiplier = trade.instrument.multiplier;
    let mut position = Decimal::ZERO;
    let mut max_quantity = Decimal::ZERO;
    for fill in &trade.fills {
        if is_entry(fill.role) || fill.role == FillRole::StockDividend {
            position += fill.quantity;
        } else if is_exit(fill.role) && fill.role != FillRole::Orphan {
            position -= fill.quantity;
        }
        max_quantity = max_quantity.max(position);
    }
    if trade.status == TradeStatus::Incomplete && max_quantity.is_zero() {
        max_quantity = trade.fills.iter().map(|f| f.quantity).sum();
    }
    let gross: Decimal = trade
        .lots
        .iter()
        .flat_map(|lot| &lot.closures)
        .map(|closure| closure.gross)
        .sum();
    let fees: Decimal = trade.fills.iter().map(|fill| fill.fee).sum();
    let entry_cost: Decimal = trade
        .fills
        .iter()
        .filter(|f| is_entry(f.role))
        .map(|f| f.quantity * f.price * multiplier)
        .sum();
    let net = (trade.status != TradeStatus::Incomplete).then(|| gross - fees);
    let return_pct = match (trade.status, net) {
        (TradeStatus::Closed, Some(net)) if !entry_cost.is_zero() => {
            Some((net / entry_cost * Decimal::ONE_HUNDRED).round_dp(4))
        }
        _ => None,
    };
    Metrics {
        max_quantity,
        open_quantity: trade.lots.iter().map(|lot| lot.quantity).sum(),
        avg_entry: weighted(
            trade
                .fills
                .iter()
                .filter(|f| is_entry(f.role))
                .map(|f| (f.quantity, f.price)),
        ),
        avg_exit: weighted(
            trade
                .fills
                .iter()
                .filter(|f| is_exit(f.role))
                .map(|f| (f.quantity, f.price)),
        ),
        gross,
        fees,
        net,
        return_pct,
        holding_seconds: trade
            .closed_at
            .filter(|_| trade.status != TradeStatus::Open)
            .map(|closed| (closed - trade.opened_at).num_seconds()),
        fill_count: trade
            .fills
            .iter()
            .map(|f| &f.key)
            .collect::<BTreeSet<_>>()
            .len(),
        entry_cost,
    }
}

/// A strategy's numbers are the sum of its legs'.
pub fn strategy(trade: &Trade, legs: &[&Metrics]) -> Metrics {
    let net = legs
        .iter()
        .try_fold(Decimal::ZERO, |sum, leg| leg.net.map(|net| sum + net));
    let entry_cost: Decimal = legs.iter().map(|leg| leg.entry_cost).sum();
    Metrics {
        max_quantity: legs
            .iter()
            .map(|l| l.max_quantity)
            .max()
            .unwrap_or_default(),
        open_quantity: legs.iter().map(|l| l.open_quantity).sum(),
        avg_entry: None,
        avg_exit: None,
        gross: legs.iter().map(|l| l.gross).sum(),
        fees: legs.iter().map(|l| l.fees).sum(),
        net,
        return_pct: match (trade.status, net) {
            (TradeStatus::Closed, Some(net)) if !entry_cost.is_zero() => {
                Some((net / entry_cost * Decimal::ONE_HUNDRED).round_dp(4))
            }
            _ => None,
        },
        holding_seconds: trade
            .closed_at
            .filter(|_| trade.status == TradeStatus::Closed)
            .map(|closed| (closed - trade.opened_at).num_seconds()),
        fill_count: legs.iter().map(|l| l.fill_count).sum(),
        entry_cost,
    }
}

/// Metrics for every trade, strategies included.
pub fn all(trades: &[Trade]) -> HashMap<String, Metrics> {
    let mut metrics: HashMap<String, Metrics> = trades
        .iter()
        .filter(|t| t.kind == TradeKind::Single)
        .map(|t| (t.id.clone(), single(t)))
        .collect();
    for trade in trades.iter().filter(|t| t.kind == TradeKind::Strategy) {
        let legs: Vec<&Metrics> = trade
            .children
            .iter()
            .filter_map(|id| metrics.get(id))
            .collect();
        let value = strategy(trade, &legs);
        metrics.insert(trade.id.clone(), value);
    }
    metrics
}

/// Unrealised P&L of the open lots at `price`.
pub fn unrealized(trade: &Trade, price: Decimal) -> Decimal {
    trade
        .lots
        .iter()
        .filter(|lot| lot.quantity > Decimal::ZERO)
        .map(|lot| {
            (price - lot.cost_per_unit)
                * lot.quantity
                * trade.instrument.multiplier
                * lot.direction.sign()
        })
        .sum()
}
