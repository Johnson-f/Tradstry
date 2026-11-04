//! The pure trade engine, on fixtures modelled after real Webull history.

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde_json::{Value, json};
use uuid::Uuid;

use tradstry::trades::{
    EngineInput, EngineOutput, compute,
    decisions::{Decision, DecisionKind, OutcomeStatus},
    instrument::Alias,
    measure,
    model::{
        ClosureKind, Direction, FillRole, Instrument, TaxStatus, Term, Trade, TradeKind,
        TradeStatus, WorkspaceInfo,
    },
    normalize::{ActivityRow, ManualFill, OpeningPosition},
};

const CASH: Uuid = Uuid::from_u128(1);
const MARGIN: Uuid = Uuid::from_u128(2);
const IRA: Uuid = Uuid::from_u128(3);

fn workspaces() -> Vec<WorkspaceInfo> {
    vec![
        WorkspaceInfo {
            id: CASH,
            can_short: false,
            tax: TaxStatus::Taxable,
            is_ira: false,
        },
        WorkspaceInfo {
            id: MARGIN,
            can_short: true,
            tax: TaxStatus::Taxable,
            is_ira: false,
        },
        WorkspaceInfo {
            id: IRA,
            can_short: false,
            tax: TaxStatus::Sheltered,
            is_ira: true,
        },
    ]
}

fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

fn stock(
    id: &str,
    workspace: Uuid,
    kind: &str,
    symbol: &str,
    units: Decimal,
    price: Decimal,
    when: &str,
) -> ActivityRow {
    ActivityRow {
        activity_id: id.into(),
        workspace_id: workspace,
        raw: json!({
            "id": id, "type": kind, "units": units, "price": price, "fee": 0,
            "amount": -(units * price), "trade_date": when, "description": "",
            "symbol": {"symbol": symbol, "description": format!("{symbol} Corp")}, "option_symbol": null,
        }),
    }
}

fn buy(id: &str, w: Uuid, symbol: &str, units: Decimal, price: Decimal, when: &str) -> ActivityRow {
    stock(id, w, "BUY", symbol, units, price, when)
}

fn sell(
    id: &str,
    w: Uuid,
    symbol: &str,
    units: Decimal,
    price: Decimal,
    when: &str,
) -> ActivityRow {
    stock(id, w, "SELL", symbol, -units, price, when)
}

#[allow(clippy::too_many_arguments)]
fn option(
    id: &str,
    w: Uuid,
    kind: &str,
    intent: &str,
    occ: &str,
    units: Decimal,
    price: Decimal,
    when: &str,
) -> ActivityRow {
    ActivityRow {
        activity_id: id.into(),
        workspace_id: w,
        raw: json!({
            "id": id, "type": kind, "units": units, "price": price, "fee": 0,
            "amount": -(units * price * dec!(100)), "trade_date": when, "option_type": intent, "symbol": null,
            "option_symbol": {"ticker": occ, "is_mini_option": false},
        }),
    }
}

fn event(id: &str, w: Uuid, kind: &str, symbol: Value, extra: Value, when: &str) -> ActivityRow {
    let mut raw = json!({"id": id, "type": kind, "trade_date": when, "description": "", "fee": 0});
    if symbol.get("ticker").is_some() {
        raw["option_symbol"] = symbol;
    } else {
        raw["symbol"] = symbol;
    }
    for (k, v) in extra.as_object().unwrap() {
        raw[k] = v.clone();
    }
    ActivityRow {
        activity_id: id.into(),
        workspace_id: w,
        raw,
    }
}

fn run(activities: Vec<ActivityRow>) -> EngineOutput {
    compute(&EngineInput {
        workspaces: workspaces(),
        activities,
        ..EngineInput::default()
    })
}

fn singles(output: &EngineOutput) -> Vec<&Trade> {
    output
        .trades
        .iter()
        .filter(|t| t.kind == TradeKind::Single)
        .collect()
}

fn net(trade: &Trade) -> Option<Decimal> {
    measure::single(trade).net
}

