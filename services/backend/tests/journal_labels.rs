//! Journal labels (edges, entry tactics, tags, mistakes), initial risk, and
//! stops suggested from imported orders.

use std::sync::Arc;

use chrono::{Duration, Utc};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use sqlx::types::Json;
use tradstry::brokerage::Brokerage;
use tradstry::brokerage::history::ImportMode;
use tradstry::brokerage::linking::Selection;
use tradstry::snaptrade::fake::{FakeAccount, FakeSnapTrade};
use tradstry::trades::decisions::DecisionKind;
use tradstry::trades::labels::{self, LabelInput, LabelKind, LabelRef};
use tradstry::trades::model::{AssetClass, Side};
use tradstry::trades::read::{self, TradeFilter, TradeRow, TradeSort};
use tradstry::trades::service::{
    self, AnnotationInput, InstrumentInput, ManualFillInput, TradeError,
};
use tradstry::users::{self, Provisioning};

async fn user(pool: &PgPool, stytch: &str) -> Uuid {
    users::load_user(pool, stytch, "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id
}

fn named(name: &str) -> LabelInput {
    LabelInput {
        name: name.into(),
        ..LabelInput::default()
    }
}

async fn label(pool: &PgPool, owner: Uuid, kind: LabelKind, name: &str) -> Uuid {
    labels::create(pool, owner, kind, &named(name))
        .await
        .unwrap()
        .id
}

fn names(labels: &Json<Vec<LabelRef>>) -> Vec<&str> {
    labels.0.iter().map(|l| l.name.as_str()).collect()
}

fn code(error: TradeError) -> String {
    match error {
        TradeError::Invalid(code, _) => code.to_owned(),
        TradeError::LabelExists(_) => "LABEL_EXISTS".into(),
        TradeError::NotFound => "NOT_FOUND".into(),
        other => format!("{other:?}"),
    }
}

/// A manual workspace with two AAPL round trips: +10 then +15.
async fn journal(pool: &PgPool, owner: Uuid) -> (Uuid, Vec<TradeRow>) {
    journal_named(pool, owner, "Paper").await
}

async fn journal_named(pool: &PgPool, owner: Uuid, name: &str) -> (Uuid, Vec<TradeRow>) {
    let workspace = tradstry::workspace::create(pool, owner, name)
        .await
        .unwrap()
        .id;
    for (side, quantity, price, minutes) in [
        (Side::Buy, dec!(10), dec!(10), 0),
        (Side::Sell, dec!(10), dec!(11), 60),
        (Side::Buy, dec!(5), dec!(12), 120),
        (Side::Sell, dec!(5), dec!(15), 180),
    ] {
        fill(pool, owner, workspace, side, quantity, price, minutes).await;
    }
    (
        workspace,
        trades(pool, owner, workspace, &TradeFilter::default()).await,
    )
}

async fn fill(
    pool: &PgPool,
    owner: Uuid,
    workspace: Uuid,
    side: Side,
    quantity: Decimal,
    price: Decimal,
    minutes: i64,
) {
    let input = ManualFillInput {
        instrument: InstrumentInput {
            asset_class: AssetClass::Stock,
            symbol: "AAPL".into(),
            expiry: None,
            right: None,
            strike: None,
            mini: false,
        },
        side,
        quantity,
        price,
        fee: Decimal::ZERO,
        intent: None,
        executed_at: "2026-01-02T15:00:00Z"
            .parse::<chrono::DateTime<Utc>>()
            .unwrap()
            + Duration::minutes(minutes),
        note: String::new(),
    };
    service::add_manual_fill(pool, owner, workspace, &input)
        .await
        .unwrap();
}

async fn trades(
    pool: &PgPool,
    owner: Uuid,
    workspace: Uuid,
    filter: &TradeFilter,
) -> Vec<TradeRow> {
    read::trades(pool, owner, workspace, filter, TradeSort::OpenedAsc, 0, 50)
        .await
        .unwrap()
        .1
}

async fn save(
    pool: &PgPool,
    owner: Uuid,
    workspace: Uuid,
    trade: &str,
    version: Option<i32>,
    input: AnnotationInput,
) -> Result<Uuid, TradeError> {
    service::save_annotation(pool, owner, workspace, trade, version, &input).await
}

#[sqlx::test]
async fn names_are_unique_per_kind_ignoring_case_and_archiving_frees_them(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let orb = label(&pool, owner, LabelKind::Edge, "Opening range  breakout").await;
    let created = labels::get(&pool, owner, orb).await.unwrap();
    assert_eq!(
        created.name, "Opening range breakout",
        "spaces are collapsed"
    );

    let clash = labels::create(
        &pool,
        owner,
        LabelKind::Edge,
        &named(" opening RANGE breakout"),
    )
    .await;
    assert!(matches!(clash, Err(TradeError::LabelExists(id)) if id == orb));
    label(&pool, owner, LabelKind::Tag, "Opening range breakout").await;

    labels::set_archived(&pool, owner, orb, true).await.unwrap();
    let again = label(&pool, owner, LabelKind::Edge, "Opening range breakout").await;
    assert_ne!(again, orb, "an archived name can be used again");
    let unarchive = labels::set_archived(&pool, owner, orb, false).await;
    assert!(matches!(unarchive, Err(TradeError::LabelExists(id)) if id == again));

    let listed = labels::list(&pool, owner, Some(LabelKind::Edge), false)
        .await
        .unwrap();
    assert_eq!(listed.iter().map(|l| l.id).collect::<Vec<_>>(), [again]);
    assert_eq!(
        labels::list(&pool, owner, Some(LabelKind::Edge), true)
            .await
            .unwrap()
            .len(),
        2
    );

    assert_eq!(
        code(
            labels::create(&pool, owner, LabelKind::Tag, &named("  "))
                .await
                .unwrap_err()
        ),
        "INVALID_NAME"
    );
    let bad_color = LabelInput {
        color: Some("red".into()),
        ..named("Red")
    };
    assert_eq!(
        code(
            labels::create(&pool, owner, LabelKind::Tag, &bad_color)
                .await
                .unwrap_err()
        ),
        "INVALID_COLOR"
    );
}

#[sqlx::test]
async fn the_database_refuses_a_label_of_the_wrong_kind(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let tag = label(&pool, owner, LabelKind::Tag, "gap up").await;
    let entry = save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        None,
        AnnotationInput::default(),
    )
    .await
    .unwrap();

    for kind in ["edge", "entry_tactic", "mistake"] {
        let filed = sqlx::query(
            "INSERT INTO trade_annotation_labels (annotation_id, label_id, kind) VALUES ($1, $2, $3)",
        )
        .bind(entry)
        .bind(tag)
        .bind(kind)
        .execute(&pool)
        .await;
        assert!(filed.is_err(), "a tag cannot be filed as {kind}");
    }

    let through_service = save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        Some(1),
        AnnotationInput {
            edge_ids: vec![tag],
            ..AnnotationInput::default()
        },
    )
    .await;
    assert_eq!(code(through_service.unwrap_err()), "INVALID_LABEL");
}

