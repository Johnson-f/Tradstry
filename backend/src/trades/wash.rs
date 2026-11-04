//! Tax figures for every lot closure, with wash sales (IRC §1091) across all
//! of a user's workspaces. An estimate, not tax advice: "substantially
//! identical" is matched as the same instrument key after aliases.
//!
//! Rules applied:
//! - A loss closure in a taxable workspace is washed by purchases of the same
//!   instrument, in the same direction, made 30 days either side of it, in any
//!   workspace. Each purchased share replaces at most one washed share.
//! - A purchase before the sale counts only while it is still held then.
//! - The disallowed loss joins the replacement's basis, along with the washed
//!   lot's holding period. A replacement in an IRA loses it permanently.
//! - Sheltered workspaces report nothing.

use std::collections::HashMap;

use chrono::{Duration, Months};
use rust_decimal::Decimal;
use uuid::Uuid;

use super::model::{
    Direction, Issue, Lot, Severity, TaxDetail, TaxStatus, Term, Trade, WashAdjustment,
    WorkspaceInfo,
};

#[derive(Clone, Copy)]
struct ClosureRef {
    trade: usize,
    lot: usize,
    closure: usize,
}

fn window() -> Duration {
    Duration::days(30)
}

/// Shares of the lot still held at `at`.
fn held_at(lot: &Lot, at: chrono::DateTime<chrono::Utc>) -> Decimal {
    if lot.acquired_at > at {
        return Decimal::ZERO;
    }
    let closed_before: Decimal = lot
        .closures
        .iter()
        .filter(|c| c.closed_at < at)
        .map(|c| c.quantity)
        .sum();
    (lot.original_quantity - closed_before).max(Decimal::ZERO)
}

