//! Statistics over closed trades. Every closed trade counts, journaled or not;
//! strategies count once (their legs do not), and transfers and trades with
//! missing history are left out. Days, weekdays, hours, sessions and months
//! are New York trading time.

mod behavior;
mod breakdowns;
mod common;
mod load;
mod model;
mod risk;
#[cfg(test)]
mod tests;

use rust_decimal::Decimal;

pub use load::stats;
pub use model::{
    BehaviorStats, Bucket, DayLoad, EdgeTacticCell, EquityPoint, MistakeCost, Outcome, PlanStats,
    StatTrade, Stats,
};

use crate::trades::measure::money;
use common::{average_seconds, is_loss, is_win, ratio};

/// Mean `return_pct` of the trades that have one, always to two decimals.
fn average_return(trades: &[&StatTrade]) -> Option<Decimal> {
    let returns: Vec<Decimal> = trades.iter().filter_map(|t| t.return_pct).collect();
    ratio(returns.iter().copied().sum(), Decimal::from(returns.len())).map(money)
}

pub fn compute(trades: Vec<StatTrade>) -> Stats {
    compute_with(trades, Decimal::ZERO)
}

/// Statistics where a trade whose net is within `breakeven_band` dollars of
/// zero counts as breakeven rather than a win or a loss. Gross profit and loss
/// still follow the sign of each trade's net, so together they equal net P&L.
pub fn compute_with(mut trades: Vec<StatTrade>, breakeven_band: Decimal) -> Stats {
    trades.sort_by_key(|t| t.closed_at);
    for trade in &mut trades {
        trade.outcome = if trade.net > breakeven_band {
            Outcome::Win
        } else if trade.net < -breakeven_band {
            Outcome::Loss
        } else {
            Outcome::Even
        };
    }
    let wins: Vec<&StatTrade> = trades.iter().filter(|t| is_win(t)).collect();
    let losses: Vec<&StatTrade> = trades.iter().filter(|t| is_loss(t)).collect();
    let gross_profit: Decimal = trades
        .iter()
        .map(|t| t.net)
        .filter(|n| *n > Decimal::ZERO)
        .sum();
    let gross_loss: Decimal = trades
        .iter()
        .map(|t| t.net)
        .filter(|n| *n < Decimal::ZERO)
        .sum();
    let win_total: Decimal = wins.iter().map(|t| t.net).sum();
    let loss_total: Decimal = losses.iter().map(|t| t.net).sum();
    let net: Decimal = trades.iter().map(|t| t.net).sum();
    let r: Vec<Decimal> = trades.iter().filter_map(|t| t.r).collect();
    let equity = risk::equity(&trades);
    let (longest_win_streak, longest_loss_streak, current_streak) = risk::streaks(&trades);

    Stats {
        trades: trades.len(),
        wins: wins.len(),
        losses: losses.len(),
        breakeven: trades.len() - wins.len() - losses.len(),
        win_rate: ratio(
            Decimal::from(wins.len()),
            Decimal::from(wins.len() + losses.len()),
        ),
        net: money(net),
        gross_profit: money(gross_profit),
        gross_loss: money(gross_loss),
        average_win: ratio(win_total, Decimal::from(wins.len())).map(money),
        average_loss: ratio(loss_total, Decimal::from(losses.len())).map(money),
        average_win_pct: average_return(&wins),
        average_loss_pct: average_return(&losses),
        largest_win: wins.iter().map(|t| t.net).max().map(money),
        largest_loss: losses.iter().map(|t| t.net).min().map(money),
        profit_factor: ratio(gross_profit, gross_loss.abs()),
        expectancy: ratio(net, Decimal::from(trades.len())).map(money),
        expectancy_r: ratio(r.iter().copied().sum(), Decimal::from(r.len())),
        r_trades: r.len(),
        sqn: risk::sqn(&r),
        recovery_factor: ratio(net, equity.max_drawdown).map(|value| value.round_dp(2)),
        average_hold_seconds: average_seconds(trades.iter()),
        average_win_hold_seconds: average_seconds(wins.iter().copied()),
        average_loss_hold_seconds: average_seconds(losses.iter().copied()),
        max_drawdown: equity.max_drawdown,
        current_drawdown: equity.current_drawdown,
        longest_win_streak,
        longest_loss_streak,
        current_streak,
        equity: equity.points,
        by_symbol: breakdowns::by_count(&trades, |t| t.symbol.clone()),
        by_direction: breakdowns::by_count(&trades, |t| {
            t.direction.clone().unwrap_or_else(|| "strategy".into())
        }),
        by_weekday: breakdowns::in_order(&trades, &breakdowns::WEEKDAYS, breakdowns::weekday),
        by_hour: breakdowns::by_key(&trades, breakdowns::hour),
        by_session: breakdowns::in_order(&trades, &breakdowns::SESSIONS, breakdowns::session),
        by_month: breakdowns::by_key(&trades, breakdowns::month),
        by_hold: breakdowns::in_order(&trades, &breakdowns::HOLDS, breakdowns::hold),
        by_size: breakdowns::in_order(&trades, &breakdowns::SIZES, breakdowns::size),
        r_distribution: risk::r_distribution(&trades),
        by_edge: breakdowns::by_label(&trades, true, |t| t.edges.clone()),
        by_entry_tactic: breakdowns::by_label(&trades, true, |t| t.entry_tactics.clone()),
        by_tag: breakdowns::by_label(&trades, false, |t| t.tags.clone()),
        by_mistake: breakdowns::by_label(&trades, false, |t| t.mistakes.clone()),
        edge_tactic: breakdowns::edge_tactic(&trades),
        mistake_costs: behavior::mistake_costs(&trades),
        by_discipline: behavior::by_discipline(&trades),
        by_previous_trade: behavior::by_previous_trade(&trades),
        trades_per_day: behavior::trades_per_day(&trades),
        behavior: behavior::self_review(&trades),
        plans: behavior::plans(&trades),
        untagged: trades.iter().filter(|t| t.edges.is_empty()).count(),
    }
}
