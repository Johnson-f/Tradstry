//! Every write path that takes a caller-supplied id must refuse another user's row.
//! Each test seeds a victim and an attacker and proves the victim's data is untouched.

use sqlx::PgPool;
use tradstry_backend::service::db::schema::tables::notebook::{folders, notes};
use tradstry_backend::service::db::schema::tables::playbook_table;
use tradstry_backend::service::db::schema::tables::tags_table;
use tradstry_backend::service::db::schema::tables::trading_principle_table as tp;

use crate::pg_support::{seed_user_workspace, test_pool};

const EMPTY_DOC: &str = r#"{"root":{"children":[]}}"#;

async fn make_folder(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    parent_folder_id: Option<String>,
) -> anyhow::Result<folders::NotebookFolder> {
    folders::create_notebook_folder(
        pool,
        folders::CreateNotebookFolderInput {
            id: None,
            user_id: user_id.to_string(),
            workspace_id: workspace_id.to_string(),
            parent_folder_id,
            name: "Setups".into(),
        },
    )
    .await
}

async fn make_note(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    folder_id: Option<String>,
) -> anyhow::Result<notes::NotebookNote> {
    notes::create_notebook_note(
        pool,
        user_id,
        notes::CreateNotebookNoteInput {
            id: None,
            workspace_id: workspace_id.to_string(),
            document_json: EMPTY_DOC.into(),
            trade_ids: vec![],
            folder_id,
        },
    )
    .await
}

async fn seed_trade(pool: &PgPool, user_id: &str, workspace_id: &str) -> String {
    let id = tradstry_backend::ids::new_uuid_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, user_id, workspace_id, open_date, close_date, \
         entry_price, exit_price, position_size, symbol, symbol_name, status, total_pl, \
         net_roi, duration, stop_loss, risk_reward, trade_type, mistakes, entry_tactics, edges_spotted) \
         VALUES ($1, $2, $3, now(), now(), 1, 2, 1, 'AAPL', 'Apple', 'profit', 1, 1, 1, 0, 1, 'long', '', '', '')",
    )
    .bind(&id)
    .bind(user_id)
    .bind(workspace_id)
    .execute(pool)
    .await
    .expect("seed journal entry");
    id
}

/// A user with one tag attached to one trade. Returns `(category_id, tag_id, trade_id)`.
async fn seed_tagged_trade(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    tag_name: &str,
) -> (String, String, String) {
    let category = tags_table::create_category(pool, user_id, workspace_id, "Setups", None)
        .await
        .unwrap();
    let tag = tags_table::create_tag(pool, user_id, workspace_id, &category.id, tag_name, None)
        .await
        .unwrap();
    let trade_id = seed_trade(pool, user_id, workspace_id).await;
    tags_table::set_trade_tags(pool, user_id, &trade_id, std::slice::from_ref(&tag.id))
        .await
        .unwrap();
    (category.id, tag.id, trade_id)
}

async fn link_count(pool: &PgPool, tag_id: &str) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM trade_tags WHERE tag_id = $1")
        .bind(tag_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

// ---------------------------------------------------------------------------
// Notebook folders
// ---------------------------------------------------------------------------

#[tokio::test]
async fn folder_reads_are_scoped_to_the_caller() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, _) = seed_user_workspace(&pool).await;
    let folder = make_folder(&pool, &victim, &victim_ws, None).await.unwrap();

    let listed = folders::list_notebook_folders(&pool, &attacker, &victim_ws)
        .await
        .unwrap();
    assert!(listed.is_empty(), "listed another user's folders");

    let found = folders::find_notebook_folder(&pool, &attacker, &folder.id)
        .await
        .unwrap();
    assert!(found.is_none(), "found another user's folder");
}

#[tokio::test]
async fn folders_cannot_be_created_in_or_under_another_users_workspace() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, attacker_ws) = seed_user_workspace(&pool).await;
    let victim_folder = make_folder(&pool, &victim, &victim_ws, None).await.unwrap();

    assert!(
        make_folder(&pool, &attacker, &victim_ws, None)
            .await
            .is_err(),
        "created a folder in another user's workspace"
    );
    assert!(
        make_folder(
            &pool,
            &attacker,
            &attacker_ws,
            Some(victim_folder.id.clone())
        )
        .await
        .is_err(),
        "nested a folder under another user's folder"
    );

    let foreign_rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM notebook_folders WHERE workspace_id = $1 AND user_id = $2",
    )
    .bind(&victim_ws)
    .bind(&attacker)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(foreign_rows, 0);
}

