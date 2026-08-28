use anyhow::{Context, Result, anyhow, ensure};
use async_graphql::SimpleObject;
use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use super::notes;
use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::notebook::notebook_images;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookImage {
    pub id: String,
    pub note_id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub cloudinary_asset_id: String,
    pub cloudinary_public_id: String,
    pub secure_url: String,
    pub width: i64,
    pub height: i64,
    pub format: String,
    pub bytes: i64,
    pub original_filename: String,
    pub media_type: String,
    pub content_type: String,
    pub duration_seconds: f64,
    pub created_at: String,
    pub content_hash: String,
}

#[derive(Debug, Clone)]
pub struct CreateNotebookImageInput {
    pub id: String,
    pub note_id: String,
    pub workspace_id: String,
    pub cloudinary_asset_id: String,
    pub cloudinary_public_id: String,
    pub secure_url: String,
    pub width: i64,
    pub height: i64,
    pub format: String,
    pub bytes: i64,
    pub original_filename: String,
    pub media_type: String,
    pub content_type: String,
    pub duration_seconds: f64,
    pub content_hash: String,
}

impl From<notebook_images::Model> for NotebookImage {
    fn from(model: notebook_images::Model) -> Self {
        Self {
            id: model.id,
            note_id: model.note_id,
            user_id: model.user_id,
            workspace_id: model.workspace_id,
            cloudinary_asset_id: model.cloudinary_asset_id,
            cloudinary_public_id: model.cloudinary_public_id,
            secure_url: model.secure_url,
            width: model.width,
            height: model.height,
            format: model.format,
            bytes: model.bytes,
            original_filename: model.original_filename,
            media_type: model.media_type,
            content_type: model.content_type,
            duration_seconds: model.duration_seconds,
            created_at: model
                .created_at
                .with_timezone(&Utc)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
            content_hash: model.content_hash,
        }
    }
}

pub async fn list_notebook_images_for_note(
    pool: &PgPool,
    note_id: &str,
    user_id: &str,
) -> Result<Vec<NotebookImage>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_images::Entity::find()
        .filter(notebook_images::Column::NoteId.eq(note_id))
        .filter(notebook_images::Column::UserId.eq(user_id))
        .order_by_asc(notebook_images::Column::CreatedAt)
        .order_by_asc(notebook_images::Column::Id)
        .all(&db)
        .await
        .context("Failed to list notebook images")?
        .into_iter()
        .map(Into::into)
        .collect())
}

/// Batched sibling of `list_notebook_images_for_note`: fetches every image for a
/// set of notes in a single query, returning `(note_id, image)` pairs so callers
/// can group them without an extra round-trip per note.
///
/// `note_id` is appended as a trailing select column (index 17). Prepending it
/// would shift every column and break `row_to_notebook_image`, which reads the
/// existing `SELECT_COLS` layout by hardcoded index 0..=16; appending leaves that
/// mapper untouched. The `ORDER BY note_id, created_at ASC, id ASC` preserves the
/// exact per-note ordering of the single-note function within each note's group.
pub async fn list_notebook_images_for_notes(
    pool: &PgPool,
    note_ids: &[String],
    user_id: &str,
) -> Result<Vec<(String, NotebookImage)>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_images::Entity::find()
        .filter(notebook_images::Column::NoteId.is_in(note_ids.iter().cloned()))
        .filter(notebook_images::Column::UserId.eq(user_id))
        .order_by_asc(notebook_images::Column::NoteId)
        .order_by_asc(notebook_images::Column::CreatedAt)
        .order_by_asc(notebook_images::Column::Id)
        .all(&db)
        .await
        .context("Failed to list notebook images for notes")?
        .into_iter()
        .map(|model| (model.note_id.clone(), model.into()))
        .collect())
}

pub async fn find_notebook_image(
    pool: &PgPool,
    id: &str,
    user_id: &str,
) -> Result<Option<NotebookImage>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_images::Entity::find_by_id(id)
        .filter(notebook_images::Column::UserId.eq(user_id))
        .one(&db)
        .await
        .context("Failed to find notebook image")?
        .map(Into::into))
}

