//! Behaviour the MCP tools rely on: stable notebook paging, self-healing user
//! provisioning, and mistake search over mistake-role tags.

use sqlx::PgPool;
use tradstry_backend::service::db::Db;
use tradstry_backend::service::db::schema::tables::notebook::notes;
use tradstry_backend::service::db::schema::tables::{journal_table, tags_table, users_table};
use tradstry_backend::service::read_service::journal::JournalFilter;
use tradstry_backend::service::read_service::users::ensure_user;

use crate::pg_support::{seed_user_workspace, test_pool};

const EMPTY_DOC: &str = r#"{"root":{"children":[]}}"#;

async fn make_note(pool: &PgPool, user_id: &str, workspace_id: &str) -> String {
    notes::create_notebook_note(
        pool,
        user_id,
        notes::CreateNotebookNoteInput {
            id: None,
            workspace_id: workspace_id.to_string(),
            document_json: EMPTY_DOC.into(),
            trade_ids: vec![],
            folder_id: None,
        },
    )
    .await
    .expect("create note")
    .id
}

#[tokio::test]
async fn notebook_pages_cover_every_note_once_even_if_the_cursor_note_is_deleted() {
    let pool = test_pool().await;
    let (user, ws) = seed_user_workspace(&pool).await;
    let mut created = Vec::new();
    for _ in 0..5 {
        created.push(make_note(&pool, &user, &ws).await);
    }

    let (first, more) = notes::list_notebook_notes_page(&pool, &user, Some(&ws), None, 2)
        .await
        .unwrap();
    assert_eq!(first.len(), 2);
    assert!(more);

    // Editing must not reorder pages, and deleting the cursor note must not
    // restart the listing.
    let cursor = first.last().unwrap().id.clone();
    notes::delete_notebook_note(&pool, &cursor, &user)
        .await
        .unwrap();

    let mut seen: Vec<String> = first.iter().map(|n| n.id.clone()).collect();
    let mut after = Some(cursor);
    loop {
        let (page, more) =
            notes::list_notebook_notes_page(&pool, &user, Some(&ws), after.as_deref(), 2)
                .await
                .unwrap();
        seen.extend(page.iter().map(|n| n.id.clone()));
        if !more {
            break;
        }
        after = page.last().map(|n| n.id.clone());
    }

    let mut expected = created.clone();
    expected.sort();
    let mut got = seen.clone();
    got.sort();
    assert_eq!(got, expected, "every note exactly once");
    assert!(
        seen.windows(2).all(|w| w[0] > w[1]),
        "newest first by uuid v7 id: {seen:?}"
    );
}

#[tokio::test]
async fn an_unknown_notebook_cursor_is_an_error_not_page_one() {
    let pool = test_pool().await;
    let (user, ws) = seed_user_workspace(&pool).await;
    make_note(&pool, &user, &ws).await;
    let missing = tradstry_backend::ids::new_uuid_v7().to_string();
    assert!(
        notes::list_notebook_notes_page(&pool, &user, Some(&ws), Some(&missing), 10)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn a_user_left_unprovisioned_is_provisioned_on_the_next_request() {
    let pool = test_pool().await;
    let db = Db::from_pool(pool.clone());
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();

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

#[tokio::test]
async fn blank_profile_fields_are_filled_but_never_overwritten() {
    let pool = test_pool().await;
    let db = Db::from_pool(pool.clone());
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();

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

#[tokio::test]
async fn mistake_search_matches_mistake_role_tags() {
    let pool = test_pool().await;
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