#[test]
fn scaling_in_and_out_stays_one_trade() {
    let out = run(vec![
        buy(
            "1",
            CASH,
            "RGTI",
            dec!(4),
            dec!(19.67),
            "2026-04-17T16:09:06Z",
        ),
        buy(
            "2",
            CASH,
            "RGTI",
            dec!(6),
            dec!(19.78),
            "2026-04-17T19:48:34Z",
        ),
        sell(
            "3",
            CASH,
            "RGTI",
            dec!(10),
            dec!(18.92),
            "2026-04-20T17:32:14Z",
        ),
        buy(
            "4",
            CASH,
            "RGTI",
            dec!(8),
            dec!(19.37),
            "2026-04-20T18:26:47Z",
        ),
    ]);
    let trades = singles(&out);
    assert_eq!(trades.len(), 2);
    let first = trades[0];
    assert_eq!(
        (first.status, first.direction),
        (TradeStatus::Closed, Some(Direction::Long))
    );
    let metrics = measure::single(first);
    assert_eq!(metrics.gross, dec!(-8.16));
    assert_eq!(metrics.avg_entry.unwrap().round_dp(3), dec!(19.736));
    assert_eq!(metrics.avg_exit, Some(dec!(18.92)));
    assert_eq!(metrics.max_quantity, dec!(10));
    assert_eq!(metrics.fill_count, 3);
    let roles: Vec<FillRole> = first.fills.iter().map(|f| f.role).collect();
    assert_eq!(roles, [FillRole::Open, FillRole::Add, FillRole::Close]);
    assert_eq!(trades[1].status, TradeStatus::Open);
}

#[test]
fn fifo_closes_the_oldest_lots_first() {
    let out = run(vec![
        buy("1", MARGIN, "X", dec!(10), dec!(10), "2026-01-01T15:00:00Z"),
        buy("2", MARGIN, "X", dec!(10), dec!(12), "2026-01-02T15:00:00Z"),
        sell("3", MARGIN, "X", dec!(15), dec!(13), "2026-01-03T15:00:00Z"),
    ]);
    let trade = singles(&out)[0];
    assert_eq!(trade.status, TradeStatus::Open);
    let gross: Vec<Decimal> = trade
        .lots
        .iter()
        .flat_map(|l| &l.closures)
        .map(|c| c.gross)
        .collect();
    assert_eq!(gross, [dec!(30), dec!(5)]);
    assert_eq!(trade.lots[1].quantity, dec!(5));
    assert_eq!(
        net(trade),
        Some(dec!(35)),
        "realised so far on an open trade"
    );
}

#[test]
fn same_instant_fills_never_short_a_cash_account() {
    // Sell sorts first by key; the engine must still buy first.
    let out = run(vec![
        sell(
            "a",
            CASH,
            "BULL",
            dec!(5),
            dec!(16.55),
            "2025-07-23T14:08:18.706Z",
        ),
        buy(
            "b",
            CASH,
            "BULL",
            dec!(5),
            dec!(16.89),
            "2025-07-23T14:08:18.706Z",
        ),
    ]);
    let trades = singles(&out);
    assert_eq!(trades.len(), 1);
    assert_eq!(
        (trades[0].status, trades[0].direction),
        (TradeStatus::Closed, Some(Direction::Long))
    );
    assert_eq!(net(trades[0]), Some(dec!(-1.70)));
}

#[test]
fn shorts_open_with_a_sell_in_margin_but_not_in_cash() {
    let margin = run(vec![
        sell(
            "1",
            MARGIN,
            "EVMN",
            dec!(1),
            dec!(6.32),
            "2026-10-28T18:21:54Z",
        ),
        buy(
            "2",
            MARGIN,
            "EVMN",
            dec!(1),
            dec!(6.00),
            "2026-10-28T19:00:00Z",
        ),
    ]);
    let trade = singles(&margin)[0];
    assert_eq!(
        (trade.status, trade.direction),
        (TradeStatus::Closed, Some(Direction::Short))
    );
    assert_eq!(net(trade), Some(dec!(0.32)));

    let cash = run(vec![sell(
        "1",
        CASH,
        "EVMN",
        dec!(1),
        dec!(6.32),
        "2026-10-28T18:21:54Z",
    )]);
    let trade = singles(&cash)[0];
    assert_eq!(trade.status, TradeStatus::Incomplete);
    assert_eq!(trade.fills[0].role, FillRole::Orphan);
    assert_eq!(trade.issues[0].code, "missing_opening_history");
    assert_eq!(net(trade), None);
}

#[test]
fn a_crossing_fill_closes_one_trade_and_opens_the_next() {
    let mut flip = sell("2", MARGIN, "X", dec!(15), dec!(11), "2026-01-02T15:00:00Z");
    flip.raw["fee"] = json!(1.5);
    flip.raw["amount"] = json!(163.5);
    let out = run(vec![
        buy("1", MARGIN, "X", dec!(10), dec!(10), "2026-01-01T15:00:00Z"),
        flip,
    ]);
    let trades = singles(&out);
    assert_eq!(trades.len(), 2);
    assert_eq!(trades[0].fills[1].role, FillRole::FlipClose);
    assert_eq!(trades[0].fills[1].fee, dec!(1.0));
    assert_eq!(net(trades[0]), Some(dec!(9.0)));
    assert_eq!(
        (trades[1].direction, trades[1].status),
        (Some(Direction::Short), TradeStatus::Open)
    );
    assert_eq!(trades[1].fills[0].role, FillRole::FlipOpen);
    assert_eq!(trades[1].fills[0].fee, dec!(0.5));
}

