use crate::service::db::client::UserDb;
use crate::service::db::schema::tables::journal_table::{JournalAggregateRow, TradeOutcomeRow};
use crate::service::db::schema::tables::tags_table;
use crate::service::db::schema::tables::trading_principle_table;
use crate::service::db::schema::tables::workspaces_table;
use crate::service::read_service::trade_set;
use rust_decimal::prelude::ToPrimitive;

pub use crate::service::trading_performance::{
    CalendarDaySummary, CalendarWeekSummary, TradingCalendar as CalendarAnalytics,
};
use anyhow::{Result, anyhow, ensure};
use chrono::{DateTime, Datelike, Duration, Months, NaiveDate, NaiveDateTime, TimeZone, Utc};
use chrono_tz::America::New_York;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct TradeOutcome {
    pub symbol: String,
    pub symbol_name: String,
    pub amount: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct JournalAnalytics {
    pub win_rate: f64,
    pub cumulative_profit: f64,
    pub average_risk_to_reward: f64,
    pub average_gain: f64,
    pub average_loss: f64,
    /// Average percent return on winning trades (mean of total_pl over winners).
    pub average_gain_pct: f64,
    /// Average percent loss on losing trades (mean of |total_pl| over losers).
    pub average_loss_pct: f64,
    pub profit_factor: Option<f64>,
    pub biggest_win: Option<TradeOutcome>,
    pub biggest_loss: Option<TradeOutcome>,
    /// Resolved ET calendar start/end of the active range (`YYYY-MM-DD`).
    /// `None` for the unbounded `All` range.
    pub range_start: Option<String>,
    pub range_end: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnalyticsTimeFilter {
    Today,
    Last7Days,
    Last1Month,
    Last3Months,
    Last6Months,
    YearToDate,
    Last1Year,
    All,
    Custom {
        start_date: String,
        end_date: String,
    },
}

pub async fn get_journal_analytics(
    user_db: &UserDb,
    workspace_id: &str,
    time_filter: &AnalyticsTimeFilter,
) -> Result<JournalAnalytics> {
    let bounds = resolve_range_bounds(time_filter, Utc::now())?;
    let set = trade_set::load(
        user_db.pool(),
        user_db.user_id(),
        workspace_id,
        bounds.start,
        bounds.end,
    )
    .await?;
    let mut analytics = journal_analytics_of(&set);
    analytics.range_start = bounds
        .start_date_et
        .map(|d| d.format("%Y-%m-%d").to_string());
    analytics.range_end = bounds.end_date_et.map(|d| d.format("%Y-%m-%d").to_string());
    Ok(analytics)
}

/// The journal page's summary, decided by each trade's money like every other report.
fn journal_analytics_of(set: &trade_set::TradeSet) -> JournalAnalytics {
    let mut agg = JournalAggregateRow {
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        cumulative_profit: 0.0,
        gross_profit: 0.0,
        gross_loss: 0.0,
        sum_risk_reward: 0.0,
        sum_win_pct: 0.0,
        sum_loss_pct: 0.0,
        risk_reward_count: 0,
    };
    let mut biggest_win: Option<TradeOutcomeRow> = None;
    let mut biggest_loss: Option<TradeOutcomeRow> = None;
    for entry in &set.entries {
        let money = set.money_of(entry).to_f64().unwrap_or_default();
        agg.total_trades += 1;
        agg.cumulative_profit += money;
        if let Some(risk_reward) = entry.risk_reward {
            agg.sum_risk_reward += risk_reward;
            agg.risk_reward_count += 1;
        }
        let outcome = || TradeOutcomeRow {
            symbol: entry.symbol.clone(),
            symbol_name: entry.symbol_name.clone(),
            amount: money,
        };
        if money > 0.0 {
            agg.winning_trades += 1;
            agg.gross_profit += money;
            agg.sum_win_pct += entry.total_pl;
            if biggest_win.as_ref().is_none_or(|best| money > best.amount) {
                biggest_win = Some(outcome());
            }
        } else if money < 0.0 {
            agg.losing_trades += 1;
            agg.gross_loss += money.abs();
            agg.sum_loss_pct += entry.total_pl.abs();
            if biggest_loss
                .as_ref()
                .is_none_or(|worst| money < worst.amount)
            {
                biggest_loss = Some(outcome());
            }
        }
    }
    build_journal_analytics(agg, biggest_win, biggest_loss)
}

pub async fn get_trading_performance(
    user_db: &UserDb,
    workspace_id: &str,
    time_filter: &AnalyticsTimeFilter,
) -> Result<crate::service::trading_performance::TradingPerformance> {
    let bounds = resolve_range_bounds(time_filter, Utc::now())?;
    crate::service::trading_performance::load_trading_performance(
        user_db.pool(),
        user_db.user_id(),
        workspace_id,
        bounds.start,
        bounds.end,
    )
    .await
}

fn build_journal_analytics(
    agg: JournalAggregateRow,
    biggest_win: Option<TradeOutcomeRow>,
    biggest_loss: Option<TradeOutcomeRow>,
) -> JournalAnalytics {
    // Win rate excludes breakeven (scratch) trades from both sides — the
    // journal-software standard: wins / (wins + losses).
    let decisive_trades = (agg.winning_trades + agg.losing_trades) as f64;
    let win_rate = if decisive_trades > 0.0 {
        (agg.winning_trades as f64 / decisive_trades) * 100.0
    } else {
        0.0
    };
    // Divide by the count of trades that HAVE an R:R (non-null risk_reward), not
    // total trades — no-stop trades (NULL) must not dilute the average.
    let average_risk_to_reward = if agg.risk_reward_count > 0 {
        agg.sum_risk_reward / agg.risk_reward_count as f64
    } else {
        0.0
    };
    let average_gain = if agg.winning_trades == 0 {
        0.0
    } else {
        agg.gross_profit / agg.winning_trades as f64
    };
    let average_loss = if agg.losing_trades == 0 {
        0.0
    } else {
        agg.gross_loss / agg.losing_trades as f64
    };
    let average_gain_pct = if agg.winning_trades == 0 {
        0.0
    } else {
        agg.sum_win_pct / agg.winning_trades as f64
    };
    let average_loss_pct = if agg.losing_trades == 0 {
        0.0
    } else {
        agg.sum_loss_pct / agg.losing_trades as f64
    };
    let profit_factor = if agg.gross_loss > 0.0 {
        Some(agg.gross_profit / agg.gross_loss)
    } else {
        None
    };
    JournalAnalytics {
        win_rate,
        cumulative_profit: agg.cumulative_profit,
        average_risk_to_reward,
        average_gain,
        average_loss,
        average_gain_pct,
        average_loss_pct,
        profit_factor,
        biggest_win: biggest_win.map(trade_outcome_from_row),
        biggest_loss: biggest_loss.map(trade_outcome_from_row),
        // Set by the caller (get_journal_analytics) from the resolved bounds.
        range_start: None,
        range_end: None,
    }
}

fn trade_outcome_from_row(row: TradeOutcomeRow) -> TradeOutcome {
    TradeOutcome {
        symbol: row.symbol,
        symbol_name: row.symbol_name,
        amount: row.amount,
    }
}

pub async fn get_advanced_analytics(
    user_db: &UserDb,
    workspace_id: &str,
    time_filter: &AnalyticsTimeFilter,
) -> Result<crate::service::read_service::analytics_advanced::AdvancedAnalytics> {
    let bounds = resolve_range_bounds(time_filter, Utc::now())?;
    let range_start = bounds
        .start_date_et
        .map(|d| d.format("%Y-%m-%d").to_string());
    let range_end = bounds.end_date_et.map(|d| d.format("%Y-%m-%d").to_string());

    let (set, workspace) = tokio::try_join!(
        trade_set::load(
            user_db.pool(),
            user_db.user_id(),
            workspace_id,
            bounds.start,
            bounds.end
        ),
        workspaces_table::find_workspace(user_db.pool(), workspace_id, user_db.user_id()),
    )?;
    let entry_ids: Vec<String> = set.entries.iter().map(|e| e.id.clone()).collect();
    let (trade_tags, violations) = tokio::try_join!(
        tags_table::tags_for_trades(user_db.pool(), &entry_ids),
        trading_principle_table::principles_for_trades(
            user_db.pool(),
            user_db.user_id(),
            &entry_ids
        ),
    )?;
    let mut analytics =
        crate::service::read_service::analytics_advanced::compute_advanced_analytics(
            &set.entries,
            &crate::service::read_service::analytics_advanced::AnalysisContext {
                current_equity: workspace.and_then(|account| account.total_value),
                trade_tags,
                violations,
                money: set.money_f64(),
                timezone: set.timezone,
            },
        );
    analytics.r_typed_stop_count = set
        .entries
        .iter()
        .filter(|entry| {
            set.stop_sources.get(&entry.id) == Some(&trade_set::StopSource::Typed)
                && trade_set::r_multiple(entry, set.money_of(entry).to_f64().unwrap_or_default())
                    .is_some()
        })
        .count();
    analytics.coverage = set.coverage;
    analytics.range_start = range_start;
    analytics.range_end = range_end;
    Ok(analytics)
}

pub async fn get_calendar_analytics(
    user_db: &UserDb,
    workspace_id: &str,
    year: i32,
    month: u32,
) -> Result<CalendarAnalytics> {
    crate::service::trading_performance::load_trading_calendar(
        user_db.pool(),
        user_db.user_id(),
        workspace_id,
        year,
        month,
    )
    .await
}

/// All-UTC range bounds plus the ET calendar dates they were derived from.
/// `start`/`end`/`*_date_et` are `None` only for the unbounded `All` preset.
pub struct RangeBounds {
    pub start: Option<DateTime<Utc>>,
    pub end: Option<DateTime<Utc>>,
    pub start_date_et: Option<NaiveDate>,
    pub end_date_et: Option<NaiveDate>,
}

/// Midnight (00:00:00) on `date` in America/New_York, as UTC.
fn et_start_of_day(date: NaiveDate) -> Result<DateTime<Utc>> {
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| anyhow!("invalid start-of-day"))?;
    let local = New_York
        .from_local_datetime(&naive)
        .earliest()
        .ok_or_else(|| anyhow!("nonexistent local midnight in ET"))?;
    Ok(local.with_timezone(&Utc))
}

/// End-of-day (23:59:59.999999999) on `date` in America/New_York, as UTC.
fn et_end_of_day(date: NaiveDate) -> Result<DateTime<Utc>> {
    let naive = date
        .and_hms_nano_opt(23, 59, 59, 999_999_999)
        .ok_or_else(|| anyhow!("invalid end-of-day"))?;
    let local = New_York
        .from_local_datetime(&naive)
        .latest()
        .ok_or_else(|| anyhow!("nonexistent local end-of-day in ET"))?;
    Ok(local.with_timezone(&Utc))
}

/// Resolve a preset (or custom range) into UTC bounds, anchored to ET.
pub fn resolve_range_bounds(
    filter: &AnalyticsTimeFilter,
    now: DateTime<Utc>,
) -> Result<RangeBounds> {
    let today = now.with_timezone(&New_York).date_naive();

    // Custom ranges keep the existing parse semantics (interpreted as UTC).
    if let AnalyticsTimeFilter::Custom {
        start_date,
        end_date,
    } = filter
    {
        let start = parse_filter_datetime(start_date, FilterBound::Start)?;
        let end = parse_filter_datetime(end_date, FilterBound::End)?;
        ensure!(
            end >= start,
            "custom end_date must be on or after start_date"
        );
        return Ok(RangeBounds {
            start: Some(start),
            end: Some(end),
            start_date_et: Some(start.with_timezone(&New_York).date_naive()),
            end_date_et: Some(end.with_timezone(&New_York).date_naive()),
        });
    }

    if matches!(filter, AnalyticsTimeFilter::All) {
        return Ok(RangeBounds {
            start: None,
            end: None,
            start_date_et: None,
            end_date_et: None,
        });
    }

    let start_date = match filter {
        AnalyticsTimeFilter::Today => today,
        AnalyticsTimeFilter::Last7Days => today - Duration::days(6),
        AnalyticsTimeFilter::Last1Month => today
            .checked_sub_months(Months::new(1))
            .ok_or_else(|| anyhow!("month subtraction overflow"))?,
        AnalyticsTimeFilter::Last3Months => today
            .checked_sub_months(Months::new(3))
            .ok_or_else(|| anyhow!("month subtraction overflow"))?,
        AnalyticsTimeFilter::Last6Months => today
            .checked_sub_months(Months::new(6))
            .ok_or_else(|| anyhow!("month subtraction overflow"))?,
        AnalyticsTimeFilter::Last1Year => today
            .checked_sub_months(Months::new(12))
            .ok_or_else(|| anyhow!("year subtraction overflow"))?,
        AnalyticsTimeFilter::YearToDate => NaiveDate::from_ymd_opt(today.year(), 1, 1)
            .ok_or_else(|| anyhow!("invalid year-to-date start"))?,
        AnalyticsTimeFilter::All | AnalyticsTimeFilter::Custom { .. } => unreachable!(),
    };

    Ok(RangeBounds {
        start: Some(et_start_of_day(start_date)?),
        end: Some(et_end_of_day(today)?),
        start_date_et: Some(start_date),
        end_date_et: Some(today),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FilterBound {
    Start,
    End,
}

fn parse_filter_datetime(value: &str, bound: FilterBound) -> Result<DateTime<Utc>> {
    if let Ok(parsed) = DateTime::parse_from_rfc3339(value) {
        return Ok(parsed.with_timezone(&Utc));
    }

    for format in [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
    ] {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(value, format) {
            return Ok(DateTime::<Utc>::from_naive_utc_and_offset(parsed, Utc));
        }
    }

    if let Ok(parsed) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
        let datetime = match bound {
            FilterBound::Start => parsed
                .and_hms_opt(0, 0, 0)
                .ok_or_else(|| anyhow!("Invalid start date provided"))?,
            FilterBound::End => parsed
                .and_hms_nano_opt(23, 59, 59, 999_999_999)
                .ok_or_else(|| anyhow!("Invalid end date provided"))?,
        };
        return Ok(DateTime::<Utc>::from_naive_utc_and_offset(datetime, Utc));
    }

    Err(anyhow!(
        "Invalid filter datetime format '{}'. Use RFC3339, YYYY-MM-DD HH:MM[:SS], or YYYY-MM-DD",
        value
    ))
}

#[cfg(test)]
mod range_tests {
    use super::*;
    use chrono::{TimeZone, Timelike};

    // 2026-06-20 18:00 UTC = 14:00 ET (EDT, summer). "today" in ET = 2026-06-20.
    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 6, 20, 18, 0, 0).unwrap()
    }

    #[test]
    fn today_is_single_et_day() {
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Today, now()).unwrap();
        assert_eq!(
            b.start_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 20).unwrap()
        );
        assert_eq!(
            b.end_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 20).unwrap()
        );
        // Midnight ET (EDT, -04:00) on 2026-06-20 == 04:00 UTC.
        assert_eq!(
            b.start.unwrap(),
            Utc.with_ymd_and_hms(2026, 6, 20, 4, 0, 0).unwrap()
        );
    }

    #[test]
    fn last_7_days_includes_today() {
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Last7Days, now()).unwrap();
        // 7 calendar days incl today => start = today - 6 days.
        assert_eq!(
            b.start_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 14).unwrap()
        );
        assert_eq!(
            b.end_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 6, 20).unwrap()
        );
    }

    #[test]
    fn last_1_month_is_calendar_month() {
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Last1Month, now()).unwrap();
        assert_eq!(
            b.start_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 5, 20).unwrap()
        );
    }

    #[test]
    fn month_subtraction_clamps_end_of_month() {
        // 2026-03-31 12:00 ET -> 1 month back clamps to 2026-02-28.
        let now = Utc.with_ymd_and_hms(2026, 3, 31, 16, 0, 0).unwrap();
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Last1Month, now).unwrap();
        assert_eq!(
            b.start_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 2, 28).unwrap()
        );
    }

    #[test]
    fn last_1_year_handles_leap_day() {
        // 2024-02-29 -> 1 year back clamps to 2023-02-28.
        let now = Utc.with_ymd_and_hms(2024, 2, 29, 17, 0, 0).unwrap();
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Last1Year, now).unwrap();
        assert_eq!(
            b.start_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2023, 2, 28).unwrap()
        );
    }

    #[test]
    fn year_to_date_starts_jan_1() {
        let b = resolve_range_bounds(&AnalyticsTimeFilter::YearToDate, now()).unwrap();
        assert_eq!(
            b.start_date_et.unwrap(),
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()
        );
    }

    #[test]
    fn all_is_unbounded() {
        let b = resolve_range_bounds(&AnalyticsTimeFilter::All, now()).unwrap();
        assert!(b.start.is_none() && b.end.is_none());
        assert!(b.start_date_et.is_none() && b.end_date_et.is_none());
    }

    #[test]
    fn dst_spring_forward_midnight_is_valid() {
        // 2026-03-08 is the US spring-forward day; midnight ET still exists
        // (gap is 02:00–03:00). now = 2026-03-08 18:00 UTC = 13:00 EDT.
        let now = Utc.with_ymd_and_hms(2026, 3, 8, 18, 0, 0).unwrap();
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Today, now).unwrap();
        // Midnight 2026-03-08 ET is still EST (-05:00) => 05:00 UTC.
        assert_eq!(
            b.start.unwrap(),
            Utc.with_ymd_and_hms(2026, 3, 8, 5, 0, 0).unwrap()
        );
    }

    #[test]
    fn end_is_end_of_today_et() {
        let b = resolve_range_bounds(&AnalyticsTimeFilter::Last7Days, now()).unwrap();
        // End-of-day 2026-06-20 ET (EDT -04:00) == 2026-06-21 03:59:59.999… UTC.
        let end = b.end.unwrap();
        assert_eq!(
            end.date_naive(),
            NaiveDate::from_ymd_opt(2026, 6, 21).unwrap()
        );
        assert_eq!(
            (end.time().hour(), end.time().minute(), end.time().second()),
            (3, 59, 59)
        );
    }
}
