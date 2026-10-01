use anyhow::Result;

use crate::service::db::client::UserDb;
use crate::service::db::schema::tables::notebook::folders::{
    self, CreateNotebookFolderInput, MoveNotebookNodeInput, NotebookFolder,
};

pub async fn list_notebook_folders(
    user_db: &UserDb,
    workspace_id: &str,
) -> Result<Vec<NotebookFolder>> {
    folders::list_notebook_folders(user_db.pool(), user_db.user_id(), workspace_id).await
}

pub async fn create_notebook_folder(
    user_db: &UserDb,
    input: CreateNotebookFolderInput,
) -> Result<NotebookFolder> {
    folders::create_notebook_folder(user_db.pool(), input).await
}

pub async fn rename_notebook_folder(user_db: &UserDb, id: &str, name: &str) -> Result<()> {
    folders::rename_notebook_folder(user_db.pool(), user_db.user_id(), id, name).await
}

pub async fn move_notebook_node(user_db: &UserDb, input: MoveNotebookNodeInput) -> Result<()> {
    folders::move_notebook_node(user_db.pool(), user_db.user_id(), input).await
}

/// Delete a notebook folder and its entire subtree (descendant folders + notes
/// + images + note-trade links via the cascading deletes in the table layer).
///
pub async fn delete_notebook_folder(user_db: &UserDb, folder_id: &str) -> Result<bool> {
    let mut tx = user_db.pool().begin().await?;
    let note_ids = folders::delete_notebook_folder_subtree_tx(
        &mut tx,
        folder_id,
        user_db.user_id(),
        &crate::service::hlc::stamp(),
    )
    .await?;
    crate::service::notebook::media::remove_note_references_tx(
        &mut tx,
        user_db.user_id(),
        &note_ids,
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}