#[test]
fn options_use_their_multiplier() {
    let out = run(vec![
        option(
            "1",
            CASH,
            "BUY",
            "BUY_TO_OPEN",
            "IONQ  260508P00037000",
            dec!(1),
            dec!(1.68),
            "2026-04-29T15:00:00Z",
        ),
        option(
            "2",
            CASH,
            "SELL",
            "SELL_TO_CLOSE",
            "IONQ  260508P00037000",
            dec!(-1),
            dec!(0.89),
            "2026-04-30T14:00:04Z",
        ),
    ]);
    let trade = singles(&out)[0];
    assert_eq!(trade.instrument_key, "option:IONQ:2026-05-08:P:37:100");
    assert_eq!(net(trade), Some(dec!(-79)));
}

#[test]
fn fractional_shares_are_exact_and_dust_closes() {
    let out = run(vec![
        buy(
            "1",
            CASH,
            "AEHR",
            dec!(11.91029),
            dec!(10),
            "2026-01-01T15:00:00Z",
        ),
        sell(
            "2",
            CASH,
            "AEHR",
            dec!(11.91029),
            dec!(11),
            "2026-01-02T15:00:00Z",
        ),
        buy("3", CASH, "SATS", dec!(1), dec!(10), "2026-01-03T15:00:00Z"),
        sell(
            "4",
            CASH,
            "SATS",
            dec!(0.99995),
            dec!(12),
            "2026-01-04T15:00:00Z",
        ),
    ]);
    let trades = singles(&out);
    assert_eq!(net(trades[0]), Some(dec!(11.91029)));
    assert_eq!(trades[1].status, TradeStatus::Closed);
    assert!(out.issues.iter().any(|i| i.code == "dust_residual"));
}

#[test]
fn splits_preserve_cost_and_pnl() {
    let out = run(vec![
        buy("1", CASH, "X", dec!(10), dec!(100), "2026-01-01T15:00:00Z"),
        event(
            "2",
            CASH,
            "SPLIT",
            json!({"symbol": "X"}),
            json!({"units": 10, "description": "2-for-1 split"}),
            "2026-01-05T12:00:00Z",
        ),
        sell("3", CASH, "X", dec!(20), dec!(55), "2026-01-06T15:00:00Z"),
        buy("4", CASH, "Y", dec!(100), dec!(1), "2026-01-01T15:00:00Z"),
        event(
            "5",
            CASH,
            "SPLIT",
            json!({"symbol": "Y"}),
            json!({"units": -90}),
            "2026-01-05T12:00:00Z",
        ),
    ]);
    let x = singles(&out)
        .into_iter()
        .find(|t| t.instrument.symbol == "X")
        .unwrap();
    assert_eq!((x.status, net(x)), (TradeStatus::Closed, Some(dec!(100))));
    let y = singles(&out)
        .into_iter()
        .find(|t| t.instrument.symbol == "Y")
        .unwrap();
    assert_eq!(
        (y.lots[0].quantity, y.lots[0].cost_per_unit),
        (dec!(10), dec!(10))
    );
}

#[test]
fn expiry_closes_an_option_at_zero() {
    let out = run(vec![
        option(
            "1",
            MARGIN,
            "SELL",
            "SELL_TO_OPEN",
            "X     260116P00037000",
            dec!(-1),
            dec!(2),
            "2026-01-02T15:00:00Z",
        ),
        event(
            "2",
            MARGIN,
            "OPTIONEXPIRATION",
            json!({"ticker": "X     260116P00037000"}),
            json!({"units": 1}),
            "2026-01-16T21:00:00Z",
        ),
    ]);
    let trade = singles(&out)[0];
    assert_eq!(
        (trade.direction, trade.status),
        (Some(Direction::Short), TradeStatus::Closed)
    );
    assert_eq!(trade.fills[1].role, FillRole::Expire);
    assert_eq!(net(trade), Some(dec!(200)));
}