#[sqlx::test]
async fn entries_hold_labels_and_risk_and_r_prefers_planned_risk(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let orb = label(&pool, owner, LabelKind::Edge, "ORB").await;
    let pullback = label(&pool, owner, LabelKind::EntryTactic, "Pullback").await;
    let gap = label(&pool, owner, LabelKind::Tag, "gap up").await;
    let chased = label(&pool, owner, LabelKind::Mistake, "Chased").await;
    let volume = label(&pool, owner, LabelKind::Edge, "Relative volume").await;
    save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        None,
        AnnotationInput {
            notes: "first".into(),
            edge_ids: vec![orb, volume, orb],
            entry_tactic_ids: vec![pullback],
            tag_ids: vec![gap, gap],
            mistake_ids: vec![chased],
            initial_stop: Some(dec!(9.5)),
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();

    let row = &trades(&pool, owner, workspace, &TradeFilter::default()).await[0];
    assert_eq!(
        names(&row.edges),
        ["ORB", "Relative volume"],
        "several edges, no duplicates"
    );
    assert_eq!(names(&row.entry_tactics), ["Pullback"]);
    assert_eq!(
        row.tags
            .0
            .iter()
            .map(|t| t.name.as_str())
            .collect::<Vec<_>>(),
        ["gap up"]
    );
    assert_eq!(row.mistakes.0.len(), 1);
    assert_eq!(
        row.r_multiple(),
        Some(dec!(2)),
        "10 net over 0.5 × 10 risked"
    );

    save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        Some(1),
        AnnotationInput {
            edge_ids: vec![orb],
            initial_stop: Some(dec!(9.5)),
            planned_risk: Some(dec!(4)),
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();
    let row = &trades(&pool, owner, workspace, &TradeFilter::default()).await[0];
    assert_eq!(
        row.r_multiple(),
        Some(dec!(2.5)),
        "a planned dollar risk wins over the stop"
    );
    assert!(
        row.tags.0.is_empty() && row.entry_tactics.0.is_empty() && names(&row.edges) == ["ORB"],
        "a save replaces every label"
    );

    let bad = save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        Some(2),
        AnnotationInput {
            planned_risk: Some(dec!(0)),
            ..AnnotationInput::default()
        },
    )
    .await;
    assert_eq!(code(bad.unwrap_err()), "INVALID_PRICE");
}

#[sqlx::test]
async fn merging_labels_moves_every_use(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let (a, b) = (
        label(&pool, owner, LabelKind::Edge, "orb").await,
        label(&pool, owner, LabelKind::Edge, "ORB proper").await,
    );
    let (t1, t2) = (
        label(&pool, owner, LabelKind::Tag, "gap").await,
        label(&pool, owner, LabelKind::Tag, "gap up").await,
    );
    let tactic = label(&pool, owner, LabelKind::EntryTactic, "Pullback").await;
    save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        None,
        AnnotationInput {
            edge_ids: vec![a, b],
            tag_ids: vec![t1, t2],
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();
    save(
        &pool,
        owner,
        workspace,
        &rows[1].id,
        None,
        AnnotationInput {
            edge_ids: vec![b],
            tag_ids: vec![t2],
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(
        code(labels::merge(&pool, owner, t1, tactic).await.unwrap_err()),
        "INVALID_LABEL"
    );
    labels::merge(&pool, owner, t1, t2).await.unwrap();
    let merged = labels::merge(&pool, owner, a, b).await.unwrap();
    assert_eq!(
        merged.trade_count, 2,
        "both trades now use the surviving edge, once each"
    );
    assert_eq!(
        code(labels::get(&pool, owner, a).await.unwrap_err()),
        "NOT_FOUND"
    );

    let rows = trades(&pool, owner, workspace, &TradeFilter::default()).await;
    assert!(rows.iter().all(|r| names(&r.edges) == ["ORB proper"]));
    assert_eq!(
        rows[0]
            .tags
            .0
            .iter()
            .map(|t| t.name.as_str())
            .collect::<Vec<_>>(),
        ["gap up"],
        "the duplicate was dropped"
    );
}

#[sqlx::test]
async fn labels_in_use_are_archived_not_deleted(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let orb = label(&pool, owner, LabelKind::Edge, "ORB").await;
    let unused = label(&pool, owner, LabelKind::Edge, "Unused").await;
    save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        None,
        AnnotationInput {
            edge_ids: vec![orb],
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(
        code(labels::delete(&pool, owner, orb).await.unwrap_err()),
        "LABEL_IN_USE"
    );
    labels::delete(&pool, owner, unused).await.unwrap();

    labels::set_archived(&pool, owner, orb, true).await.unwrap();
    let kept = save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        Some(1),
        AnnotationInput {
            edge_ids: vec![orb],
            notes: "still ORB".into(),
            ..AnnotationInput::default()
        },
    )
    .await;
    assert!(
        kept.is_ok(),
        "an archived label stays on the entry it is on"
    );
    let row = &trades(&pool, owner, workspace, &TradeFilter::default()).await[0];
    assert!(row.edges.0[0].archived);
    let newly = save(
        &pool,
        owner,
        workspace,
        &rows[1].id,
        None,
        AnnotationInput {
            edge_ids: vec![orb],
            ..AnnotationInput::default()
        },
    )
    .await;
    assert_eq!(
        code(newly.unwrap_err()),
        "INVALID_LABEL",
        "but cannot be newly picked"
    );
}

#[sqlx::test]
async fn another_users_labels_cannot_be_used_or_seen(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let stranger = user(&pool, "user-2").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let theirs = label(&pool, stranger, LabelKind::Edge, "Theirs").await;
    let used = save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        None,
        AnnotationInput {
            edge_ids: vec![theirs],
            ..AnnotationInput::default()
        },
    )
    .await;
    assert_eq!(code(used.unwrap_err()), "INVALID_LABEL");
    assert_eq!(
        code(labels::get(&pool, owner, theirs).await.unwrap_err()),
        "NOT_FOUND"
    );
    assert_eq!(
        code(labels::delete(&pool, owner, theirs).await.unwrap_err()),
        "NOT_FOUND"
    );
    assert!(
        labels::list(&pool, owner, None, true)
            .await
            .unwrap()
            .is_empty()
    );
}

#[sqlx::test]
async fn labels_follow_their_trade_through_a_merge_and_undo(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let orb = label(&pool, owner, LabelKind::Edge, "ORB").await;
    let gap = label(&pool, owner, LabelKind::Tag, "gap up").await;
    save(
        &pool,
        owner,
        workspace,
        &rows[1].id,
        None,
        AnnotationInput {
            edge_ids: vec![orb],
            tag_ids: vec![gap],
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();

    let (decision, _) = service::decide(
        &pool,
        owner,
        workspace,
        &DecisionKind::Merge {
            trade_ids: vec![rows[0].id.clone(), rows[1].id.clone()],
        },
    )
    .await
    .unwrap();
    let merged = trades(&pool, owner, workspace, &TradeFilter::default()).await;
    assert_eq!(merged.len(), 1);
    assert_eq!(names(&merged[0].edges), ["ORB"]);
    assert_eq!(merged[0].tags.0.len(), 1);

    service::undo_decision(&pool, owner, decision)
        .await
        .unwrap();
    let back = trades(&pool, owner, workspace, &TradeFilter::default()).await;
    assert!(back[0].edges.0.is_empty());
    assert_eq!(
        names(&back[1].edges),
        ["ORB"],
        "back on the trade it was written for"
    );
}

#[sqlx::test]
async fn trades_filter_by_each_label_kind(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let orb = label(&pool, owner, LabelKind::Edge, "ORB").await;
    let pullback = label(&pool, owner, LabelKind::EntryTactic, "Pullback").await;
    let gap = label(&pool, owner, LabelKind::Tag, "gap up").await;
    let chased = label(&pool, owner, LabelKind::Mistake, "Chased").await;
    save(
        &pool,
        owner,
        workspace,
        &rows[0].id,
        None,
        AnnotationInput {
            edge_ids: vec![orb],
            tag_ids: vec![gap],
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();
    save(
        &pool,
        owner,
        workspace,
        &rows[1].id,
        None,
        AnnotationInput {
            entry_tactic_ids: vec![pullback],
            mistake_ids: vec![chased],
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();

    let ids = |rows: Vec<TradeRow>| rows.into_iter().map(|r| r.id).collect::<Vec<_>>();
    let first = vec![rows[0].id.clone()];
    let second = vec![rows[1].id.clone()];
    assert_eq!(
        ids(trades(
            &pool,
            owner,
            workspace,
            &TradeFilter {
                edge_id: Some(orb),
                ..TradeFilter::default()
            }
        )
        .await),
        first
    );
    assert_eq!(
        ids(trades(
            &pool,
            owner,
            workspace,
            &TradeFilter {
                tag_id: Some(gap),
                ..TradeFilter::default()
            }
        )
        .await),
        first
    );
    assert_eq!(
        ids(trades(
            &pool,
            owner,
            workspace,
            &TradeFilter {
                entry_tactic_id: Some(pullback),
                ..TradeFilter::default()
            }
        )
        .await),
        second
    );
    assert_eq!(
        ids(trades(
            &pool,
            owner,
            workspace,
            &TradeFilter {
                mistake_id: Some(chased),
                ..TradeFilter::default()
            }
        )
        .await),
        second
    );

    let stats = read::stats(&pool, owner, Some(workspace), None, None)
        .await
        .unwrap();
    assert_eq!(
        stats
            .by_edge
            .iter()
            .map(|b| (b.key.as_str(), b.trades))
            .collect::<Vec<_>>(),
        [("ORB", 1), ("None", 1)]
    );
    assert_eq!(stats.mistake_costs[0].net, dec!(15.00));
    assert_eq!(stats.untagged, 1);
}

#[sqlx::test]
async fn trades_filter_by_when_they_closed(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (workspace, rows) = journal(&pool, owner).await;
    let at = |time: &str| Some(time.parse::<chrono::DateTime<Utc>>().unwrap());
    let ids = |rows: Vec<TradeRow>| rows.into_iter().map(|r| r.id).collect::<Vec<_>>();

    let first_close = TradeFilter {
        closed_from: at("2026-01-02T15:30:00Z"),
        closed_to: at("2026-01-02T17:00:00Z"),
        ..TradeFilter::default()
    };
    assert_eq!(
        ids(trades(&pool, owner, workspace, &first_close).await),
        [rows[0].id.clone()],
        "the first trade closed at 16:00"
    );
    let later = TradeFilter {
        closed_from: at("2026-01-02T16:30:00Z"),
        ..TradeFilter::default()
    };
    assert_eq!(
        ids(trades(&pool, owner, workspace, &later).await),
        [rows[1].id.clone()]
    );
}

// ── Suggested stops ─────────────────────────────────────────────────────────

fn order(
    id: &str,
    action: &str,
    symbol: Value,
    kind: &str,
    stop: f64,
    minutes_after_open: i64,
    status: &str,
) -> Value {
    let mut order = json!({
        "brokerage_order_id": id, "status": status, "action": action, "order_type": kind,
        "stop_price": stop, "limit_price": 0, "total_quantity": "10", "filled_quantity": "0",
        "time_placed": (opened() + Duration::minutes(minutes_after_open)).to_rfc3339(),
    });
    if symbol.get("ticker").is_some() {
        order["option_symbol"] = symbol;
    } else {
        order["universal_symbol"] = symbol;
    }
    order
}

fn opened() -> chrono::DateTime<Utc> {
    (Utc::now() - Duration::days(2))
        .date_naive()
        .and_hms_opt(15, 0, 0)
        .unwrap()
        .and_utc()
}

fn buy(id: &str, units: i64, price: f64, extra: Value) -> Value {
    let mut fill = json!({
        "id": id, "type": "BUY", "units": units, "price": price, "amount": -(units as f64 * price), "fee": 0,
        "currency": {"code": "USD"}, "trade_date": opened().to_rfc3339(), "description": "",
        "symbol": {"id": "sym-aapl", "symbol": "AAPL"}, "option_symbol": null,
    });
    for (k, v) in extra.as_object().unwrap() {
        fill[k] = v.clone();
    }
    fill
}

#[sqlx::test]
async fn the_first_protective_stop_order_is_suggested(pool: PgPool) {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Arc::new(Brokerage::for_tests(pool.clone(), &snaptrade));
    let owner = user(&pool, "user-1").await;
    brokerage.start_commercial(owner, None).await.unwrap();
    snaptrade.complete_portal(
        &owner.to_string(),
        "conn-1",
        vec![FakeAccount::investment("acct-1", "Margin")],
    );
    let put = json!({"ticker": "IONQ  260508P00037000", "is_mini_option": false});
    snaptrade.set_activities(
        "acct-1",
        vec![
            buy("a1", 10, 100.0, json!({})),
            buy("a2", 1, 1.68, json!({"symbol": null, "option_symbol": put, "option_type": "BUY_TO_OPEN", "amount": -168.0})),
        ],
    );
    snaptrade.set_orders(
        "acct-1",
        vec![
            order(
                "o1",
                "SELL",
                json!({"symbol": "AAPL"}),
                "Limit",
                0.0,
                5,
                "CANCELED",
            ),
            order(
                "o2",
                "BUY",
                json!({"symbol": "AAPL"}),
                "Stop",
                105.0,
                6,
                "ACCEPTED",
            ),
            order(
                "o3",
                "SELL",
                json!({"symbol": "MSFT"}),
                "Stop",
                90.0,
                7,
                "ACCEPTED",
            ),
            order(
                "o4",
                "SELL",
                json!({"symbol": "AAPL"}),
                "StopLimit",
                95.5,
                8,
                "CANCELED",
            ),
            order(
                "o5",
                "SELL",
                json!({"symbol": "AAPL"}),
                "Stop",
                97.0,
                30,
                "ACCEPTED",
            ),
            order("o6", "SELL", put.clone(), "Stop", 1.1, 9, "ACCEPTED"),
            order(
                "o7",
                "SELL",
                json!({"symbol": "AAPL"}),
                "Stop",
                80.0,
                -60,
                "CANCELED",
            ),
        ],
    );
    let choices = brokerage
        .complete_commercial(owner, "conn-1")
        .await
        .unwrap();
    let account = brokerage
        .finalize_accounts(
            owner,
            vec![Selection {
                connection_id: choices[0].connection_id,
                snaptrade_account_id: "acct-1".into(),
                mode: ImportMode::All,
                custom_start_date: None,
            }],
        )
        .await
        .unwrap()
        .remove(0);
    brokerage.run_due_jobs(10).await.unwrap();
    let workspace = account.workspace_id.unwrap();

    let rows = trades(&pool, owner, workspace, &TradeFilter::default()).await;
    let stock = rows.iter().find(|r| r.symbol == "AAPL").unwrap();
    let suggested = read::suggested_stop(&pool, owner, stock)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (
            suggested.price,
            suggested.order_type.as_str(),
            suggested.status.as_deref()
        ),
        (dec!(95.5), "StopLimit", Some("CANCELED")),
        "the first sell stop on AAPL after the entry, cancelled or not; its trigger, not its limit"
    );
    let option = rows.iter().find(|r| r.asset_class == "option").unwrap();
    assert_eq!(
        read::suggested_stop(&pool, owner, option)
            .await
            .unwrap()
            .unwrap()
            .price,
        dec!(1.1)
    );

    save(
        &pool,
        owner,
        workspace,
        &stock.id,
        None,
        AnnotationInput {
            initial_stop: Some(dec!(95.5)),
            ..AnnotationInput::default()
        },
    )
    .await
    .unwrap();
    let stock = trades(&pool, owner, workspace, &TradeFilter::default())
        .await
        .into_iter()
        .find(|r| r.symbol == "AAPL")
        .unwrap();
    assert!(
        read::suggested_stop(&pool, owner, &stock)
            .await
            .unwrap()
            .is_none(),
        "nothing to suggest once a stop is set"
    );
}

#[sqlx::test]
async fn manual_trades_have_no_suggested_stop(pool: PgPool) {
    let owner = user(&pool, "user-1").await;
    let (_, rows) = journal(&pool, owner).await;
    assert!(
        read::suggested_stop(&pool, owner, &rows[0])
            .await
            .unwrap()
            .is_none()
    );
}