/// Any image the user owns whose bytes hash to `content_hash`, regardless of note.
/// The bytes are content-addressed and deduped in R2, so any matching row resolves
/// the same object; the read path presigns a fresh URL from `cloudinary_public_id`.
pub async fn find_notebook_image_by_hash(
    pool: &PgPool,
    user_id: &str,
    content_hash: &str,
) -> Result<Option<NotebookImage>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_images::Entity::find()
        .filter(notebook_images::Column::UserId.eq(user_id))
        .filter(notebook_images::Column::ContentHash.eq(content_hash))
        .order_by_asc(notebook_images::Column::CreatedAt)
        .order_by_asc(notebook_images::Column::Id)
        .one(&db)
        .await
        .context("Failed to find notebook image by hash")?
        .map(Into::into))
}

/// The row for one specific `(note, hash)` pair. Upload is idempotent on this:
/// re-pasting the same bytes into the same note returns the existing row.
pub async fn find_notebook_image_for_note_hash(
    pool: &PgPool,
    user_id: &str,
    note_id: &str,
    content_hash: &str,
) -> Result<Option<NotebookImage>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_images::Entity::find()
        .filter(notebook_images::Column::UserId.eq(user_id))
        .filter(notebook_images::Column::NoteId.eq(note_id))
        .filter(notebook_images::Column::ContentHash.eq(content_hash))
        .one(&db)
        .await
        .context("Failed to find notebook image for note+hash")?
        .map(Into::into))
}

/// How many rows the user still has pointing at these bytes. The R2 object is only
/// safe to delete when this reaches zero.
pub async fn count_images_with_hash(
    pool: &PgPool,
    user_id: &str,
    content_hash: &str,
) -> Result<i64> {
    let db = sea_orm_connection(pool);
    let count = notebook_images::Entity::find()
        .filter(notebook_images::Column::UserId.eq(user_id))
        .filter(notebook_images::Column::ContentHash.eq(content_hash))
        .count(&db)
        .await
        .context("Failed to count images with hash")?;
    i64::try_from(count).context("Notebook image count exceeds i64")
}

pub async fn delete_notebook_image(pool: &PgPool, id: &str, user_id: &str) -> Result<()> {
    let db = sea_orm_connection(pool);
    notebook_images::Entity::delete_many()
        .filter(notebook_images::Column::Id.eq(id))
        .filter(notebook_images::Column::UserId.eq(user_id))
        .exec(&db)
        .await
        .context("Failed to delete notebook image")?;

    Ok(())
}

pub async fn create_notebook_image(
    pool: &PgPool,
    user_id: &str,
    input: CreateNotebookImageInput,
) -> Result<NotebookImage> {
    let note = notes::find_notebook_note(pool, &input.note_id, user_id)
        .await?
        .ok_or_else(|| anyhow!("Notebook note '{}' not found", input.note_id))?;

    ensure!(
        note.workspace_id == input.workspace_id,
        "Notebook note '{}' does not belong to account '{}'",
        input.note_id,
        input.workspace_id
    );

    let db = sea_orm_connection(pool);
    Ok(notebook_images::ActiveModel {
        id: Set(input.id),
        note_id: Set(input.note_id),
        user_id: Set(user_id.to_owned()),
        workspace_id: Set(input.workspace_id),
        cloudinary_asset_id: Set(input.cloudinary_asset_id),
        cloudinary_public_id: Set(input.cloudinary_public_id),
        secure_url: Set(input.secure_url),
        width: Set(input.width),
        height: Set(input.height),
        format: Set(input.format),
        bytes: Set(input.bytes),
        original_filename: Set(input.original_filename),
        media_type: Set(input.media_type),
        content_type: Set(input.content_type),
        duration_seconds: Set(input.duration_seconds),
        content_hash: Set(input.content_hash),
        ..Default::default()
    }
    .insert(&db)
    .await
    .context("Failed to insert notebook image")?
    .into())
}

pub async fn sync_note_image_workspace_id(
    pool: &PgPool,
    note_id: &str,
    user_id: &str,
    workspace_id: &str,
) -> Result<()> {
    let db = sea_orm_connection(pool);
    notebook_images::Entity::update_many()
        .col_expr(
            notebook_images::Column::WorkspaceId,
            Expr::value(workspace_id.to_owned()),
        )
        .filter(notebook_images::Column::NoteId.eq(note_id))
        .filter(notebook_images::Column::UserId.eq(user_id))
        .exec(&db)
        .await
        .context("Failed to sync notebook image account ids")?;

    Ok(())
}
