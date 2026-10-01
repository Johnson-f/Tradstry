use std::collections::HashMap;

use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use tradstry_backend::service::db::schema::tables::trade_review_table::StoredEpisode;
use tradstry_backend::service::trade_review::types::{
    EpisodeDirection, ExecutionInstrument, FillAllocation, FillRole, PlanSnapshot, PlanTranche,
    TradeEpisodeDraft,
};
use tradstry_backend::service::trading_performance::{
    calculate_trading_performance, calculate_trading_performance_with_plans,
};

fn closed_episode(
    id: &str,
    symbol: &str,
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
                symbol: symbol.to_string(),
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

fn open_episode() -> StoredEpisode {
    let opened_at = Utc.with_ymd_and_hms(2026, 6, 12, 14, 0, 0).unwrap();
    StoredEpisode {
        id: "open".to_string(),
        workspace_id: "workspace-1".to_string(),
        grouping_source: "automatic".to_string(),
        draft: TradeEpisodeDraft {
            instrument: ExecutionInstrument::Equity {
                symbol: "OPEN".to_string(),
            },
            direction: EpisodeDirection::Long,
            allocations: vec![FillAllocation {
                transaction_id: "open-entry".to_string(),
                role: FillRole::Entry,
                quantity: Decimal::ONE,
                price: Decimal::new(10, 0),
                fee: Decimal::ZERO,
                executed_at: opened_at,
            }],
            opened_at,
            closed_at: None,
            current_quantity: Decimal::ONE,
            fingerprint: "fingerprint-open".to_string(),
        },
    }
}

fn plan(id: &str, entry_price: i64, stop_loss: i64) -> PlanSnapshot {
    PlanSnapshot {
        plan_id: format!("plan-{id}"),
        workspace_id: "workspace-1".to_string(),
        instrument: ExecutionInstrument::Equity {
            symbol: "TEST".to_string(),
        },
        direction: EpisodeDirection::Long,
        stop_loss: Decimal::new(stop_loss, 0),
        created_at: Utc.with_ymd_and_hms(2026, 6, 1, 12, 0, 0).unwrap(),
        active_at_episode_open: true,
        tranches: vec![PlanTranche {
            id: format!("tranche-{id}"),
            order: 0,
            quantity: Decimal::TEN,
            entry_price: Decimal::new(entry_price, 0),
        }],
    }
}

#[test]
fn calculates_filtered_realized_trading_performance_from_closed_episodes() {
    let episodes = vec![
        closed_episode("win", "TEST", 10, 10, 20, 1),
        closed_episode("loss", "TEST", 11, 20, 15, 1),
        closed_episode("flat", "TEST", 12, 10, 10, 0),
        open_episode(),
    ];

    let performance = calculate_trading_performance(&episodes, None, None);

    assert!((performance.total_realized_pnl - 46.0).abs() < f64::EPSILON);
    assert_eq!(performance.closed_trade_count, 3);
    assert_eq!(performance.winning_trade_count, 1);
    assert_eq!(performance.breakeven_trade_count, 1);
    assert_eq!(performance.losing_trade_count, 1);
    assert_eq!(performance.open_position_count, 1);
    assert_eq!(performance.needs_review_count, 0);
    assert!((performance.win_rate - 50.0).abs() < f64::EPSILON);
    assert!((performance.profit_factor.unwrap() - (98.0 / 52.0)).abs() < 1e-9);
    assert!((performance.peak_realized_pnl - 98.0).abs() < f64::EPSILON);
    assert!((performance.current_drawdown - 52.0).abs() < f64::EPSILON);
    assert!((performance.max_drawdown - 52.0).abs() < f64::EPSILON);
    assert_eq!(performance.current_streak, 0);
    assert_eq!(performance.longest_loss_streak, 1);
    assert_eq!(performance.points.len(), 4);
    assert!((performance.points[0].cumulative_pnl - 0.0).abs() < f64::EPSILON);
    assert!((performance.points[0].drawdown - 0.0).abs() < f64::EPSILON);
    assert!((performance.points[1].daily_pnl - 98.0).abs() < f64::EPSILON);
    assert!((performance.points[1].drawdown - 0.0).abs() < f64::EPSILON);
    assert!((performance.points[2].cumulative_pnl - 46.0).abs() < f64::EPSILON);
    assert!((performance.points[2].drawdown - (-52.0)).abs() < f64::EPSILON);
    assert!((performance.points[3].cumulative_pnl - 46.0).abs() < f64::EPSILON);
}

#[test]
fn ranks_best_and_worst_symbols_and_trading_days() {
    let episodes = vec![
        closed_episode("aapl-win", "AAPL", 10, 10, 20, 1),
        closed_episode("nvda-loss", "NVDA", 11, 20, 15, 1),
        closed_episode("aapl-flat", "AAPL", 12, 10, 10, 0),
    ];

    let performance = calculate_trading_performance(&episodes, None, None);

    let best_symbol = performance.best_symbol.expect("best symbol");
    assert_eq!(best_symbol.key, "AAPL");
    assert_eq!(best_symbol.trade_count, 2);
    assert!((best_symbol.net_pnl - 98.0).abs() < f64::EPSILON);
    assert!((best_symbol.win_rate - 100.0).abs() < f64::EPSILON);

    let worst_symbol = performance.worst_symbol.expect("worst symbol");
    assert_eq!(worst_symbol.key, "NVDA");
    assert_eq!(worst_symbol.trade_count, 1);
    assert!((worst_symbol.net_pnl - (-52.0)).abs() < f64::EPSILON);

    let best_day = performance.best_day.expect("best day");
    assert_eq!(best_day.key, "2026-06-10");
    assert!((best_day.net_pnl - 98.0).abs() < f64::EPSILON);

    let worst_day = performance.worst_day.expect("worst day");
    assert_eq!(worst_day.key, "2026-06-11");
    assert!((worst_day.net_pnl - (-52.0)).abs() < f64::EPSILON);
}

#[test]
fn averages_realized_r_only_across_closed_episodes_with_confirmed_risk() {
    let episodes = vec![
        closed_episode("win", "TEST", 10, 10, 20, 1),
        closed_episode("loss", "TEST", 11, 20, 15, 1),
        closed_episode("no-plan", "TEST", 12, 10, 10, 0),
    ];
    let plans = HashMap::from([
        ("win".to_string(), plan("win", 10, 9)),
        ("loss".to_string(), plan("loss", 20, 18)),
    ]);

    let performance = calculate_trading_performance_with_plans(&episodes, &plans, None, None);

    assert_eq!(performance.risk_defined_trade_count, 2);
    assert!((performance.average_realized_r.expect("average R") - 3.6).abs() < 1e-9);
}

#[test]
fn leaves_average_realized_r_unavailable_without_confirmed_risk() {
    let episodes = vec![closed_episode("win", "TEST", 10, 10, 20, 1)];

    let performance =
        calculate_trading_performance_with_plans(&episodes, &HashMap::new(), None, None);

    assert_eq!(performance.risk_defined_trade_count, 0);
    assert_eq!(performance.average_realized_r, None);
}