#[tokio::test]
async fn another_users_folder_cannot_be_renamed() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, _) = seed_user_workspace(&pool).await;
    let folder = make_folder(&pool, &victim, &victim_ws, None).await.unwrap();

    assert!(
        folders::rename_notebook_folder(&pool, &attacker, &folder.id, "pwned")
            .await
            .is_err()
    );

    let after = folders::find_notebook_folder(&pool, &victim, &folder.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(after.name, "Setups");
}

#[tokio::test]
async fn another_users_nodes_cannot_be_moved() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, attacker_ws) = seed_user_workspace(&pool).await;
    let victim_folder = make_folder(&pool, &victim, &victim_ws, None).await.unwrap();
    let victim_note = make_note(&pool, &victim, &victim_ws, Some(victim_folder.id.clone()))
        .await
        .unwrap();
    let attacker_folder = make_folder(&pool, &attacker, &attacker_ws, None)
        .await
        .unwrap();
    let attacker_note = make_note(&pool, &attacker, &attacker_ws, None)
        .await
        .unwrap();

    let move_input = |workspace_id: &str, node_id: &str, node_type, parent: Option<&str>| {
        folders::MoveNotebookNodeInput {
            workspace_id: workspace_id.to_string(),
            node_id: node_id.to_string(),
            node_type,
            new_parent_folder_id: parent.map(str::to_string),
            new_sort_order: 0,
        }
    };

    let attempts = [
        (
            "victim's note, victim's workspace",
            move_input(
                &victim_ws,
                &victim_note.id,
                folders::NotebookNodeType::Note,
                None,
            ),
        ),
        (
            "victim's folder, victim's workspace",
            move_input(
                &victim_ws,
                &victim_folder.id,
                folders::NotebookNodeType::Folder,
                None,
            ),
        ),
        (
            "victim's note, attacker's workspace",
            move_input(
                &attacker_ws,
                &victim_note.id,
                folders::NotebookNodeType::Note,
                None,
            ),
        ),
        (
            "own note into victim's folder",
            move_input(
                &attacker_ws,
                &attacker_note.id,
                folders::NotebookNodeType::Note,
                Some(&victim_folder.id),
            ),
        ),
        (
            "own folder under victim's folder",
            move_input(
                &attacker_ws,
                &attacker_folder.id,
                folders::NotebookNodeType::Folder,
                Some(&victim_folder.id),
            ),
        ),
    ];
    for (label, input) in attempts {
        assert!(
            folders::move_notebook_node(&pool, &attacker, input)
                .await
                .is_err(),
            "move was allowed: {label}"
        );
    }

    let note = notes::find_notebook_note(&pool, &victim_note.id, &victim)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(note.folder_id.as_deref(), Some(victim_folder.id.as_str()));
}

#[tokio::test]
async fn owner_can_still_move_and_rename() {
    let pool = test_pool().await;
    let (user, ws) = seed_user_workspace(&pool).await;
    let parent = make_folder(&pool, &user, &ws, None).await.unwrap();
    let child = make_folder(&pool, &user, &ws, None).await.unwrap();
    let note = make_note(&pool, &user, &ws, None).await.unwrap();

    folders::rename_notebook_folder(&pool, &user, &parent.id, "Playbooks")
        .await
        .unwrap();
    folders::move_notebook_node(
        &pool,
        &user,
        folders::MoveNotebookNodeInput {
            workspace_id: ws.clone(),
            node_id: child.id.clone(),
            node_type: folders::NotebookNodeType::Folder,
            new_parent_folder_id: Some(parent.id.clone()),
            new_sort_order: 0,
        },
    )
    .await
    .unwrap();
    folders::move_notebook_node(
        &pool,
        &user,
        folders::MoveNotebookNodeInput {
            workspace_id: ws.clone(),
            node_id: note.id.clone(),
            node_type: folders::NotebookNodeType::Note,
            new_parent_folder_id: Some(child.id.clone()),
            new_sort_order: 0,
        },
    )
    .await
    .unwrap();

    let moved = folders::find_notebook_folder(&pool, &user, &child.id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(moved.parent_folder_id.as_deref(), Some(parent.id.as_str()));
    let moved_note = notes::find_notebook_note(&pool, &note.id, &user)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(moved_note.folder_id.as_deref(), Some(child.id.as_str()));

    // MCP `move_note` with no folder_id: back out to Uncategorized, placed last.
    folders::move_notebook_node(
        &pool,
        &user,
        folders::MoveNotebookNodeInput {
            workspace_id: ws.clone(),
            node_id: note.id.clone(),
            node_type: folders::NotebookNodeType::Note,
            new_parent_folder_id: None,
            new_sort_order: i64::MAX,
        },
    )
    .await
    .unwrap();
    let unfiled = notes::find_notebook_note(&pool, &note.id, &user)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unfiled.folder_id, None);
}