#[test]
fn assignment_links_or_creates_the_stock_leg() {
    let put = "X     260116P00037000";
    let derived = run(vec![
        option(
            "1",
            MARGIN,
            "SELL",
            "SELL_TO_OPEN",
            put,
            dec!(-1),
            dec!(2),
            "2026-01-02T15:00:00Z",
        ),
        event(
            "2",
            MARGIN,
            "OPTIONASSIGNMENT",
            json!({"ticker": put}),
            json!({"units": 1}),
            "2026-01-16T21:00:00Z",
        ),
    ]);
    let option_trade = singles(&derived)
        .into_iter()
        .find(|t| t.instrument.option.is_some())
        .unwrap();
    assert_eq!(
        net(option_trade),
        Some(dec!(200)),
        "trading view keeps the premium on the option"
    );
    let stock_trade = singles(&derived)
        .into_iter()
        .find(|t| t.instrument.option.is_none())
        .unwrap();
    assert_eq!(stock_trade.lots[0].quantity, dec!(100));
    assert_eq!(stock_trade.lots[0].cost_per_unit, dec!(37));
    assert_eq!(
        stock_trade.lots[0].tax_cost_adjustment,
        dec!(-2),
        "tax basis is strike minus premium"
    );
    assert!(stock_trade.fills[0].derived);
    assert_eq!(option_trade.related, std::slice::from_ref(&stock_trade.id));
    assert!(
        derived
            .issues
            .iter()
            .any(|i| i.code == "assignment_stock_leg_derived")
    );

    let linked = run(vec![
        option(
            "1",
            MARGIN,
            "SELL",
            "SELL_TO_OPEN",
            put,
            dec!(-1),
            dec!(2),
            "2026-01-02T15:00:00Z",
        ),
        event(
            "2",
            MARGIN,
            "OPTIONASSIGNMENT",
            json!({"ticker": put}),
            json!({"units": 1}),
            "2026-01-16T21:00:00Z",
        ),
        buy(
            "3",
            MARGIN,
            "X",
            dec!(100),
            dec!(37),
            "2026-01-19T14:30:00Z",
        ),
    ]);
    let stock_trade = singles(&linked)
        .into_iter()
        .find(|t| t.instrument.option.is_none())
        .unwrap();
    assert!(
        !stock_trade.fills[0].derived,
        "the broker's own fill is used"
    );
    assert_eq!(stock_trade.lots[0].tax_cost_adjustment, dec!(-2));
    assert!(
        !linked
            .issues
            .iter()
            .any(|i| i.code == "assignment_stock_leg_derived")
    );
    let closure = &singles(&linked)
        .into_iter()
        .find(|t| t.instrument.option.is_some())
        .unwrap()
        .lots[0]
        .closures[0];
    assert!(
        closure.tax_folded && closure.tax.is_none(),
        "the premium is reported through the stock"
    );
}

#[test]
fn exercising_a_long_call_buys_stock_with_the_premium_in_basis() {
    let call = "X     260116C00050000";
    let out = run(vec![
        option(
            "1",
            MARGIN,
            "BUY",
            "BUY_TO_OPEN",
            call,
            dec!(1),
            dec!(3),
            "2026-01-02T15:00:00Z",
        ),
        event(
            "2",
            MARGIN,
            "OPTIONEXERCISE",
            json!({"ticker": call}),
            json!({"units": 1}),
            "2026-01-16T21:00:00Z",
        ),
    ]);
    let stock_trade = singles(&out)
        .into_iter()
        .find(|t| t.instrument.option.is_none())
        .unwrap();
    assert_eq!(stock_trade.direction, Some(Direction::Long));
    assert_eq!(stock_trade.lots[0].tax_cost_adjustment, dec!(3));
}

#[test]
fn transfers_open_and_close_positions() {
    let out = run(vec![
        event(
            "1",
            CASH,
            "EXTERNAL_ASSET_TRANSFER_IN",
            json!({"symbol": "X"}),
            json!({"units": 10, "price": 0}),
            "2026-01-01T15:00:00Z",
        ),
        sell("2", CASH, "X", dec!(10), dec!(20), "2026-02-01T15:00:00Z"),
        event(
            "3",
            CASH,
            "EXTERNAL_ASSET_TRANSFER_IN",
            json!({"symbol": "Y"}),
            json!({"units": 5, "price": 4}),
            "2026-01-01T15:00:00Z",
        ),
        event(
            "4",
            CASH,
            "EXTERNAL_ASSET_TRANSFER_OUT",
            json!({"symbol": "Y"}),
            json!({"units": -5}),
            "2026-02-01T15:00:00Z",
        ),
    ]);
    let x = singles(&out)
        .into_iter()
        .find(|t| t.instrument.symbol == "X")
        .unwrap();
    assert_eq!(x.status, TradeStatus::Incomplete, "no cost, so no P&L");
    assert!(
        out.issues
            .iter()
            .any(|i| i.code == "transfer_in_without_cost")
    );
    let y = singles(&out)
        .into_iter()
        .find(|t| t.instrument.symbol == "Y")
        .unwrap();
    assert_eq!(y.status, TradeStatus::Closed);
    assert!(y.non_economic());
    assert_eq!(y.lots[0].closures[0].kind, ClosureKind::TransferOut);
}

