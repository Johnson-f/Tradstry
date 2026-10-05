use std::collections::VecDeque;

use anyhow::{Result, anyhow, ensure};
use rust_decimal::Decimal;

use crate::service::trade_review::types::{EpisodeDirection, FillRole, TradeEpisodeDraft};

pub(super) struct Results {
    pub entered: Decimal,
    pub entry_price: Decimal,
    pub exit_price: Option<Decimal>,
    pub realized: Decimal,
    pub fees: Decimal,
    pub percent: Option<Decimal>,
}

struct Lot {
    quantity: Decimal,
    price: Decimal,
    fee: Decimal,
}

pub(super) fn calculate(draft: &TradeEpisodeDraft) -> Result<Results> {
    let mut lots = VecDeque::<Lot>::new();
    let mut entered = Decimal::ZERO;
    let mut entry_cost = Decimal::ZERO;
    let mut exited = Decimal::ZERO;
    let mut exit_value = Decimal::ZERO;
    let mut realized = Decimal::ZERO;
    let mut fees = Decimal::ZERO;
    let sign = if draft.direction == EpisodeDirection::Long {
        Decimal::ONE
    } else {
        -Decimal::ONE
    };
    let multiplier = draft.instrument.multiplier();
    for fill in &draft.allocations {
        ensure!(
            fill.quantity > Decimal::ZERO && fill.price > Decimal::ZERO,
            "invalid execution allocation"
        );
        fees += fill.fee;
        match fill.role {
            FillRole::Entry => {
                entered += fill.quantity;
                entry_cost += fill.quantity * fill.price;
                lots.push_back(Lot {
                    quantity: fill.quantity,
                    price: fill.price,
                    fee: fill.fee,
                });
            }
            FillRole::Exit => {
                let mut remaining = fill.quantity;
                while remaining > Decimal::ZERO {
                    let lot = lots
                        .front_mut()
                        .ok_or_else(|| anyhow!("exit has no opening allocation"))?;
                    let quantity = remaining.min(lot.quantity);
                    let fee = if quantity == lot.quantity {
                        lot.fee
                    } else {
                        lot.fee * quantity / lot.quantity
                    };
                    realized += (fill.price - lot.price) * quantity * multiplier * sign - fee;
                    lot.quantity -= quantity;
                    lot.fee -= fee;
                    remaining -= quantity;
                    if lot.quantity == Decimal::ZERO {
                        lots.pop_front();
                    }
                }
                realized -= fill.fee;
                exited += fill.quantity;
                exit_value += fill.quantity * fill.price;
            }
        }
    }
    ensure!(entered > Decimal::ZERO, "trade has no opening quantity");
    ensure!(
        lots.iter().map(|lot| lot.quantity).sum::<Decimal>() == draft.current_quantity,
        "position quantity mismatch"
    );
    Ok(Results {
        entered,
        entry_price: entry_cost / entered,
        exit_price: if exited > Decimal::ZERO {
            Some(exit_value / exited)
        } else {
            None
        },
        realized,
        fees,
        percent: if draft.closed_at.is_some() {
            Some(realized / (entry_cost * multiplier) * Decimal::from(100))
        } else {
            None
        },
    })
}
