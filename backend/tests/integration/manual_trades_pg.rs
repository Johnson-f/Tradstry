//! Manual trades: fees, safe retries and version checks.

use sqlx::PgPool;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::db::schema::tables::journal_table::{
    self as jt, CreateJournalEntryInput, UpdateJournalEntryInput,
};
use tradstry_backend::service::read_service::analytics::{
    AnalyticsTimeFilter, get_advanced_analytics, get_journal_analytics,
};
use tradstry_backend::service::trading_performance::load_trading_performance;

/// 10 shares of `symbol` bought at 100 on 2026-09-01.
fn input(workspace: &str, symbol: &str, exit: f64, fees: Option<f64>) -> CreateJournalEntryInput {
    CreateJournalEntryInput {
        id: None,
        workspace_id: workspace.into(),
        open_date: "2026-09-01T14:00:00Z".into(),
        close_date: "2026-09-01T16:00:00Z".into(),
        entry_price: 100.0,
        exit_price: exit,
        position_size: 10.0,
        symbol: symbol.into(),
        symbol_name: Some(symbol.into()),
        stop_loss: 95.0,
        trade_type: "long".into(),
        playbook_id: None,
        notes: None,
        broke_30min_rule: None,
        pre_trade_conviction: None,
        market_regime: None,
        is_planned_pre_market: None,
        revenge_trade: None,
        rule_adherence_score: None,
        contract_multiplier: None,
        fees,
        brokerage_transaction_ids: None,
        tag_ids: Vec::new(),
        violated_principle_ids: Vec::new(),
    }
}

async fn money(pool: &PgPool, id: &str) -> (f64, String) {
    sqlx::query_as("SELECT realized_net::float8, outcome FROM journal_entries WHERE id=$1")
        .bind(id)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn fees_reach_every_report_and_decide_the_outcome() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;

    let win = jt::create_journal_entry(&pool, &user, input(&workspace, "ACME", 105.0, Some(7.0)))
        .await
        .unwrap();
    // Up 5 before fees, down 3 after them.
    let flipped =
        jt::create_journal_entry(&pool, &user, input(&workspace, "BETA", 100.5, Some(8.0)))
            .await
            .unwrap();
    let unknown = jt::create_journal_entry(&pool, &user, input(&workspace, "GAMA", 101.0, None))
        .await
        .unwrap();

    assert_eq!(money(&pool, &win.id).await, (43.0, "profit".into()));
    assert_eq!(money(&pool, &flipped.id).await, (-3.0, "loss".into()));
    assert_eq!(
        money(&pool, &unknown.id).await,
        (10.0, "profit".into()),
        "unknown fees leave the money as it was"
    );
    assert_eq!((flipped.status.as_str(), flipped.fees), ("loss", Some(8.0)));
    assert_eq!(unknown.fees, None);

    let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
    let analytics = get_advanced_analytics(
        &user_db,
        &workspace,
        &AnalyticsTimeFilter::All,
        &Default::default(),
    )
    .await
    .unwrap();
    let journal = get_journal_analytics(&user_db, &workspace, &AnalyticsTimeFilter::All)
        .await
        .unwrap();
    let dashboard = load_trading_performance(&pool, &user, &workspace, None, None)
        .await
        .unwrap();
    for (report, total, win_rate) in [
        ("analytics", analytics.net_profit, analytics.win_rate),
        ("journal", journal.cumulative_profit, journal.win_rate),
        (
            "dashboard",
            dashboard.total_realized_pnl,
            dashboard.win_rate,
        ),
    ] {
        assert!((total - 50.0).abs() < 1e-9, "{report} total {total}");
        assert!(
            (win_rate - 200.0 / 3.0).abs() < 1e-9,
            "{report} win rate {win_rate}"
        );
    }
    assert_eq!(
        (
            analytics.coverage.manual_trades,
            analytics.coverage.manual_without_fees
        ),
        (3, 1)
    );

    assert!(
        jt::create_journal_entry(&pool, &user, input(&workspace, "ZETA", 101.0, Some(-1.0)))
            .await
            .is_err()
    );
}

