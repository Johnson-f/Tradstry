//! Self-healing user provisioning and mistake search over mistake-role tags.

use tradstry_backend::service::auth::Subject;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::db::schema::tables::{journal_table, tags_table, users_table};
use tradstry_backend::service::read_service::journal::JournalFilter;
use tradstry_backend::service::read_service::users::ensure_user;

use crate::pg_support::{TestDb, seed_user_workspace};

#[tokio::test(flavor = "multi_thread")]
async fn a_user_left_unprovisioned_is_provisioned_on_the_next_request() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let db = Db::from_pool(pool.clone());
    let clerk_uuid = Subject::Clerk(tradstry_backend::ids::new_uuid_v7().to_string());

    // Simulates provisioning failing right after the user row was inserted.
    let (_, created) = users_table::find_or_create_user(db.connection(), &clerk_uuid, "", "")
        .await
        .unwrap();
    assert!(created);

    let user = ensure_user(&db, &clerk_uuid, "", "").await.unwrap();
    let workspaces: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE user_id = $1")
        .bind(&user.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(workspaces, 1);
    let roles: i64 = sqlx::query_scalar(
        "SELECT count(DISTINCT role) FROM tag_categories WHERE user_id = $1 AND role IS NOT NULL",
    )
    .bind(&user.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(roles, 3);

    // Concurrent repeat requests stay idempotent.
    let (a, b) = tokio::join!(
        ensure_user(&db, &clerk_uuid, "", ""),
        ensure_user(&db, &clerk_uuid, "", "")
    );
    a.unwrap();
    b.unwrap();
    let workspaces: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE user_id = $1")
        .bind(&user.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(workspaces, 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn blank_profile_fields_are_filled_but_never_overwritten() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let db = Db::from_pool(pool.clone());
    let clerk_uuid = Subject::Clerk(tradstry_backend::ids::new_uuid_v7().to_string());

    let user = ensure_user(&db, &clerk_uuid, "", "").await.unwrap();
    assert_eq!(user.email, "");

    let user = ensure_user(&db, &clerk_uuid, "Ada Trader", "ada@example.com")
        .await
        .unwrap();
    assert_eq!(user.full_name, "Ada Trader");
    assert_eq!(user.email, "ada@example.com");

    let user = ensure_user(&db, &clerk_uuid, "Someone Else", "else@example.com")
        .await
        .unwrap();
    assert_eq!(user.full_name, "Ada Trader");
    assert_eq!(user.email, "ada@example.com");
}

#[tokio::test(flavor = "multi_thread")]
async fn mistake_search_matches_mistake_role_tags() {
    let test_db = TestDb::new().await;
    let pool = test_db.pool();
    let (user, ws) = seed_user_workspace(&pool).await;
    tags_table::ensure_default_categories(&pool, &user, &ws)
        .await
        .unwrap();
    let mistakes = tags_table::list_categories(&pool, &user, &ws)
        .await
        .unwrap()
        .into_iter()
        .find(|c| c.role.as_ref().is_some_and(|r| r.as_str() == "mistake"))
        .expect("mistake category");
    let chased = tags_table::create_tag(&pool, &user, &ws, &mistakes.id, "Chased entry", None)
        .await
        .unwrap();

    let trade_id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, user_id, workspace_id, open_date, close_date, \
         entry_price, exit_price, position_size, symbol, symbol_name, status, total_pl, \
         net_roi, duration, stop_loss, risk_reward, trade_type, mistakes, entry_tactics, edges_spotted) \
         VALUES ($1, $2, $3, now(), now(), 1, 2, 1, 'AAPL', 'Apple', 'loss', -1, -1, 1, 0, 1, 'long', '', '', '')",
    )
    .bind(&trade_id)
    .bind(&user)
    .bind(&ws)
    .execute(&pool)
    .await
    .unwrap();
    tags_table::set_trade_tags(&pool, &user, &trade_id, std::slice::from_ref(&chased.id))
        .await
        .unwrap();

    let search = |term: &str| JournalFilter {
        workspace_id: Some(ws.clone()),
        mistake_contains: Some(term.to_string()),
        ..Default::default()
    };
    let hits = journal_table::list_journal_entries_filtered(&pool, &user, &search("chased"))
        .await
        .unwrap();
    assert_eq!(
        hits.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
        [trade_id.as_str()]
    );

    let misses = journal_table::list_journal_entries_filtered(&pool, &user, &search("revenge"))
        .await
        .unwrap();
    assert!(misses.is_empty());
}
