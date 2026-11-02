use async_graphql::ID;
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use super::*;
use crate::trades::{
    behavior::{MarketRegime, TradeBehavior},
    labels::{LabelKind, LabelRef},
    measure::{r_multiple, stop_risk},
};

fn label(kind: LabelKind, name: &str) -> LabelRef {
    LabelRef {
        id: ID(format!("{}-{name}", kind.as_str())),
        kind,
        name: name.into(),
        color: None,
        archived: false,
    }
}

fn instant(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

fn trade(net: Decimal, closed: &str, hold: i64, r: Option<Decimal>, tags: &[&str]) -> StatTrade {
    let closed_at = instant(closed);
    StatTrade {
        symbol: "X".into(),
        direction: Some("long".into()),
        opened_at: closed_at - chrono::Duration::seconds(hold),
        closed_at,
        net,
        return_pct: None,
        entry_cost: Decimal::ZERO,
        holding_seconds: hold,
        r,
        edges: Vec::new(),
        entry_tactics: Vec::new(),
        tags: tags.iter().map(|t| label(LabelKind::Tag, t)).collect(),
        mistakes: Vec::new(),
        behavior: TradeBehavior::default(),
        planned: false,
        outcome: Outcome::default(),
    }
}

/// A trade opened and closed at the given UTC times.
fn between(opened: &str, closed: &str, net: Decimal) -> StatTrade {
    let (opened_at, closed_at) = (instant(opened), instant(closed));
    StatTrade {
        opened_at,
        holding_seconds: (closed_at - opened_at).num_seconds(),
        ..trade(net, closed, 0, None, &[])
    }
}

fn keys(buckets: &[Bucket]) -> Vec<(&str, usize)> {
    buckets.iter().map(|b| (b.key.as_str(), b.trades)).collect()
}

#[test]
fn totals_ratios_and_streaks() {
    let stats = compute(vec![
        trade(
            dec!(100),
            "2026-01-05T15:00:00Z",
            600,
            Some(dec!(2)),
            &["breakout"],
        ),
        trade(dec!(-50), "2026-01-06T15:00:00Z", 600, Some(dec!(-1)), &[]),
        trade(dec!(0), "2026-01-07T15:00:00Z", 600, None, &[]),
        trade(dec!(-30), "2026-01-08T15:00:00Z", 7200, None, &[]),
        trade(dec!(60), "2026-01-09T15:00:00Z", 7200, None, &["breakout"]),
    ]);
    assert_eq!(
        (stats.trades, stats.wins, stats.losses, stats.breakeven),
        (5, 2, 2, 1)
    );
    assert_eq!(stats.win_rate, Some(dec!(0.5)));
    assert_eq!(stats.net, dec!(80));
    assert_eq!(stats.profit_factor, Some(dec!(2)));
    assert_eq!(stats.expectancy, Some(dec!(16)));
    assert_eq!(stats.expectancy_r, Some(dec!(0.5)));
    assert_eq!(stats.max_drawdown, dec!(80), "from +100 down to +20");
    assert_eq!(stats.current_drawdown, dec!(20));
    assert_eq!(
        stats.recovery_factor,
        Some(dec!(1)),
        "80 net over an 80 drawdown"
    );
    assert_eq!(
        (
            stats.longest_win_streak,
            stats.longest_loss_streak,
            stats.current_streak
        ),
        (1, 2, 1)
    );
    let breakout = stats.by_tag.iter().find(|b| b.key == "breakout").unwrap();
    assert_eq!((breakout.trades, breakout.net), (2, dec!(160)));
    assert_eq!(stats.equity.last().unwrap().cumulative, dec!(80));
    assert_eq!(
        stats
            .equity
            .iter()
            .map(|d| (d.trades, d.wins, d.losses))
            .collect::<Vec<_>>(),
        [(1, 1, 0), (1, 0, 1), (1, 0, 0), (1, 0, 1), (1, 1, 0)],
        "each day counts the trades it closed and how they ended"
    );
    assert_eq!(
        keys(&stats.by_hold),
        [("Under 1 hour", 3), ("1 hour to 1 day", 2)],
        "hold buckets keep their natural order"
    );
}

#[test]
fn average_win_and_loss_in_percent_weigh_trades_equally() {
    let with = |net: Decimal, pct: Option<Decimal>| StatTrade {
        return_pct: pct,
        ..trade(net, "2026-01-05T15:00:00Z", 600, None, &[])
    };
    let stats = compute(vec![
        with(dec!(500), Some(dec!(5))),
        with(dec!(10), Some(dec!(2))),
        with(dec!(40), None),
        with(dec!(-30), Some(dec!(-3))),
        with(dec!(-90), Some(dec!(-1.5))),
        with(dec!(0), Some(dec!(0))),
    ]);
    assert_eq!(
        stats.average_win_pct,
        Some(dec!(3.50)),
        "(5 + 2) / 2; the trade without a cost is skipped"
    );
    assert_eq!(stats.average_loss_pct, Some(dec!(-2.25)));
    assert_eq!(
        stats.average_win,
        Some(dec!(183.33)),
        "dollars still average all three wins"
    );

    let none = compute(vec![with(dec!(10), None)]);
    assert_eq!((none.average_win_pct, none.average_loss_pct), (None, None));
}

#[test]
fn nothing_to_measure_is_not_an_error() {
    let stats = compute(vec![]);
    assert_eq!(
        (stats.trades, stats.win_rate, stats.profit_factor, stats.sqn),
        (0, None, None, None)
    );
    assert_eq!(stats.r_distribution.len(), 7, "every R range is listed");
    assert!(stats.by_session.is_empty() && stats.trades_per_day.is_empty());
}

#[test]
fn r_divides_by_the_dollars_at_risk() {
    let risk = stop_risk(dec!(10), dec!(9), dec!(50), dec!(1));
    assert_eq!(r_multiple(dec!(100), risk), Some(dec!(2)));
    assert_eq!(
        r_multiple(dec!(100), stop_risk(dec!(10), dec!(10), dec!(50), dec!(1))),
        None
    );
    assert_eq!(
        r_multiple(dec!(-200), stop_risk(dec!(2), dec!(1), dec!(1), dec!(100))),
        Some(dec!(-2)),
        "an option's risk counts its multiplier"
    );
    assert_eq!(
        r_multiple(dec!(150), dec!(50)),
        Some(dec!(3)),
        "a planned dollar risk"
    );
}

#[test]
fn sessions_weekdays_months_and_sizes_use_new_york_time() {
    let sized = |opened: &str, closed: &str, cost: Decimal| StatTrade {
        entry_cost: cost,
        ..between(opened, closed, dec!(1))
    };
    let stats = compute(vec![
        // Monday 5 January 2026; New York is UTC−5 in winter.
        sized("2026-01-05T13:00:00Z", "2026-01-05T13:10:00Z", dec!(500)),
        sized(
            "2026-01-05T14:45:00Z",
            "2026-01-05T15:00:00Z",
            dec!(4999.99),
        ),
        sized("2026-01-05T17:00:00Z", "2026-01-05T17:30:00Z", dec!(30000)),
        sized("2026-01-05T20:30:00Z", "2026-01-05T20:45:00Z", dec!(0)),
        sized("2026-01-05T22:00:00Z", "2026-01-05T22:30:00Z", dec!(250000)),
        // 22:00 on Monday in New York, already Tuesday in UTC; closes in February.
        sized("2026-01-06T03:00:00Z", "2026-02-02T15:00:00Z", dec!(1000)),
    ]);
    assert_eq!(
        keys(&stats.by_session),
        [
            ("Pre-market", 1),
            ("First hour", 1),
            ("Midday", 1),
            ("Last hour", 1),
            ("After hours", 1),
            ("Overnight", 1)
        ]
    );
    assert_eq!(
        keys(&stats.by_weekday),
        [("Mon", 6)],
        "the overnight trade opened on Monday in New York"
    );
    assert_eq!(keys(&stats.by_month), [("2026-01", 5), ("2026-02", 1)]);
    assert_eq!(
        keys(&stats.by_size),
        [
            ("Under $1K", 1),
            ("$1K to $5K", 2),
            ("$25K to $100K", 1),
            ("Over $100K", 1),
            ("Unknown", 1)
        ]
    );
    assert_eq!(stats.by_hour[0].key, "08:00", "hours sort by the clock");
}

#[test]
fn r_multiples_spread_across_every_range() {
    let with_r = |r: Option<Decimal>| trade(dec!(1), "2026-01-05T15:00:00Z", 60, r, &[]);
    let stats = compute(
        [
            Some(dec!(-2.5)),
            Some(dec!(-1)),
            Some(dec!(-0.5)),
            Some(dec!(0)),
            Some(dec!(1.5)),
            Some(dec!(3)),
            None,
        ]
        .into_iter()
        .map(with_r)
        .collect(),
    );
    assert_eq!(
        keys(&stats.r_distribution),
        [
            ("Below −2R", 1),
            ("−2R to −1R", 0),
            ("−1R to 0R", 2),
            ("0R to 1R", 1),
            ("1R to 2R", 1),
            ("2R to 3R", 0),
            ("3R and above", 1)
        ],
        "each range includes its lower bound; trades without a risk are left out"
    );

    let steady = compute(
        [dec!(1), dec!(2), dec!(3)]
            .into_iter()
            .map(|r| with_r(Some(r)))
            .collect(),
    );
    assert_eq!(steady.sqn, Some(dec!(3.46)), "√3 × mean 2 ÷ deviation 1");
    let same = compute(vec![with_r(Some(dec!(1))), with_r(Some(dec!(1)))]);
    assert_eq!(same.sqn, None, "no spread, no SQN");
}

#[test]
fn behavior_after_wins_and_losses_and_by_trades_per_day() {
    let chased = label(LabelKind::Mistake, "Chased");
    let mut loss = between("2026-01-05T15:30:00Z", "2026-01-05T16:00:00Z", dec!(-5));
    loss.mistakes = vec![chased];
    let stats = compute(vec![
        between("2026-01-05T14:30:00Z", "2026-01-05T15:00:00Z", dec!(10)),
        loss,
        between("2026-01-05T16:00:00Z", "2026-01-05T17:00:00Z", dec!(3)),
        between("2026-01-06T14:30:00Z", "2026-01-06T15:00:00Z", dec!(0)),
    ]);
    assert_eq!(
        keys(&stats.by_previous_trade),
        [
            ("First trade of the day", 2),
            ("After a win", 1),
            ("After a loss", 1)
        ],
        "a trade opened as another closed follows it; a new day starts fresh"
    );
    let after_loss = &stats.by_previous_trade[2];
    assert_eq!(after_loss.net, dec!(3));

    let loads: Vec<(&str, usize, usize, Decimal, Option<Decimal>)> = stats
        .trades_per_day
        .iter()
        .map(|d| (d.key.as_str(), d.days, d.trades, d.net, d.average_day))
        .collect();
    assert_eq!(
        loads,
        [
            ("1 trade", 1, 1, dec!(0), Some(dec!(0))),
            ("3 trades", 1, 3, dec!(8), Some(dec!(8)))
        ]
    );

    assert_eq!(
        stats
            .by_discipline
            .iter()
            .map(|b| (b.key.as_str(), b.trades, b.net))
            .collect::<Vec<_>>(),
        [("No mistakes", 3, dec!(13)), ("With mistakes", 1, dec!(-5))]
    );
    assert_eq!(
        (
            stats.average_win_hold_seconds,
            stats.average_loss_hold_seconds
        ),
        (Some(2700), Some(1800)),
        "winners held 30 and 60 minutes; the loser 30"
    );
}

#[test]
fn labels_break_results_down_and_a_trade_counts_under_each() {
    let orb = label(LabelKind::Edge, "ORB");
    let volume = label(LabelKind::Edge, "Relative volume");
    let pullback = label(LabelKind::EntryTactic, "Pullback");
    let chased = label(LabelKind::Mistake, "Chased");
    let with = |net: Decimal,
                edges: &[&LabelRef],
                tactics: &[&LabelRef],
                mistakes: &[&LabelRef],
                r: Option<Decimal>| StatTrade {
        edges: edges.iter().map(|l| (*l).clone()).collect(),
        entry_tactics: tactics.iter().map(|l| (*l).clone()).collect(),
        mistakes: mistakes.iter().map(|m| (*m).clone()).collect(),
        ..trade(net, "2026-01-05T15:00:00Z", 600, r, &[])
    };
    let stats = compute(vec![
        with(
            dec!(100),
            &[&orb, &volume],
            &[&pullback],
            &[],
            Some(dec!(2)),
        ),
        with(dec!(-40), &[&orb], &[], &[&chased], Some(dec!(-1))),
        with(dec!(-60), &[&volume], &[&pullback], &[&chased], None),
        with(dec!(30), &[], &[], &[], None),
    ]);

    let edges: Vec<(&str, usize, Decimal)> = stats
        .by_edge
        .iter()
        .map(|b| (b.key.as_str(), b.trades, b.net))
        .collect();
    assert_eq!(
        edges,
        [
            ("ORB", 2, dec!(60)),
            ("Relative volume", 2, dec!(40)),
            ("None", 1, dec!(30))
        ],
        "the first trade counts under both of its edges"
    );
    let orb_bucket = &stats.by_edge[0];
    assert_eq!(orb_bucket.label_id, Some(orb.id.clone()));
    assert_eq!(
        (orb_bucket.expectancy, orb_bucket.expectancy_r),
        (Some(dec!(30)), Some(dec!(0.5)))
    );
    assert_eq!(stats.by_edge[2].label_id, None);
    assert_eq!(keys(&stats.by_entry_tactic), [("Pullback", 2), ("None", 2)]);
    assert_eq!(stats.untagged, 1);

    let cell = |edge: Option<&LabelRef>, tactic: Option<&LabelRef>| {
        stats
            .edge_tactic
            .iter()
            .find(|c| c.edge.as_ref() == edge && c.entry_tactic.as_ref() == tactic)
            .map(|c| (c.trades, c.net))
    };
    assert_eq!(cell(Some(&orb), Some(&pullback)), Some((1, dec!(100))));
    assert_eq!(cell(Some(&volume), Some(&pullback)), Some((2, dec!(40))));
    assert_eq!(cell(Some(&orb), None), Some((1, dec!(-40))));
    assert_eq!(cell(None, None), Some((1, dec!(30))));
    assert_eq!(stats.edge_tactic.len(), 4);

    assert_eq!(stats.by_mistake.len(), 1, "no None bucket for mistakes");
    let cost = &stats.mistake_costs[0];
    assert_eq!(cost.mistake, chased);
    assert_eq!((cost.trades, cost.net), (2, dec!(-100)));
    assert_eq!(
        (cost.expectancy_with, cost.expectancy_without),
        (Some(dec!(-50)), Some(dec!(65)))
    );
}

#[test]
fn a_breakeven_band_counts_small_results_as_even() {
    let at = |net: Decimal| trade(net, "2026-01-05T15:00:00Z", 600, None, &[]);
    let trades = vec![at(dec!(0.5)), at(dec!(-0.4)), at(dec!(10)), at(dec!(-3))];
    let stats = compute_with(trades.clone(), dec!(1));
    assert_eq!(
        (stats.wins, stats.losses, stats.breakeven),
        (1, 1, 2),
        "±$1 or less is breakeven"
    );
    assert_eq!(stats.win_rate, Some(dec!(0.5)));
    assert_eq!(
        (stats.average_win, stats.average_loss),
        (Some(dec!(10)), Some(dec!(-3)))
    );
    assert_eq!(
        (stats.gross_profit, stats.gross_loss, stats.net),
        (dec!(10.50), dec!(-3.40), dec!(7.10)),
        "totals still add up to net"
    );

    let plain = compute(trades);
    assert_eq!((plain.wins, plain.losses, plain.breakeven), (2, 2, 0));
}

#[test]
fn recorded_behavior_breaks_results_down_and_unrecorded_is_left_out() {
    let with = |net, closed, behavior| StatTrade {
        behavior,
        ..trade(net, closed, 600, None, &[])
    };
    let stats = compute(vec![
        with(
            dec!(100),
            "2026-01-05T15:00:00Z",
            TradeBehavior {
                conviction: Some(5),
                market_regime: Some(MarketRegime::Trending),
                planned_pre_market: Some(true),
                revenge_trade: Some(false),
                broke_thirty_minute_rule: Some(false),
                rule_adherence: Some(5),
            },
        ),
        with(
            dec!(-80),
            "2026-01-06T15:00:00Z",
            TradeBehavior {
                conviction: Some(2),
                market_regime: Some(MarketRegime::Choppy),
                planned_pre_market: Some(false),
                revenge_trade: Some(true),
                broke_thirty_minute_rule: Some(true),
                rule_adherence: Some(2),
            },
        ),
        with(
            dec!(40),
            "2026-01-07T15:00:00Z",
            TradeBehavior {
                conviction: Some(5),
                ..TradeBehavior::default()
            },
        ),
        trade(dec!(-10), "2026-01-08T15:00:00Z", 600, None, &[]),
    ]);
    let behavior = &stats.behavior;
    assert_eq!(behavior.recorded, 3);
    assert_eq!(behavior.average_conviction, Some(dec!(4)));
    assert_eq!(behavior.average_rule_adherence, Some(dec!(3.5)));
    assert_eq!(keys(&behavior.by_conviction), [("2/5", 1), ("5/5", 2)]);
    assert_eq!(behavior.by_conviction[1].net, dec!(140));
    assert_eq!(
        keys(&behavior.by_market_regime),
        [("Trending", 1), ("Choppy", 1)]
    );
    assert_eq!(
        keys(&behavior.by_planned),
        [("Planned pre-market", 1), ("Not planned", 1)]
    );
    assert_eq!(
        keys(&behavior.by_revenge),
        [("Not a revenge trade", 1), ("Revenge trade", 1)]
    );
    assert_eq!(behavior.by_revenge[1].net, dec!(-80));
    assert_eq!(
        keys(&behavior.by_thirty_minute_rule),
        [
            ("Kept the 30-minute rule", 1),
            ("Broke the 30-minute rule", 1)
        ]
    );
    assert_eq!(keys(&behavior.by_rule_adherence), [("2/5", 1), ("5/5", 1)]);
}

#[test]
fn trades_from_a_plan_compare_with_trades_without_one() {
    let planned = |net, closed| StatTrade {
        planned: true,
        ..trade(net, closed, 600, None, &[])
    };
    let stats = compute(vec![
        planned(dec!(120), "2026-01-05T15:00:00Z"),
        planned(dec!(-40), "2026-01-06T15:00:00Z"),
        trade(dec!(-90), "2026-01-07T15:00:00Z", 600, None, &[]),
    ]);
    assert_eq!(stats.plans.from_plan, 2);
    assert_eq!(
        keys(&stats.plans.by_plan),
        [("From a plan", 2), ("No plan", 1)]
    );
    assert_eq!(stats.plans.by_plan[0].expectancy, Some(dec!(40.00)));
}
