use rust_decimal::Decimal;
use sqlx::{PgPool, Row};
use tradstry_backend::service::db::schema::tables::trade_review_table;
use tradstry_backend::service::trade_review::journal_flow;

async fn enabled_workspace(pool: &PgPool) -> (String, String) {
    let (user, workspace) = crate::pg_support::seed_user_workspace(pool).await;
    sqlx::query("INSERT INTO journal_workspace_state(workspace_id,user_id,enabled,opening_inventory) VALUES ($1,$2,true,$3)")
        .bind(&workspace).bind(&user)
        .bind(serde_json::json!({"equity:ACME|USD":{"kind":"flat","as_of":"2026-09-01T00:00:00Z","provenance":"user_confirmed"}}))
        .execute(pool).await.unwrap();
    (user, workspace)
}

struct FillAmounts {
    quantity: f64,
    price: f64,
    fee: f64,
}

async fn fill(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    name: &str,
    side: &str,
    amounts: FillAmounts,
    at: &str,
) {
    let FillAmounts {
        quantity,
        price,
        fee,
    } = amounts;
    let id = format!("{workspace}:{name}");
    sqlx::query("INSERT INTO brokerage_transactions(id,user_id,workspace_id,snaptrade_id,symbol,symbol_description,currency,transaction_type,price,units,fee,trade_date,settlement_date,institution,raw_json,dedup_key)
        VALUES ($1,$2,$3,$1,'ACME','Acme','USD',$4,$5,$6,$7,$8::text::timestamptz,$8::text::timestamptz,'test',$9,$1)")
        .bind(id).bind(user).bind(workspace).bind(side).bind(price).bind(quantity).bind(fee).bind(at)
        .bind(serde_json::json!({"fee":fee,"trade_date":at,"type":side}).to_string())
        .execute(pool).await.unwrap();
}

async fn project(pool: &PgPool, user: &str, workspace: &str) {
    journal_flow::seal_import(pool, user, workspace)
        .await
        .unwrap();
    journal_flow::process_once(pool, "journal-test")
        .await
        .unwrap();
}

#[tokio::test]
async fn empty_option_metadata_recovers_stock_history_and_preserves_the_journal_entry() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    for (name, side, quantity, price, at) in [
        ("buy", "BUY", 2.0, 5.88, "2026-09-01T14:00:00Z"),
        ("sell", "SELL", -2.0, 6.14, "2026-09-02T14:00:00Z"),
        ("reentry", "BUY", 3.0, 7.0, "2026-09-03T14:00:00Z"),
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
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    // The older brokerage flow already allocated these executions, but never
    // published them to the journal. Reproduce that retained-data boundary.
    sqlx::query("UPDATE journal_workspace_state SET enabled=false WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE brokerage_transactions SET option_kind='put' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let broken = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(broken.len(), 1);
    assert_eq!(broken[0].lifecycle_state, "incomplete");
    let id = &broken[0].id;
    let context = journal_flow::reflection::save_context(
        &pool,
        &user,
        &workspace,
        journal_flow::reflection::ContextInput {
            entry_id: id.clone(),
            expected_version: 0,
            stop_state: "unknown".into(),
            stop_price: None,
            playbook_id: None,
            claimed_at: None,
            notes: Some("Keep my original reasoning".into()),
            tag_ids: None,
            violated_principle_ids: None,
        },
        "test",
        "stock-recovery-context",
    )
    .await
    .unwrap();
    // Real stock imports store absent option strings as empty strings, not NULL.
    sqlx::query("UPDATE brokerage_transactions SET option_kind='',underlying_symbol='  ',option_expiration='' WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    project(&pool, &user, &workspace).await;
    let recovered = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(recovered.len(), 2);
    let closed = recovered.iter().find(|trade| trade.id == *id).unwrap();
    assert_eq!(closed.lifecycle_state, "closed");
    assert_eq!(closed.realized_net.as_deref(), Some("0.52"));
    assert!(
        closed
            .open_date
            .as_deref()
            .unwrap()
            .starts_with("2026-09-01")
    );
    assert!(
        closed
            .close_date
            .as_deref()
            .unwrap()
            .starts_with("2026-09-02")
    );
    let open = recovered.iter().find(|trade| trade.id != *id).unwrap();
    assert_eq!(open.lifecycle_state, "open");
    assert_eq!(open.remaining_quantity.as_deref(), Some("3"));
    assert_eq!(
        journal_flow::reflection::context(&pool, &user, &workspace, id)
            .await
            .unwrap()
            .notes,
        context.notes
    );
    let bad_allocations: i64 = sqlx::query_scalar("SELECT count(*) FROM brokerage_transactions b WHERE b.workspace_id=$1 AND abs(b.units)::numeric<>(SELECT coalesce(sum(f.quantity),0) FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id WHERE f.brokerage_transaction_id=b.id AND e.retired_at IS NULL)")
        .bind(&workspace).fetch_one(&pool).await.unwrap();
    assert_eq!(bad_allocations, 0);
    // Force another projection at the same source revision: retries must not
    // replace IDs or invalidate reviews by unnecessarily bumping entry revisions.
    sqlx::query("UPDATE journal_projection_jobs SET state='pending',available_at=now() WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    assert_eq!(
        journal_flow::process_once(&pool, "stock-retry")
            .await
            .unwrap(),
        1
    );
    let retried = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(retried).unwrap(),
        serde_json::to_value(recovered).unwrap()
    );
}

#[tokio::test]
async fn stock_placeholders_do_not_hide_genuinely_incomplete_options() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory=jsonb_build_object('*',opening_inventory->'equity:ACME|USD') WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    for (name, kind, underlying, strike, expiration, multiplier, raw_option, expected) in [
        (
            "EMPTY",
            "",
            "",
            None,
            "",
            1.0,
            serde_json::Value::Null,
            "open",
        ),
        (
            "SPACE",
            "  ",
            "  ",
            None,
            "  ",
            1.0,
            serde_json::json!(" "),
            "open",
        ),
        (
            "PUT",
            " PUT ",
            " ACME ",
            Some(37.0),
            "2026-10-16",
            100.0,
            serde_json::json!({"ticker":"ACME PUT"}),
            "open",
        ),
        (
            "STRIKE",
            "",
            "",
            Some(37.0),
            "",
            1.0,
            serde_json::Value::Null,
            "incomplete",
        ),
        (
            "EXPIRY",
            "",
            "",
            None,
            "2026-10-16",
            1.0,
            serde_json::Value::Null,
            "incomplete",
        ),
        (
            "PARTIAL",
            "PUT",
            "ACME",
            None,
            "",
            100.0,
            serde_json::Value::Null,
            "incomplete",
        ),
        (
            "RAW",
            "",
            "",
            None,
            "",
            1.0,
            serde_json::json!({"ticker":"missing metadata"}),
            "incomplete",
        ),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            "BUY",
            FillAmounts {
                quantity: 1.0,
                price: 1.68,
                fee: 0.25,
            },
            "2026-09-01T14:00:00Z",
        )
        .await;
        sqlx::query("UPDATE brokerage_transactions SET symbol=$2,option_kind=$3,underlying_symbol=$4,strike_price=$5,option_expiration=$6,contract_multiplier=$7,raw_json=jsonb_set(raw_json::jsonb,'{option_symbol}',$8)::text WHERE id=$1")
            .bind(format!("{workspace}:{name}")).bind(name).bind(kind).bind(underlying).bind(strike).bind(expiration).bind(multiplier).bind(raw_option)
            .execute(&pool).await.unwrap();
        project(&pool, &user, &workspace).await;
        let trades = journal_flow::list_trades(&pool, &user, &workspace)
            .await
            .unwrap();
        let trade = trades.iter().find(|trade| trade.symbol == name).unwrap();
        assert_eq!(trade.lifecycle_state, expected, "{name}");
        if name == "PUT" {
            assert_eq!(trade.contract_multiplier, "100");
            assert_eq!(trade.fees_paid.as_deref(), Some("0.25"));
        }
    }
}