#[tokio::test]
async fn notes_cannot_be_filed_in_another_users_folder() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, attacker_ws) = seed_user_workspace(&pool).await;
    let victim_folder = make_folder(&pool, &victim, &victim_ws, None).await.unwrap();

    assert!(
        make_note(
            &pool,
            &attacker,
            &attacker_ws,
            Some(victim_folder.id.clone())
        )
        .await
        .is_err(),
        "created a note in another user's folder"
    );

    let note = make_note(&pool, &attacker, &attacker_ws, None)
        .await
        .unwrap();
    let update = notes::update_notebook_note(
        &pool,
        &note.id,
        &attacker,
        notes::UpdateNotebookNoteInput {
            folder_id: Some(victim_folder.id.clone()),
            ..Default::default()
        },
    )
    .await;
    assert!(update.is_err(), "moved a note into another user's folder");
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

#[tokio::test]
async fn deleting_another_users_tag_leaves_their_links_alone() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, _) = seed_user_workspace(&pool).await;
    let (_, tag_id, _) = seed_tagged_trade(&pool, &victim, &victim_ws, "Breakout").await;

    let deleted = tags_table::delete_tag(&pool, &attacker, &tag_id)
        .await
        .unwrap();

    assert!(!deleted);
    assert_eq!(link_count(&pool, &tag_id).await, 1);
    assert!(
        tags_table::find_tag(&pool, &victim, &tag_id)
            .await
            .unwrap()
            .is_some()
    );
}

#[tokio::test]
async fn deleting_a_tag_tombstones_it_and_bumps_its_trades() {
    let pool = test_pool().await;
    let (user, ws) = seed_user_workspace(&pool).await;
    let (_, tag_id, trade_id) = seed_tagged_trade(&pool, &user, &ws, "Breakout").await;
    sqlx::query("UPDATE journal_entries SET updated_at = now() - interval '1 day' WHERE id = $1")
        .bind(&trade_id)
        .execute(&pool)
        .await
        .unwrap();

    assert!(tags_table::delete_tag(&pool, &user, &tag_id).await.unwrap());

    assert_eq!(link_count(&pool, &tag_id).await, 0);
    let tombstoned: bool =
        sqlx::query_scalar("SELECT deleted_at IS NOT NULL FROM tags WHERE id = $1")
            .bind(&tag_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        tombstoned,
        "tag must stay as a tombstone so offline clients see it go"
    );
    let bumped: bool = sqlx::query_scalar(
        "SELECT updated_at > now() - interval '1 hour' FROM journal_entries WHERE id = $1",
    )
    .bind(&trade_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        bumped,
        "trade must be re-delivered to sync with its new tag set"
    );

    // The partial unique index ignores tombstones, so the name is free again.
    let category_id: String = sqlx::query_scalar("SELECT category_id FROM tags WHERE id = $1")
        .bind(&tag_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    tags_table::create_tag(&pool, &user, &ws, &category_id, "Breakout", None)
        .await
        .unwrap();
}

#[tokio::test]
async fn merging_with_another_users_tag_is_refused() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, attacker_ws) = seed_user_workspace(&pool).await;
    let (_, victim_tag, _) = seed_tagged_trade(&pool, &victim, &victim_ws, "Breakout").await;
    let (_, attacker_tag, _) = seed_tagged_trade(&pool, &attacker, &attacker_ws, "Chase").await;

    let mut tx = pool.begin().await.unwrap();
    let merged = tags_table::merge_tags_tx(
        &mut tx,
        &attacker,
        &victim_tag,
        &attacker_tag,
        "999999999999999:00000:attacker",
    )
    .await;
    assert!(merged.is_err(), "sync merge accepted another user's tag");
    drop(tx);

    assert!(
        tags_table::merge_tags(&pool, &attacker, &victim_tag, &attacker_tag)
            .await
            .is_err()
    );
    assert_eq!(link_count(&pool, &victim_tag).await, 1);
    assert_eq!(link_count(&pool, &attacker_tag).await, 1);
}

