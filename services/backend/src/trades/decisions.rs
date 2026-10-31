//! User decisions replayed over the engine's baseline trades. Decisions never
//! edit fills; they regroup trades, and record whether they still apply.

use std::collections::{BTreeSet, HashSet};

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::ids;
use super::model::{FillRole, Instrument, Trade, TradeFill, TradeKind, TradeStatus};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DecisionKind {
    Merge {
        trade_ids: Vec<String>,
    },
    Split {
        trade_id: String,
        at_fill: String,
    },
    CombineLegs {
        trade_ids: Vec<String>,
        label: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Decision {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub kind: DecisionKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeStatus {
    Applied,
    /// A trade it names no longer exists, e.g. after fills were corrected.
    Stale,
    Conflict,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DecisionOutcome {
    pub decision_id: Uuid,
    pub status: OutcomeStatus,
    pub code: Option<String>,
    pub trade_ids: Vec<String>,
}

fn outcome(
    decision: &Decision,
    status: OutcomeStatus,
    code: Option<&str>,
    trade_ids: Vec<String>,
) -> DecisionOutcome {
    DecisionOutcome {
        decision_id: decision.id,
        status,
        code: code.map(str::to_owned),
        trade_ids,
    }
}

fn status_of(parts: &[&Trade]) -> TradeStatus {
    if parts.iter().any(|t| t.status == TradeStatus::Open) {
        TradeStatus::Open
    } else if parts.iter().any(|t| t.status == TradeStatus::Incomplete) {
        TradeStatus::Incomplete
    } else {
        TradeStatus::Closed
    }
}

struct Replay<'a> {
    trades: &'a mut Vec<Trade>,
    consumed: HashSet<String>,
}

impl Replay<'_> {
    /// Finds every named trade, or says why it cannot.
    fn take(
        &self,
        decision: &Decision,
        ids: &[String],
    ) -> Result<Vec<usize>, (OutcomeStatus, &'static str)> {
        let unique: BTreeSet<&String> = ids.iter().collect();
        if unique.len() != ids.len() {
            return Err((OutcomeStatus::Conflict, "duplicate_trade"));
        }
        ids.iter()
            .map(|id| match self.trades.iter().position(|t| &t.id == id) {
                Some(index) if self.trades[index].workspace_id != decision.workspace_id => {
                    Err((OutcomeStatus::Conflict, "wrong_workspace"))
                }
                Some(index) => Ok(index),
                None if self.consumed.contains(id) => {
                    Err((OutcomeStatus::Conflict, "trade_already_regrouped"))
                }
                None => Err((OutcomeStatus::Stale, "trade_missing")),
            })
            .collect()
    }

    fn remove(&mut self, mut indexes: Vec<usize>) -> Vec<Trade> {
        indexes.sort_unstable();
        let mut removed: Vec<Trade> = indexes
            .into_iter()
            .rev()
            .map(|index| self.trades.remove(index))
            .collect();
        removed.reverse();
        for trade in &removed {
            self.consumed.insert(trade.id.clone());
        }
        removed
    }

    fn merge(&mut self, decision: &Decision, ids: &[String]) -> DecisionOutcome {
        if ids.len() < 2 {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("needs_two_trades"),
                vec![],
            );
        }
        let indexes = match self.take(decision, ids) {
            Ok(indexes) => indexes,
            Err((status, code)) => return outcome(decision, status, Some(code), vec![]),
        };
        let first = &self.trades[indexes[0]];
        let compatible = indexes.iter().all(|&i| {
            let t = &self.trades[i];
            t.kind == TradeKind::Single
                && t.parent_id.is_none()
                && t.instrument_key == first.instrument_key
                && t.direction == first.direction
        });
        if !compatible {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("trades_not_compatible"),
                vec![],
            );
        }
        let parts = self.remove(indexes);
        let refs: Vec<&Trade> = parts.iter().collect();
        let status = status_of(&refs);
        let mut merged = parts[0].clone();
        merged.id = ids::from_decision(decision.id, 0);
        merged.decision_id = Some(decision.id);
        merged.status = status;
        merged.opened_at = parts.iter().map(|t| t.opened_at).min().expect("two parts");
        merged.closed_at = if status == TradeStatus::Open {
            None
        } else {
            parts.iter().filter_map(|t| t.closed_at).max()
        };
        merged.fills = parts.iter().flat_map(|t| t.fills.clone()).collect();
        merged.fills.sort_by_key(|f| f.at);
        merged.lots = parts.iter().flat_map(|t| t.lots.clone()).collect();
        merged.income = parts.iter().map(|t| t.income).sum();
        merged.issues = parts.iter().flat_map(|t| t.issues.clone()).collect();
        merged.related = parts
            .iter()
            .flat_map(|t| t.related.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let id = merged.id.clone();
        self.trades.push(merged);
        outcome(decision, OutcomeStatus::Applied, None, vec![id])
    }

    fn split(&mut self, decision: &Decision, trade_id: &str, at_fill: &str) -> DecisionOutcome {
        let index = match self.take(decision, &[trade_id.to_owned()]) {
            Ok(indexes) => indexes[0],
            Err((status, code)) => return outcome(decision, status, Some(code), vec![]),
        };
        let trade = &self.trades[index];
        if trade.kind != TradeKind::Single || trade.parent_id.is_some() {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("trade_not_splittable"),
                vec![],
            );
        }
        let Some(position) = trade.fills.iter().position(|f| f.key == at_fill) else {
            return outcome(decision, OutcomeStatus::Stale, Some("fill_missing"), vec![]);
        };
        if position == 0 {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("split_at_first_fill"),
                vec![],
            );
        }
        if trade.fills[position].role != FillRole::Add {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("split_not_at_entry"),
                vec![],
            );
        }
        let earlier: HashSet<String> = trade.fills[..position]
            .iter()
            .map(|f| f.key.clone())
            .collect();
        let original = self.remove(vec![index]).remove(0);
        let (lots_a, lots_b): (Vec<_>, Vec<_>) = original
            .lots
            .iter()
            .cloned()
            .partition(|lot| earlier.contains(lot.opened_by.as_str()));
        let part = |lots: Vec<super::model::Lot>, n: usize| -> Trade {
            let opening: HashSet<&str> = lots.iter().map(|l| l.opened_by.as_str()).collect();
            let mut fills: Vec<TradeFill> = Vec::new();
            for fill in &original.fills {
                match fill.role {
                    FillRole::Open
                    | FillRole::Add
                    | FillRole::FlipOpen
                    | FillRole::TransferIn
                    | FillRole::StockDividend => {
                        if opening.contains(fill.key.as_str()) {
                            fills.push(fill.clone());
                        }
                    }
                    FillRole::Split => fills.push(fill.clone()),
                    _ => {
                        let quantity: Decimal = lots
                            .iter()
                            .flat_map(|l| &l.closures)
                            .filter(|c| c.closed_by == fill.key)
                            .map(|c| c.quantity)
                            .sum();
                        if !quantity.is_zero() {
                            let mut share = fill.clone();
                            share.fee = fill.fee * quantity / fill.quantity;
                            share.quantity = quantity;
                            fills.push(share);
                        }
                    }
                }
            }
            let open: Decimal = lots.iter().map(|l| l.quantity).sum();
            let status = if !open.is_zero() {
                TradeStatus::Open
            } else if lots.iter().all(|l| l.cost_known) {
                TradeStatus::Closed
            } else {
                TradeStatus::Incomplete
            };
            let closed_at = (status != TradeStatus::Open)
                .then(|| {
                    lots.iter()
                        .flat_map(|l| &l.closures)
                        .map(|c| c.closed_at)
                        .max()
                })
                .flatten();
            Trade {
                id: ids::from_decision(decision.id, n),
                status,
                opened_at: fills.first().map_or(original.opened_at, |f| f.at),
                closed_at,
                fills,
                lots,
                income: if n == 0 {
                    original.income
                } else {
                    Decimal::ZERO
                },
                decision_id: Some(decision.id),
                ..original.clone()
            }
        };
        let a = part(lots_a, 0);
        let b = part(lots_b, 1);
        let ids = vec![a.id.clone(), b.id.clone()];
        self.trades.push(a);
        self.trades.push(b);
        outcome(decision, OutcomeStatus::Applied, None, ids)
    }

    fn combine(
        &mut self,
        decision: &Decision,
        ids: &[String],
        label: Option<&str>,
    ) -> DecisionOutcome {
        if ids.len() < 2 {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("needs_two_trades"),
                vec![],
            );
        }
        let indexes = match self.take(decision, ids) {
            Ok(indexes) => indexes,
            Err((status, code)) => return outcome(decision, status, Some(code), vec![]),
        };
        let underlying = self.trades[indexes[0]].underlying().to_owned();
        let compatible = indexes.iter().all(|&i| {
            let t = &self.trades[i];
            t.kind == TradeKind::Single && t.parent_id.is_none() && t.underlying() == underlying
        });
        if !compatible {
            return outcome(
                decision,
                OutcomeStatus::Conflict,
                Some("legs_not_compatible"),
                vec![],
            );
        }
        let parent_id = ids::from_decision(decision.id, 0);
        let legs: Vec<&Trade> = indexes.iter().map(|&i| &self.trades[i]).collect();
        let status = status_of(&legs);
        let parent = Trade {
            id: parent_id.clone(),
            kind: TradeKind::Strategy,
            workspace_id: decision.workspace_id,
            instrument_key: format!("strategy:{underlying}"),
            instrument: Instrument::stock(&underlying),
            direction: None,
            status,
            opened_at: legs.iter().map(|t| t.opened_at).min().expect("two legs"),
            closed_at: if status == TradeStatus::Open {
                None
            } else {
                legs.iter().filter_map(|t| t.closed_at).max()
            },
            fills: Vec::new(),
            lots: Vec::new(),
            income: legs.iter().map(|t| t.income).sum(),
            parent_id: None,
            children: ids.to_vec(),
            related: Vec::new(),
            decision_id: Some(decision.id),
            strategy_label: label.map(str::to_owned),
            issues: Vec::new(),
        };
        for &index in &indexes {
            self.trades[index].parent_id = Some(parent_id.clone());
        }
        self.trades.push(parent);
        outcome(decision, OutcomeStatus::Applied, None, vec![parent_id])
    }
}

/// Merges and splits first, in the order they were made, then strategies.
pub fn apply(trades: &mut Vec<Trade>, decisions: &[Decision]) -> Vec<DecisionOutcome> {
    let mut ordered: Vec<&Decision> = decisions.iter().collect();
    ordered.sort_by_key(|d| {
        (
            matches!(d.kind, DecisionKind::CombineLegs { .. }),
            d.created_at,
            d.id,
        )
    });
    let mut replay = Replay {
        trades,
        consumed: HashSet::new(),
    };
    ordered
        .into_iter()
        .map(|decision| match &decision.kind {
            DecisionKind::Merge { trade_ids } => replay.merge(decision, trade_ids),
            DecisionKind::Split { trade_id, at_fill } => replay.split(decision, trade_id, at_fill),
            DecisionKind::CombineLegs { trade_ids, label } => {
                replay.combine(decision, trade_ids, label.as_deref())
            }
        })
        .collect()
}