pub fn apply(trades: &mut [Trade], workspaces: &HashMap<Uuid, WorkspaceInfo>) -> Vec<Issue> {
    let mut issues = Vec::new();
    let taxable = |id: &Uuid| {
        workspaces
            .get(id)
            .is_none_or(|w| w.tax == TaxStatus::Taxable)
    };
    let is_ira = |id: &Uuid| workspaces.get(id).is_some_and(|w| w.is_ira);

    let mut closures: Vec<ClosureRef> = Vec::new();
    for (t, trade) in trades.iter().enumerate() {
        for (l, lot) in trade.lots.iter().enumerate() {
            for (c, _) in lot.closures.iter().enumerate() {
                closures.push(ClosureRef {
                    trade: t,
                    lot: l,
                    closure: c,
                });
            }
        }
    }
    closures.sort_by(|a, b| {
        let ca = &trades[a.trade].lots[a.lot].closures[a.closure];
        let cb = &trades[b.trade].lots[b.lot].closures[b.closure];
        (ca.closed_at, &trades[a.trade].lots[a.lot].id, a.closure).cmp(&(
            cb.closed_at,
            &trades[b.trade].lots[b.lot].id,
            b.closure,
        ))
    });
    let mut replaceable: HashMap<(usize, usize), Decimal> = HashMap::new();
    for (t, trade) in trades.iter().enumerate() {
        for (l, lot) in trade.lots.iter().enumerate() {
            if lot.purchase {
                replaceable.insert((t, l), lot.original_quantity);
            }
        }
    }

    for reference in closures {
        let trade = &trades[reference.trade];
        let workspace_id = trade.workspace_id;
        let multiplier = trade.instrument.multiplier;
        let instrument_key = trade.instrument_key.clone();
        let lot = &trade.lots[reference.lot];
        let closure = &lot.closures[reference.closure];
        if !taxable(&workspace_id) || closure.non_economic || closure.tax_folded {
            continue;
        }
        let quantity = closure.quantity;
        let closed_at = closure.closed_at;
        let direction = lot.direction;
        let lot_id = lot.id.clone();
        let closure_id = lot.closure_id(reference.closure);

        let lot = &mut trades[reference.trade].lots[reference.lot];
        let mut wash_basis = Decimal::ZERO;
        let mut holding_from = lot.holding_from;
        let mut needed = quantity;
        for adjustment in lot
            .wash_adjustments
            .iter_mut()
            .filter(|a| a.quantity > Decimal::ZERO)
        {
            if needed.is_zero() {
                break;
            }
            let take = needed.min(adjustment.quantity);
            let amount = adjustment.amount * take / adjustment.quantity;
            adjustment.amount -= amount;
            adjustment.quantity -= take;
            needed -= take;
            wash_basis += amount;
            holding_from = holding_from.min(adjustment.holding_from);
        }
        let closure = &lot.closures[reference.closure];
        let (proceeds, cost) = match direction {
            Direction::Long => (
                quantity * (closure.exit_price + closure.tax_proceeds_adjustment) * multiplier
                    - closure.fee,
                quantity * (lot.cost_per_unit + lot.tax_cost_adjustment) * multiplier
                    + lot.fee_per_unit * quantity
                    + wash_basis,
            ),
            Direction::Short => (
                quantity * lot.cost_per_unit * multiplier - lot.fee_per_unit * quantity,
                quantity * closure.exit_price * multiplier + closure.fee + wash_basis,
            ),
        };
        let realized = proceeds - cost;
        let term = match direction {
            Direction::Short => Term::Short,
            Direction::Long => {
                let anniversary = holding_from
                    .checked_add_months(Months::new(12))
                    .unwrap_or(holding_from);
                if closed_at > anniversary {
                    Term::Long
                } else {
                    Term::Short
                }
            }
        };
        let mut detail = TaxDetail {
            proceeds,
            cost,
            realized,
            term: Some(term),
            ..TaxDetail::default()
        };

        if realized < Decimal::ZERO {
            let mut candidates: Vec<(usize, usize)> = replaceable
                .iter()
                .filter(|(_, left)| **left > Decimal::ZERO)
                .map(|(key, _)| *key)
                .filter(|&(t, l)| {
                    let candidate = &trades[t].lots[l];
                    trades[t].instrument_key == instrument_key
                        && candidate.direction == direction
                        && candidate.id != lot_id
                        && candidate.acquired_at >= closed_at - window()
                        && candidate.acquired_at <= closed_at + window()
                        && (candidate.acquired_at > closed_at
                            || held_at(candidate, closed_at) > Decimal::ZERO)
                })
                .collect();
            candidates.sort_by(|a, b| {
                let la = &trades[a.0].lots[a.1];
                let lb = &trades[b.0].lots[b.1];
                (la.acquired_at, &la.id).cmp(&(lb.acquired_at, &lb.id))
            });
            let loss = -realized;
            let mut unmatched = quantity;
            for (t, l) in candidates {
                if unmatched.is_zero() {
                    break;
                }
                let available = {
                    let candidate = &trades[t].lots[l];
                    let left = replaceable[&(t, l)];
                    if candidate.acquired_at > closed_at {
                        left
                    } else {
                        left.min(held_at(candidate, closed_at))
                    }
                };
                let left = replaceable
                    .get_mut(&(t, l))
                    .expect("candidate is replaceable");
                let take = unmatched.min(available);
                if take.is_zero() {
                    continue;
                }
                *left -= take;
                unmatched -= take;
                let disallowed = loss * take / quantity;
                detail.wash_disallowed += disallowed;
                let replacement_workspace = trades[t].workspace_id;
                let replacement = &mut trades[t].lots[l];
                detail.washed_into.push(replacement.id.clone());
                if is_ira(&replacement_workspace) {
                    detail.wash_permanent = true;
                } else {
                    replacement.wash_adjustments.push(WashAdjustment {
                        quantity: take,
                        amount: disallowed,
                        holding_from,
                        from_closure: closure_id.clone(),
                    });
                }
            }
            if trades[reference.trade].instrument.option.is_none() {
                let underlying = trades[reference.trade].instrument.symbol.clone();
                let option_nearby = trades.iter().any(|t| {
                    t.instrument
                        .option
                        .as_ref()
                        .is_some_and(|o| o.underlying == underlying)
                        && t.lots.iter().any(|l| {
                            l.purchase
                                && l.acquired_at >= closed_at - window()
                                && l.acquired_at <= closed_at + window()
                        })
                });
                if option_nearby {
                    issues.push(
                        Issue::new(
                            "possible_option_wash_sale",
                            Severity::Info,
                            format!("Options on {underlying} were opened within 30 days of a loss; the IRS may treat them as substantially identical"),
                        )
                        .workspace(workspace_id)
                        .instrument(&instrument_key),
                    );
                }
            }
        }
        trades[reference.trade].lots[reference.lot].closures[reference.closure].tax = Some(detail);
    }
    issues
}
