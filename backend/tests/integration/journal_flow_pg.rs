use rust_decimal::Decimal;
use sqlx::{PgPool, Row};
use tradstry_backend::service::db::schema::tables::trade_review_table;
use tradstry_backend::service::trade_review::journal_flow;

pub(crate) async fn enabled_workspace(pool: &PgPool) -> (String, String) {
    let (user, workspace) = crate::pg_support::seed_user_workspace(pool).await;
    sqlx::query("INSERT INTO journal_workspace_state(workspace_id,user_id,enabled,opening_inventory) VALUES ($1,$2,true,$3)")
        .bind(&workspace).bind(&user)
        .bind(serde_json::json!({"equity:ACME|USD":{"kind":"flat","as_of":"2026-09-01T00:00:00Z","provenance":"user_confirmed"}}))
        .execute(pool).await.unwrap();
    (user, workspace)
}

pub(crate) struct FillAmounts {
    pub quantity: f64,
    pub price: f64,
    pub fee: f64,
}

pub(crate) async fn fill(
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

pub(crate) async fn project(pool: &PgPool, user: &str, workspace: &str) {
    journal_flow::seal_import(pool, user, workspace)
        .await
        .unwrap();
    journal_flow::process_once(pool, "journal-test")
        .await
        .unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn saved_review_work_is_in_progress_until_explicitly_finalized() {
    use journal_flow::reflection;
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    let entry = format!("{workspace}:review-progress");
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,lifecycle_state,open_date,close_date,entry_price,exit_price,position_size) VALUES ($1,$2,$3,'ACME','Acme','long','closed','2026-09-01T14:00:00Z','2026-09-01T15:00:00Z',10,11,1)")
        .bind(&entry).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    let state = || async {
        journal_flow::get_trade(&pool, &user, &workspace, &entry)
            .await
            .unwrap()
            .unwrap()
            .review_state
    };
    assert_eq!(state().await, "unreviewed");
    for column in ["entry_tactics", "mistakes", "edges_spotted"] {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE journal_entries SET {column}=$2 WHERE id=$1"
        )))
        .bind(&entry)
        .bind("Inside day")
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(
            state().await,
            "in_progress",
            "legacy {column} counts as saved work"
        );
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "UPDATE journal_entries SET {column}=$2 WHERE id=$1"
        )))
        .bind(&entry)
        .bind(" [ ] \n")
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(state().await, "unreviewed");
    }
    let context_input = |notes: &str| reflection::ContextInput {
        entry_id: entry.clone(),
        expected_version: 0,
        stop_state: "unknown".into(),
        stop_price: None,
        playbook_id: None,
        claimed_at: None,
        notes: Some(notes.into()),
        tag_ids: None,
        violated_principle_ids: None,
    };
    reflection::save_context(
        &pool,
        &user,
        &workspace,
        context_input("I followed my setup in a weak market."),
        "test",
        "progress-note",
    )
    .await
    .unwrap();
    assert_eq!(state().await, "in_progress");
    reflection::save_context(
        &pool,
        &user,
        &workspace,
        context_input(" \n\t"),
        "test",
        "clear-progress-note",
    )
    .await
    .unwrap();
    assert_eq!(state().await, "unreviewed");
    let category = format!("{workspace}:category");
    let tag = format!("{workspace}:tag");
    sqlx::query("INSERT INTO tag_categories(id,user_id,workspace_id,name,created_at,updated_at) VALUES ($1,$2,$3,'Tactics',now(),now())")
        .bind(&category).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO tags(id,user_id,workspace_id,category_id,name,created_at,updated_at) VALUES ($1,$2,$3,$4,'Inside day',now(),now())")
        .bind(&tag).bind(&user).bind(&workspace).bind(&category).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO trade_tags(journal_entry_id,tag_id) VALUES ($1,$2)")
        .bind(&entry)
        .bind(&tag)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(state().await, "in_progress");
    sqlx::query("UPDATE tags SET deleted_at=now() WHERE id=$1")
        .bind(&tag)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(state().await, "unreviewed");
    let mut version = 0;
    for (index, takeaway) in [
        " \n\t",
        "Repeat the setup only when the market supports it.",
    ]
    .iter()
    .enumerate()
    {
        let draft = reflection::save_draft(
            &pool,
            &user,
            &workspace,
            reflection::DraftInput {
                entry_id: entry.clone(),
                expected_version: version,
                takeaway: (*takeaway).into(),
                choice_ids: vec![],
                plan_adherence: None,
            },
            "test",
            &format!("progress-draft-{index}"),
        )
        .await
        .unwrap();
        version = draft.version;
        assert_eq!(
            state().await,
            if index == 0 {
                "unreviewed"
            } else {
                "in_progress"
            }
        );
    }
    let trade = journal_flow::get_trade(&pool, &user, &workspace, &entry)
        .await
        .unwrap()
        .unwrap();
    reflection::finalize(
        &pool,
        &user,
        &workspace,
        reflection::ReviewInput {
            entry_id: entry.clone(),
            expected_entry_revision: trade.materialized_revision,
            expected_context_version: 0,
            expected_draft_version: version,
            session_id: None,
        },
        "test",
        "finish-progress-review",
    )
    .await
    .unwrap();
    assert_eq!(state().await, "reviewed");
}

#[tokio::test(flavor = "multi_thread")]
async fn empty_option_metadata_recovers_stock_history_and_preserves_the_journal_entry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn stock_placeholders_do_not_hide_genuinely_incomplete_options() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn confirmed_ticker_continuation_closes_the_position_without_changing_broker_facts() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn unresolved_history_is_confirmed_reviewed_and_undone_without_losing_identity() {
    use journal_flow::{
        grouping::{self, AllocationInput, GroupInput, GroupingInput},
        reflection,
    };
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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
    // Still open, so the history does not end flat and its start stays unknown.
    fill(
        &pool,
        &user,
        &workspace,
        "later",
        "BUY",
        FillAmounts {
            quantity: 5.0,
            price: 12.0,
            fee: 0.0,
        },
        "2026-09-02T15:00:00Z",
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
            groups: vec![
                GroupInput {
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
                },
                GroupInput {
                    entry_id: None,
                    allocations: vec![AllocationInput {
                        transaction_id: format!("{workspace}:later"),
                        quantity: "5".into(),
                    }],
                },
            ],
        },
    )
    .await
    .unwrap();
    assert_eq!(
        preview.realized_net,
        vec![Some("10".into()), Some("0".into())]
    );
    let confirmed = grouping::confirm(&pool, &user, &workspace, &preview.token, "test", "resolve")
        .await
        .unwrap();
    assert_eq!(confirmed.entry_ids[0], original.id);
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
            groups: vec![
                GroupInput {
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
                },
                GroupInput {
                    entry_id: None,
                    allocations: vec![AllocationInput {
                        transaction_id: format!("{workspace}:later"),
                        quantity: "5".into(),
                    }],
                },
            ],
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

