use anyhow::Result;

use crate::service::db::client::UserDb;
use crate::service::db::schema::tables::notebook::images::{self, NotebookImage};

pub async fn find_notebook_image_by_hash(
    user_db: &UserDb,
    content_hash: &str,
) -> Result<Option<NotebookImage>> {
    images::find_notebook_image_by_hash(user_db.pool(), user_db.user_id(), content_hash).await
}

pub async fn find_notebook_image_for_note_hash(
    user_db: &UserDb,
    note_id: &str,
    content_hash: &str,
) -> Result<Option<NotebookImage>> {
    images::find_notebook_image_for_note_hash(
        user_db.pool(),
        user_db.user_id(),
        note_id,
        content_hash,
    )
    .await
}
