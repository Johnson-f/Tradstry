//! Every report counts the same trades: the dashboard, the calendar, the journal
//! summary and analytics agree for a workspace with the journal on or off.

use sqlx::PgPool;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::db::schema::tables::trade_review_table;
use tradstry_backend::service::read_service::analytics::{
    AnalyticsTimeFilter, get_advanced_analytics, get_journal_analytics,
};
use tradstry_backend::service::read_service::trade_set::{TradeCoverage, TradeScope};
use tradstry_backend::service::trade_review::journal_flow;
use tradstry_backend::service::trading_performance::{
    load_trading_calendar, load_trading_performance,
};

struct Fill<'a> {
    name: &'a str,
    symbol: &'a str,
    side: &'a str,
    price: f64,
    fee: f64,
    at: &'a str,
}

async fn fill(pool: &PgPool, user: &str, workspace: &str, f: Fill<'_>) {
    let id = format!("{workspace}:{}", f.name);
    sqlx::query("INSERT INTO brokerage_transactions(id,user_id,workspace_id,snaptrade_id,symbol,symbol_description,currency,transaction_type,price,units,fee,trade_date,settlement_date,institution,raw_json,dedup_key)
        VALUES ($1,$2,$3,$1,$4,$4,'USD',$5,$6,10,$7,$8::text::timestamptz,$8::text::timestamptz,'test',$9,$1)")
        .bind(&id).bind(user).bind(workspace).bind(f.symbol).bind(f.side).bind(f.price).bind(f.fee).bind(f.at)
        .bind(serde_json::json!({"fee":f.fee,"trade_date":f.at,"type":f.side}).to_string())
        .execute(pool).await.unwrap();
}

/// 10 shares bought and sold on one day, at 14:00 and 16:00 UTC.
#[derive(Clone, Copy)]
struct Trip<'a> {
    symbol: &'a str,
    day: &'a str,
    buy: f64,
    sell: f64,
    /// Per execution; broker trades only.
    fee: f64,
}

fn trip<'a>(symbol: &'a str, day: &'a str, buy: f64, sell: f64) -> Trip<'a> {
    Trip {
        symbol,
        day,
        buy,
        sell,
        fee: 0.0,
    }
}

async fn round_trip(pool: &PgPool, user: &str, workspace: &str, trip: Trip<'_>) {
    let Trip {
        symbol,
        day,
        buy,
        sell,
        fee,
    } = trip;
    let open = format!("{day}T14:00:00Z");
    let close = format!("{day}T16:00:00Z");
    let buy_name = format!("{symbol}-buy");
    let sell_name = format!("{symbol}-sell");
    fill(
        pool,
        user,
        workspace,
        Fill {
            name: &buy_name,
            symbol,
            side: "BUY",
            price: buy,
            fee,
            at: &open,
        },
    )
    .await;
    fill(
        pool,
        user,
        workspace,
        Fill {
            name: &sell_name,
            symbol,
            side: "SELL",
            price: sell,
            fee,
            at: &close,
        },
    )
    .await;
}

/// A manual trade, saved the way older clients saved them.
async fn manual(pool: &PgPool, user: &str, workspace: &str, id: &str, trip: Trip<'_>) {
    let Trip {
        symbol,
        day,
        buy,
        sell,
        ..
    } = trip;
    let percent = (sell - buy) / buy * 100.0;
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,total_pl,net_roi,duration,status)
        VALUES($1,$2,$3,$4,$4,'long',($5||'T14:00:00Z')::timestamptz,($5||'T16:00:00Z')::timestamptz,$6,$7,10,$8,$8,7200,CASE WHEN $8>0 THEN 'profit' ELSE 'loss' END)")
        .bind(id).bind(user).bind(workspace).bind(symbol).bind(day).bind(buy).bind(sell).bind(percent)
        .execute(pool).await.unwrap();
}

struct Totals {
    dashboard: (f64, usize),
    calendar: (f64, usize),
    analytics: (f64, usize),
    journal: f64,
    win_rates: [f64; 4],
    coverage: TradeCoverage,
}