#[tokio::test(flavor = "multi_thread")]
async fn entry_identity_and_context_survive_partial_and_final_exits() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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
    assert_eq!(entries[0].review_state, "in_progress");
    let row = sqlx::query("SELECT notes,(SELECT sum(allocated_quantity) FROM journal_brokerage_links WHERE journal_entry_id=$1) AS allocated FROM journal_entries WHERE id=$1").bind(&id).fetch_one(&pool).await.unwrap();
    assert_eq!(row.get::<String, _>("notes"), "Keep this context");
    assert_eq!(row.get::<Decimal, _>("allocated"), Decimal::from(200));
}

#[tokio::test(flavor = "multi_thread")]
async fn reversal_allocates_exact_fees_and_keeps_both_identities_on_later_sync() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn missing_opening_history_is_repaired_without_replacing_the_entry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn unsealed_import_waits_and_expired_worker_lease_recovers() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn fee_availability_correction_recalculates_the_same_entry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn allocation_fees_cannot_exceed_the_broker_record() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn failed_import_preserves_the_last_projection_until_a_successful_retry() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn invalid_source_correction_marks_the_same_entry_incomplete_and_can_recover() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn existing_published_entry_keeps_its_identity_and_notes() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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
    assert_eq!(trades[0].review_state, "in_progress");
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

