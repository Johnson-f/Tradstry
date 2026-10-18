use crate::journal_flow_pg::{enabled_workspace, project};
use sqlx::PgPool;
use tradstry_backend::service::trade_review::journal_flow::{self, attention};

struct Stock<'a> {
    name: &'a str,
    symbol: &'a str,
    instrument_id: Option<&'a str>,
    side: &'a str,
    quantity: f64,
    at: &'a str,
}

async fn stock(pool: &PgPool, user: &str, workspace: &str, fill: Stock<'_>) {
    let id = format!("{workspace}:{}", fill.name);
    let symbol_json = fill.instrument_id.map(|instrument_id| {
        serde_json::json!({"id":instrument_id,"symbol":fill.symbol,"description":"Acme Corp"})
    });
    sqlx::query("INSERT INTO brokerage_transactions(id,user_id,workspace_id,snaptrade_id,symbol,symbol_description,currency,transaction_type,price,units,fee,trade_date,settlement_date,institution,raw_json,dedup_key)
        VALUES ($1,$2,$3,$1,$4,'Acme Corp','USD',$5,10,$6,0,$7::text::timestamptz,$7::text::timestamptz,'test',$8,$1)")
        .bind(&id).bind(user).bind(workspace).bind(fill.symbol).bind(fill.side).bind(fill.quantity).bind(fill.at)
        .bind(serde_json::json!({"fee":0,"trade_date":fill.at,"type":fill.side,"symbol":symbol_json,"option_symbol":null}).to_string())
        .execute(pool).await.unwrap();
}

async fn unknown_start(pool: &PgPool) -> (String, String) {
    let (user, workspace) = enabled_workspace(pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(pool)
        .await
        .unwrap();
    (user, workspace)
}

async fn holdings(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    synced_at: &str,
    held: &[(&str, &str, f64)],
) {
    sqlx::query("INSERT INTO brokerage_sync_state(user_id,workspace_id,snaptrade_account_id,holdings_last_successful_sync) VALUES ($1,$2,'account',$3)
        ON CONFLICT(user_id,workspace_id,snaptrade_account_id) DO UPDATE SET holdings_last_successful_sync=EXCLUDED.holdings_last_successful_sync")
        .bind(user).bind(workspace).bind(synced_at).execute(pool).await.unwrap();
    for (instrument_id, symbol, units) in held {
        sqlx::query("INSERT INTO brokerage_holdings(id,user_id,workspace_id,snaptrade_symbol_id,symbol,units,raw_json) VALUES ($1,$2,$3,$4,$5,$6,'{}')")
            .bind(format!("{workspace}:holding:{symbol}")).bind(user).bind(workspace).bind(instrument_id).bind(symbol).bind(units)
            .execute(pool).await.unwrap();
    }
    journal_flow::holdings_synced(pool, user, workspace)
        .await
        .unwrap();
    journal_flow::process_once(pool, "journal-test")
        .await
        .unwrap();
}

async fn trades(pool: &PgPool, user: &str, workspace: &str) -> Vec<journal_flow::JournalTrade> {
    let mut trades = journal_flow::list_trades(pool, user, workspace)
        .await
        .unwrap();
    trades.sort_by(|a, b| a.open_date.cmp(&b.open_date));
    trades
}

#[tokio::test(flavor = "multi_thread")]
async fn a_renamed_stock_with_the_same_id_stays_one_trade_and_keeps_its_entry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "buy",
            symbol: "ACME",
            instrument_id: Some("acme-id"),
            side: "BUY",
            quantity: 10.0,
            at: "2026-09-02T15:00:00Z",
        },
    )
    .await;
    project(&pool, &user, &workspace).await;
    let opened = trades(&pool, &user, &workspace).await;
    assert_eq!(opened.len(), 1);
    assert_eq!(opened[0].lifecycle_state, "open");

    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "sell",
            symbol: "ACMN",
            instrument_id: Some("acme-id"),
            side: "SELL",
            quantity: 10.0,
            at: "2026-09-03T15:00:00Z",
        },
    )
    .await;
    project(&pool, &user, &workspace).await;
    let closed = trades(&pool, &user, &workspace).await;
    assert_eq!(closed.len(), 1, "{closed:?}");
    assert_eq!(closed[0].id, opened[0].id);
    assert_eq!(closed[0].lifecycle_state, "closed");
    assert_eq!(closed[0].symbol, "ACMN");
}

