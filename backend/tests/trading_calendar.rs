use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use tradstry_backend::service::db::schema::tables::trade_review_table::StoredEpisode;
use tradstry_backend::service::trade_review::types::{
    EpisodeDirection, ExecutionInstrument, FillAllocation, FillRole, TradeEpisodeDraft,
};
use tradstry_backend::service::trading_performance::calculate_trading_calendar;

fn closed_episode(
    id: &str,
    closed_day: u32,
    entry_price: i64,
    exit_price: i64,
    fee: i64,
) -> StoredEpisode {
    let opened_at = Utc.with_ymd_and_hms(2026, 6, closed_day, 14, 0, 0).unwrap();
    let closed_at = Utc.with_ymd_and_hms(2026, 6, closed_day, 20, 0, 0).unwrap();
    StoredEpisode {
        id: id.to_string(),
        workspace_id: "workspace-1".to_string(),
        grouping_source: "automatic".to_string(),
        draft: TradeEpisodeDraft {
            instrument: ExecutionInstrument::Equity {
                symbol: "TEST".to_string(),
            },
            direction: EpisodeDirection::Long,
            allocations: vec![
                FillAllocation {
                    transaction_id: format!("{id}-entry"),
                    role: FillRole::Entry,
                    quantity: Decimal::TEN,
                    price: Decimal::new(entry_price, 0),
                    fee: Decimal::new(fee, 0),
                    executed_at: opened_at,
                },
                FillAllocation {
                    transaction_id: format!("{id}-exit"),
                    role: FillRole::Exit,
                    quantity: Decimal::TEN,
                    price: Decimal::new(exit_price, 0),
                    fee: Decimal::new(fee, 0),
                    executed_at: closed_at,
                },
            ],
            opened_at,
            closed_at: Some(closed_at),
            current_quantity: Decimal::ZERO,
            fingerprint: format!("fingerprint-{id}"),
        },
    }
}

#[test]
fn builds_month_calendar_from_closed_broker_episodes() {
    let episodes = vec![
        closed_episode("win", 10, 10, 20, 1),
        closed_episode("loss", 10, 20, 15, 1),
        closed_episode("flat", 12, 10, 10, 0),
    ];

    let calendar = calculate_trading_calendar(&episodes, 2026, 6).unwrap();

    assert!((calendar.month_profit - 46.0).abs() < f64::EPSILON);
    assert_eq!(calendar.trade_count, 3);
    assert_eq!(calendar.trading_days, 2);
    assert_eq!(calendar.winning_trade_count, 1);
    assert_eq!(calendar.breakeven_trade_count, 1);
    assert_eq!(calendar.losing_trade_count, 1);
    assert!((calendar.win_rate - 50.0).abs() < f64::EPSILON);

    let june_10 = calendar
        .days
        .iter()
        .find(|day| day.date == "2026-06-10")
        .expect("June 10");
    assert!((june_10.profit - 46.0).abs() < f64::EPSILON);
    assert_eq!(june_10.trade_count, 2);
    assert_eq!(june_10.winning_trade_count, 1);
    assert_eq!(june_10.losing_trade_count, 1);
    assert!((june_10.win_rate - 50.0).abs() < f64::EPSILON);

    let june_12 = calendar
        .days
        .iter()
        .find(|day| day.date == "2026-06-12")
        .expect("June 12");
    assert_eq!(june_12.breakeven_trade_count, 1);
    assert_eq!(june_12.win_rate, 0.0);

    let active_week = calendar
        .weeks
        .iter()
        .find(|week| week.trade_count == 3)
        .expect("active week");
    assert_eq!(active_week.trading_days, 2);
    assert_eq!(active_week.winning_trade_count, 1);
    assert_eq!(active_week.breakeven_trade_count, 1);
    assert_eq!(active_week.losing_trade_count, 1);
}

#[test]
fn excludes_closed_episodes_outside_the_visible_month() {
    let episodes = vec![closed_episode("june", 10, 10, 20, 1)];

    let calendar = calculate_trading_calendar(&episodes, 2026, 7).unwrap();

    assert_eq!(calendar.month_profit, 0.0);
    assert_eq!(calendar.trade_count, 0);
    assert_eq!(calendar.trading_days, 0);
    assert!(calendar.days.iter().all(|day| day.trade_count == 0));
}
