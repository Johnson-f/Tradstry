use crate::pg_support::{reset_schema, seed_user_workspace, test_pool};
use sqlx::PgPool;
use tradstry_backend::service::db::schema::tables::notebook::folders;
use tradstry_backend::service::db::schema::tables::notebook::notes;
use tradstry_backend::service::trade_review::journal_flow::reflection;

#[tokio::test]
async fn trade_note_is_listed_in_recent_trades_and_keeps_its_source_link() {
    let pool = test_pool().await;
    let (user, workspace) = seed_user_workspace(&pool).await;
    sqlx::query(
        "INSERT INTO journal_workspace_state(workspace_id,user_id,enabled) VALUES ($1,$2,true)",
    )
    .bind(&workspace)
    .bind(&user)
    .execute(&pool)
    .await
    .unwrap();
    let entry = uuid::Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO journal_entries(id,user_id,workspace_id,symbol,symbol_name,trade_type,open_date,close_date,entry_price,exit_price,position_size,total_pl,net_roi,duration,status,notes) VALUES($1,$2,$3,'PAY','Paymentus','long','2026-09-01T14:00:00Z','2026-09-01T15:00:00Z',10,11,10,10,10,3600,'profit','Original thoughts')")
        .bind(&entry).bind(&user).bind(&workspace).execute(&pool).await.unwrap();
    let note_id = reflection::ensure_note(&pool, &user, &workspace, &entry, "notes-test", "create")
        .await
        .unwrap();
    assert_eq!(
        reflection::ensure_note(&pool, &user, &workspace, &entry, "notes-test", "again")
            .await
            .unwrap(),
        note_id
    );
    let listed = notes::list_notebook_notes(&pool, &user, Some(&workspace))
        .await
        .unwrap();
    let note = listed.iter().find(|n| n.id == note_id).unwrap();
    assert_eq!(note.trade_ids, vec![entry.clone()]);
    assert!(note.document_json.contains("Original thoughts"));
    let folder = folders::list_notebook_folders(&pool, &user, &workspace)
        .await
        .unwrap()
        .into_iter()
        .find(|f| Some(&f.id) == note.folder_id.as_ref())
        .unwrap();
    assert_eq!(folder.name, "Recent Trades");
    assert!(folder.is_system);
    assert!(folder.parent_folder_id.is_some());
    let edited = notes::update_notebook_note(
        &pool,
        &note_id,
        &user,
        notes::UpdateNotebookNoteInput {
            trade_ids: Some(vec![]),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(edited.trade_ids, vec![entry]);
    let (other_user, other_workspace) = seed_user_workspace(&pool).await;
    assert!(
        notes::list_notebook_notes(&pool, &other_user, Some(&workspace))
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        notes::list_notebook_notes(&pool, &user, Some(&other_workspace))
            .await
            .unwrap()
            .is_empty()
    );
}

async fn migrate(pool: &PgPool) {
    tradstry_backend::service::db::schema::pg::migrate(pool)
        .await
        .expect("migrate");
    tradstry_backend::service::db::schema::bootstrap(pool, "public")
        .await
        .expect("bootstrap");
}

async fn system_folder(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> folders::NotebookFolder {
    folders::list_notebook_folders(pool, user_id, workspace_id)
        .await
        .unwrap()
        .into_iter()
        .find(|f| f.is_system && f.parent_folder_id.is_none())
        .expect("account has a system folder")
}

#[tokio::test]
async fn every_account_is_provisioned_with_exactly_one_system_folder() {
    let pool = test_pool().await;
    let _g = reset_schema(&pool).await;
    migrate(&pool).await;
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;

    // Backfill + create-time provisioning both run; neither may produce a duplicate.
    folders::ensure_system_folder(&pool, &user_id, &workspace_id)
        .await
        .unwrap();
    folders::ensure_system_folder(&pool, &user_id, &workspace_id)
        .await
        .unwrap();

    let all = folders::list_notebook_folders(&pool, &user_id, &workspace_id)
        .await
        .unwrap();
    let system: Vec<_> = all
        .iter()
        .filter(|f| f.is_system && f.parent_folder_id.is_none())
        .collect();
    assert_eq!(system.len(), 1, "exactly one system folder per account");
    assert_eq!(system[0].name, folders::SYSTEM_FOLDER_NAME);
    let recent: Vec<_> = all
        .iter()
        .filter(|f| f.is_system && f.name == "Recent Trades")
        .collect();
    assert_eq!(recent.len(), 1);
    assert_eq!(
        recent[0].parent_folder_id.as_deref(),
        Some(system[0].id.as_str())
    );
    assert!(
        folders::rename_notebook_folder(&pool, &user_id, &recent[0].id, "Changed")
            .await
            .is_err()
    );
    assert!(
        folders::delete_notebook_folder_subtree(&pool, &recent[0].id, &user_id)
            .await
            .is_err()
    );
    assert!(
        folders::move_notebook_node(
            &pool,
            &user_id,
            folders::MoveNotebookNodeInput {
                workspace_id: workspace_id.clone(),
                node_id: recent[0].id.clone(),
                node_type: folders::NotebookNodeType::Folder,
                new_parent_folder_id: None,
                new_sort_order: 0,
            }
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn the_system_folder_cannot_be_renamed_or_deleted() {
    let pool = test_pool().await;
    let _g = reset_schema(&pool).await;
    migrate(&pool).await;
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;
    folders::ensure_system_folder(&pool, &user_id, &workspace_id)
        .await
        .unwrap();

    let sys = system_folder(&pool, &user_id, &workspace_id).await;

    // Enforced in the data layer, not the UI: the desktop sync path and any future MCP
    // write tool go through these same functions and must be refused too.
    assert!(
        folders::rename_notebook_folder(&pool, &user_id, &sys.id, "Renamed")
            .await
            .is_err()
    );
    assert!(
        folders::delete_notebook_folder_subtree(&pool, &sys.id, &user_id)
            .await
            .is_err()
    );

    let still_there = system_folder(&pool, &user_id, &workspace_id).await;
    assert_eq!(still_there.name, folders::SYSTEM_FOLDER_NAME);
}

#[tokio::test]
async fn an_ordinary_folder_is_still_renamable_and_deletable() {
    let pool = test_pool().await;
    let _g = reset_schema(&pool).await;
    migrate(&pool).await;
    let (user_id, workspace_id) = seed_user_workspace(&pool).await;

    let f = folders::create_notebook_folder(
        &pool,
        folders::CreateNotebookFolderInput {
            id: None,
            user_id: user_id.clone(),
            workspace_id: workspace_id.clone(),
            parent_folder_id: None,
            name: "Setups".into(),
        },
    )
    .await
    .unwrap();
    assert!(!f.is_system);

    folders::rename_notebook_folder(&pool, &user_id, &f.id, "Setups 2026")
        .await
        .unwrap();
    folders::delete_notebook_folder_subtree(&pool, &f.id, &user_id)
        .await
        .unwrap();

    let left = folders::list_notebook_folders(&pool, &user_id, &workspace_id)
        .await
        .unwrap();
    assert!(left.iter().all(|x| x.id != f.id));
}