#[tokio::test(flavor = "multi_thread")]
async fn one_ticker_used_by_two_securities_needs_attention() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "buy",
            symbol: "ACME",
            instrument_id: Some("old-acme"),
            side: "BUY",
            quantity: 10.0,
            at: "2026-09-02T15:00:00Z",
        },
    )
    .await;
    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "sell",
            symbol: "ACME",
            instrument_id: Some("new-acme"),
            side: "SELL",
            quantity: 10.0,
            at: "2026-09-03T15:00:00Z",
        },
    )
    .await;
    project(&pool, &user, &workspace).await;
    let found = trades(&pool, &user, &workspace).await;
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].lifecycle_state, "incomplete");
    assert!(
        found[0]
            .issue_message
            .as_deref()
            .is_some_and(|message| message.contains("more than one security")),
        "{:?}",
        found[0].issue_message
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn holdings_that_match_prove_the_start_of_a_reversing_history() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = unknown_start(&pool).await;
    for (name, side, quantity, at) in [
        ("buy", "BUY", 10.0, "2026-09-02T15:00:00Z"),
        ("reverse", "SELL", 15.0, "2026-09-03T15:00:00Z"),
        ("cover", "BUY", 5.0, "2026-09-04T15:00:00Z"),
    ] {
        stock(
            &pool,
            &user,
            &workspace,
            Stock {
                name,
                symbol: "ACME",
                instrument_id: Some("acme-id"),
                side,
                quantity,
                at,
            },
        )
        .await;
    }
    project(&pool, &user, &workspace).await;
    let before = trades(&pool, &user, &workspace).await;
    assert_eq!(before.len(), 1);
    assert_eq!(before[0].lifecycle_state, "incomplete");

    holdings(&pool, &user, &workspace, "2026-09-05T00:00:00Z", &[]).await;
    let after = trades(&pool, &user, &workspace).await;
    assert_eq!(
        after
            .iter()
            .map(|t| t.direction.as_str())
            .collect::<Vec<_>>(),
        ["long", "short"]
    );
    assert!(after.iter().all(|trade| trade.lifecycle_state == "closed"));
    assert!(
        attention::holdings_mismatches(&pool, &user, &workspace)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn holdings_that_disagree_are_shown_without_blocking_a_balanced_history() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = unknown_start(&pool).await;
    for (name, side, at) in [
        ("buy", "BUY", "2026-09-02T15:00:00Z"),
        ("sell", "SELL", "2026-09-03T15:00:00Z"),
    ] {
        stock(
            &pool,
            &user,
            &workspace,
            Stock {
                name,
                symbol: "ACME",
                instrument_id: Some("acme-id"),
                side,
                quantity: 10.0,
                at,
            },
        )
        .await;
    }
    project(&pool, &user, &workspace).await;
    holdings(
        &pool,
        &user,
        &workspace,
        "2026-09-05T00:00:00Z",
        &[("acme-id", "ACME", 50.0)],
    )
    .await;
    let found = trades(&pool, &user, &workspace).await;
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].lifecycle_state, "closed");
    let mismatches = attention::holdings_mismatches(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(mismatches.len(), 1);
    assert_eq!(mismatches[0].held, "50");
    assert_eq!(mismatches[0].imported, "0");
    assert_eq!(
        mismatches[0].entry_id.as_deref(),
        Some(found[0].id.as_str())
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_stale_holdings_snapshot_says_it_is_waiting() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = unknown_start(&pool).await;
    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "sell",
            symbol: "ACME",
            instrument_id: Some("acme-id"),
            side: "SELL",
            quantity: 10.0,
            at: "2026-09-03T15:00:00Z",
        },
    )
    .await;
    project(&pool, &user, &workspace).await;
    holdings(&pool, &user, &workspace, "2026-09-01T00:00:00Z", &[]).await;
    let found = trades(&pool, &user, &workspace).await;
    assert_eq!(found[0].lifecycle_state, "incomplete");
    assert!(
        found[0]
            .issue_message
            .as_deref()
            .is_some_and(|message| message.contains("Waiting for a fresh holdings sync")),
        "{:?}",
        found[0].issue_message
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_confirmed_ticker_change_joins_the_position() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory=jsonb_build_object('*',jsonb_build_object('kind','flat','as_of','2026-09-01T00:00:00Z','provenance','user_confirmed')) WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "buy",
            symbol: "ACME",
            instrument_id: Some("old-id"),
            side: "BUY",
            quantity: 10.0,
            at: "2026-09-02T15:00:00Z",
        },
    )
    .await;
    stock(
        &pool,
        &user,
        &workspace,
        Stock {
            name: "sell",
            symbol: "ACMEQ",
            instrument_id: Some("new-id"),
            side: "SELL",
            quantity: 10.0,
            at: "2026-09-04T15:00:00Z",
        },
    )
    .await;
    project(&pool, &user, &workspace).await;
    assert_eq!(trades(&pool, &user, &workspace).await.len(), 2);

    let suggestions = attention::continuation_suggestions(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(suggestions.len(), 1, "{suggestions:?}");
    assert_eq!(suggestions[0].from_symbol, "ACME");
    assert_eq!(suggestions[0].to_symbol, "ACMEQ");
    let answer = |mutation: &'static str| {
        let (pool, user, workspace) = (pool.clone(), user.clone(), workspace.clone());
        let suggestion = suggestions[0].clone();
        async move {
            attention::answer_continuation(
                &pool,
                &user,
                &workspace,
                attention::ContinuationInput {
                    execution_id: &suggestion.execution_id,
                    opening_execution_id: &suggestion.opening_execution_id,
                },
                true,
                "test-client",
                mutation,
            )
            .await
        }
    };
    assert!(answer("confirm").await.unwrap());
    assert!(answer("confirm").await.unwrap(), "a retried answer replays");

    let joined = trades(&pool, &user, &workspace).await;
    assert_eq!(joined.len(), 1, "{joined:?}");
    assert_eq!(joined[0].lifecycle_state, "closed");
    assert_eq!(joined[0].symbol, "ACME");
    assert!(
        attention::continuation_suggestions(&pool, &user, &workspace)
            .await
            .unwrap()
            .is_empty()
    );
}