#[tokio::test]
async fn confirmed_ticker_continuation_closes_the_position_without_changing_broker_facts() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory=jsonb_build_object('*',opening_inventory->'equity:ACME|USD') WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    for (name, side, quantity, price, at) in [
        ("first", "BUY", 100.0, 0.59, "2026-09-01T14:00:00Z"),
        ("exit", "SELL", -100.0, 0.5102, "2026-09-01T15:00:00Z"),
        ("opening", "BUY", 150.0, 0.5324, "2026-09-01T16:00:00Z"),
        ("renamed", "SELL", -150.0, 0.345, "2026-09-02T14:00:00Z"),
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
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    sqlx::query("UPDATE brokerage_transactions SET symbol=CASE WHEN id=$2 THEN 'ACMEQ' ELSE symbol END,option_kind='PUT' WHERE workspace_id=$1")
        .bind(&workspace).bind(format!("{workspace}:renamed")).execute(&pool).await.unwrap();
    project(&pool, &user, &workspace).await;
    let original = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(original.len(), 2);
    sqlx::query("UPDATE brokerage_transactions SET option_kind='',underlying_symbol='' WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    let facts: serde_json::Value = sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM brokerage_transactions b WHERE workspace_id=$1")
        .bind(&workspace).fetch_one(&pool).await.unwrap();
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory=jsonb_set(opening_inventory,'{confirmed_continuations}',$2),grouping_revision=grouping_revision+1 WHERE workspace_id=$1")
        .bind(&workspace).bind(serde_json::json!([{"execution_id":format!("{workspace}:renamed"),"opening_execution_id":format!("{workspace}:opening"),"provenance":"user_confirmed"}]))
        .execute(&pool).await.unwrap();
    project(&pool, &user, &workspace).await;
    let repaired = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(repaired.len(), 2);
    assert!(
        repaired
            .iter()
            .all(|trade| trade.direction == "long" && trade.lifecycle_state == "closed")
    );
    assert!(
        original
            .iter()
            .all(|old| repaired.iter().any(|new| new.id == old.id))
    );
    let mut profits = repaired
        .iter()
        .map(|trade| trade.realized_net.clone().unwrap())
        .collect::<Vec<_>>();
    profits.sort();
    assert_eq!(profits, vec!["-28.11", "-7.98"]);
    let after: serde_json::Value = sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM brokerage_transactions b WHERE workspace_id=$1")
        .bind(&workspace).fetch_one(&pool).await.unwrap();
    assert_eq!(after, facts);
    // A confirmation cannot borrow an opening from a different workspace.
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory=jsonb_set(opening_inventory,'{confirmed_continuations,0,opening_execution_id}','\"another-workspace:opening\"'),grouping_revision=grouping_revision+1 WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    sqlx::query("UPDATE journal_projection_jobs SET state='pending',available_at=now() WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    assert!(
        journal_flow::process_once(&pool, "invalid-continuation")
            .await
            .is_err()
    );
    assert_eq!(
        serde_json::to_value(
            journal_flow::list_trades(&pool, &user, &workspace)
                .await
                .unwrap()
        )
        .unwrap(),
        serde_json::to_value(repaired).unwrap()
    );
    // Leave no intentionally invalid job for subsequent tests in this shared DB.
    sqlx::query("UPDATE journal_projection_jobs SET state='complete' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
async fn unresolved_history_is_confirmed_reviewed_and_undone_without_losing_identity() {
    use journal_flow::{
        grouping::{self, AllocationInput, GroupInput, GroupingInput},
        reflection,
    };
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 10.0,
            price: 10.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "sell",
        "SELL",
        FillAmounts {
            quantity: 10.0,
            price: 11.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let original = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()
        .remove(0);
    assert_eq!(original.lifecycle_state, "incomplete");
    let preview = grouping::preview(
        &pool,
        &user,
        &workspace,
        GroupingInput {
            direction: Some("long".into()),
            entry_ids: vec![original.id.clone()],
            groups: vec![GroupInput {
                entry_id: Some(original.id.clone()),
                allocations: vec![
                    AllocationInput {
                        transaction_id: format!("{workspace}:buy"),
                        quantity: "10".into(),
                    },
                    AllocationInput {
                        transaction_id: format!("{workspace}:sell"),
                        quantity: "10".into(),
                    },
                ],
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(preview.realized_net, vec![Some("10".into())]);
    let confirmed = grouping::confirm(&pool, &user, &workspace, &preview.token, "test", "resolve")
        .await
        .unwrap();
    assert_eq!(confirmed.entry_ids, vec![original.id.clone()]);
    let trade = journal_flow::get_trade(&pool, &user, &workspace, &original.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(trade.lifecycle_state, "closed");
    let context = reflection::save_context(
        &pool,
        &user,
        &workspace,
        reflection::ContextInput {
            entry_id: original.id.clone(),
            expected_version: 0,
            stop_state: "price".into(),
            stop_price: Some("9".into()),
            playbook_id: None,
            claimed_at: Some("2026-09-01T13:00:00Z".into()),
            notes: Some("Keep the entry reasoning".into()),
            tag_ids: None,
            violated_principle_ids: None,
        },
        "test",
        "context",
    )
    .await
    .unwrap();
    assert_eq!(context.phase.as_deref(), Some("retrospective"));
    assert_eq!(context.notes.as_deref(), Some("Keep the entry reasoning"));
    assert_eq!(
        reflection::context(&pool, &user, &workspace, &original.id)
            .await
            .unwrap()
            .notes,
        context.notes
    );
    let draft = reflection::save_draft(
        &pool,
        &user,
        &workspace,
        reflection::DraftInput {
            entry_id: original.id.clone(),
            expected_version: 0,
            takeaway: "".into(),
            choice_ids: vec![],
            plan_adherence: None,
        },
        "test",
        "draft-empty",
    )
    .await
    .unwrap();
    let review_input = reflection::ReviewInput {
        entry_id: original.id.clone(),
        expected_entry_revision: trade.materialized_revision,
        expected_context_version: context.version,
        expected_draft_version: draft.version,
        session_id: None,
    };
    assert!(
        reflection::finalize(
            &pool,
            &user,
            &workspace,
            review_input.clone(),
            "test",
            "empty-review"
        )
        .await
        .is_err()
    );
    let draft = reflection::save_draft(
        &pool,
        &user,
        &workspace,
        reflection::DraftInput {
            entry_id: original.id.clone(),
            expected_version: draft.version,
            takeaway: "Keep the planned exit next time".into(),
            choice_ids: vec![],
            plan_adherence: None,
        },
        "test",
        "draft-final",
    )
    .await
    .unwrap();
    let review_input = reflection::ReviewInput {
        expected_draft_version: draft.version,
        ..review_input
    };
    let reviewed = reflection::finalize(
        &pool,
        &user,
        &workspace,
        review_input.clone(),
        "test",
        "review",
    )
    .await
    .unwrap();
    assert_eq!(
        reflection::finalize(&pool, &user, &workspace, review_input, "test", "review")
            .await
            .unwrap()
            .id,
        reviewed.id
    );
    assert_eq!(
        journal_flow::get_trade(&pool, &user, &workspace, &original.id)
            .await
            .unwrap()
            .unwrap()
            .review_state,
        "reviewed"
    );
    assert!(
        journal_flow::get_trade(&pool, "different-user", &workspace, &original.id)
            .await
            .unwrap()
            .is_none()
    );
    let undo = grouping::preview_undo(&pool, &user, &workspace, &confirmed.operation_id)
        .await
        .unwrap();
    grouping::confirm(&pool, &user, &workspace, &undo.token, "test", "undo")
        .await
        .unwrap();
    let restored = journal_flow::get_trade(&pool, &user, &workspace, &original.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(restored.lifecycle_state, "incomplete");
    assert_eq!(restored.review_state, "outdated");
    let manual_id = format!("{workspace}:manual");
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,total_pl,net_roi,duration,status,notes) VALUES($1,$2,$3,'ACME','Acme','long','2026-09-01T14:00:00Z','2026-09-01T15:00:00Z',10,11,10,10,10,3600,'profit','Keep my original notes')")
        .bind(&manual_id).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    let adoption = grouping::preview(
        &pool,
        &user,
        &workspace,
        GroupingInput {
            direction: Some("long".into()),
            entry_ids: vec![original.id.clone(), manual_id.clone()],
            groups: vec![GroupInput {
                entry_id: Some(manual_id.clone()),
                allocations: vec![
                    AllocationInput {
                        transaction_id: format!("{workspace}:buy"),
                        quantity: "10".into(),
                    },
                    AllocationInput {
                        transaction_id: format!("{workspace}:sell"),
                        quantity: "10".into(),
                    },
                ],
            }],
        },
    )
    .await
    .unwrap();
    assert!(
        grouping::confirm(
            &pool,
            "another-user",
            &workspace,
            &adoption.token,
            "test",
            "stolen"
        )
        .await
        .is_err()
    );
    grouping::confirm(&pool, &user, &workspace, &adoption.token, "test", "adopt")
        .await
        .unwrap();
    let adopted = journal_flow::get_trade(&pool, &user, &workspace, &manual_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(adopted.source_kind, "broker");
    assert_eq!(adopted.realized_net.as_deref(), Some("10"));
    let notes: String = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
        .bind(&manual_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(notes, "Keep my original notes");
    let undo_adoption = grouping::preview_undo(&pool, &user, &workspace, &adoption.token)
        .await
        .unwrap();
    grouping::confirm(
        &pool,
        &user,
        &workspace,
        &undo_adoption.token,
        "test",
        "undo-adopt",
    )
    .await
    .unwrap();
    assert_eq!(
        journal_flow::get_trade(&pool, &user, &workspace, &manual_id)
            .await
            .unwrap()
            .unwrap()
            .source_kind,
        "manual"
    );
    assert_eq!(
        reflection::context(&pool, &user, &workspace, &original.id)
            .await
            .unwrap()
            .stop_price
            .as_deref(),
        Some("9")
    );
}

#[tokio::test]
async fn entry_identity_and_context_survive_partial_and_final_exits() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 1.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let entries = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(entries.len(), 1);
    let id = entries[0].id.clone();
    assert_eq!(entries[0].lifecycle_state, "open");
    assert_eq!(entries[0].remaining_quantity.as_deref(), Some("100"));
    assert_eq!(entries[0].realized_net.as_deref(), Some("0"));
    assert_eq!(entries[0].close_date, None);
    sqlx::query("UPDATE journal_entries SET notes='Keep this context' WHERE id=$1")
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

    fill(
        &pool,
        &user,
        &workspace,
        "partial",
        "SELL",
        FillAmounts {
            quantity: 40.0,
            price: 110.0,
            fee: 0.4,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let entries = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, id);
    assert_eq!(entries[0].remaining_quantity.as_deref(), Some("60"));
    assert_eq!(entries[0].realized_net.as_deref(), Some("399.2"));

    fill(
        &pool,
        &user,
        &workspace,
        "exit",
        "SELL",
        FillAmounts {
            quantity: 60.0,
            price: 108.0,
            fee: 0.6,
        },
        "2026-09-01T16:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    project(&pool, &user, &workspace).await;
    let entries = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, id);
    assert_eq!(entries[0].lifecycle_state, "closed");
    assert_eq!(entries[0].remaining_quantity.as_deref(), Some("0"));
    assert_eq!(entries[0].realized_net.as_deref(), Some("878"));
    assert_eq!(entries[0].fees_paid.as_deref(), Some("2"));
    assert_eq!(entries[0].review_state, "unreviewed");
    let row = sqlx::query("SELECT notes,(SELECT sum(allocated_quantity) FROM journal_brokerage_links WHERE journal_entry_id=$1) AS allocated FROM journal_entries WHERE id=$1").bind(&id).fetch_one(&pool).await.unwrap();
    assert_eq!(row.get::<String, _>("notes"), "Keep this context");
    assert_eq!(row.get::<Decimal, _>("allocated"), Decimal::from(200));
}

#[tokio::test]
async fn reversal_allocates_exact_fees_and_keeps_both_identities_on_later_sync() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let original = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()[0]
        .id
        .clone();
    fill(
        &pool,
        &user,
        &workspace,
        "reverse",
        "SELL",
        FillAmounts {
            quantity: 150.0,
            price: 110.0,
            fee: 1.5,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 2);
    let short = trades
        .iter()
        .find(|trade| trade.id != original)
        .unwrap()
        .id
        .clone();
    let allocations:Vec<(String,Decimal,Decimal)>=sqlx::query_as("SELECT f.role,f.quantity,f.fee FROM trade_episode_fills f WHERE f.brokerage_transaction_id=$1 ORDER BY f.role")
        .bind(format!("{workspace}:reverse")).fetch_all(&pool).await.unwrap();
    assert_eq!(
        allocations,
        vec![
            ("entry".into(), Decimal::from(50), Decimal::new(5, 1)),
            ("exit".into(), Decimal::from(100), Decimal::ONE)
        ]
    );
    fill(
        &pool,
        &user,
        &workspace,
        "cover",
        "BUY",
        FillAmounts {
            quantity: 50.0,
            price: 105.0,
            fee: 0.5,
        },
        "2026-09-01T16:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 2);
    assert!(trades.iter().all(|trade| trade.lifecycle_state == "closed"));
    assert_eq!(
        trades
            .iter()
            .find(|trade| trade.id == short)
            .unwrap()
            .realized_net
            .as_deref(),
        Some("249")
    );
    assert_eq!(
        trades
            .iter()
            .find(|trade| trade.id == original)
            .unwrap()
            .realized_net
            .as_deref(),
        Some("999")
    );
}

#[tokio::test]
async fn missing_opening_history_is_repaired_without_replacing_the_entry() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    fill(
        &pool,
        &user,
        &workspace,
        "sale",
        "SELL",
        FillAmounts {
            quantity: 100.0,
            price: 110.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    let id = trades[0].id.clone();
    assert_eq!(trades[0].lifecycle_state, "incomplete");
    assert_eq!(trades[0].realized_net, None);
    fill(
        &pool,
        &user,
        &workspace,
        "opening",
        "BUY_TO_OPEN",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, id);
    assert_eq!(trades[0].lifecycle_state, "closed");
    assert_eq!(trades[0].realized_net.as_deref(), Some("1000"));
}

#[tokio::test]
async fn unsealed_import_waits_and_expired_worker_lease_recovers() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    journal_flow::process_once(&pool, "before-seal")
        .await
        .unwrap();
    assert!(
        journal_flow::list_trades(&pool, &user, &workspace)
            .await
            .unwrap()
            .is_empty()
    );
    journal_flow::seal_import(&pool, &user, &workspace)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_projection_jobs SET state='running',lease_owner='crashed-worker',lease_until=now()-interval '1 minute' WHERE workspace_id=$1").bind(&workspace).execute(&pool).await.unwrap();
    journal_flow::process_once(&pool, "replacement-worker")
        .await
        .unwrap();
    let before = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(before.len(), 1);
    let versions:(i64,i64)=sqlx::query_as("SELECT source_revision,projection_revision FROM journal_workspace_state WHERE workspace_id=$1").bind(&workspace).fetch_one(&pool).await.unwrap();
    assert_eq!(versions, (1, 1));
    sqlx::query("UPDATE brokerage_transactions SET updated_at=now() WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let after = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(after[0].id, before[0].id);
    let versions:(i64,i64)=sqlx::query_as("SELECT source_revision,projection_revision FROM journal_workspace_state WHERE workspace_id=$1").bind(&workspace).fetch_one(&pool).await.unwrap();
    assert_eq!(versions, (1, 1));
}

#[tokio::test]
async fn fee_availability_correction_recalculates_the_same_entry() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "sell",
        "SELL",
        FillAmounts {
            quantity: 100.0,
            price: 110.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    sqlx::query("UPDATE brokerage_transactions SET raw_json=(raw_json::jsonb||'{\"fee\":null}')::text WHERE id=$1").bind(format!("{workspace}:buy")).execute(&pool).await.unwrap();
    project(&pool, &user, &workspace).await;
    let before = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(before.len(), 1);
    assert_eq!(before[0].realized_net, None);
    sqlx::query("UPDATE brokerage_transactions SET raw_json=(raw_json::jsonb||'{\"fee\":0}')::text WHERE id=$1").bind(format!("{workspace}:buy")).execute(&pool).await.unwrap();
    project(&pool, &user, &workspace).await;
    let after = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].id, before[0].id);
    assert_eq!(after[0].realized_net.as_deref(), Some("1000"));
}

#[tokio::test]
async fn allocation_fees_cannot_exceed_the_broker_record() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 1.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let result =
        sqlx::query("UPDATE trade_episode_fills SET fee=10 WHERE brokerage_transaction_id=$1")
            .bind(format!("{workspace}:buy"))
            .execute(&pool)
            .await;
    assert!(result.is_err(), "an allocation must not manufacture fees");
}

#[tokio::test]
async fn failed_import_preserves_the_last_projection_until_a_successful_retry() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let id = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()[0]
        .id
        .clone();
    journal_flow::begin_import(&pool, &user, &workspace)
        .await
        .unwrap();
    fill(
        &pool,
        &user,
        &workspace,
        "sell",
        "SELL",
        FillAmounts {
            quantity: 100.0,
            price: 110.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    journal_flow::fail_import(&pool, &user, &workspace)
        .await
        .unwrap();
    journal_flow::process_once(&pool, "after-failure")
        .await
        .unwrap();
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades[0].lifecycle_state, "open");
    assert_eq!(trades[0].id, id);
    journal_flow::begin_import(&pool, &user, &workspace)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades[0].lifecycle_state, "closed");
    assert_eq!(trades[0].id, id);
    let (other, _) = crate::pg_support::seed_user_workspace(&pool).await;
    assert!(
        journal_flow::begin_import(&pool, &other, &workspace)
            .await
            .is_err()
    );
    assert!(
        journal_flow::list_trades(&pool, &other, &workspace)
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn invalid_source_correction_marks_the_same_entry_incomplete_and_can_recover() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let id = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()[0]
        .id
        .clone();
    sqlx::query("UPDATE brokerage_transactions SET price=0 WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, id);
    assert_eq!(trades[0].lifecycle_state, "incomplete");
    assert_eq!(trades[0].realized_net, None);
    sqlx::query("UPDATE brokerage_transactions SET price=100 WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, id);
    assert_eq!(trades[0].lifecycle_state, "open");
    assert_eq!(trades[0].realized_net.as_deref(), Some("0"));
}

#[tokio::test]
async fn existing_published_entry_keeps_its_identity_and_notes() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET enabled=false WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "sell",
        "SELL",
        FillAmounts {
            quantity: 100.0,
            price: 110.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    let episode: String = sqlx::query_scalar("SELECT id FROM trade_episodes WHERE workspace_id=$1")
        .bind(&workspace)
        .fetch_one(&pool)
        .await
        .unwrap();
    let input = trade_review_table::PublishEpisodeReviewInput {
        episode_id: episode,
        plan_id: None,
        stop_loss: Some(95.0),
        playbook_id: None,
        notes: Some("My existing journal notes".into()),
        plan_adherence: None,
        lesson: None,
        tag_ids: vec![],
        violated_principle_ids: vec![],
    };
    let id = trade_review_table::publish_episode_review(&pool, &user, input.clone())
        .await
        .unwrap();
    let before: Option<String> =
        sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, id);
    assert_eq!(trades[0].review_state, "unreviewed");
    let after: Option<String> = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(after, before);
    assert_eq!(
        trade_review_table::publish_episode_review(&pool, &user, input)
            .await
            .unwrap(),
        id
    );
}

#[tokio::test]
async fn legacy_manual_merge_with_exact_links_is_adopted_once() {
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET enabled=false WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 100.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "sell",
        "SELL",
        FillAmounts {
            quantity: 100.0,
            price: 110.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    let id = format!("{workspace}:manual");
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,status,total_pl,net_roi,duration,notes)
        VALUES ($1,$2,$3,'ACME','Acme','long','2026-09-01T14:00:00Z','2026-09-01T15:00:00Z',100,110,100,'profit',10,10,3600,'Original manual merge')")
        .bind(&id).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) SELECT uuidv7()::text,$1,id,$2 FROM brokerage_transactions WHERE workspace_id=$3")
        .bind(&id).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 1);
    assert_eq!(trades[0].id, id);
    let notes: String = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(notes, "Original manual merge");
}

#[tokio::test]
async fn split_preview_is_read_only_and_confirmation_preserves_the_holding() {
    use journal_flow::grouping::{self, AllocationInput, GroupInput, GroupingInput};
    let pool = crate::pg_support::test_pool().await;
    let (user, workspace) = enabled_workspace(&pool).await;
    fill(
        &pool,
        &user,
        &workspace,
        "hold",
        "BUY",
        FillAmounts {
            quantity: 100.0,
            price: 50.0,
            fee: 0.0,
        },
        "2026-09-01T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "add",
        "BUY",
        FillAmounts {
            quantity: 20.0,
            price: 55.0,
            fee: 0.0,
        },
        "2026-09-02T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "exit",
        "SELL",
        FillAmounts {
            quantity: 20.0,
            price: 57.0,
            fee: 0.0,
        },
        "2026-09-02T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let original = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    let id = original[0].id.clone();
    assert_eq!(original[0].realized_net.as_deref(), Some("140"));
    let allocation = |name: &str, quantity: &str| AllocationInput {
        transaction_id: format!("{workspace}:{name}"),
        quantity: quantity.into(),
    };
    let preview = grouping::preview(
        &pool,
        &user,
        &workspace,
        GroupingInput {
            direction: None,
            entry_ids: vec![id.clone()],
            groups: vec![
                GroupInput {
                    entry_id: Some(id.clone()),
                    allocations: vec![allocation("hold", "100")],
                },
                GroupInput {
                    entry_id: None,
                    allocations: vec![allocation("add", "20"), allocation("exit", "20")],
                },
            ],
        },
    )
    .await
    .unwrap();
    assert_eq!(
        preview.realized_net,
        vec![Some("0".into()), Some("40".into())]
    );
    assert_eq!(
        journal_flow::list_trades(&pool, &user, &workspace)
            .await
            .unwrap()
            .len(),
        1
    );
    let result = grouping::confirm(
        &pool,
        &user,
        &workspace,
        &preview.token,
        "browser",
        "split-1",
    )
    .await
    .unwrap();
    assert_eq!(
        grouping::confirm(
            &pool,
            &user,
            &workspace,
            &preview.token,
            "browser",
            "split-1"
        )
        .await
        .unwrap(),
        result
    );
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(trades.len(), 2);
    let holding = trades.iter().find(|trade| trade.id == id).unwrap();
    assert_eq!(holding.remaining_quantity.as_deref(), Some("100"));
    assert_eq!(holding.realized_net.as_deref(), Some("0"));
    let child = trades.iter().find(|trade| trade.id != id).unwrap();
    assert_eq!(child.lifecycle_state, "closed");
    assert_eq!(child.realized_net.as_deref(), Some("40"));
    assert_eq!(child.review_state, "unreviewed");
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM brokerage_transactions WHERE workspace_id=$1")
            .bind(&workspace)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 3);
}