#[test]
fn ticker_changes_are_suggested_then_joined_once_confirmed() {
    let history = || {
        vec![
            buy(
                "1",
                CASH,
                "IRBT",
                dec!(150),
                dec!(0.5833),
                "2025-12-01T15:00:00Z",
            ),
            sell(
                "2",
                CASH,
                "IRBTQ",
                dec!(150),
                dec!(0.35),
                "2025-12-22T15:33:20Z",
            ),
        ]
    };
    let before = run(history());
    assert_eq!(singles(&before).len(), 2);
    let suggestion = &before.alias_suggestions[0];
    assert_eq!(
        (suggestion.from_key.as_str(), suggestion.to_key.as_str()),
        ("stock:IRBTQ", "stock:IRBT")
    );

    let after = compute(&EngineInput {
        workspaces: workspaces(),
        activities: history(),
        aliases: vec![Alias {
            from_key: suggestion.from_key.clone(),
            to_key: suggestion.to_key.clone(),
            effective_at: suggestion.effective_at,
        }],
        ..EngineInput::default()
    });
    let trades = singles(&after);
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].status, TradeStatus::Closed);
    assert_eq!(net(trades[0]), Some(dec!(-34.995)));
    assert!(after.alias_suggestions.is_empty());
}

#[test]
fn dividends_attach_to_the_trade_that_earned_them() {
    let out = run(vec![
        buy("1", CASH, "X", dec!(10), dec!(10), "2026-01-01T15:00:00Z"),
        event(
            "2",
            CASH,
            "DIVIDEND",
            json!({"symbol": "X"}),
            json!({"amount": 2.5}),
            "2026-01-10T12:00:00Z",
        ),
        sell("3", CASH, "X", dec!(10), dec!(10), "2026-01-20T15:00:00Z"),
        event(
            "4",
            CASH,
            "DIVIDEND",
            json!({"symbol": "X"}),
            json!({"amount": 1.0}),
            "2026-02-01T12:00:00Z",
        ),
        event(
            "5",
            CASH,
            "DIVIDEND",
            json!({"symbol": "Z"}),
            json!({"amount": 9.0}),
            "2026-02-01T12:00:00Z",
        ),
    ]);
    let trade = singles(&out)[0];
    assert_eq!(trade.income, dec!(3.5));
    assert_eq!(net(trade), Some(dec!(0)), "income stays out of net P&L");
    assert_eq!(out.unattributed_income.len(), 1);
}

#[test]
fn an_opening_position_supplies_missing_history() {
    let id = Uuid::from_u128(77);
    let out = compute(&EngineInput {
        workspaces: workspaces(),
        activities: vec![
            sell("0", CASH, "X", dec!(5), dec!(1), "2025-06-01T15:00:00Z"),
            sell("1", CASH, "X", dec!(100), dec!(25), "2026-02-01T15:00:00Z"),
        ],
        openings: vec![OpeningPosition {
            id,
            workspace_id: CASH,
            instrument: Instrument::stock("X"),
            quantity: dec!(100),
            cost_per_unit: dec!(20),
            acquired_at: at("2024-03-01T00:00:00Z"),
            as_of: at("2026-01-01T00:00:00Z"),
        }],
        ..EngineInput::default()
    });
    let trades = singles(&out);
    assert_eq!(trades.len(), 1);
    assert_eq!(
        (trades[0].status, net(trades[0])),
        (TradeStatus::Closed, Some(dec!(500)))
    );
    assert!(
        out.issues
            .iter()
            .any(|i| i.code == "fills_before_opening_ignored")
    );
    let tax = trades[0].lots[0].closures[0].tax.as_ref().unwrap();
    assert_eq!(tax.term, Some(Term::Long), "held since 2024");
}

#[test]
fn manual_fills_trade_like_imported_ones() {
    let fill = |n: u128, side, quantity, price, when| ManualFill {
        id: Uuid::from_u128(n),
        workspace_id: CASH,
        instrument: Instrument::stock("AAPL"),
        side,
        quantity,
        price,
        fee: dec!(0),
        intent: None,
        executed_at: at(when),
    };
    use tradstry::trades::model::Side::{Buy, Sell};
    let manual = compute(&EngineInput {
        workspaces: workspaces(),
        manual_fills: vec![
            fill(1, Buy, dec!(10), dec!(190), "2026-01-01T15:00:00Z"),
            fill(2, Sell, dec!(10), dec!(195), "2026-01-05T15:00:00Z"),
        ],
        ..EngineInput::default()
    });
    let imported = run(vec![
        buy(
            "1",
            CASH,
            "AAPL",
            dec!(10),
            dec!(190),
            "2026-01-01T15:00:00Z",
        ),
        sell(
            "2",
            CASH,
            "AAPL",
            dec!(10),
            dec!(195),
            "2026-01-05T15:00:00Z",
        ),
    ]);
    let (m, i) = (singles(&manual)[0], singles(&imported)[0]);
    assert_eq!(measure::single(m), measure::single(i));
    assert!(m.fills[0].key.starts_with("manual:"));
}