#[tokio::test]
async fn merging_a_tag_into_itself_keeps_its_links() {
    let pool = test_pool().await;
    let (user, ws) = seed_user_workspace(&pool).await;
    let (_, tag_id, _) = seed_tagged_trade(&pool, &user, &ws, "Breakout").await;

    let mut tx = pool.begin().await.unwrap();
    assert!(
        tags_table::merge_tags_tx(&mut tx, &user, &tag_id, &tag_id, "999999999999999:00000:c")
            .await
            .is_err()
    );
    drop(tx);
    assert_eq!(link_count(&pool, &tag_id).await, 1);
}

#[tokio::test]
async fn online_merge_repoints_links_and_tombstones_the_source() {
    let pool = test_pool().await;
    let (user, ws) = seed_user_workspace(&pool).await;
    let (category_id, from_tag, trade_id) = seed_tagged_trade(&pool, &user, &ws, "Chased").await;
    let into_tag = tags_table::create_tag(&pool, &user, &ws, &category_id, "Chasing", None)
        .await
        .unwrap();

    tags_table::merge_tags(&pool, &user, &from_tag, &into_tag.id)
        .await
        .unwrap();

    assert_eq!(link_count(&pool, &from_tag).await, 0);
    let tags = tags_table::tags_for_trade(&pool, &user, &trade_id)
        .await
        .unwrap();
    assert_eq!(
        tags.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
        [into_tag.id.as_str()]
    );
    let tombstoned: bool =
        sqlx::query_scalar("SELECT deleted_at IS NOT NULL FROM tags WHERE id = $1")
            .bind(&from_tag)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(tombstoned);
}

// ---------------------------------------------------------------------------
// Principles
// ---------------------------------------------------------------------------

fn principle_input(workspace_id: &str) -> tp::CreatePrincipleInput {
    tp::CreatePrincipleInput {
        workspace_id: workspace_id.to_string(),
        title: "No first 30 minutes".to_string(),
        the_rule: "Do not touch a position 9:30-10:00 ET.".to_string(),
        why: "12 breaks cost -46%.".to_string(),
        intervention: None,
        playbook_id: None,
        evidence_note_id: None,
    }
}

fn principle_write_args(workspace_id: &str, playbook_id: Option<String>) -> tp::PrincipleWriteArgs {
    tp::PrincipleWriteArgs {
        id: tradstry_backend::ids::new_uuid_v7().to_string(),
        workspace_id: workspace_id.to_string(),
        playbook_id,
        evidence_note_id: None,
        title: "No first 30 minutes".to_string(),
        the_rule: "Do not touch a position 9:30-10:00 ET.".to_string(),
        why: "12 breaks cost -46%.".to_string(),
        intervention: None,
        is_active: true,
        priority: 0,
    }
}

#[tokio::test]
async fn principles_cannot_be_created_in_another_users_workspace() {
    let pool = test_pool().await;
    let (_, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, _) = seed_user_workspace(&pool).await;

    assert!(
        tp::create_principle(&pool, &attacker, principle_input(&victim_ws))
            .await
            .is_err()
    );

    let mut tx = pool.begin().await.unwrap();
    assert!(
        tp::create_principle_tx(
            &mut tx,
            &attacker,
            &principle_write_args(&victim_ws, None),
            "999999999999999:00000:attacker",
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn synced_principles_cannot_reference_another_users_playbook() {
    let pool = test_pool().await;
    let (victim, victim_ws) = seed_user_workspace(&pool).await;
    let (attacker, attacker_ws) = seed_user_workspace(&pool).await;
    let victim_playbook = playbook_table::create_playbook(
        &pool,
        &victim,
        playbook_table::CreatePlaybookInput {
            workspace_id: victim_ws.clone(),
            name: "Opening range".into(),
            edge_name: "ORB".into(),
            entry_rules: "Break of the 5m high".into(),
            exit_rules: "Close below VWAP".into(),
            position_sizing_rules: "0.5R".into(),
            additional_rules: None,
        },
    )
    .await
    .unwrap();

    let own = principle_write_args(&attacker_ws, None);
    let mut tx = pool.begin().await.unwrap();
    tp::create_principle_tx(&mut tx, &attacker, &own, "999999999999999:00000:a")
        .await
        .unwrap();

    let hijack = tp::PrincipleWriteArgs {
        playbook_id: Some(victim_playbook.id.clone()),
        ..own
    };
    assert!(
        tp::update_principle_tx(&mut tx, &attacker, &hijack, "999999999999999:00001:a")
            .await
            .is_err()
    );
    let moved = tp::PrincipleWriteArgs {
        workspace_id: victim_ws.clone(),
        playbook_id: None,
        ..hijack
    };
    assert!(
        tp::update_principle_tx(&mut tx, &attacker, &moved, "999999999999999:00002:a")
            .await
            .is_err()
    );
}
