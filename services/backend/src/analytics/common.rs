use chrono::{DateTime, Utc};
use chrono_tz::{America::New_York, Tz};
use rust_decimal::Decimal;

use super::model::{Bucket, Outcome, StatTrade};
use crate::trades::measure::money;

/// US trading days, sessions and months are dated in New York.
pub(super) fn market(instant: DateTime<Utc>) -> DateTime<Tz> {
    instant.with_timezone(&New_York)
}

pub(super) fn ratio(numerator: Decimal, denominator: Decimal) -> Option<Decimal> {
    (!denominator.is_zero()).then(|| (numerator / denominator).round_dp(4))
}

pub(super) fn is_win(trade: &StatTrade) -> bool {
    trade.outcome == Outcome::Win
}

pub(super) fn is_loss(trade: &StatTrade) -> bool {
    trade.outcome == Outcome::Loss
}

pub(super) fn expectancy(trades: &[&StatTrade]) -> Option<Decimal> {
    ratio(
        trades.iter().map(|t| t.net).sum(),
        Decimal::from(trades.len()),
    )
    .map(money)
}

pub(super) fn expectancy_r(trades: &[&StatTrade]) -> Option<Decimal> {
    let r: Vec<Decimal> = trades.iter().filter_map(|t| t.r).collect();
    ratio(r.iter().copied().sum(), Decimal::from(r.len()))
}

pub(super) fn average_seconds<'a>(trades: impl Iterator<Item = &'a StatTrade>) -> Option<i64> {
    let held: Vec<i64> = trades.map(|t| t.holding_seconds).collect();
    (!held.is_empty()).then(|| held.iter().sum::<i64>() / held.len() as i64)
}

pub(super) fn bucket(key: impl Into<String>, trades: &[&StatTrade]) -> Bucket {
    let wins = trades.iter().filter(|t| is_win(t)).count();
    let losses = trades.iter().filter(|t| is_loss(t)).count();
    Bucket {
        key: key.into(),
        label_id: None,
        color: None,
        trades: trades.len(),
        wins,
        losses,
        net: money(trades.iter().map(|t| t.net).sum()),
        win_rate: ratio(Decimal::from(wins), Decimal::from(wins + losses)),
        expectancy: expectancy(trades),
        expectancy_r: expectancy_r(trades),
    }
}