fn decide(n: u128, kind: DecisionKind) -> Decision {
    Decision {
        id: Uuid::from_u128(n),
        workspace_id: MARGIN,
        created_at: at("2026-03-01T00:00:00Z") + Duration::seconds(n as i64),
        kind,
    }
}

fn round_trips() -> Vec<ActivityRow> {
    vec![
        buy("1", MARGIN, "X", dec!(10), dec!(10), "2026-01-01T15:00:00Z"),
        sell("2", MARGIN, "X", dec!(10), dec!(11), "2026-01-01T16:00:00Z"),
        buy("3", MARGIN, "X", dec!(5), dec!(12), "2026-01-01T17:00:00Z"),
        buy("4", MARGIN, "X", dec!(5), dec!(13), "2026-01-01T18:00:00Z"),
        sell("5", MARGIN, "X", dec!(10), dec!(14), "2026-01-01T19:00:00Z"),
    ]
}

#[test]
fn merging_splitting_and_undoing_regroup_without_touching_fills() {
    let baseline = run(round_trips());
    let ids: Vec<String> = baseline.trades.iter().map(|t| t.id.clone()).collect();
    assert_eq!(ids.len(), 2);
    let with = |decisions| {
        compute(&EngineInput {
            workspaces: workspaces(),
            activities: round_trips(),
            decisions,
            ..EngineInput::default()
        })
    };

    let merged = with(vec![decide(
        1,
        DecisionKind::Merge {
            trade_ids: ids.clone(),
        },
    )]);
    assert_eq!(merged.decision_outcomes[0].status, OutcomeStatus::Applied);
    assert_eq!(merged.trades.len(), 1);
    assert_eq!(net(&merged.trades[0]), Some(dec!(25)));

    let split = with(vec![decide(
        2,
        DecisionKind::Split {
            trade_id: ids[1].clone(),
            at_fill: "snaptrade:4".into(),
        },
    )]);
    assert_eq!(split.decision_outcomes[0].status, OutcomeStatus::Applied);
    let mut parts: Vec<Decimal> = split.trades.iter().filter_map(net).collect();
    parts.sort();
    assert_eq!(
        parts,
        [dec!(5), dec!(10), dec!(10)],
        "5 @ 12 and 5 @ 13 each closed @ 14"
    );

    let refused = with(vec![decide(
        3,
        DecisionKind::Split {
            trade_id: ids[1].clone(),
            at_fill: "snaptrade:3".into(),
        },
    )]);
    assert_eq!(
        refused.decision_outcomes[0].code.as_deref(),
        Some("split_at_first_fill")
    );

    let stale = with(vec![decide(
        4,
        DecisionKind::Merge {
            trade_ids: vec![ids[0].clone(), "gone".into()],
        },
    )]);
    assert_eq!(stale.decision_outcomes[0].status, OutcomeStatus::Stale);

    let regrouped = with(vec![
        decide(
            5,
            DecisionKind::Merge {
                trade_ids: ids.clone(),
            },
        ),
        decide(
            6,
            DecisionKind::Merge {
                trade_ids: ids.clone(),
            },
        ),
    ]);
    assert_eq!(
        regrouped.decision_outcomes[1].code.as_deref(),
        Some("trade_already_regrouped")
    );

    let undone = with(vec![]);
    assert_eq!(
        undone.trades, baseline.trades,
        "dropping the decision restores the baseline"
    );
}

