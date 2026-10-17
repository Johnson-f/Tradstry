use crate::journal_flow_pg::{FillAmounts, enabled_workspace, fill, project};
use sqlx::PgPool;
use tradstry_backend::service::trade_review::journal_flow::{
    self,
    grouping::{self, AllocationInput, GroupInput, GroupingInput},
    opening::{self, OpeningPositionInput},
};

async fn unknown_start_history(pool: &PgPool) -> (String, String, String) {
    let (user, workspace) = enabled_workspace(pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(pool)
        .await
        .unwrap();
    for (name, side, quantity, price, at) in [
        ("first-sell", "SELL", 10.0, 12.0, "2026-09-02T15:00:00Z"),
        ("rebuy", "BUY", 5.0, 10.0, "2026-09-03T15:00:00Z"),
        ("second-sell", "SELL", 5.0, 11.0, "2026-09-04T15:00:00Z"),
    ] {
        fill(
            pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity,
                price,
                fee: 1.0,
            },
            at,
        )
        .await;
    }
    project(pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].lifecycle_state, "incomplete");
    sqlx::query("UPDATE journal_entries SET notes='Keep this note' WHERE id=$1")
        .bind(&trades[0].id)
        .execute(pool)
        .await
        .unwrap();
    (user, workspace, trades[0].id.clone())
}

fn held_before_history() -> OpeningPositionInput {
    OpeningPositionInput {
        direction: "long".into(),
        quantity: "10".into(),
        average_price: "9".into(),
        as_of: "2026-09-01T00:00:00Z".into(),
    }
}

async fn save(pool: &PgPool, user: &str, workspace: &str, entry: &str, mutation: &str) -> String {
    opening::save(
        pool,
        user,
        workspace,
        entry,
        held_before_history(),
        "browser",
        mutation,
    )
    .await
    .unwrap()
    .id
}

