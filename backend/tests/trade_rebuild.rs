//! Rebuilding trades from imported and manual data, end to end in Postgres.

use std::sync::Arc;
use tradstry::trades::notes::NoteDocument;

use chrono::Utc;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use tradstry::{
    brokerage::{Brokerage, history::ImportMode, linking::Selection},
    snaptrade::fake::{FakeAccount, FakeSnapTrade},
    trades::rebuild::{rebuild, stale_users},
    users::{self, Provisioning},
};

struct Linked {
    snaptrade: FakeSnapTrade,
    brokerage: Arc<Brokerage>,
    user_id: Uuid,
    workspace_id: Uuid,
}

fn fill(id: &str, kind: &str, symbol: &str, units: Decimal, price: Decimal, day: &str) -> Value {
    json!({
        "id": id, "type": kind, "units": units, "price": price, "amount": -(units * price), "fee": 0,
        "currency": {"code": "USD"}, "trade_date": format!("{day}T15:00:00Z"),
        "symbol": {"id": format!("sym-{symbol}"), "symbol": symbol}, "option_symbol": null, "description": "",
    })
}

fn recent(days_ago: i64) -> String {
    (Utc::now() - chrono::Duration::days(days_ago))
        .date_naive()
        .to_string()
}

async fn linked(pool: &PgPool, activities: Vec<Value>, positions: Value) -> Linked {
    let snaptrade = FakeSnapTrade::start().await;
    let brokerage = Arc::new(Brokerage::for_tests(pool.clone(), &snaptrade));
    let user_id = users::load_user(pool, "user-1", "", "", Provisioning::CreateIfMissing)
        .await
        .unwrap()
        .id;
    brokerage.start_commercial(user_id, None).await.unwrap();
    snaptrade.complete_portal(
        &user_id.to_string(),
        "conn-1",
        vec![FakeAccount::investment("acct-1", "Margin")],
    );
    snaptrade.set_activities("acct-1", activities);
    snaptrade.set_positions("acct-1", positions);
    let choices = brokerage
        .complete_commercial(user_id, "conn-1")
        .await
        .unwrap();
    let account = brokerage
        .finalize_accounts(
            user_id,
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
    Linked {
        snaptrade,
        brokerage,
        user_id,
        workspace_id: account.workspace_id.unwrap(),
    }
}

fn held(symbol: &str, units: &str, price: &str) -> Value {
    json!({"results": [{"instrument": {"symbol": symbol, "kind": "stock"}, "units": units, "price": price, "cost_basis": "10"}]})
}

async fn trades(pool: &PgPool, user_id: Uuid) -> Vec<(String, String, String, Option<Decimal>)> {
    sqlx::query_as(
        "SELECT id, symbol, status, net FROM trades WHERE user_id = $1 ORDER BY opened_at, id",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn issue_codes(pool: &PgPool, user_id: Uuid) -> Vec<String> {
    sqlx::query_scalar("SELECT i->>'code' FROM trade_engine_state, jsonb_array_elements(issues) i WHERE user_id = $1 ORDER BY 1")
        .bind(user_id)
        .fetch_all(pool)
        .await
        .unwrap()
}

#[sqlx::test]
async fn importing_builds_trades_and_reconciles_with_holdings(pool: PgPool) {
    let l = linked(
        &pool,
        vec![
            fill("a1", "BUY", "AAPL", dec!(10), dec!(10), &recent(20)),
            fill("a2", "SELL", "AAPL", dec!(-10), dec!(12), &recent(19)),
            fill("a3", "BUY", "MSFT", dec!(5), dec!(10), &recent(10)),
        ],
        held("MSFT", "5", "11"),
    )
    .await;
    let rows = trades(&pool, l.user_id).await;
    assert_eq!(
        rows.iter()
            .map(|r| (r.1.as_str(), r.2.as_str(), r.3))
            .collect::<Vec<_>>(),
        [
            ("AAPL", "closed", Some(dec!(20))),
            ("MSFT", "open", Some(dec!(0)))
        ]
    );
    assert!(
        issue_codes(&pool, l.user_id).await.is_empty(),
        "positions agree with the brokerage"
    );

    let lots: i64 = sqlx::query_scalar("SELECT count(*) FROM trade_lots WHERE user_id = $1")
        .bind(l.user_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(lots, 2);
    let tax: Option<Decimal> =
        sqlx::query_scalar("SELECT tax_realized FROM lot_closures WHERE user_id = $1")
            .bind(l.user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(tax, Some(dec!(20)));
}

#[sqlx::test]
async fn missing_history_shows_up_as_a_position_mismatch(pool: PgPool) {
    let l = linked(
        &pool,
        vec![fill("a1", "BUY", "MSFT", dec!(5), dec!(10), &recent(10))],
        held("MSFT", "8", "11"),
    )
    .await;
    assert_eq!(issue_codes(&pool, l.user_id).await, ["position_mismatch"]);
}

#[sqlx::test]
async fn rebuilding_is_idempotent_and_ids_survive_new_fills(pool: PgPool) {
    let l = linked(
        &pool,
        vec![fill("a1", "BUY", "AAPL", dec!(10), dec!(10), &recent(20))],
        json!({"results": []}),
    )
    .await;
    let before = trades(&pool, l.user_id).await;
    rebuild(&pool, l.user_id).await.unwrap();
    assert_eq!(trades(&pool, l.user_id).await, before);

    l.snaptrade.set_activities(
        "acct-1",
        vec![
            fill("a1", "BUY", "AAPL", dec!(10), dec!(10), &recent(20)),
            fill("a2", "SELL", "AAPL", dec!(-10), dec!(11), &recent(1)),
        ],
    );
    sqlx::query("UPDATE sync_jobs SET due_at = now() - interval '1 second', leased_until = NULL")
        .execute(&pool)
        .await
        .unwrap();
    l.brokerage.run_due_jobs(10).await.unwrap();
    let after = trades(&pool, l.user_id).await;
    assert_eq!(
        after[0].0, before[0].0,
        "appending a fill keeps the trade's ID"
    );
    assert_eq!(
        (after[0].2.as_str(), after[0].3),
        ("closed", Some(dec!(10)))
    );
}

#[sqlx::test]
async fn concurrent_rebuilds_serialise(pool: PgPool) {
    let l = linked(
        &pool,
        vec![fill("a1", "BUY", "AAPL", dec!(10), dec!(10), &recent(20))],
        json!({"results": []}),
    )
    .await;
    let runs = (0..4).map(|_| {
        let pool = pool.clone();
        tokio::spawn(async move { rebuild(&pool, l.user_id).await })
    });
    for result in futures_util::future::join_all(runs).await {
        result.unwrap().unwrap();
    }
    assert_eq!(trades(&pool, l.user_id).await.len(), 1);
}

#[sqlx::test]
async fn annotations_follow_their_trade_through_regrouping(pool: PgPool) {
    let l = linked(
        &pool,
        vec![
            fill("a1", "BUY", "AAPL", dec!(10), dec!(10), &recent(20)),
            fill("a2", "SELL", "AAPL", dec!(-10), dec!(11), &recent(19)),
            fill("a3", "BUY", "AAPL", dec!(10), dec!(10), &recent(18)),
            fill("a4", "SELL", "AAPL", dec!(-10), dec!(12), &recent(17)),
        ],
        json!({"results": []}),
    )
    .await;
    let rows = trades(&pool, l.user_id).await;
    let annotation = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO trade_annotations (id, user_id, workspace_id, trade_id, anchor_fill_key, notes) VALUES ($1, $2, $3, $4, 'snaptrade:a3', $5)",
    )
    .bind(annotation)
    .bind(l.user_id)
    .bind(l.workspace_id)
    .bind(&rows[1].0)
    .bind(sqlx::types::Json(NoteDocument::from("second").0))
    .execute(&pool)
    .await
    .unwrap();

    let decision = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO trade_decisions (id, user_id, workspace_id, payload) VALUES ($1, $2, $3, $4)",
    )
    .bind(decision)
    .bind(l.user_id)
    .bind(l.workspace_id)
    .bind(json!({"kind": "merge", "trade_ids": [rows[0].0, rows[1].0]}))
    .execute(&pool)
    .await
    .unwrap();
    rebuild(&pool, l.user_id).await.unwrap();
    let merged = trades(&pool, l.user_id).await;
    assert_eq!(merged.len(), 1);
    let (trade_id, orphaned): (String, Option<chrono::DateTime<Utc>>) =
        sqlx::query_as("SELECT trade_id, orphaned_at FROM trade_annotations WHERE id = $1")
            .bind(annotation)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!((trade_id.as_str(), orphaned), (merged[0].0.as_str(), None));

    sqlx::query("UPDATE trade_decisions SET undone_at = now() WHERE id = $1")
        .bind(decision)
        .execute(&pool)
        .await
        .unwrap();
    rebuild(&pool, l.user_id).await.unwrap();
    let trade_id: String =
        sqlx::query_scalar("SELECT trade_id FROM trade_annotations WHERE id = $1")
            .bind(annotation)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        trade_id, rows[1].0,
        "undoing returns it to its original trade"
    );

    sqlx::query("DELETE FROM brokerage_activities")
        .execute(&pool)
        .await
        .unwrap();
    rebuild(&pool, l.user_id).await.unwrap();
    let orphaned: Option<chrono::DateTime<Utc>> =
        sqlx::query_scalar("SELECT orphaned_at FROM trade_annotations WHERE id = $1")
            .bind(annotation)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        orphaned.is_some(),
        "kept, not deleted, when its trade is gone"
    );
}

#[sqlx::test]
async fn users_built_by_another_engine_version_are_rebuilt(pool: PgPool) {
    let l = linked(
        &pool,
        vec![fill("a1", "BUY", "AAPL", dec!(10), dec!(10), &recent(20))],
        json!({"results": []}),
    )
    .await;
    assert!(stale_users(&pool).await.unwrap().is_empty());
    sqlx::query("UPDATE trade_engine_state SET engine_version = 0")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(stale_users(&pool).await.unwrap(), [l.user_id]);
}