#[test]
fn option_legs_combine_into_a_strategy() {
    let legs = vec![
        option(
            "1",
            MARGIN,
            "BUY",
            "BUY_TO_OPEN",
            "X     260116C00050000",
            dec!(1),
            dec!(3),
            "2026-01-02T15:00:00Z",
        ),
        option(
            "2",
            MARGIN,
            "SELL",
            "SELL_TO_OPEN",
            "X     260116C00055000",
            dec!(-1),
            dec!(1),
            "2026-01-02T15:00:20Z",
        ),
        option(
            "3",
            MARGIN,
            "SELL",
            "SELL_TO_CLOSE",
            "X     260116C00050000",
            dec!(-1),
            dec!(4),
            "2026-01-10T15:00:00Z",
        ),
        option(
            "4",
            MARGIN,
            "BUY",
            "BUY_TO_CLOSE",
            "X     260116C00055000",
            dec!(1),
            dec!(1.5),
            "2026-01-10T15:00:00Z",
        ),
    ];
    let baseline = run(legs.clone());
    let suggestion = &baseline.strategy_suggestions[0];
    assert_eq!(suggestion.trade_ids.len(), 2);
    let out = compute(&EngineInput {
        workspaces: workspaces(),
        activities: legs,
        decisions: vec![decide(
            1,
            DecisionKind::CombineLegs {
                trade_ids: suggestion.trade_ids.clone(),
                label: Some("Call spread".into()),
            },
        )],
        ..EngineInput::default()
    });
    let parent = out
        .trades
        .iter()
        .find(|t| t.kind == TradeKind::Strategy)
        .unwrap();
    assert_eq!(parent.children.len(), 2);
    assert_eq!(parent.status, TradeStatus::Closed);
    let metrics = measure::all(&out.trades);
    assert_eq!(metrics[&parent.id].net, Some(dec!(50)));
    assert!(out.strategy_suggestions.is_empty());
}

#[test]
fn a_loss_is_washed_into_a_repurchase_within_thirty_days() {
    let out = run(vec![
        buy("1", CASH, "X", dec!(100), dec!(10), "2026-01-02T15:00:00Z"),
        sell("2", CASH, "X", dec!(100), dec!(8), "2026-01-10T15:00:00Z"),
        buy("3", CASH, "X", dec!(100), dec!(9), "2026-01-20T15:00:00Z"),
        sell("4", CASH, "X", dec!(100), dec!(9.5), "2026-03-01T15:00:00Z"),
    ]);
    let trades = singles(&out);
    let first = trades[0].lots[0].closures[0].tax.as_ref().unwrap();
    assert_eq!(
        (first.realized, first.wash_disallowed),
        (dec!(-200), dec!(200))
    );
    assert!(!first.wash_permanent);
    let second = trades[1].lots[0].closures[0].tax.as_ref().unwrap();
    assert_eq!(
        second.cost,
        dec!(1100),
        "the disallowed loss joined the replacement's basis"
    );
    assert_eq!(second.realized, dec!(-150));
    assert_eq!(net(trades[1]), Some(dec!(50)), "trading P&L is unaffected");
}

#[test]
fn a_replacement_bought_earlier_counts_only_while_held() {
    let out = run(vec![
        buy("1", CASH, "X", dec!(100), dec!(10), "2026-01-02T15:00:00Z"),
        buy("2", CASH, "X", dec!(100), dec!(10), "2026-01-05T15:00:00Z"),
        sell("3", CASH, "X", dec!(100), dec!(8), "2026-01-10T15:00:00Z"),
    ]);
    let lots = &singles(&out)[0].lots;
    let tax = lots[0].closures[0].tax.as_ref().unwrap();
    assert_eq!(tax.wash_disallowed, dec!(200));
    assert_eq!(lots[1].wash_adjustments[0].amount, dec!(200));
}

#[test]
fn an_ira_repurchase_disallows_the_loss_for_good() {
    let out = run(vec![
        buy("1", CASH, "X", dec!(100), dec!(10), "2026-01-02T15:00:00Z"),
        sell("2", CASH, "X", dec!(100), dec!(8), "2026-01-10T15:00:00Z"),
        buy("3", IRA, "X", dec!(100), dec!(9), "2026-01-20T15:00:00Z"),
    ]);
    let cash = singles(&out)
        .into_iter()
        .find(|t| t.workspace_id == CASH)
        .unwrap();
    let tax = cash.lots[0].closures[0].tax.as_ref().unwrap();
    assert!(tax.wash_permanent);
    assert_eq!(tax.wash_disallowed, dec!(200));
    let ira = singles(&out)
        .into_iter()
        .find(|t| t.workspace_id == IRA)
        .unwrap();
    assert!(ira.lots[0].wash_adjustments.is_empty());
}