async fn active_trades(
    pool: &PgPool,
    user: &str,
    workspace: &str,
) -> Vec<journal_flow::JournalTrade> {
    journal_flow::list_trades(pool, user, workspace)
        .await
        .unwrap()
        .into_iter()
        .filter(|trade| trade.retired_at.is_none())
        .collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn a_starting_position_rebuilds_unknown_history_into_trades() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace, placeholder) = unknown_start_history(&pool).await;

    let preview = opening::preview(
        &pool,
        &user,
        &workspace,
        &placeholder,
        held_before_history(),
    )
    .await
    .unwrap();
    let summary = preview
        .trades
        .iter()
        .map(|trade| {
            (
                trade.realized_net.clone(),
                trade.fees_paid.clone(),
                trade.entered_quantity.clone(),
                trade.closed_at.is_some(),
                trade.starting_position,
            )
        })
        .collect::<Vec<_>>();
    // (12 - 9) * 10 - 1 sell fee, then (11 - 10) * 5 - 2 fees.
    assert_eq!(
        summary,
        vec![
            (Some("29".into()), Some("1".into()), "10".into(), true, true),
            (Some("3".into()), Some("2".into()), "5".into(), true, false),
        ]
    );

    let saved = opening::save(
        &pool,
        &user,
        &workspace,
        &placeholder,
        held_before_history(),
        "browser",
        "opening-1",
    )
    .await
    .unwrap();
    let replayed = opening::save(
        &pool,
        &user,
        &workspace,
        &placeholder,
        held_before_history(),
        "browser",
        "opening-1",
    )
    .await
    .unwrap();
    assert_eq!(saved.id, replayed.id);

    let trades = active_trades(&pool, &user, &workspace).await;
    assert_eq!(trades.len(), 2);
    let first = trades.iter().find(|trade| trade.id == placeholder).unwrap();
    assert_eq!(first.lifecycle_state, "closed");
    assert_eq!(first.realized_net.as_deref(), Some("29"));
    assert!(first.starting_position);
    assert_eq!(
        first.open_date.as_deref(),
        Some("2026-09-01T00:00:00+00:00")
    );
    assert_eq!(first.execution_count, 1);
    let second = trades.iter().find(|trade| trade.id != placeholder).unwrap();
    assert_eq!(second.lifecycle_state, "closed");
    assert_eq!(second.realized_net.as_deref(), Some("3"));
    assert!(!second.starting_position);

    let note: String = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
        .bind(&placeholder)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(note, "Keep this note");
    let links: Vec<String> = sqlx::query_scalar(
        "SELECT brokerage_transaction_id FROM journal_brokerage_links WHERE journal_entry_id=$1",
    )
    .bind(&placeholder)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(links, vec![format!("{workspace}:first-sell")]);

    let view = opening::for_entry(&pool, &user, &workspace, &placeholder)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(view.id, saved.id);
    assert_eq!(
        (view.quantity.as_str(), view.average_price.as_str()),
        ("10", "9")
    );
    assert!(!view.older_history);
    journal_flow::suggestions::refresh(&pool, &user, &workspace)
        .await
        .unwrap();

    let over_allocated = async {
        let mut tx = pool.begin().await?;
        sqlx::query("UPDATE trade_episode_fills SET quantity=11 WHERE opening_position_id=$1")
            .bind(&saved.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await
    }
    .await;
    assert!(
        over_allocated
            .unwrap_err()
            .to_string()
            .contains("Starting position quantity is over-allocated")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn removing_a_starting_position_returns_to_one_unresolved_entry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace, placeholder) = unknown_start_history(&pool).await;
    let position = save(&pool, &user, &workspace, &placeholder, "opening-1").await;
    let rebuilt = active_trades(&pool, &user, &workspace).await;
    let later = rebuilt
        .iter()
        .find(|trade| trade.id != placeholder)
        .unwrap()
        .id
        .clone();

    assert!(
        opening::remove(&pool, &user, &workspace, &position, "browser", "remove-1")
            .await
            .unwrap()
    );
    assert!(
        opening::remove(&pool, &user, &workspace, &position, "browser", "remove-1")
            .await
            .unwrap()
    );

    let trades = active_trades(&pool, &user, &workspace).await;
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, placeholder);
    assert_eq!(trades[0].lifecycle_state, "incomplete");
    assert_eq!(trades[0].realized_net, None);
    assert!(!trades[0].starting_position);
    let successor: Option<String> =
        sqlx::query_scalar("SELECT successor_id FROM journal_entries WHERE id=$1")
            .bind(&later)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(successor.as_deref(), Some(placeholder.as_str()));
    assert!(
        opening::for_entry(&pool, &user, &workspace, &placeholder)
            .await
            .unwrap()
            .is_none()
    );

    save(&pool, &user, &workspace, &placeholder, "opening-2").await;
    let trades = active_trades(&pool, &user, &workspace).await;
    assert_eq!(trades.len(), 2);
    assert!(
        trades
            .iter()
            .any(|trade| trade.id == placeholder && trade.realized_net.as_deref() == Some("29"))
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn older_imported_history_flags_the_starting_position_without_counting_twice() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace, placeholder) = unknown_start_history(&pool).await;
    let position = save(&pool, &user, &workspace, &placeholder, "opening-1").await;

    fill(
        &pool,
        &user,
        &workspace,
        "older-buy",
        "BUY",
        FillAmounts {
            quantity: 10.0,
            price: 8.0,
            fee: 1.0,
        },
        "2026-08-31T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;

    let trades = active_trades(&pool, &user, &workspace).await;
    assert!(!trades.is_empty());
    for trade in &trades {
        assert_eq!(trade.lifecycle_state, "incomplete");
        assert_eq!(trade.realized_net, None);
        assert!(
            trade
                .issue_message
                .as_deref()
                .is_some_and(|message| message.contains("Older broker history"))
        );
    }
    assert!(
        opening::for_entry(&pool, &user, &workspace, &placeholder)
            .await
            .unwrap()
            .unwrap()
            .older_history
    );

    // Once the starting position is gone, the imported history starts and ends
    // flat, so it is calculated from the real buys: (12 - 8) * 10 - 2 fees.
    opening::remove(&pool, &user, &workspace, &position, "browser", "remove-1")
        .await
        .unwrap();
    let mut trades = active_trades(&pool, &user, &workspace)
        .await
        .into_iter()
        .map(|trade| {
            (
                trade.id == placeholder,
                trade.lifecycle_state,
                trade.realized_net,
                trade.starting_position,
            )
        })
        .collect::<Vec<_>>();
    trades.sort();
    assert_eq!(
        trades,
        vec![
            (false, "closed".into(), Some("3".into()), false),
            (true, "closed".into(), Some("38".into()), false),
        ]
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn starting_positions_are_validated() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace, placeholder) = unknown_start_history(&pool).await;
    let attempt = |input: OpeningPositionInput| {
        let (pool, user, workspace, placeholder) = (&pool, &user, &workspace, &placeholder);
        async move {
            opening::preview(pool, user, workspace, placeholder, input)
                .await
                .unwrap_err()
                .to_string()
        }
    };
    assert!(
        attempt(OpeningPositionInput {
            as_of: "2026-09-02T15:00:00Z".into(),
            ..held_before_history()
        })
        .await
        .contains("before the first imported execution")
    );
    assert!(
        attempt(OpeningPositionInput {
            quantity: "0".into(),
            ..held_before_history()
        })
        .await
        .contains("more than zero")
    );
    assert!(
        attempt(OpeningPositionInput {
            direction: "flat".into(),
            ..held_before_history()
        })
        .await
        .contains("long or short")
    );

    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    for (name, side, at) in [
        ("buy", "BUY", "2026-09-02T15:00:00Z"),
        ("sell", "SELL", "2026-09-03T15:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity: 1.0,
                price: 10.0,
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    project(&pool, &user, &workspace).await;
    let known = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()
        .remove(0);
    assert_eq!(known.lifecycle_state, "closed");
    let error = opening::save(
        &pool,
        &user,
        &workspace,
        &known.id,
        held_before_history(),
        "browser",
        "opening-known",
    )
    .await
    .unwrap_err();
    assert!(error.to_string().contains("already has a known start"));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_split_trade_keeps_its_starting_position_through_projection() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace, placeholder) = unknown_start_history(&pool).await;
    let position = save(&pool, &user, &workspace, &placeholder, "opening-1").await;
    let allocation = |id: String, quantity: &str| AllocationInput {
        transaction_id: id,
        quantity: quantity.into(),
    };
    let opening_fill = format!("opening:{position}");
    let first_sell = format!("{workspace}:first-sell");
    let preview = grouping::preview(
        &pool,
        &user,
        &workspace,
        GroupingInput {
            direction: None,
            entry_ids: vec![placeholder.clone()],
            groups: vec![
                GroupInput {
                    entry_id: Some(placeholder.clone()),
                    allocations: vec![
                        allocation(opening_fill.clone(), "6"),
                        allocation(first_sell.clone(), "6"),
                    ],
                },
                GroupInput {
                    entry_id: None,
                    allocations: vec![
                        allocation(opening_fill.clone(), "4"),
                        allocation(first_sell.clone(), "4"),
                    ],
                },
            ],
        },
    )
    .await
    .unwrap();
    // (12 - 9) * 6 - 0.6 fee and (12 - 9) * 4 - 0.4 fee.
    assert_eq!(
        preview.realized_net,
        vec![Some("17.4".into()), Some("11.6".into())]
    );
    grouping::confirm(
        &pool,
        &user,
        &workspace,
        &preview.token,
        "browser",
        "split-1",
    )
    .await
    .unwrap();

    sqlx::query(
        "UPDATE journal_projection_jobs SET state='pending',available_at=now() WHERE workspace_id=$1",
    )
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
    journal_flow::process_once(&pool, "opening-retry")
        .await
        .unwrap();

    let trades = active_trades(&pool, &user, &workspace).await;
    let mut split = trades
        .iter()
        .filter(|trade| trade.starting_position)
        .map(|trade| (trade.lifecycle_state.clone(), trade.realized_net.clone()))
        .collect::<Vec<_>>();
    split.sort();
    assert_eq!(
        split,
        vec![
            ("closed".into(), Some("11.6".into())),
            ("closed".into(), Some("17.4".into())),
        ]
    );
    assert!(
        opening::remove(&pool, &user, &workspace, &position, "browser", "remove-1")
            .await
            .unwrap_err()
            .to_string()
            .contains("grouped by hand")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_starting_position_absorbs_records_built_before_the_journal() {
    use tradstry_backend::service::db::schema::tables::trade_review_table;
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query(
        "UPDATE journal_workspace_state SET enabled=false,opening_inventory='{}' WHERE workspace_id=$1",
    )
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
    for (name, side, quantity, price, at) in [
        ("first-sell", "SELL", 10.0, 12.0, "2026-09-02T15:00:00Z"),
        ("rebuy", "BUY", 5.0, 10.0, "2026-09-03T15:00:00Z"),
        ("second-sell", "SELL", 5.0, 11.0, "2026-09-04T15:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity,
                price,
                fee: 1.0,
            },
            at,
        )
        .await;
    }
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let unresolved = active_trades(&pool, &user, &workspace).await;
    assert!(
        unresolved
            .iter()
            .all(|trade| trade.lifecycle_state == "incomplete")
    );
    let placeholder = unresolved[0].id.clone();

    save(&pool, &user, &workspace, &placeholder, "opening-1").await;
    let mut trades = active_trades(&pool, &user, &workspace)
        .await
        .into_iter()
        .map(|trade| {
            (
                trade.lifecycle_state,
                trade.realized_net,
                trade.starting_position,
            )
        })
        .collect::<Vec<_>>();
    trades.sort();
    assert_eq!(
        trades,
        vec![
            ("closed".into(), Some("29".into()), true),
            ("closed".into(), Some("3".into()), false),
        ]
    );
}

async fn unknown_start(pool: &PgPool, fills: &[(&str, &str, f64, &str)]) -> (String, String) {
    let (user, workspace) = enabled_workspace(pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(pool)
        .await
        .unwrap();
    for (name, side, quantity, at) in fills {
        fill(
            pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity: *quantity,
                price: if *side == "BUY" { 10.0 } else { 11.0 },
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    project(pool, &user, &workspace).await;
    (user, workspace)
}

#[tokio::test(flavor = "multi_thread")]
async fn history_that_starts_and_ends_flat_is_confirmed_automatically() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = unknown_start(
        &pool,
        &[
            ("buy", "BUY", 1.0, "2026-09-01T14:00:00Z"),
            ("buy-more", "BUY", 0.11994, "2026-09-01T14:05:00Z"),
            ("sell", "SELL", 1.11994, "2026-09-01T15:00:00Z"),
            ("rebuy", "BUY", 2.0, "2026-09-02T14:00:00Z"),
            ("resell", "SELL", 2.0, "2026-09-02T15:00:00Z"),
        ],
    )
    .await;
    let trades = active_trades(&pool, &user, &workspace).await;
    assert_eq!(trades.len(), 2);
    assert!(trades.iter().all(|trade| trade.lifecycle_state == "closed"));

    // The guess never blocks a position the user says they held.
    let entry = trades[0].id.clone();
    opening::save(
        &pool,
        &user,
        &workspace,
        &entry,
        OpeningPositionInput {
            direction: "long".into(),
            quantity: "3".into(),
            average_price: "9".into(),
            as_of: "2026-09-01T00:00:00Z".into(),
        },
        "browser",
        "opening-over-guess",
    )
    .await
    .unwrap();
    // Holding 3 before means the position never went flat, so the two trades
    // become one open trade; the other entry points to it.
    let rebuilt = active_trades(&pool, &user, &workspace).await;
    assert_eq!(rebuilt.len(), 1);
    assert_eq!(rebuilt[0].lifecycle_state, "open");
    assert_eq!(rebuilt[0].remaining_quantity.as_deref(), Some("3"));
    assert!(rebuilt[0].starting_position);
    let merged = trades
        .iter()
        .find(|trade| trade.id != rebuilt[0].id)
        .unwrap();
    let successor: Option<String> =
        sqlx::query_scalar("SELECT successor_id FROM journal_entries WHERE id=$1")
            .bind(&merged.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(successor.as_deref(), Some(rebuilt[0].id.as_str()));
}

#[tokio::test(flavor = "multi_thread")]
async fn history_that_flips_or_stays_open_still_needs_attention() {
    for fills in [
        vec![
            ("buy", "BUY", 10.0, "2026-09-01T14:00:00Z"),
            ("sell", "SELL", 15.0, "2026-09-01T15:00:00Z"),
            ("cover", "BUY", 5.0, "2026-09-02T15:00:00Z"),
        ],
        vec![
            ("buy", "BUY", 10.0, "2026-09-01T14:00:00Z"),
            ("sell", "SELL", 4.0, "2026-09-01T15:00:00Z"),
        ],
    ] {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = unknown_start(&pool, &fills).await;
        let trades = active_trades(&pool, &user, &workspace).await;
        assert!(!trades.is_empty());
        assert!(
            trades
                .iter()
                .all(|trade| trade.lifecycle_state == "incomplete")
        );
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn trades_blocked_before_the_rule_clear_after_a_hand_confirmed_one() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    for (name, side, quantity, at) in [
        ("buy-1", "BUY", 1.0, "2026-09-02T14:00:00Z"),
        ("sell-1", "SELL", 1.0, "2026-09-02T15:00:00Z"),
        ("buy-2", "BUY", 0.11994, "2026-09-03T14:00:00Z"),
        ("buy-3", "BUY", 1.83131, "2026-09-03T14:30:00Z"),
        ("sell-2", "SELL", 1.95125, "2026-09-03T15:00:00Z"),
        ("buy-4", "BUY", 2.0, "2026-09-04T14:00:00Z"),
        ("sell-3", "SELL", 2.0, "2026-09-04T15:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity,
                price: if side == "BUY" { 10.0 } else { 11.0 },
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    project(&pool, &user, &workspace).await;
    let trades = active_trades(&pool, &user, &workspace).await;
    assert_eq!(trades.len(), 3);

    // What the projection did before this change, once the start became unknown.
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SELECT set_config('tradstry.journal_writer','on',true)")
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("UPDATE trade_episodes SET status='blocked',block_reason='Grouping needs confirmation' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_entries SET lifecycle_state='incomplete',outcome='unknown',open_date=NULL,close_date=NULL,entry_price=NULL,exit_price=NULL,position_size=NULL,remaining_quantity=NULL,realized_net=NULL,fees_paid=NULL,status=NULL,total_pl=NULL,net_roi=NULL,duration=NULL,
        issue_json=jsonb_build_object('code','source_needs_attention','instrument_key','equity:ACME|USD','source_ids',(SELECT jsonb_agg(id) FROM brokerage_transactions WHERE workspace_id=$1),'message','Grouping needs confirmation') WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let middle = trades
        .iter()
        .find(|trade| trade.execution_count == 3)
        .unwrap()
        .id
        .clone();
    let allocation = |name: &str, quantity: &str| AllocationInput {
        transaction_id: format!("{workspace}:{name}"),
        quantity: quantity.into(),
    };
    let preview = grouping::preview(
        &pool,
        &user,
        &workspace,
        GroupingInput {
            direction: Some("long".into()),
            entry_ids: vec![middle.clone()],
            groups: vec![GroupInput {
                entry_id: Some(middle.clone()),
                allocations: vec![
                    allocation("buy-2", "0.11994"),
                    allocation("buy-3", "1.83131"),
                    allocation("sell-2", "1.95125"),
                ],
            }],
        },
    )
    .await
    .unwrap();
    grouping::confirm(
        &pool,
        &user,
        &workspace,
        &preview.token,
        "browser",
        "keep-one",
    )
    .await
    .unwrap();
    sqlx::query(
        "UPDATE journal_projection_jobs SET state='pending',available_at=now() WHERE workspace_id=$1",
    )
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
    journal_flow::process_once(&pool, "after-deploy")
        .await
        .unwrap();

    let trades = active_trades(&pool, &user, &workspace).await;
    assert_eq!(trades.len(), 3);
    assert!(
        trades.iter().all(|trade| trade.lifecycle_state == "closed"),
        "{:?}",
        trades
            .iter()
            .map(|trade| (&trade.lifecycle_state, &trade.issue_message))
            .collect::<Vec<_>>()
    );
}