fn sync_args(id: &str, workspace: &str, exit: f64, fees: Option<f64>) -> jt::JournalWriteArgs {
    jt::JournalWriteArgs {
        id: id.into(),
        workspace_id: workspace.into(),
        open_date: "2026-09-01T14:00:00Z".into(),
        close_date: "2026-09-01T16:00:00Z".into(),
        entry_price: 100.0,
        exit_price: exit,
        position_size: 10.0,
        stop_loss: Some(95.0),
        symbol: "ACME".into(),
        symbol_name: "Acme".into(),
        trade_type: "long".into(),
        playbook_id: None,
        notes: None,
        broke_30min_rule: None,
        pre_trade_conviction: None,
        market_regime: None,
        is_planned_pre_market: None,
        revenge_trade: None,
        rule_adherence_score: None,
        tag_ids: Vec::new(),
        violated_principle_ids: Vec::new(),
        contract_multiplier: 1.0,
        fees,
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn an_older_client_that_leaves_fees_out_keeps_them() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let id = tradstry_backend::ids::new_uuid_v7().to_string();
    let mut conn = pool.acquire().await.unwrap();
    let hlc = tradstry_backend::service::hlc::stamp();

    jt::create_journal_entry_tx(
        &mut conn,
        &user,
        &sync_args(&id, &workspace, 105.0, Some(4.0)),
        &hlc,
    )
    .await
    .unwrap();
    jt::update_journal_entry_tx(
        &mut conn,
        &user,
        &sync_args(&id, &workspace, 101.0, None),
        &hlc,
    )
    .await
    .unwrap();
    drop(conn);

    // 10 before fees on the new exit, less the 4 already saved.
    assert_eq!(money(&pool, &id).await, (6.0, "profit".into()));
    let cleared = UpdateJournalEntryInput {
        clear_fees: true,
        ..Default::default()
    };
    assert_eq!(
        jt::update_journal_entry(&pool, &id, &user, cleared)
            .await
            .unwrap()
            .fees,
        None
    );
    assert_eq!(money(&pool, &id).await, (10.0, "profit".into()));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_client_chosen_id_makes_creating_a_trade_safe_to_retry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let (other, other_workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let id = "0199c3b0-0000-7000-8000-000000000001";
    let with_id = |workspace: &str| CreateJournalEntryInput {
        id: Some(id.into()),
        ..input(workspace, "ACME", 105.0, Some(1.0))
    };

    let first = jt::create_journal_entry(&pool, &user, with_id(&workspace))
        .await
        .unwrap();
    let retried = jt::create_journal_entry(&pool, &user, with_id(&workspace))
        .await
        .unwrap();
    assert_eq!((first.id.as_str(), retried.id.as_str()), (id, id));
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM journal_entries WHERE workspace_id=$1")
            .bind(&workspace)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 1);

    assert!(
        jt::create_journal_entry(&pool, &other, with_id(&other_workspace))
            .await
            .is_err(),
        "another user's id"
    );
    let bad = CreateJournalEntryInput {
        id: Some("not-a-uuid".into()),
        ..input(&workspace, "ACME", 105.0, None)
    };
    assert!(jt::create_journal_entry(&pool, &user, bad).await.is_err());
}

#[tokio::test(flavor = "multi_thread")]
async fn an_edit_based_on_a_stale_read_is_refused() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let trade = jt::create_journal_entry(&pool, &user, input(&workspace, "ACME", 105.0, None))
        .await
        .unwrap();

    let first = UpdateJournalEntryInput {
        notes: Some("first".into()),
        expected_version: Some(trade.record_version),
        ..Default::default()
    };
    let saved = jt::update_journal_entry(&pool, &trade.id, &user, first)
        .await
        .unwrap();
    assert!(saved.record_version > trade.record_version);

    let stale = UpdateJournalEntryInput {
        notes: Some("stale".into()),
        expected_version: Some(trade.record_version),
        ..Default::default()
    };
    let refused = jt::update_journal_entry(&pool, &trade.id, &user, stale)
        .await
        .unwrap_err();
    assert!(refused.to_string().starts_with("CONFLICT"), "{refused}");
    let notes: Option<String> = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
        .bind(&trade.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(notes.as_deref(), Some("first"));
}
