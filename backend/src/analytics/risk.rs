//! Equity, drawdown, streaks and the spread of R-multiples.

use std::collections::BTreeMap;

use chrono::NaiveDate;
use rust_decimal::{
    Decimal,
    prelude::{FromPrimitive, ToPrimitive},
};

use super::{
    common::{bucket, is_loss, is_win, market},
    model::{Bucket, EquityPoint, StatTrade},
};
use crate::trades::measure::money;

pub(super) struct Equity {
    pub points: Vec<EquityPoint>,
    pub max_drawdown: Decimal,
    pub current_drawdown: Decimal,
}

/// Daily closed P&L and its running total. The peak starts at zero, so a
/// losing first day already counts as drawdown.
pub(super) fn equity(trades: &[StatTrade]) -> Equity {
    let mut daily: BTreeMap<NaiveDate, Vec<&StatTrade>> = BTreeMap::new();
    for trade in trades {
        daily
            .entry(market(trade.closed_at).date_naive())
            .or_default()
            .push(trade);
    }
    let (mut cumulative, mut peak, mut max_drawdown) =
        (Decimal::ZERO, Decimal::ZERO, Decimal::ZERO);
    let points = daily
        .into_iter()
        .map(|(day, closed)| {
            let value: Decimal = closed.iter().map(|t| t.net).sum();
            cumulative += value;
            peak = peak.max(cumulative);
            max_drawdown = max_drawdown.max(peak - cumulative);
            EquityPoint {
                day,
                net: money(value),
                cumulative: money(cumulative),
                trades: closed.len(),
                wins: closed.iter().filter(|t| is_win(t)).count(),
                losses: closed.iter().filter(|t| is_loss(t)).count(),
            }
        })
        .collect();
    Equity {
        points,
        max_drawdown: money(max_drawdown),
        current_drawdown: money(peak - cumulative),
    }
}

/// Longest winning run, longest losing run, and the run in progress (positive
/// for wins, negative for losses). Breakeven trades leave a run unbroken.
pub(super) fn streaks(trades: &[StatTrade]) -> (usize, usize, i64) {
    let (mut longest_win, mut longest_loss, mut streak) = (0usize, 0usize, 0i64);
    for trade in trades {
        if is_win(trade) {
            streak = if streak > 0 { streak + 1 } else { 1 };
        } else if is_loss(trade) {
            streak = if streak < 0 { streak - 1 } else { -1 };
        }
        if streak > 0 {
            longest_win = longest_win.max(streak as usize);
        } else {
            longest_loss = longest_loss.max(streak.unsigned_abs() as usize);
        }
    }
    (longest_win, longest_loss, streak)
}

/// R ranges, lowest first; each includes its lower bound.
pub(super) const R_RANGES: [(&str, Option<i64>, Option<i64>); 7] = [
    ("Below −2R", None, Some(-2)),
    ("−2R to −1R", Some(-2), Some(-1)),
    ("−1R to 0R", Some(-1), Some(0)),
    ("0R to 1R", Some(0), Some(1)),
    ("1R to 2R", Some(1), Some(2)),
    ("2R to 3R", Some(2), Some(3)),
    ("3R and above", Some(3), None),
];

pub(super) fn r_distribution(trades: &[StatTrade]) -> Vec<Bucket> {
    R_RANGES
        .iter()
        .map(|(key, low, high)| {
            let members: Vec<&StatTrade> = trades
                .iter()
                .filter(|t| {
                    t.r.is_some_and(|r| {
                        low.is_none_or(|low| r >= Decimal::from(low))
                            && high.is_none_or(|high| r < Decimal::from(high))
                    })
                })
                .collect();
            bucket(*key, &members)
        })
        .collect()
}

/// √n × mean ÷ sample standard deviation; needs two R values that differ.
pub(super) fn sqn(r: &[Decimal]) -> Option<Decimal> {
    if r.len() < 2 {
        return None;
    }
    let values: Vec<f64> = r.iter().filter_map(|value| value.to_f64()).collect();
    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;
    let variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let deviation = variance.sqrt();
    if deviation == 0.0 || !deviation.is_finite() {
        return None;
    }
    Decimal::from_f64(n.sqrt() * mean / deviation).map(|value| value.round_dp(2))
}