#[test]
fn gains_and_distant_repurchases_are_not_washed() {
    let out = run(vec![
        buy("1", CASH, "X", dec!(100), dec!(10), "2026-01-02T15:00:00Z"),
        sell("2", CASH, "X", dec!(100), dec!(8), "2026-01-10T15:00:00Z"),
        buy("3", CASH, "X", dec!(100), dec!(9), "2026-03-20T15:00:00Z"),
        buy("4", CASH, "Y", dec!(1), dec!(10), "2026-01-02T15:00:00Z"),
        sell("5", CASH, "Y", dec!(1), dec!(12), "2026-01-10T15:00:00Z"),
        buy("6", CASH, "Y", dec!(1), dec!(11), "2026-01-11T15:00:00Z"),
    ]);
    for trade in singles(&out)
        .into_iter()
        .filter(|t| t.status == TradeStatus::Closed)
    {
        let tax = trade.lots[0].closures[0].tax.as_ref().unwrap();
        assert_eq!(
            tax.wash_disallowed,
            Decimal::ZERO,
            "{}",
            trade.instrument.symbol
        );
    }
}

mod properties {
    use super::*;
    use proptest::prelude::*;
    use std::collections::HashSet;

    fn sequence() -> impl Strategy<Value = Vec<(bool, u32, u32)>> {
        prop::collection::vec((any::<bool>(), 1u32..50, 1u32..2000), 1..40)
    }

    fn fills(seq: &[(bool, u32, u32)], workspace: Uuid) -> Vec<ActivityRow> {
        seq.iter()
            .enumerate()
            .map(|(i, (is_buy, quantity, cents))| {
                let when = (at("2026-01-01T15:00:00Z") + Duration::minutes(i as i64)).to_rfc3339();
                let price = Decimal::new(i64::from(*cents), 2);
                let id = format!("{i:04}");
                if *is_buy {
                    buy(&id, workspace, "P", Decimal::from(*quantity), price, &when)
                } else {
                    sell(&id, workspace, "P", Decimal::from(*quantity), price, &when)
                }
            })
            .collect()
    }

    /// A naive FIFO ledger over signed quantities, for comparison.
    fn reference(seq: &[(bool, u32, u32)]) -> Decimal {
        let mut lots: std::collections::VecDeque<(Decimal, Decimal)> = Default::default();
        let mut realized = Decimal::ZERO;
        for (is_buy, quantity, cents) in seq {
            let mut q = Decimal::from(*quantity)
                * if *is_buy {
                    Decimal::ONE
                } else {
                    Decimal::NEGATIVE_ONE
                };
            let price = Decimal::new(i64::from(*cents), 2);
            while !q.is_zero() {
                match lots.front_mut() {
                    Some((lq, lp)) if lq.is_sign_positive() != q.is_sign_positive() => {
                        let take = q.abs().min(lq.abs());
                        let sign = if lq.is_sign_positive() {
                            Decimal::ONE
                        } else {
                            Decimal::NEGATIVE_ONE
                        };
                        realized += (price - *lp) * take * sign;
                        *lq -= take * sign;
                        q += take * sign;
                        if lq.is_zero() {
                            lots.pop_front();
                        }
                    }
                    _ => {
                        lots.push_back((q, price));
                        q = Decimal::ZERO;
                    }
                }
            }
        }
        realized
    }

    proptest! {
        #[test]
        fn engine_matches_a_reference_ledger(seq in sequence()) {
            let out = run(fills(&seq, MARGIN));
            let keys: HashSet<String> = out.trades.iter().flat_map(|t| t.fills.iter().map(|f| f.key.clone())).collect();
            prop_assert_eq!(keys.len(), seq.len(), "every fill lands in a trade");
            let gross: Decimal = out.trades.iter().flat_map(|t| &t.lots).flat_map(|l| &l.closures).map(|c| c.gross).sum();
            prop_assert_eq!(gross, reference(&seq));
            let position: Decimal = seq.iter().map(|(b, q, _)| if *b { Decimal::from(*q) } else { -Decimal::from(*q) }).sum();
            let open: Decimal = out.trades.iter().flat_map(|t| &t.lots).map(|l| l.quantity * l.direction.sign()).sum();
            prop_assert_eq!(open, position, "quantity is conserved");
            prop_assert!(out.trades.iter().filter(|t| t.status == TradeStatus::Open).count() <= 1);
        }

        #[test]
        fn input_order_does_not_matter(seq in sequence()) {
            let rows = fills(&seq, MARGIN);
            let mut reversed = rows.clone();
            reversed.reverse();
            prop_assert_eq!(run(rows).trades, run(reversed).trades);
        }

        #[test]
        fn closed_trades_net_their_cash_flows(seq in sequence()) {
            let out = run(fills(&seq, CASH));
            for trade in out.trades.iter().filter(|t| t.status == TradeStatus::Closed) {
                let flows: Decimal = trade.fills.iter().map(|f| match f.role {
                    FillRole::Open | FillRole::Add => -f.quantity * f.price,
                    _ => f.quantity * f.price,
                }).sum();
                prop_assert_eq!(measure::single(trade).net, Some(flows));
            }
        }
    }
}