async fn totals(pool: &PgPool, user: &str, workspace: &str) -> Totals {
    let user_db = Db::from_pool(pool.clone()).get_user_db(user);
    let dashboard = load_trading_performance(pool, user, workspace, None, None)
        .await
        .unwrap();
    let calendar = load_trading_calendar(pool, user, workspace, 2026, 9)
        .await
        .unwrap();
    let analytics = get_advanced_analytics(
        &user_db,
        workspace,
        &AnalyticsTimeFilter::All,
        &Default::default(),
    )
    .await
    .unwrap();
    let journal = get_journal_analytics(&user_db, workspace, &AnalyticsTimeFilter::All)
        .await
        .unwrap();
    let round = |value: f64| (value * 100.0).round() / 100.0;
    Totals {
        dashboard: (
            round(dashboard.total_realized_pnl),
            dashboard.closed_trade_count,
        ),
        calendar: (round(calendar.month_profit), calendar.trade_count),
        analytics: (round(analytics.net_profit), analytics.trade_count),
        journal: round(journal.cumulative_profit),
        win_rates: [
            dashboard.win_rate,
            calendar.win_rate,
            analytics.win_rate,
            journal.win_rate,
        ]
        .map(round),
        coverage: analytics.coverage,
    }
}

fn assert_every_report(t: &Totals, money: f64, trades: usize) {
    assert_eq!(t.dashboard, (money, trades), "dashboard");
    assert_eq!(t.calendar, (money, trades), "calendar");
    assert_eq!(t.analytics, (money, trades), "analytics");
    assert_eq!(t.journal, money, "journal summary");
}

#[tokio::test(flavor = "multi_thread")]
async fn every_report_agrees_with_the_journal_on() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    sqlx::query("INSERT INTO journal_workspace_state(workspace_id,user_id,enabled,opening_inventory) VALUES ($1,$2,true,$3)")
        .bind(&workspace).bind(&user)
        .bind(serde_json::json!({"equity:ACME|USD":{"kind":"flat","as_of":"2026-09-01T00:00:00Z","provenance":"user_confirmed"},"equity:BETA|USD":{"kind":"flat","as_of":"2026-09-01T00:00:00Z","provenance":"user_confirmed"},"equity:CAPA|USD":{"kind":"flat","as_of":"2026-09-01T00:00:00Z","provenance":"user_confirmed"}}))
        .execute(&pool).await.unwrap();
    round_trip(
        &pool,
        &user,
        &workspace,
        Trip {
            fee: 1.0,
            ..trip("ACME", "2026-09-01", 100.0, 105.0)
        },
    )
    .await;
    round_trip(
        &pool,
        &user,
        &workspace,
        trip("BETA", "2026-09-02", 100.0, 98.0),
    )
    .await;
    // Up before fees, down after them: a loss by its money.
    round_trip(
        &pool,
        &user,
        &workspace,
        Trip {
            fee: 1.0,
            ..trip("CAPA", "2026-09-04", 100.0, 100.1)
        },
    )
    .await;
    journal_flow::seal_import(&pool, &user, &workspace)
        .await
        .unwrap();
    journal_flow::process_once(&pool, "trade-set-test")
        .await
        .unwrap();
    manual(
        &pool,
        &user,
        &workspace,
        "zeta",
        trip("ZETA", "2026-09-03", 10.0, 13.0),
    )
    .await;
    manual(
        &pool,
        &user,
        &workspace,
        "acme-copy",
        trip("ACME", "2026-09-01", 100.0, 105.0),
    )
    .await;

    let t = totals(&pool, &user, &workspace).await;

    // ACME 48 after fees, BETA -20, CAPA -1 after fees, ZETA +30; the ACME copy
    // waits for the user. Two wins of four decisive trades.
    assert_every_report(&t, 57.0, 4);
    assert_eq!(
        t.win_rates, [50.0; 4],
        "dashboard, calendar, analytics and journal win rates"
    );
    assert_eq!(
        t.coverage,
        TradeCoverage {
            broker_trades: 3,
            manual_trades: 1,
            manual_without_fees: 1,
            open_positions: 0,
            needs_review: 1,
            possible_duplicates: 1
        }
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn every_report_agrees_with_the_journal_off() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    round_trip(
        &pool,
        &user,
        &workspace,
        trip("ACME", "2026-09-01", 100.0, 98.0),
    )
    .await;
    // Up before fees, down after them: a loss by its money.
    round_trip(
        &pool,
        &user,
        &workspace,
        Trip {
            fee: 1.0,
            ..trip("CAPA", "2026-09-05", 100.0, 100.1)
        },
    )
    .await;
    round_trip(
        &pool,
        &user,
        &workspace,
        Trip {
            fee: 1.0,
            ..trip("BETA", "2026-09-02", 100.0, 105.0)
        },
    )
    .await;
    round_trip(
        &pool,
        &user,
        &workspace,
        Trip {
            fee: 1.0,
            ..trip("GAMA", "2026-09-03", 100.0, 103.0)
        },
    )
    .await;
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    let episode = |symbol: &'static str| {
        let pool = pool.clone();
        let workspace = workspace.clone();
        async move {
            sqlx::query_scalar::<_, String>("SELECT id FROM trade_episodes WHERE workspace_id=$1 AND instrument_json->>'symbol'=$2 AND retired_at IS NULL")
                .bind(&workspace).bind(symbol).fetch_one(&pool).await.unwrap()
        }
    };
    let beta = episode("BETA").await;

    // BETA was published from its review; GAMA was linked to an entry by hand.
    manual(
        &pool,
        &user,
        &workspace,
        "beta-entry",
        trip("BETA", "2026-09-02", 100.0, 105.0),
    )
    .await;
    manual(
        &pool,
        &user,
        &workspace,
        "gama-entry",
        trip("GAMA", "2026-09-03", 100.0, 103.0),
    )
    .await;
    sqlx::query("INSERT INTO brokerage_episode_publications(episode_id,user_id,workspace_id,journal_entry_id) VALUES ($1,$2,$3,'beta-entry')")
        .bind(&beta).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    for (entry, symbol) in [("beta-entry", "BETA"), ("gama-entry", "GAMA")] {
        for side in ["buy", "sell"] {
            sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) VALUES ($1,$2,$3,$4)")
                .bind(format!("{entry}-{side}")).bind(entry).bind(format!("{workspace}:{symbol}-{side}")).bind(&user)
                .execute(&pool).await.unwrap();
        }
    }
    manual(
        &pool,
        &user,
        &workspace,
        "zeta",
        trip("ZETA", "2026-09-04", 10.0, 13.0),
    )
    .await;

    let t = totals(&pool, &user, &workspace).await;

    // ACME -20 and CAPA -1 after fees from the broker; BETA 48 and GAMA 28 after
    // fees, each counted once as its journal entry; ZETA +30 by hand.
    assert_every_report(&t, 85.0, 5);
    assert_eq!(
        t.win_rates, [60.0; 4],
        "dashboard, calendar, analytics and journal win rates"
    );
    assert_eq!(
        t.coverage,
        TradeCoverage {
            broker_trades: 4,
            manual_trades: 1,
            manual_without_fees: 1,
            open_positions: 0,
            needs_review: 0,
            possible_duplicates: 0
        }
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn the_journal_off_case_from_the_check_counts_both_trades_everywhere() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    round_trip(
        &pool,
        &user,
        &workspace,
        trip("ACME", "2026-09-02", 100.0, 98.0),
    )
    .await;
    manual(
        &pool,
        &user,
        &workspace,
        "beta",
        trip("BETA", "2026-09-01", 100.0, 105.0),
    )
    .await;

    assert_every_report(&totals(&pool, &user, &workspace).await, 30.0, 2);
}