#[tokio::test(flavor = "multi_thread")]
async fn legacy_manual_merge_with_exact_links_recovers_without_a_flat_account() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET enabled=false,opening_inventory='{}' WHERE workspace_id=$1")
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
            quantity: 1.0,
            price: 2.50,
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
            quantity: -1.0,
            price: 1.75,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    sqlx::query("UPDATE brokerage_transactions SET symbol='ACME  260918P00037000',symbol_description='ACME $37 Put 2026-09-18',underlying_symbol='ACME',option_kind='PUT',option_expiration='2026-09-18',strike_price=37,contract_multiplier=100 WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    let id = format!("{workspace}:manual");
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,status,total_pl,net_roi,duration,notes,contract_multiplier)
        VALUES ($1,$2,$3,'ACME','ACME $37 Put 2026-09-18','long','2026-09-01T14:00:00Z','2026-09-01T15:00:00Z',2.50,1.75,1,'loss',-30,-30,3600,'Original manual merge',100)")
        .bind(&id).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) SELECT uuidv7()::text,$1,id,$2 FROM brokerage_transactions WHERE workspace_id=$3")
        .bind(&id).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    let episode: String = sqlx::query_scalar("SELECT id FROM trade_episodes WHERE workspace_id=$1")
        .bind(&workspace)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE trade_episodes SET status='blocked',block_reason='Grouping needs confirmation' WHERE id=$1")
        .bind(&episode).execute(&pool).await.unwrap();
    let placeholder = format!("{workspace}:incomplete");
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,source_kind,lifecycle_state,outcome,issue_json,notes) VALUES ($1,$2,$3,'ACME  260918P00037000','ACME $37 Put 2026-09-18','unknown','broker','incomplete','unknown',$4,'Keep this placeholder note too')")
        .bind(&placeholder).bind(&user).bind(&workspace)
        .bind(serde_json::json!({"code":"incomplete_history","instrument_key":"option:ACME:2026-09-18:37:put:100|USD","source_ids":[format!("{workspace}:buy"),format!("{workspace}:sell")],"possible_duplicates":[]}))
        .execute(&pool).await.unwrap();
    let source_before: serde_json::Value = sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM brokerage_transactions b WHERE workspace_id=$1")
        .bind(&workspace).fetch_one(&pool).await.unwrap();
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
    assert_eq!(trades[0].episode_id.as_deref(), Some(episode.as_str()));
    assert_eq!(trades[0].lifecycle_state, "closed");
    assert_eq!(trades[0].realized_net.as_deref(), Some("-75"));
    assert_eq!(trades[0].review_state, "in_progress");
    let notes: String = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(notes, "Original manual merge");
    let retired: (bool, Option<String>, String) = sqlx::query_as(
        "SELECT retired_at IS NOT NULL,successor_id,notes FROM journal_entries WHERE id=$1",
    )
    .bind(&placeholder)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        retired,
        (
            true,
            Some(id.clone()),
            "Keep this placeholder note too".into()
        )
    );
    let source_after: serde_json::Value = sqlx::query_scalar("SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM brokerage_transactions b WHERE workspace_id=$1")
        .bind(&workspace).fetch_one(&pool).await.unwrap();
    assert_eq!(source_before, source_after);
    let inventory: serde_json::Value = sqlx::query_scalar(
        "SELECT opening_inventory FROM journal_workspace_state WHERE workspace_id=$1",
    )
    .bind(&workspace)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(inventory, serde_json::json!({}));
    sqlx::query("UPDATE journal_projection_jobs SET state='pending',available_at=now() WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    assert_eq!(
        journal_flow::process_once(&pool, "legacy-retry")
            .await
            .unwrap(),
        1
    );
    let retried = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(&trades).unwrap(),
        serde_json::to_value(retried).unwrap()
    );
    fill(
        &pool,
        &user,
        &workspace,
        "later",
        "BUY",
        FillAmounts {
            quantity: 1.0,
            price: 2.0,
            fee: 0.0,
        },
        "2026-09-02T14:00:00Z",
    )
    .await;
    sqlx::query("UPDATE brokerage_transactions SET symbol='ACME  260918P00037000',symbol_description='ACME $37 Put 2026-09-18',underlying_symbol='ACME',option_kind='PUT',option_expiration='2026-09-18',strike_price=37,contract_multiplier=100 WHERE id=$1")
        .bind(format!("{workspace}:later")).execute(&pool).await.unwrap();
    project(&pool, &user, &workspace).await;
    let later = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    assert_eq!(later.len(), 2);
    assert_eq!(
        later
            .iter()
            .find(|trade| trade.id == id)
            .unwrap()
            .lifecycle_state,
        "closed"
    );
    assert_eq!(
        later
            .iter()
            .find(|trade| trade.id != id)
            .unwrap()
            .lifecycle_state,
        "incomplete"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn uncertain_legacy_links_do_not_confirm_starting_history() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    for case in [
        "partial",
        "missing",
        "wrong_direction",
        "wrong_size",
        "wrong_lifecycle",
        "deleted",
        "retired",
        "competing",
    ] {
        let (user, workspace) = enabled_workspace(&pool).await;
        sqlx::query(
            "UPDATE journal_workspace_state SET enabled=false,opening_inventory='{}' WHERE workspace_id=$1",
        )
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
        for (name, side, quantity, at) in [
            ("buy", "BUY", 1.0, "2026-09-01T14:00:00Z"),
            ("sell", "SELL", -1.0, "2026-09-01T15:00:00Z"),
        ] {
            fill(
                &pool,
                &user,
                &workspace,
                name,
                side,
                FillAmounts {
                    quantity,
                    price: 10.0,
                    fee: 0.0,
                },
                at,
            )
            .await;
        }
        let id = format!("{workspace}:manual");
        sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,notes,position_size,close_date) VALUES ($1,$2,$3,'ACME','Acme',$4,'Preserve legacy entry',1,'2026-09-01T15:00:00Z')")
            .bind(&id).bind(&user).bind(&workspace).bind(if case == "wrong_direction" { "short" } else { "long" }).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id,allocated_quantity) SELECT uuidv7()::text,$1,id,$2,$4 FROM brokerage_transactions WHERE workspace_id=$3 AND ($5 OR transaction_type='BUY')")
            .bind(&id).bind(&user).bind(&workspace).bind(if case == "partial" { Some(Decimal::new(5,1)) } else { None }).bind(case != "missing").execute(&pool).await.unwrap();
        match case {
            "wrong_size" => {
                sqlx::query("UPDATE journal_entries SET position_size=2 WHERE id=$1")
                    .bind(&id)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            "wrong_lifecycle" => {
                sqlx::query("UPDATE journal_entries SET close_date=NULL WHERE id=$1")
                    .bind(&id)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            "deleted" => {
                sqlx::query("UPDATE journal_entries SET deleted_at=now() WHERE id=$1")
                    .bind(&id)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            "retired" => {
                sqlx::query("UPDATE journal_entries SET retired_at=now() WHERE id=$1")
                    .bind(&id)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            "competing" => {
                let other = format!("{workspace}:other");
                sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,position_size,close_date) VALUES ($1,$2,$3,'ACME','Acme','long',1,'2026-09-01T15:00:00Z')")
                    .bind(&other).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
                sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) SELECT uuidv7()::text,$1,id,$2 FROM brokerage_transactions WHERE workspace_id=$3")
                    .bind(&other).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
            }
            _ => {}
        }
        sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
            .bind(&workspace)
            .execute(&pool)
            .await
            .unwrap();
        project(&pool, &user, &workspace).await;
        let adopted: bool =
            sqlx::query_scalar("SELECT episode_id IS NOT NULL FROM journal_entries WHERE id=$1")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(!adopted, "{case} links must not adopt the legacy entry");
        let notes: String = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(notes, "Preserve legacy entry");
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn adopting_an_option_does_not_hold_a_separately_linked_stock_trade() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET enabled=false,opening_inventory='{}' WHERE workspace_id=$1")
        .bind(&workspace).execute(&pool).await.unwrap();
    for (name, side, quantity, at) in [
        ("stock-buy", "BUY", 1.0, "2026-09-01T14:00:00Z"),
        ("stock-sell", "SELL", -1.0, "2026-09-02T14:00:00Z"),
        ("later-stock", "BUY", 1.0, "2026-09-03T14:00:00Z"),
        ("option-buy", "BUY", 1.0, "2026-09-01T14:30:00Z"),
        ("option-sell", "SELL", -1.0, "2026-09-02T14:30:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity,
                price: 10.0,
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    sqlx::query("UPDATE brokerage_transactions SET symbol='ACME  260918P00037000',underlying_symbol='ACME',option_kind='PUT',option_expiration='2026-09-18',strike_price=37,contract_multiplier=100 WHERE id=ANY($1)")
        .bind(vec![format!("{workspace}:option-buy"),format!("{workspace}:option-sell")]).execute(&pool).await.unwrap();
    let stock = format!("{workspace}:stock");
    let option = format!("{workspace}:option");
    for (id, names, multiplier) in [
        (&stock, ["stock-buy", "stock-sell"], 1.0),
        (&option, ["option-buy", "option-sell"], 100.0),
    ] {
        sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,contract_multiplier,notes) VALUES ($1,$2,$3,'ACME','Acme','long','2026-09-01T14:00:00Z','2026-09-02T15:00:00Z',10,10,1,$4,'Keep my trade')")
            .bind(id).bind(&user).bind(&workspace).bind(multiplier).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO journal_brokerage_links(id,journal_entry_id,brokerage_transaction_id,user_id) SELECT uuidv7()::text,$1,id,$2 FROM brokerage_transactions WHERE workspace_id=$3 AND id=ANY($4)")
            .bind(id).bind(&user).bind(&workspace).bind(names.map(|name|format!("{workspace}:{name}"))).execute(&pool).await.unwrap();
    }
    sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();
    let original_stock = trades.iter().find(|trade| trade.id == stock).unwrap();
    assert_eq!(original_stock.source_kind, "manual");
    assert_eq!(original_stock.lifecycle_state, "closed");
    assert_eq!(original_stock.issue_code, None);
    assert_eq!(
        trades
            .iter()
            .find(|trade| trade.id == option)
            .unwrap()
            .source_kind,
        "broker"
    );
    sqlx::query("UPDATE journal_entries SET close_date=close_date+interval '1 minute' WHERE id=$1")
        .bind(&stock)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        journal_flow::get_trade(&pool, &user, &workspace, &stock)
            .await
            .unwrap()
            .unwrap()
            .lifecycle_state,
        "closed"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn split_preview_is_read_only_and_confirmation_preserves_the_holding() {
    use journal_flow::grouping::{self, AllocationInput, GroupInput, GroupingInput};
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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

#[tokio::test(flavor = "multi_thread")]
async fn only_risk_and_strategy_changes_outdate_a_review() {
    use journal_flow::reflection;

    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    let amounts = |price| FillAmounts {
        quantity: 10.0,
        price,
        fee: 0.0,
    };
    fill(
        &pool,
        &user,
        &workspace,
        "buy",
        "BUY",
        amounts(100.0),
        "2026-09-01T14:00:00Z",
    )
    .await;
    fill(
        &pool,
        &user,
        &workspace,
        "sell",
        "SELL",
        amounts(105.0),
        "2026-09-01T15:00:00Z",
    )
    .await;
    project(&pool, &user, &workspace).await;
    let trade = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()
        .remove(0);
    assert_eq!(trade.lifecycle_state, "closed");

    let context = |expected_version, stop: &str, notes: &str| reflection::ContextInput {
        entry_id: trade.id.clone(),
        expected_version,
        stop_state: "price".into(),
        stop_price: Some(stop.into()),
        playbook_id: None,
        claimed_at: None,
        notes: Some(notes.into()),
        tag_ids: None,
        violated_principle_ids: None,
    };
    let saved = reflection::save_context(
        &pool,
        &user,
        &workspace,
        context(0, "98", "First thoughts"),
        "test",
        "stop",
    )
    .await
    .unwrap();
    let draft = reflection::save_draft(
        &pool,
        &user,
        &workspace,
        reflection::DraftInput {
            entry_id: trade.id.clone(),
            expected_version: 0,
            takeaway: "Waited for the pullback".into(),
            choice_ids: vec![],
            plan_adherence: Some("yes".into()),
        },
        "test",
        "draft",
    )
    .await
    .unwrap();
    reflection::finalize(
        &pool,
        &user,
        &workspace,
        reflection::ReviewInput {
            entry_id: trade.id.clone(),
            expected_entry_revision: trade.materialized_revision,
            expected_context_version: saved.version,
            expected_draft_version: draft.version,
            session_id: None,
        },
        "test",
        "review",
    )
    .await
    .unwrap();
    let review_state = || async {
        journal_flow::get_trade(&pool, &user, &workspace, &trade.id)
            .await
            .unwrap()
            .unwrap()
            .review_state
    };
    assert_eq!(review_state().await, "reviewed");

    let noted = reflection::save_context(
        &pool,
        &user,
        &workspace,
        context(saved.version, "98", "Added later"),
        "test",
        "notes",
    )
    .await
    .unwrap();
    assert_eq!(noted.notes.as_deref(), Some("Added later"));
    assert_eq!(
        noted.version, saved.version,
        "notes alone must not change the context version"
    );
    assert_eq!(
        review_state().await,
        "reviewed",
        "adding notes must not outdate the review"
    );

    let moved = reflection::save_context(
        &pool,
        &user,
        &workspace,
        context(saved.version, "97", "Added later"),
        "test",
        "move-stop",
    )
    .await
    .unwrap();
    assert_eq!(moved.version, saved.version + 1);
    assert_eq!(
        review_state().await,
        "outdated",
        "a different stop changes what was reviewed"
    );

    let stale = reflection::save_context(
        &pool,
        &user,
        &workspace,
        context(saved.version, "97", "From another device"),
        "test",
        "stale",
    )
    .await;
    assert!(
        stale.is_err_and(|error| error.to_string().starts_with("CONFLICT")),
        "a save based on an old version is still refused"
    );
}

mod analytics {
    use super::*;
    use tradstry_backend::service::db::Db;
    use tradstry_backend::service::read_service::analytics::{
        AnalyticsTimeFilter, get_advanced_analytics, get_journal_analytics,
    };

    /// Two closed ACME trades: +50 on 2026-09-01 and -20 on 2026-09-02, both
    /// closing at 16:00 UTC.
    async fn two_closed_trades(pool: &PgPool) -> (String, String, Vec<journal_flow::JournalTrade>) {
        let (user, workspace) = enabled_workspace(pool).await;
        let fills = [
            ("buy-a", "BUY", 100.0, "2026-09-01T14:00:00Z"),
            ("sell-a", "SELL", 105.0, "2026-09-01T16:00:00Z"),
            ("buy-b", "BUY", 100.0, "2026-09-02T14:00:00Z"),
            ("sell-b", "SELL", 98.0, "2026-09-02T16:00:00Z"),
        ];
        for (name, side, price, at) in fills {
            let amounts = FillAmounts {
                quantity: 10.0,
                price,
                fee: 0.0,
            };
            fill(pool, &user, &workspace, name, side, amounts, at).await;
        }
        project(pool, &user, &workspace).await;
        let mut trades = journal_flow::list_trades(pool, &user, &workspace)
            .await
            .unwrap();
        trades.sort_by(|a, b| a.open_date.cmp(&b.open_date));
        assert_eq!(trades.len(), 2);
        (user, workspace, trades)
    }

    /// Record context saves directly, so each can carry the phase a test needs.
    async fn stop_saved(
        pool: &PgPool,
        user: &str,
        workspace: &str,
        entry: &str,
        stop: &str,
        phase: &str,
        at: &str,
    ) {
        sqlx::query("INSERT INTO journal_trade_context(entry_id,user_id,workspace_id,stop_state,stop_price) VALUES ($1,$2,$3,'price',$4::numeric)
                     ON CONFLICT(entry_id) DO UPDATE SET stop_state='price',stop_price=$4::numeric,updated_at=now()")
            .bind(entry).bind(user).bind(workspace).bind(stop)
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO journal_trade_context_events(id,entry_id,user_id,workspace_id,record_version,kind,phase,payload_json,recorded_at)
                     VALUES ($1,$2,$3,$4,1,'risk_strategy',$5,$6,$7::timestamptz)")
            .bind(tradstry_backend::ids::new_uuid_v7().to_string()).bind(entry).bind(user).bind(workspace).bind(phase)
            .bind(serde_json::json!({"stop_state": "price", "stop_price": stop})).bind(at)
            .execute(pool).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn analytics_use_journal_money_stops_and_time_zone() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace, trades) = two_closed_trades(&pool).await;
        stop_saved(
            &pool,
            &user,
            &workspace,
            &trades[0].id,
            "95",
            "pre_entry",
            "2026-09-01T13:00:00Z",
        )
        .await;
        stop_saved(
            &pool,
            &user,
            &workspace,
            &trades[1].id,
            "99",
            "retrospective",
            "2026-09-03T13:00:00Z",
        )
        .await;
        sqlx::query("UPDATE workspaces SET journal_timezone='Asia/Tokyo' WHERE id=$1")
            .bind(&workspace)
            .execute(&pool)
            .await
            .unwrap();

        let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
        let advanced = get_advanced_analytics(
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

        let realized: f64 = trades
            .iter()
            .map(|t| t.realized_net.as_deref().unwrap().parse::<f64>().unwrap())
            .sum();
        assert!(
            (advanced.net_profit - realized).abs() < 1e-9,
            "{} vs {realized}",
            advanced.net_profit
        );
        assert!((journal.cumulative_profit - realized).abs() < 1e-9);
        assert!((advanced.net_profit - 30.0).abs() < 1e-9);

        // Only the stop recorded before entry counts: risk 5 x 10 = 50 against +50.
        assert_eq!(advanced.r_trade_count, 1);
        assert!((advanced.expectancy_r.unwrap() - 1.0).abs() < 1e-9);

        // 16:00 UTC is 01:00 the next day in Tokyo.
        let days: Vec<&str> = advanced.by_day.iter().map(|d| d.key.as_str()).collect();
        assert_eq!(days, ["2026-09-02", "2026-09-03"]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn wins_and_losses_are_decided_by_money_not_the_percent() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace, trades) = two_closed_trades(&pool).await;
        // The winner's percent stays positive while its money turns negative, as
        // a later fee correction would leave it. Only the journal owner may
        // change broker results, so act as it.
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("SELECT set_config('tradstry.journal_writer','on',true)")
            .execute(&mut *tx)
            .await
            .unwrap();
        sqlx::query("UPDATE journal_entries SET realized_net=-5 WHERE id=$1")
            .bind(&trades[0].id)
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();

        let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
        let journal = get_journal_analytics(&user_db, &workspace, &AnalyticsTimeFilter::All)
            .await
            .unwrap();
        let advanced = get_advanced_analytics(
            &user_db,
            &workspace,
            &AnalyticsTimeFilter::All,
            &Default::default(),
        )
        .await
        .unwrap();
        assert_eq!(journal.win_rate, 0.0, "both trades lost money");
        assert_eq!(advanced.win_rate, 0.0, "both trades lost money");
        assert!((advanced.net_profit + 25.0).abs() < 1e-9);
    }

    /// R from analytics and from the dashboard, which must always agree.
    async fn r_on_both_screens(pool: &PgPool, user: &str, workspace: &str) -> (usize, Option<f64>) {
        let user_db = Db::from_pool(pool.clone()).get_user_db(user);
        let analytics = get_advanced_analytics(
            &user_db,
            workspace,
            &AnalyticsTimeFilter::All,
            &Default::default(),
        )
        .await
        .unwrap();
        let dashboard = tradstry_backend::service::trading_performance::load_trading_performance(
            pool, user, workspace, None, None,
        )
        .await
        .unwrap();
        let round = |r: Option<f64>| r.map(|r| (r * 1000.0).round() / 1000.0);
        assert_eq!(
            (analytics.r_trade_count, round(analytics.expectancy_r)),
            (
                dashboard.risk_defined_trade_count,
                round(dashboard.average_realized_r)
            ),
            "analytics and the dashboard disagree on R"
        );
        (analytics.r_trade_count, round(analytics.expectancy_r))
    }

    async fn plan_saved(
        pool: &PgPool,
        user: &str,
        workspace: &str,
        episode: &str,
        stop: f64,
        at: &str,
    ) {
        let plan = format!("plan-{episode}-{stop}");
        sqlx::query("INSERT INTO position_calculator_plans(id,user_id,workspace_id,symbol,position_type,entry_price,stop_loss,account_balance,account_risk,total_shares,position_value,updated_at)
                     VALUES ($1,$2,$3,'ACME','long',100,$4,10000,1,10,1000,$5::timestamptz)")
            .bind(&plan).bind(user).bind(workspace).bind(stop).bind(at)
            .execute(pool).await.unwrap();
        sqlx::query("INSERT INTO trade_episode_matches(id,user_id,workspace_id,episode_id,plan_id,score,status,evidence_json) VALUES ($1,$2,$3,$4,$5,1,'confirmed','{}')")
            .bind(format!("match-{plan}")).bind(user).bind(workspace).bind(episode).bind(&plan)
            .execute(pool).await.unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn r_uses_the_stop_in_force_when_the_trade_opened() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace, trades) = two_closed_trades(&pool).await;
        let (winner, loser) = (&trades[0].id, &trades[1].id);

        // The winner (+50 on 10 shares from 100): 95 set before entry, trailed to
        // 98 while open, moved to 97 after the close. Its risk was 5 a share.
        for (stop, phase, at) in [
            ("95", "pre_entry", "2026-09-01T13:00:00Z"),
            ("98", "during_trade", "2026-09-01T15:00:00Z"),
            ("97", "retrospective", "2026-09-05T13:00:00Z"),
        ] {
            stop_saved(&pool, &user, &workspace, winner, stop, phase, at).await;
        }
        assert_eq!(
            r_on_both_screens(&pool, &user, &workspace).await,
            (1, Some(1.0))
        );

        // The loser (-20) had no stop at entry; the first one set while open counts.
        for (stop, at) in [
            ("99", "2026-09-02T15:00:00Z"),
            ("99.5", "2026-09-02T15:30:00Z"),
        ] {
            stop_saved(&pool, &user, &workspace, loser, stop, "during_trade", at).await;
        }
        assert_eq!(
            r_on_both_screens(&pool, &user, &workspace).await,
            (2, Some(-0.5))
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_calculator_plan_counts_by_when_it_was_saved() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace, trades) = two_closed_trades(&pool).await;
        let episode = |i: usize| trades[i].episode_id.clone().unwrap();

        // A plan saved after the close is hindsight.
        plan_saved(
            &pool,
            &user,
            &workspace,
            &episode(1),
            99.0,
            "2026-09-03T12:00:00Z",
        )
        .await;
        assert_eq!(r_on_both_screens(&pool, &user, &workspace).await, (0, None));

        // A plan before entry counts, on the dashboard and in analytics alike.
        plan_saved(
            &pool,
            &user,
            &workspace,
            &episode(0),
            97.0,
            "2026-09-01T12:00:00Z",
        )
        .await;
        assert_eq!(
            r_on_both_screens(&pool, &user, &workspace).await,
            (1, Some(1.667))
        );

        // A journal stop changed later, still before entry, is the one in force.
        stop_saved(
            &pool,
            &user,
            &workspace,
            &trades[0].id,
            "95",
            "pre_entry",
            "2026-09-01T13:00:00Z",
        )
        .await;
        assert_eq!(
            r_on_both_screens(&pool, &user, &workspace).await,
            (1, Some(1.0))
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_analytics_cache_sees_every_input_change() {
        use tradstry_backend::service::redis::analytics::workspace_version;

        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace, trades) = two_closed_trades(&pool).await;
        let user_db = Db::from_pool(pool.clone()).get_user_db(&user);
        let entry = &trades[0].id;
        let new_id = || tradstry_backend::ids::new_uuid_v7().to_string();
        let mut seen = vec![workspace_version(&user_db, &workspace).await.unwrap()];
        let mut changed = |label: &str, version: String| {
            assert!(
                !seen.contains(&version),
                "{label} did not change the cache version"
            );
            seen.push(version);
        };

        let (category, tag) = (new_id(), new_id());
        sqlx::query("INSERT INTO tag_categories(id,user_id,workspace_id,name,created_at,updated_at) VALUES ($1,$2,$3,'Mistakes',now(),now())")
            .bind(&category).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO tags(id,user_id,workspace_id,category_id,name,created_at,updated_at) VALUES ($1,$2,$3,$4,'FOMO',now(),now())")
            .bind(&tag).bind(&user).bind(&workspace).bind(&category).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO trade_tags(journal_entry_id,tag_id) VALUES ($1,$2)")
            .bind(entry)
            .bind(&tag)
            .execute(&pool)
            .await
            .unwrap();
        changed(
            "tagging a trade",
            workspace_version(&user_db, &workspace).await.unwrap(),
        );

        let principle = new_id();
        sqlx::query("INSERT INTO trading_principles(id,user_id,workspace_id,title,the_rule,why) VALUES ($1,$2,$3,'Wait','Wait for confirmation','Chasing loses')")
            .bind(&principle).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO trade_principle_violations(journal_entry_id,principle_id) VALUES ($1,$2)",
        )
        .bind(entry)
        .bind(&principle)
        .execute(&pool)
        .await
        .unwrap();
        changed(
            "flagging a broken principle",
            workspace_version(&user_db, &workspace).await.unwrap(),
        );

        stop_saved(
            &pool,
            &user,
            &workspace,
            entry,
            "95",
            "pre_entry",
            "2026-09-01T13:00:00Z",
        )
        .await;
        changed(
            "recording a stop",
            workspace_version(&user_db, &workspace).await.unwrap(),
        );

        sqlx::query("UPDATE workspaces SET journal_timezone='Asia/Tokyo' WHERE id=$1")
            .bind(&workspace)
            .execute(&pool)
            .await
            .unwrap();
        changed(
            "changing the journal time zone",
            workspace_version(&user_db, &workspace).await.unwrap(),
        );

        sqlx::query("DELETE FROM trade_tags WHERE journal_entry_id=$1")
            .bind(entry)
            .execute(&pool)
            .await
            .unwrap();
        changed(
            "removing a tag",
            workspace_version(&user_db, &workspace).await.unwrap(),
        );
    }
}

mod duplicates {
    use super::*;
    use journal_flow::duplicates;
    use journal_flow::grouping::{self, AllocationInput, GroupInput, GroupingInput};
    use tradstry_backend::service::db::Db;
    use tradstry_backend::service::db::schema::tables::journal_table::{
        self, CreateJournalEntryInput, UpdateJournalEntryInput,
    };
    use tradstry_backend::service::read_service::analytics::{
        AnalyticsTimeFilter, get_advanced_analytics,
    };

    /// ACME bought at 100 and sold at 105 on 2026-09-01: +50 in either source.
    const OPEN: &str = "2026-09-01T14:00:00Z";
    const CLOSE: &str = "2026-09-01T16:00:00Z";

    async fn broker_acme(pool: &PgPool, user: &str, workspace: &str) -> String {
        for (name, side, price, at) in [
            ("buy-a", "BUY", 100.0, OPEN),
            ("sell-a", "SELL", 105.0, CLOSE),
        ] {
            let amounts = FillAmounts {
                quantity: 10.0,
                price,
                fee: 0.0,
            };
            fill(pool, user, workspace, name, side, amounts, at).await;
        }
        project(pool, user, workspace).await;
        sqlx::query_scalar("SELECT id FROM journal_entries WHERE workspace_id=$1 AND source_kind='broker' AND lifecycle_state='closed' AND retired_at IS NULL")
            .bind(workspace)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn manual_acme(
        pool: &PgPool,
        user: &str,
        workspace: &str,
    ) -> journal_table::JournalEntry {
        let input = CreateJournalEntryInput {
            id: None,
            fees: None,
            workspace_id: workspace.to_string(),
            open_date: OPEN.to_string(),
            close_date: CLOSE.to_string(),
            entry_price: 100.0,
            exit_price: 105.0,
            position_size: 10.0,
            symbol: "acme".to_string(),
            symbol_name: Some("Acme".to_string()),
            stop_loss: 95.0,
            trade_type: "long".to_string(),
            playbook_id: None,
            notes: Some("My notes on the ACME breakout".to_string()),
            broke_30min_rule: None,
            pre_trade_conviction: None,
            market_regime: None,
            is_planned_pre_market: None,
            revenge_trade: None,
            rule_adherence_score: None,
            contract_multiplier: None,
            brokerage_transaction_ids: None,
            tag_ids: Vec::new(),
            violated_principle_ids: Vec::new(),
        };
        journal_table::create_journal_entry(pool, user, input)
            .await
            .unwrap()
    }

    async fn counted(pool: &PgPool, user: &str, workspace: &str) -> (usize, f64) {
        let user_db = Db::from_pool(pool.clone()).get_user_db(user);
        let a = get_advanced_analytics(
            &user_db,
            workspace,
            &AnalyticsTimeFilter::All,
            &Default::default(),
        )
        .await
        .unwrap();
        (a.trade_count as usize, a.net_profit)
    }

    async fn trade(
        pool: &PgPool,
        user: &str,
        workspace: &str,
        id: &str,
    ) -> journal_flow::JournalTrade {
        journal_flow::get_trade(pool, user, workspace, id)
            .await
            .unwrap()
            .unwrap()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_manual_copy_of_a_broker_trade_waits_instead_of_counting_twice() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        let broker = broker_acme(&pool, &user, &workspace).await;

        let manual = manual_acme(&pool, &user, &workspace).await;

        assert_eq!(manual.possible_duplicates, vec![broker.clone()]);
        assert_eq!(counted(&pool, &user, &workspace).await, (1, 50.0));
        let held = trade(&pool, &user, &workspace, &manual.id).await;
        assert_eq!(held.lifecycle_state, "incomplete");
        assert_eq!(held.issue_code.as_deref(), Some("possible_duplicate"));
        assert_eq!(held.possible_duplicates, vec![broker]);

        project(&pool, &user, &workspace).await;
        assert_eq!(
            counted(&pool, &user, &workspace).await,
            (1, 50.0),
            "a sync must not release the hold"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_trade_kept_separate_counts_and_is_not_flagged_again() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        broker_acme(&pool, &user, &workspace).await;
        let manual = manual_acme(&pool, &user, &workspace).await;
        let version = trade(&pool, &user, &workspace, &manual.id)
            .await
            .record_version;

        let stale = duplicates::keep_separate(
            &pool,
            &user,
            &workspace,
            &manual.id,
            version - 1,
            "test",
            "stale",
        )
        .await;
        assert!(stale.unwrap_err().to_string().starts_with("CONFLICT"));

        let kept = duplicates::keep_separate(
            &pool, &user, &workspace, &manual.id, version, "test", "keep",
        )
        .await
        .unwrap();
        assert_eq!(kept.lifecycle_state, "closed");
        assert!(kept.possible_duplicates.is_empty());
        let replayed = duplicates::keep_separate(
            &pool, &user, &workspace, &manual.id, version, "test", "keep",
        )
        .await
        .unwrap();
        assert_eq!(
            replayed.record_version, kept.record_version,
            "a retried call changes nothing"
        );
        assert_eq!(counted(&pool, &user, &workspace).await, (2, 100.0));

        project(&pool, &user, &workspace).await;
        let notes = UpdateJournalEntryInput {
            notes: Some("edited".into()),
            ..Default::default()
        };
        journal_table::update_journal_entry(&pool, &manual.id, &user, notes)
            .await
            .unwrap();
        assert_eq!(counted(&pool, &user, &workspace).await, (2, 100.0));
        assert!(
            duplicates::keep_separate(
                &pool,
                &user,
                &workspace,
                &manual.id,
                kept.record_version + 1,
                "test",
                "again"
            )
            .await
            .is_err(),
            "a trade that is not held has nothing to keep separate"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn merging_a_held_trade_keeps_one_trade_with_the_users_notes() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        let broker = broker_acme(&pool, &user, &workspace).await;
        let manual = manual_acme(&pool, &user, &workspace).await;

        let allocation = |name: &str| AllocationInput {
            transaction_id: format!("{workspace}:{name}"),
            quantity: "10".into(),
        };
        let preview = grouping::preview(
            &pool,
            &user,
            &workspace,
            GroupingInput {
                direction: Some("long".into()),
                entry_ids: vec![broker.clone(), manual.id.clone()],
                groups: vec![GroupInput {
                    entry_id: Some(manual.id.clone()),
                    allocations: vec![allocation("buy-a"), allocation("sell-a")],
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
            "test",
            "same-trade",
        )
        .await
        .unwrap();

        let merged = trade(&pool, &user, &workspace, &manual.id).await;
        assert_eq!(
            (merged.source_kind.as_str(), merged.lifecycle_state.as_str()),
            ("broker", "closed")
        );
        assert_eq!(merged.realized_net.as_deref(), Some("50"));
        let notes: String = sqlx::query_scalar("SELECT notes FROM journal_entries WHERE id=$1")
            .bind(&manual.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(notes, "My notes on the ACME breakout");
        assert_eq!(counted(&pool, &user, &workspace).await, (1, 50.0));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn editing_a_manual_trade_into_or_out_of_an_overlap_holds_or_releases_it() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        broker_acme(&pool, &user, &workspace).await;
        let manual = manual_acme(&pool, &user, &workspace).await;

        let elsewhere = UpdateJournalEntryInput {
            open_date: Some("2026-09-08T14:00:00Z".into()),
            close_date: Some("2026-09-08T16:00:00Z".into()),
            ..Default::default()
        };
        let moved = journal_table::update_journal_entry(&pool, &manual.id, &user, elsewhere)
            .await
            .unwrap();
        assert!(moved.possible_duplicates.is_empty());
        assert_eq!(counted(&pool, &user, &workspace).await, (2, 100.0));

        let back = UpdateJournalEntryInput {
            open_date: Some(OPEN.into()),
            close_date: Some(CLOSE.into()),
            ..Default::default()
        };
        let held = journal_table::update_journal_entry(&pool, &manual.id, &user, back)
            .await
            .unwrap();
        assert_eq!(held.possible_duplicates.len(), 1);
        assert_eq!(counted(&pool, &user, &workspace).await, (1, 50.0));

        assert!(
            journal_table::delete_journal_entry(&pool, &manual.id, &user)
                .await
                .unwrap(),
            "a held trade can still be deleted"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn existing_duplicates_are_flagged_without_changing_money() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        broker_acme(&pool, &user, &workspace).await;
        // A duplicate saved before the hold existed.
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("SELECT set_config('tradstry.journal_writer','on',true)")
            .execute(&mut *tx)
            .await
            .unwrap();
        sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,total_pl,net_roi,duration,status) VALUES('old-copy',$1,$2,'ACME','Acme','long',$3::timestamptz,$4::timestamptz,100,105,10,5,5,7200,'profit')")
            .bind(&user).bind(&workspace).bind(OPEN).bind(CLOSE)
            .execute(&mut *tx).await.unwrap();
        tx.commit().await.unwrap();
        assert_eq!(counted(&pool, &user, &workspace).await, (2, 100.0));
        let money_before: Decimal =
            sqlx::query_scalar("SELECT realized_net FROM journal_entries WHERE id='old-copy'")
                .fetch_one(&pool)
                .await
                .unwrap();

        let flagged: i32 = sqlx::query_scalar("SELECT journal_refresh_manual_holds($1,$2)")
            .bind(&user)
            .bind(&workspace)
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(flagged, 1);
        assert_eq!(counted(&pool, &user, &workspace).await, (1, 50.0));
        let money_after: Decimal =
            sqlx::query_scalar("SELECT realized_net FROM journal_entries WHERE id='old-copy'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(money_before, money_after);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn whichever_copy_arrives_second_waits() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        let manual = manual_acme(&pool, &user, &workspace).await;
        assert!(manual.possible_duplicates.is_empty());
        for (name, side, price, at) in [
            ("buy-a", "BUY", 100.0, OPEN),
            ("sell-a", "SELL", 105.0, CLOSE),
        ] {
            fill(
                &pool,
                &user,
                &workspace,
                name,
                side,
                FillAmounts {
                    quantity: 10.0,
                    price,
                    fee: 0.0,
                },
                at,
            )
            .await;
        }
        project(&pool, &user, &workspace).await;

        assert_eq!(counted(&pool, &user, &workspace).await, (1, 50.0));
        assert_eq!(
            trade(&pool, &user, &workspace, &manual.id)
                .await
                .lifecycle_state,
            "closed"
        );
        let waiting: Vec<(String, String)> = sqlx::query_as("SELECT source_kind,lifecycle_state FROM journal_entries WHERE workspace_id=$1 AND id<>$2 AND retired_at IS NULL")
            .bind(&workspace).bind(&manual.id).fetch_all(&pool).await.unwrap();
        assert_eq!(
            waiting,
            vec![("broker".to_string(), "incomplete".to_string())]
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_sync_that_removes_the_broker_trade_releases_the_hold() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = enabled_workspace(&pool).await;
        broker_acme(&pool, &user, &workspace).await;
        let manual = manual_acme(&pool, &user, &workspace).await;
        assert_eq!(manual.possible_duplicates.len(), 1);

        sqlx::query("DELETE FROM brokerage_transactions WHERE workspace_id=$1")
            .bind(&workspace)
            .execute(&pool)
            .await
            .unwrap();
        project(&pool, &user, &workspace).await;

        assert_eq!(
            trade(&pool, &user, &workspace, &manual.id)
                .await
                .lifecycle_state,
            "closed"
        );
        assert_eq!(counted(&pool, &user, &workspace).await, (1, 50.0));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn manual_trades_are_not_held_while_the_journal_is_off() {
        let test_db = crate::pg_support::TestDb::new().await;
        let pool = test_db.pool();
        let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
        let manual = manual_acme(&pool, &user, &workspace).await;
        assert!(manual.possible_duplicates.is_empty());
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn trades_report_their_executions_even_when_incomplete() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    for (name, side, quantity, at) in [
        ("buy", "BUY", 100.0, "2026-09-01T14:00:00Z"),
        ("sell", "SELL", 100.0, "2026-09-03T15:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity,
                price: 10.0,
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    for (name, quantity, at) in [
        ("odd1", 2.0, "2026-09-05T14:00:00Z"),
        ("odd2", 3.0, "2026-09-07T14:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            "BUY",
            FillAmounts {
                quantity,
                price: 1.0,
                fee: 0.0,
            },
            at,
        )
        .await;
        sqlx::query(
            "UPDATE brokerage_transactions SET symbol='STRIKE',strike_price=37 WHERE id=$1",
        )
        .bind(format!("{workspace}:{name}"))
        .execute(&pool)
        .await
        .unwrap();
    }
    project(&pool, &user, &workspace).await;
    let trades = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap();

    let closed = trades.iter().find(|t| t.symbol == "ACME").unwrap();
    assert_eq!(closed.lifecycle_state, "closed");
    assert_eq!(closed.execution_count, 2);
    assert_eq!(
        closed.first_execution_at.as_deref(),
        closed.open_date.as_deref()
    );
    assert_eq!(
        closed.last_execution_at.as_deref(),
        closed.close_date.as_deref()
    );

    let incomplete = trades.iter().find(|t| t.symbol == "STRIKE").unwrap();
    assert_eq!(incomplete.lifecycle_state, "incomplete");
    assert!(incomplete.open_date.is_none());
    assert_eq!(incomplete.execution_count, 2);
    assert_eq!(
        incomplete.first_execution_at.as_deref(),
        Some("2026-09-05T14:00:00+00:00")
    );
    assert_eq!(
        incomplete.last_execution_at.as_deref(),
        Some("2026-09-07T14:00:00+00:00")
    );
    assert_eq!(incomplete.bought_quantity.as_deref(), Some("5"));
    assert_eq!(incomplete.sold_quantity, None);
}

#[tokio::test(flavor = "multi_thread")]
async fn preparation_counts_earlier_entries_that_hold_back_new_trades() {
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = enabled_workspace(&pool).await;
    sqlx::query("UPDATE journal_workspace_state SET enabled=false WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    for (name, side, at) in [
        ("buy", "BUY", "2026-09-01T14:00:00Z"),
        ("sell", "SELL", "2026-09-01T15:00:00Z"),
    ] {
        fill(
            &pool,
            &user,
            &workspace,
            name,
            side,
            FillAmounts {
                quantity: 10.0,
                price: 10.0,
                fee: 0.0,
            },
            at,
        )
        .await;
    }
    let flat = Some("2026-09-01T00:00:00Z");
    let before = journal_flow::backfill::prepare(&pool, &user, &workspace, flat)
        .await
        .unwrap();
    assert_eq!((before.ready_trades, before.attention_groups), (1, 0));
    assert_eq!(before.existing_entries, 0);

    for (suffix, symbol, day) in [
        ("same", "ACME", "2026-09-01"),
        ("other", "OTHER", "2026-09-01"),
        ("later", "ACME", "2026-09-20"),
    ] {
        sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,status,total_pl,net_roi,duration)
            VALUES ($1,$2,$3,$4,$4,'long',$5::text::timestamptz,$5::text::timestamptz,1,2,1,'profit',1,1,1)")
            .bind(format!("{workspace}:{suffix}")).bind(&user).bind(&workspace).bind(symbol).bind(day)
            .execute(&pool).await.unwrap();
    }
    let after = journal_flow::backfill::prepare(&pool, &user, &workspace, flat)
        .await
        .unwrap();
    assert_eq!(after.existing_entries, 3);
    assert_eq!(after.overlapping_entries, 1);
    assert_eq!(after.held_by_earlier_entries, 1);
    assert_eq!((after.ready_trades, after.attention_groups), (0, 1));
}

#[tokio::test(flavor = "multi_thread")]
async fn an_oversized_exit_names_the_execution_and_the_shortfall() {
    use journal_flow::grouping::{
        self, AllocationInput, ExitExceedsPosition, GroupInput, GroupingInput,
    };
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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
            quantity: 30.0,
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
    let allocation = |name: &str, quantity: &str| AllocationInput {
        transaction_id: format!("{workspace}:{name}"),
        quantity: quantity.into(),
    };
    let error = grouping::preview(
        &pool,
        &user,
        &workspace,
        GroupingInput {
            direction: Some("long".into()),
            entry_ids: vec![original.id.clone()],
            groups: vec![GroupInput {
                entry_id: Some(original.id.clone()),
                allocations: vec![allocation("buy", "10"), allocation("sell", "30")],
            }],
        },
    )
    .await
    .unwrap_err();
    let exit = error.downcast_ref::<ExitExceedsPosition>().unwrap();
    assert_eq!(exit.transaction_id, format!("{workspace}:sell"));
    assert_eq!(exit.position_before, Decimal::from(10));
    assert_eq!(exit.exit_quantity, Decimal::from(30));
    assert_eq!(exit.short_by, Decimal::from(20));
}

#[tokio::test(flavor = "multi_thread")]
async fn executions_name_the_other_trade_holding_their_quantity() {
    use journal_flow::grouping::{self, AllocationInput, GroupInput, GroupingInput};
    let test_db = crate::pg_support::TestDb::new().await;
    let pool = test_db.pool();
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
    project(&pool, &user, &workspace).await;
    let id = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()
        .remove(0)
        .id;
    let hold = format!("{workspace}:hold");
    let allocation = |quantity: &str| AllocationInput {
        transaction_id: hold.clone(),
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
                    allocations: vec![allocation("60")],
                },
                GroupInput {
                    entry_id: None,
                    allocations: vec![allocation("40")],
                },
            ],
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
        "split-hold",
    )
    .await
    .unwrap();
    let child = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()
        .into_iter()
        .find(|trade| trade.id != id)
        .unwrap();
    let mut holders = journal_flow::execution_holders(
        &pool,
        &user,
        &workspace,
        &id,
        std::slice::from_ref(&hold),
        &[],
    )
    .await
    .unwrap();
    let holders = holders.remove(&hold).unwrap();
    assert_eq!(holders.len(), 1);
    assert_eq!(holders[0].entry_id.as_deref(), Some(child.id.as_str()));
    assert_eq!(holders[0].quantity, "40");
    assert!(!holders[0].blocked);
    assert_eq!(holders[0].direction, "long");
}

#[tokio::test(flavor = "multi_thread")]
async fn resolving_history_takes_over_fills_from_blocked_records_without_an_entry() {
    use journal_flow::grouping::{self, AllocationInput, GroupInput, GroupingInput};
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
            quantity: 4.0,
            price: 11.0,
            fee: 0.0,
        },
        "2026-09-01T15:00:00Z",
    )
    .await;
    trade_review_table::rebuild_workspace(&pool, &user, &workspace)
        .await
        .unwrap();
    let legacy: String = sqlx::query_scalar("SELECT id FROM trade_episodes WHERE workspace_id=$1")
        .bind(&workspace)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE journal_workspace_state SET enabled=true WHERE workspace_id=$1")
        .bind(&workspace)
        .execute(&pool)
        .await
        .unwrap();
    project(&pool, &user, &workspace).await;
    let legacy_state = || async {
        sqlx::query_as::<_, (String, bool)>(
            "SELECT status,retired_at IS NOT NULL FROM trade_episodes WHERE id=$1",
        )
        .bind(&legacy)
        .fetch_one(&pool)
        .await
        .unwrap()
    };
    assert_eq!(legacy_state().await, ("blocked".into(), false));
    let original = journal_flow::list_trades(&pool, &user, &workspace)
        .await
        .unwrap()
        .remove(0);
    assert_eq!(original.lifecycle_state, "incomplete");
    assert!(original.episode_id.is_none());
    assert_eq!(
        journal_flow::releasable_episodes(&pool, &user, &workspace, &original.id)
            .await
            .unwrap(),
        vec![legacy.clone()]
    );

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
            entry_ids: vec![original.id.clone()],
            groups: vec![GroupInput {
                entry_id: Some(original.id.clone()),
                allocations: vec![allocation("buy", "10"), allocation("sell", "4")],
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(preview.realized_net, vec![Some("4".into())]);
    let confirmed = grouping::confirm(
        &pool,
        &user,
        &workspace,
        &preview.token,
        "browser",
        "resolve-blocked",
    )
    .await
    .unwrap();
    let resolved = journal_flow::get_trade(&pool, &user, &workspace, &original.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(resolved.lifecycle_state, "open");
    assert_eq!(resolved.realized_net.as_deref(), Some("4"));
    assert_eq!(legacy_state().await, ("blocked".into(), true));

    let undo = grouping::preview_undo(&pool, &user, &workspace, &confirmed.operation_id)
        .await
        .unwrap();
    grouping::confirm(
        &pool,
        &user,
        &workspace,
        &undo.token,
        "browser",
        "undo-resolve-blocked",
    )
    .await
    .unwrap();
    let restored = journal_flow::get_trade(&pool, &user, &workspace, &original.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(restored.lifecycle_state, "incomplete");
    assert_eq!(legacy_state().await, ("blocked".into(), false));
}
