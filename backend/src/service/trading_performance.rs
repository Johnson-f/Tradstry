use std::collections::{BTreeMap, HashMap};

use anyhow::{Result, anyhow, ensure};
use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::service::db::schema::tables::journal_table::JournalEntry;
use crate::service::db::schema::tables::trade_review_table::StoredEpisode;
use crate::service::read_service::trade_set::{self, TradeSet};
use crate::service::trade_review::types::{ExecutionInstrument, PlanSnapshot};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PerformanceBreakdown {
    pub key: String,
    pub net_pnl: f64,
    pub win_rate: f64,
    pub trade_count: usize,
}

#[derive(Debug, Clone, Default)]
struct BreakdownAccumulator {
    net_pnl: Decimal,
    wins: usize,
    breakevens: usize,
    losses: usize,
}

impl BreakdownAccumulator {
    fn record(&mut self, pnl: Decimal) {
        self.net_pnl += pnl;
        if pnl > Decimal::ZERO {
            self.wins += 1;
        } else if pnl < Decimal::ZERO {
            self.losses += 1;
        } else {
            self.breakevens += 1;
        }
    }

    fn finish(self, key: String) -> PerformanceBreakdown {
        let decisive = self.wins + self.losses;
        PerformanceBreakdown {
            key,
            net_pnl: self.net_pnl.to_f64().unwrap_or_default(),
            win_rate: if decisive > 0 {
                self.wins as f64 / decisive as f64 * 100.0
            } else {
                0.0
            },
            trade_count: self.wins + self.breakevens + self.losses,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TradingPerformancePoint {
    pub date: String,
    pub daily_pnl: f64,
    pub cumulative_pnl: f64,
    pub drawdown: f64,
    pub closed_trade_count: usize,
    pub winning_trade_count: usize,
    pub breakeven_trade_count: usize,
    pub losing_trade_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalendarDaySummary {
    pub date: String,
    pub profit: f64,
    pub trade_count: usize,
    pub win_rate: f64,
    pub winning_trade_count: usize,
    pub breakeven_trade_count: usize,
    pub losing_trade_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalendarWeekSummary {
    pub week_index: usize,
    pub week_start: String,
    pub week_end: String,
    pub profit: f64,
    pub trade_count: usize,
    pub trading_days: usize,
    pub win_rate: f64,
    pub winning_trade_count: usize,
    pub breakeven_trade_count: usize,
    pub losing_trade_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TradingCalendar {
    pub year: i32,
    pub month: u32,
    pub month_profit: f64,
    pub trade_count: usize,
    pub trading_days: usize,
    pub win_rate: f64,
    pub winning_trade_count: usize,
    pub breakeven_trade_count: usize,
    pub losing_trade_count: usize,
    pub grid_start: String,
    pub grid_end: String,
    pub days: Vec<CalendarDaySummary>,
    pub weeks: Vec<CalendarWeekSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TradingPerformance {
    pub total_realized_pnl: f64,
    pub gross_profit: f64,
    pub gross_loss: f64,
    pub average_win: f64,
    pub average_loss: f64,
    pub profit_factor: Option<f64>,
    pub win_rate: f64,
    pub closed_trade_count: usize,
    pub winning_trade_count: usize,
    pub breakeven_trade_count: usize,
    pub losing_trade_count: usize,
    pub average_realized_r: Option<f64>,
    pub risk_defined_trade_count: usize,
    pub open_position_count: usize,
    pub needs_review_count: usize,
    pub peak_realized_pnl: f64,
    pub current_drawdown: f64,
    pub max_drawdown: f64,
    pub current_streak: i32,
    pub longest_loss_streak: usize,
    pub best_symbol: Option<PerformanceBreakdown>,
    pub worst_symbol: Option<PerformanceBreakdown>,
    pub best_day: Option<PerformanceBreakdown>,
    pub worst_day: Option<PerformanceBreakdown>,
    pub points: Vec<TradingPerformancePoint>,
}

pub fn calculate_trading_performance(
    episodes: &[StoredEpisode],
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> TradingPerformance {
    calculate_trading_performance_with_plans(episodes, &HashMap::new(), start, end)
}

pub fn calculate_trading_performance_with_plans(
    episodes: &[StoredEpisode],
    confirmed_plans: &HashMap<String, PlanSnapshot>,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> TradingPerformance {
    let mut set = TradeSet::from_episodes(episodes, start, end, New_York);
    let opened: HashMap<&str, DateTime<Utc>> = episodes
        .iter()
        .map(|episode| (episode.id.as_str(), episode.draft.opened_at))
        .collect();
    let candidates = confirmed_plans
        .iter()
        .filter_map(|(episode, plan)| {
            let opened = *opened.get(episode.as_str())?;
            let at = if plan.active_at_episode_open {
                opened - Duration::nanoseconds(1)
            } else {
                plan.created_at.max(opened)
            };
            let candidate = trade_set::StopCandidate {
                at,
                price: plan.stop_loss.to_f64()?,
                source: trade_set::StopSource::Plan,
            };
            Some((episode.clone(), vec![candidate]))
        })
        .collect();
    set.apply_initial_stops(&candidates, |_| false);
    calculate_performance(&set, start, end)
}

fn trade_symbol(entry: &JournalEntry, episode: Option<&StoredEpisode>) -> String {
    match episode.map(|episode| &episode.draft.instrument) {
        Some(ExecutionInstrument::Equity { symbol }) => symbol.clone(),
        Some(ExecutionInstrument::Option { underlying, .. }) => underlying.clone(),
        None => entry.symbol.clone(),
    }
}

fn calculate_performance(
    set: &TradeSet,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> TradingPerformance {
    let mut daily = BTreeMap::<chrono::NaiveDate, BreakdownAccumulator>::new();
    let mut by_symbol = BTreeMap::<String, BreakdownAccumulator>::new();
    let mut gross_profit = Decimal::ZERO;
    let mut gross_loss = Decimal::ZERO;
    let mut winning_trade_count = 0usize;
    let mut breakeven_trade_count = 0usize;
    let mut losing_trade_count = 0usize;
    let mut realized_r_total = 0.0;
    let mut risk_defined_trade_count = 0usize;
    let mut outcomes = Vec::<(DateTime<Utc>, Decimal)>::new();

    for entry in &set.entries {
        let Ok(closed_at) = DateTime::parse_from_rfc3339(&entry.close_date) else {
            continue;
        };
        let closed_at = closed_at.with_timezone(&Utc);
        if start.is_some_and(|bound| closed_at < bound)
            || end.is_some_and(|bound| closed_at > bound)
        {
            continue;
        }
        let pnl = set.money_of(entry);
        let episode = set.episodes.get(&entry.id);

        if let Some(realized_r) = trade_set::r_multiple(entry, pnl.to_f64().unwrap_or_default()) {
            realized_r_total += realized_r;
            risk_defined_trade_count += 1;
        }

        if pnl > Decimal::ZERO {
            gross_profit += pnl;
            winning_trade_count += 1;
        } else if pnl < Decimal::ZERO {
            gross_loss += pnl.abs();
            losing_trade_count += 1;
        } else {
            breakeven_trade_count += 1;
        }
        let day = closed_at.with_timezone(&set.timezone).date_naive();
        daily.entry(day).or_default().record(pnl);
        by_symbol
            .entry(trade_symbol(entry, episode))
            .or_default()
            .record(pnl);
        outcomes.push((closed_at, pnl));
    }
    let open_position_count = set.coverage.open_positions;
    let needs_review_count = set.coverage.needs_review;

    let closed_trade_count = winning_trade_count + breakeven_trade_count + losing_trade_count;
    let decisive_trade_count = winning_trade_count + losing_trade_count;
    let win_rate = if decisive_trade_count > 0 {
        winning_trade_count as f64 / decisive_trade_count as f64 * 100.0
    } else {
        0.0
    };
    let average_win = if winning_trade_count > 0 {
        gross_profit / Decimal::from(winning_trade_count)
    } else {
        Decimal::ZERO
    };
    let average_loss = if losing_trade_count > 0 {
        gross_loss / Decimal::from(losing_trade_count)
    } else {
        Decimal::ZERO
    };
    let profit_factor = (gross_loss > Decimal::ZERO)
        .then(|| (gross_profit / gross_loss).to_f64().unwrap_or_default());
    let average_realized_r =
        (risk_defined_trade_count > 0).then(|| realized_r_total / risk_defined_trade_count as f64);

    outcomes.sort_by_key(|(closed_at, _)| *closed_at);
    let mut current_win_streak = 0usize;
    let mut current_loss_streak = 0usize;
    let mut longest_loss_streak = 0usize;
    for (_, pnl) in &outcomes {
        if *pnl > Decimal::ZERO {
            current_win_streak += 1;
            current_loss_streak = 0;
        } else if *pnl < Decimal::ZERO {
            current_loss_streak += 1;
            current_win_streak = 0;
            longest_loss_streak = longest_loss_streak.max(current_loss_streak);
        } else {
            current_win_streak = 0;
            current_loss_streak = 0;
        }
    }
    let current_streak = if current_win_streak > 0 {
        current_win_streak as i32
    } else if current_loss_streak > 0 {
        -(current_loss_streak as i32)
    } else {
        0
    };

    let mut cumulative = Decimal::ZERO;
    let mut peak = Decimal::ZERO;
    let mut max_drawdown = Decimal::ZERO;
    let day_breakdowns: Vec<_> = daily
        .iter()
        .map(|(date, accumulator)| accumulator.clone().finish(date.to_string()))
        .collect();
    let mut points = Vec::with_capacity(daily.len().saturating_add(1));
    if let Some(baseline_date) = daily.keys().next().and_then(|date| date.pred_opt()) {
        points.push(TradingPerformancePoint {
            date: baseline_date.to_string(),
            daily_pnl: 0.0,
            cumulative_pnl: 0.0,
            drawdown: 0.0,
            closed_trade_count: 0,
            winning_trade_count: 0,
            breakeven_trade_count: 0,
            losing_trade_count: 0,
        });
    }
    points.extend(daily.into_iter().map(|(date, accumulator)| {
        let daily_pnl = accumulator.net_pnl;
        let trade_count = accumulator.wins + accumulator.breakevens + accumulator.losses;
        cumulative += daily_pnl;
        peak = peak.max(cumulative);
        let drawdown = cumulative - peak;
        max_drawdown = max_drawdown.max(drawdown.abs());
        TradingPerformancePoint {
            date: date.to_string(),
            daily_pnl: daily_pnl.to_f64().unwrap_or_default(),
            cumulative_pnl: cumulative.to_f64().unwrap_or_default(),
            drawdown: drawdown.to_f64().unwrap_or_default(),
            closed_trade_count: trade_count,
            winning_trade_count: accumulator.wins,
            breakeven_trade_count: accumulator.breakevens,
            losing_trade_count: accumulator.losses,
        }
    }));

    let current_drawdown = peak - cumulative;
    let symbol_breakdowns: Vec<_> = by_symbol
        .into_iter()
        .map(|(key, accumulator)| accumulator.finish(key))
        .collect();
    let best_symbol = symbol_breakdowns.iter().cloned().max_by(compare_breakdowns);
    let worst_symbol = symbol_breakdowns.iter().cloned().min_by(compare_breakdowns);
    let best_day = day_breakdowns.iter().cloned().max_by(compare_breakdowns);
    let worst_day = day_breakdowns.iter().cloned().min_by(compare_breakdowns);

    TradingPerformance {
        total_realized_pnl: cumulative.to_f64().unwrap_or_default(),
        gross_profit: gross_profit.to_f64().unwrap_or_default(),
        gross_loss: gross_loss.to_f64().unwrap_or_default(),
        average_win: average_win.to_f64().unwrap_or_default(),
        average_loss: average_loss.to_f64().unwrap_or_default(),
        profit_factor,
        win_rate,
        closed_trade_count,
        winning_trade_count,
        breakeven_trade_count,
        losing_trade_count,
        average_realized_r,
        risk_defined_trade_count,
        open_position_count,
        needs_review_count,
        peak_realized_pnl: peak.to_f64().unwrap_or_default(),
        current_drawdown: current_drawdown.to_f64().unwrap_or_default(),
        max_drawdown: max_drawdown.to_f64().unwrap_or_default(),
        current_streak,
        longest_loss_streak,
        best_symbol,
        worst_symbol,
        best_day,
        worst_day,
        points,
    }
}

pub fn calculate_trading_calendar(
    episodes: &[StoredEpisode],
    year: i32,
    month: u32,
) -> Result<TradingCalendar> {
    calculate_calendar(
        &TradeSet::from_episodes(episodes, None, None, New_York),
        year,
        month,
    )
}

fn month_bounds(
    year: i32,
    month: u32,
    timezone: chrono_tz::Tz,
) -> Result<(NaiveDate, NaiveDate, DateTime<Utc>, DateTime<Utc>)> {
    ensure!((1..=12).contains(&month), "month must be between 1 and 12");
    let month_start =
        NaiveDate::from_ymd_opt(year, month, 1).ok_or_else(|| anyhow!("Invalid month"))?;
    let next_month = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .ok_or_else(|| anyhow!("Invalid next month"))?;
    let month_end = next_month - Duration::days(1);
    let start = timezone
        .from_local_datetime(&month_start.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| anyhow!("Invalid month start"))?
        .with_timezone(&Utc);
    let end = timezone
        .from_local_datetime(&next_month.and_hms_opt(0, 0, 0).unwrap())
        .single()
        .ok_or_else(|| anyhow!("Invalid month end"))?
        .with_timezone(&Utc)
        - Duration::nanoseconds(1);
    Ok((month_start, month_end, start, end))
}

fn calculate_calendar(set: &TradeSet, year: i32, month: u32) -> Result<TradingCalendar> {
    let (month_start, month_end, start, end) = month_bounds(year, month, set.timezone)?;
    let performance = calculate_performance(set, Some(start), Some(end));
    let points_by_date: BTreeMap<NaiveDate, TradingPerformancePoint> = performance
        .points
        .iter()
        .filter_map(|point| {
            let date = NaiveDate::parse_from_str(&point.date, "%Y-%m-%d").ok()?;
            (date >= month_start && date <= month_end).then(|| (date, point.clone()))
        })
        .collect();

    let mut days = Vec::new();
    let mut cursor = month_start;
    while cursor <= month_end {
        let point = points_by_date.get(&cursor);
        let wins = point.map_or(0, |value| value.winning_trade_count);
        let breakevens = point.map_or(0, |value| value.breakeven_trade_count);
        let losses = point.map_or(0, |value| value.losing_trade_count);
        let decisive = wins + losses;
        days.push(CalendarDaySummary {
            date: cursor.to_string(),
            profit: point.map_or(0.0, |value| value.daily_pnl),
            trade_count: wins + breakevens + losses,
            win_rate: if decisive > 0 {
                wins as f64 / decisive as f64 * 100.0
            } else {
                0.0
            },
            winning_trade_count: wins,
            breakeven_trade_count: breakevens,
            losing_trade_count: losses,
        });
        cursor += Duration::days(1);
    }

    let grid_start =
        month_start - Duration::days(month_start.weekday().num_days_from_sunday().into());
    let grid_end =
        month_end + Duration::days((6 - month_end.weekday().num_days_from_sunday()).into());
    let mut weeks = Vec::new();
    let mut week_start = grid_start;
    let mut week_index = 1;
    while week_start <= grid_end {
        let week_end = week_start + Duration::days(6);
        let week_days: Vec<_> = days
            .iter()
            .filter(|day| {
                NaiveDate::parse_from_str(&day.date, "%Y-%m-%d")
                    .is_ok_and(|date| date >= week_start && date <= week_end)
            })
            .collect();
        let wins = week_days
            .iter()
            .map(|day| day.winning_trade_count)
            .sum::<usize>();
        let breakevens = week_days
            .iter()
            .map(|day| day.breakeven_trade_count)
            .sum::<usize>();
        let losses = week_days
            .iter()
            .map(|day| day.losing_trade_count)
            .sum::<usize>();
        let decisive = wins + losses;
        weeks.push(CalendarWeekSummary {
            week_index,
            week_start: week_start.to_string(),
            week_end: week_end.to_string(),
            profit: week_days.iter().map(|day| day.profit).sum(),
            trade_count: wins + breakevens + losses,
            trading_days: week_days.iter().filter(|day| day.trade_count > 0).count(),
            win_rate: if decisive > 0 {
                wins as f64 / decisive as f64 * 100.0
            } else {
                0.0
            },
            winning_trade_count: wins,
            breakeven_trade_count: breakevens,
            losing_trade_count: losses,
        });
        week_index += 1;
        week_start += Duration::days(7);
    }

    Ok(TradingCalendar {
        year,
        month,
        month_profit: performance.total_realized_pnl,
        trade_count: performance.closed_trade_count,
        trading_days: days.iter().filter(|day| day.trade_count > 0).count(),
        win_rate: performance.win_rate,
        winning_trade_count: performance.winning_trade_count,
        breakeven_trade_count: performance.breakeven_trade_count,
        losing_trade_count: performance.losing_trade_count,
        grid_start: grid_start.to_string(),
        grid_end: grid_end.to_string(),
        days,
        weeks,
    })
}

pub async fn load_trading_calendar(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    year: i32,
    month: u32,
) -> Result<TradingCalendar> {
    let timezone = trade_set::journal_timezone(pool, user_id, workspace_id).await?;
    let (_, _, start, end) = month_bounds(year, month, timezone)?;
    let set = trade_set::load(pool, user_id, workspace_id, Some(start), Some(end)).await?;
    calculate_calendar(&set, year, month)
}

fn compare_breakdowns(
    left: &PerformanceBreakdown,
    right: &PerformanceBreakdown,
) -> std::cmp::Ordering {
    left.net_pnl
        .total_cmp(&right.net_pnl)
        .then_with(|| right.key.cmp(&left.key))
}

pub async fn load_trading_performance(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> Result<TradingPerformance> {
    let set = trade_set::load(pool, user_id, workspace_id, start, end).await?;
    Ok(calculate_performance(&set, start, end))
}