#[tokio::test(flavor = "multi_thread")]
async fn the_analytics_cache_sees_broker_history_and_plans_change() {
    use tradstry_backend::service::redis::analytics::workspace_version;
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
    let mut seen = vec![workspace_version(&user_db, &workspace).await.unwrap()];

    round_trip(
        &pool,
        &user,
        &workspace,
        trip("ACME", "2026-09-01", 100.0, 105.0),
    )
    .await;
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    seen.push(workspace_version(&user_db, &workspace).await.unwrap());
    manual(
        &pool,
        &user,
        &workspace,
        "acme-entry",
        trip("ACME", "2026-09-01", 100.0, 105.0),
    )
    .await;
    seen.push(workspace_version(&user_db, &workspace).await.unwrap());
    sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) VALUES ('link','acme-entry',$1,$2)")
        .bind(format!("{workspace}:ACME-buy")).bind(&user).execute(&pool).await.unwrap();
    seen.push(workspace_version(&user_db, &workspace).await.unwrap());

    let episode: String = sqlx::query_scalar("SELECT id FROM trade_episodes WHERE workspace_id=$1")
        .bind(&workspace)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO position_calculator_plans(id,user_id,workspace_id,symbol,position_type,entry_price,stop_loss,account_balance,account_risk,total_shares,position_value)
                 VALUES ('plan',$1,$2,'ACME','long',100,95,10000,1,10,1000)")
        .bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO trade_episode_matches(id,user_id,workspace_id,episode_id,plan_id,score,status,evidence_json) VALUES ('match',$1,$2,$3,'plan',1,'confirmed','{}')")
        .bind(&user).bind(&workspace).bind(&episode).execute(&pool).await.unwrap();
    seen.push(workspace_version(&user_db, &workspace).await.unwrap());
    sqlx::query("UPDATE position_calculator_plans SET stop_loss=96 WHERE id='plan'")
        .execute(&pool)
        .await
        .unwrap();
    seen.push(workspace_version(&user_db, &workspace).await.unwrap());

    for pair in seen.windows(2) {
        assert_ne!(
            pair[0], pair[1],
            "a change left the cached analytics in place"
        );
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn a_manual_trades_own_stop_counts_and_is_reported_with_the_journal_off() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    round_trip(
        &pool,
        &user,
        &workspace,
        trip("ACME", "2026-09-01", 100.0, 98.0),
    )
    .await;
    manual(
        &pool,
        &user,
        &workspace,
        "zeta",
        trip("ZETA", "2026-09-02", 10.0, 13.0),
    )
    .await;
    sqlx::query("UPDATE journal_entries SET stop_loss=9 WHERE id='zeta'")
        .execute(&pool)
        .await
        .unwrap();

    let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
    let analytics = get_advanced_analytics(
        &user_db,
        &workspace,
        &AnalyticsTimeFilter::All,
        &Default::default(),
    )
    .await
    .unwrap();
    let dashboard = load_trading_performance(&pool, &user, &workspace, None, None)
        .await
        .unwrap();

    // +30 on a risk of 1 a share over 10 shares.
    assert_eq!(
        (analytics.r_trade_count, analytics.r_typed_stop_count),
        (1, 1)
    );
    assert_eq!(analytics.expectancy_r, Some(3.0));
    assert_eq!(dashboard.average_realized_r, Some(3.0));
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_for_one_playbook_count_only_its_trades() {
    let db = crate::test_db::TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    sqlx::query(
        "INSERT INTO playbooks (id, user_id, workspace_id, name, edge_name, entry_rules, exit_rules, position_sizing_rules, hlc)
         VALUES ('orb', $1, $2, 'Opening range', 'Momentum', 'wait', 'scale', 'one risk', '1')",
    )
    .bind(&user)
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
    manual(
        &pool,
        &user,
        &workspace,
        "with",
        trip("AAPL", "2026-09-01", 100.0, 110.0),
    )
    .await;
    manual(
        &pool,
        &user,
        &workspace,
        "without",
        trip("MSFT", "2026-09-02", 100.0, 90.0),
    )
    .await;
    sqlx::query("UPDATE journal_entries SET playbook_id = 'orb' WHERE id = 'with'")
        .execute(&pool)
        .await
        .unwrap();

    let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
    let all = get_advanced_analytics(
        &user_db,
        &workspace,
        &AnalyticsTimeFilter::All,
        &Default::default(),
    )
    .await
    .unwrap();
    let orb = get_advanced_analytics(
        &user_db,
        &workspace,
        &AnalyticsTimeFilter::All,
        &TradeScope {
            playbook: Some("orb".into()),
            tag: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(all.trade_count, 2);
    assert_eq!(orb.trade_count, 1);
    assert!(orb.net_profit > 0.0, "only the winning ORB trade counts");
    assert_eq!(orb.coverage.manual_trades, 1);

    let listed = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    let with = listed.iter().find(|t| t.id == "with").unwrap();
    assert_eq!(with.playbook_id.as_deref(), Some("orb"));
}

#[tokio::test(flavor = "multi_thread")]
async fn analytics_for_one_tag_count_only_trades_with_it() {
    use tradstry_backend::service::db::schema::tables::tags_table;

    let db = crate::test_db::TestDb::new().await;
    let pool = db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let category = tags_table::create_category(&pool, &user, &workspace, "Setups", None)
        .await
        .unwrap();
    let fomo = tags_table::create_tag(&pool, &user, &workspace, &category.id, "FOMO", None)
        .await
        .unwrap();
    manual(
        &pool,
        &user,
        &workspace,
        "chased",
        trip("AAPL", "2026-09-01", 100.0, 90.0),
    )
    .await;
    manual(
        &pool,
        &user,
        &workspace,
        "patient",
        trip("MSFT", "2026-09-02", 100.0, 110.0),
    )
    .await;
    sqlx::query("INSERT INTO trade_tags (journal_entry_id, tag_id) VALUES ('chased', $1)")
        .bind(&fomo.id)
        .execute(&pool)
        .await
        .unwrap();

    let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
    let scope = TradeScope {
        playbook: None,
        tag: Some(fomo.id.clone()),
    };
    let tagged = get_advanced_analytics(&user_db, &workspace, &AnalyticsTimeFilter::All, &scope)
        .await
        .unwrap();
    assert_eq!(tagged.trade_count, 1);
    assert!(tagged.net_profit < 0.0, "only the FOMO trade counts");
}
