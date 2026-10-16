use crate::pg_support::TestDb;
use sqlx::PgPool;
use tradstry_backend::service::db::schema::tables::journal_table as jt;

#[tokio::test]
async fn manual_trade_duplicates_are_rejected_without_losing_the_original() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let mut conn = pool.acquire().await.unwrap();
    let original = args("original", &workspace, 105.0, vec![]);
    jt::create_journal_entry_tx(&mut conn, &user, &original, "001:00001:test")
        .await
        .unwrap();
    let mut duplicate = args("duplicate", &workspace, 105.0, vec![]);
    duplicate.symbol = format!(" {} ", original.symbol.to_lowercase());
    let error = jt::create_journal_entry_tx(&mut conn, &user, &duplicate, "001:00002:test")
        .await
        .expect_err("a different ID must not duplicate the same manual trade");
    assert!(error.to_string().contains("already exists"), "{error:#}");
    let mut distinct = args("distinct", &workspace, 106.0, vec![]);
    jt::create_journal_entry_tx(&mut conn, &user, &distinct, "001:00003:test")
        .await
        .unwrap();
    distinct.exit_price = 105.0;
    assert!(
        jt::update_journal_entry_tx(&mut conn, &user, &distinct, "001:00004:test")
            .await
            .is_err()
    );
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM journal_entries WHERE workspace_id=$1 AND deleted_at IS NULL",
    )
    .bind(&workspace)
    .fetch_one(&mut *conn)
    .await
    .unwrap();
    assert_eq!(count, 2);
    jt::soft_delete_journal_entry_tx(&mut conn, &user, "original", "001:00005:test")
        .await
        .unwrap();
    jt::create_journal_entry_tx(&mut conn, &user, &duplicate, "001:00006:test")
        .await
        .unwrap();
}

#[tokio::test]
async fn concurrent_manual_submissions_count_the_trade_once() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user, workspace) = crate::pg_support::seed_user_workspace(&pool).await;
    let first = args("first-request", &workspace, 105.0, vec![]);
    let second = args("second-request", &workspace, 105.0, vec![]);
    let mut a = pool.acquire().await.unwrap();
    let mut b = pool.acquire().await.unwrap();
    let results = tokio::join!(
        jt::create_journal_entry_tx(&mut a, &user, &first, "001:00001:test"),
        jt::create_journal_entry_tx(&mut b, &user, &second, "001:00002:test")
    );
    assert_ne!(results.0.is_ok(), results.1.is_ok());
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM journal_entries WHERE workspace_id=$1 AND deleted_at IS NULL",
    )
    .bind(&workspace)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}

async fn seed_user(pool: &PgPool, id: &str) {
    sqlx::query("INSERT INTO users (id, stytch_user_id) VALUES ($1, $2)")
        .bind(id)
        .bind(format!("stytch_{id}"))
        .execute(pool)
        .await
        .expect("seed user");
}

async fn seed_account(pool: &PgPool, id: &str, user_id: &str) {
    sqlx::query("INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(user_id)
        .bind("acct")
        .execute(pool)
        .await
        .expect("seed account");
}

/// Inserts a tag_category + tag for `user_id`, returning the tag id. `tags`
/// FKs to `tag_categories`, so a bare tag insert would violate the constraint.
async fn seed_tag(pool: &PgPool, user_id: &str, workspace_id: &str) -> String {
    let category_id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query(
        "INSERT INTO tag_categories (id, user_id, workspace_id, name, created_at, updated_at) \
         VALUES ($1, $2, $3, 'Setup', now(), now())",
    )
    .bind(&category_id)
    .bind(user_id)
    .bind(workspace_id)
    .execute(pool)
    .await
    .expect("seed tag_category");

    let tag_id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query(
        "INSERT INTO tags (id, user_id, workspace_id, category_id, name, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, 'Breakout', now(), now())",
    )
    .bind(&tag_id)
    .bind(user_id)
    .bind(workspace_id)
    .bind(&category_id)
    .execute(pool)
    .await
    .expect("seed tag");

    tag_id
}

fn args(
    id: &str,
    workspace_id: &str,
    exit_price: f64,
    tag_ids: Vec<String>,
) -> jt::JournalWriteArgs {
    jt::JournalWriteArgs {
        fees: None,
        id: id.into(),
        workspace_id: workspace_id.into(),
        open_date: "2026-01-01T09:00:00Z".into(),
        close_date: "2026-01-01T11:00:00Z".into(),
        entry_price: 100.0,
        exit_price,
        position_size: 10.0,
        stop_loss: Some(95.0),
        symbol: "AAPL".into(),
        symbol_name: "Apple Inc.".into(),
        trade_type: "long".into(),
        playbook_id: None,
        notes: None,
        broke_30min_rule: None,
        pre_trade_conviction: None,
        market_regime: None,
        is_planned_pre_market: None,
        revenge_trade: None,
        rule_adherence_score: None,
        tag_ids,
        violated_principle_ids: Vec::new(),
        contract_multiplier: 1.0,
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn create_update_delete_flow_and_since() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    seed_user(&pool, "u1").await;
    seed_account(&pool, "acc1", "u1").await;
    let tag_id = seed_tag(&pool, "u1", "acc1").await;

    let mut c = pool.acquire().await.unwrap();
    jt::create_journal_entry_tx(
        &mut c,
        "u1",
        &args("je1", "acc1", 110.0, vec![tag_id.clone()]),
        "000000000000001:00000:client",
    )
    .await
    .unwrap();

    let deltas = jt::journal_entries_since(&pool, "u1", "acc1", None)
        .await
        .unwrap();
    assert_eq!(deltas.len(), 1);
    assert_eq!(deltas[0].symbol, "AAPL");
    assert_eq!(deltas[0].status, "profit");
    assert!(
        (deltas[0].total_pl - 10.0).abs() < 1e-9,
        "{}",
        deltas[0].total_pl
    );
    assert_eq!(deltas[0].tag_ids, vec![tag_id.clone()]);
    assert!(deltas[0].deleted_at.is_none());

    // Update: flip the trade into a loss and confirm derived metrics recompute.
    jt::update_journal_entry_tx(
        &mut c,
        "u1",
        &args("je1", "acc1", 90.0, vec![tag_id.clone()]),
        "000000000000002:00000:client",
    )
    .await
    .unwrap();
    let deltas = jt::journal_entries_since(&pool, "u1", "acc1", None)
        .await
        .unwrap();
    assert_eq!(deltas.len(), 1);
    assert_eq!(deltas[0].status, "loss");
    assert!(deltas[0].total_pl < 0.0);
    assert_eq!(deltas[0].tag_ids, vec![tag_id]);

    jt::soft_delete_journal_entry_tx(&mut c, "u1", "je1", "000000000000003:00000:client")
        .await
        .unwrap();
    let deltas = jt::journal_entries_since(&pool, "u1", "acc1", None)
        .await
        .unwrap();
    assert_eq!(deltas.len(), 1, "tombstone still appears in deltas");
    assert!(deltas[0].deleted_at.is_some());
}

#[tokio::test(flavor = "multi_thread")]
async fn create_journal_entry_mutation_applies_through_push() {
    use tradstry_backend::graphql::notebook::sync::{NotebookMutation, apply_mutation};

    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    seed_user(&pool, "u2").await;
    seed_account(&pool, "acc2", "u2").await;
    let journal_id = tradstry_backend::ids::new_uuid_v7().to_string();

    let m = NotebookMutation {
        id: 1,
        name: "createJournalEntry".into(),
        args: serde_json::json!({
            "id": journal_id,
            "workspaceId": "acc2",
            "openDate": "2026-01-01T09:00:00Z",
            "closeDate": "2026-01-01T11:00:00Z",
            "entryPrice": 100.0,
            "exitPrice": 110.0,
            "positionSize": 10.0,
            "stopLoss": 95.0,
            "symbol": "AAPL",
            "symbolName": "Apple Inc.",
            "tradeType": "long",
            "playbookId": null,
            "notes": null,
            "broke30minRule": null,
            "preTradeConviction": null,
            "marketRegime": null,
            "isPlannedPreMarket": null,
            "revengeTrade": null,
            "ruleAdherenceScore": null,
            "tagIds": [],
            "violatedPrincipleIds": [],
        })
        .to_string(),
        hlc: "000000000000009:00000:client".into(),
    };
    apply_mutation(&pool, "u2", "clientA", &m).await.unwrap();

    let deltas = jt::journal_entries_since(&pool, "u2", "acc2", None)
        .await
        .unwrap();
    assert_eq!(deltas.len(), 1);
    assert_eq!(deltas[0].symbol, "AAPL");
    assert_eq!(deltas[0].status, "profit");
    assert!((deltas[0].total_pl - 10.0).abs() < 1e-9);
    assert_eq!(deltas[0].hlc, "000000000000009:00000:client");
}
