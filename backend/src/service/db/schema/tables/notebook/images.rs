use anyhow::{Context, Result};
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookImage {
    pub id: String,
    pub note_id: String,
    pub user_id: String,
    pub workspace_id: String,
    #[serde(skip)]
    #[graphql(skip)]
    pub object_key: String,
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

const SELECT_MEDIA: &str =
    "reference.id,reference.note_id,reference.user_id,reference.workspace_id,
     blob.object_key,blob.width,blob.height,blob.format,blob.bytes,
     reference.original_filename,blob.media_type,blob.content_type,
     blob.duration_seconds,
     to_char(reference.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
     blob.content_hash";

pub async fn list_notebook_media_for_note(
    pool: &PgPool,
    note_id: &str,
    user_id: &str,
) -> Result<Vec<NotebookImage>> {
    let sql = format!(
        "SELECT {SELECT_MEDIA} FROM notebook_media_references reference
         JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
         WHERE reference.note_id=$1 AND reference.user_id=$2
           AND blob.state='ready' AND blob.content_hash IS NOT NULL
         ORDER BY reference.created_at,reference.id"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(note_id)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .context("Failed to list notebook media")?;
    rows.iter().map(row_to_notebook_image).collect()
}

pub async fn list_notebook_media_for_notes(
    pool: &PgPool,
    note_ids: &[String],
    user_id: &str,
) -> Result<Vec<(String, NotebookImage)>> {
    if note_ids.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT {SELECT_MEDIA} FROM notebook_media_references reference
         JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
         WHERE reference.note_id=ANY($1) AND reference.user_id=$2
           AND blob.state='ready' AND blob.content_hash IS NOT NULL
         ORDER BY reference.note_id,reference.created_at,reference.id"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(note_ids)
        .bind(user_id)
        .fetch_all(pool)
        .await
        .context("Failed to list notebook media for notes")?;
    rows.iter()
        .map(|row| {
            let image = row_to_notebook_image(row)?;
            Ok((image.note_id.clone(), image))
        })
        .collect()
}

pub async fn find_notebook_image(
    pool: &PgPool,
    id: &str,
    user_id: &str,
) -> Result<Option<NotebookImage>> {
    find_one(
        pool,
        format!(
            "SELECT {SELECT_MEDIA} FROM notebook_media_references reference
             JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
             WHERE reference.id=$1 AND reference.user_id=$2
               AND blob.state='ready' AND blob.content_hash IS NOT NULL"
        ),
        id,
        user_id,
    )
    .await
}

pub async fn find_notebook_image_by_hash(
    pool: &PgPool,
    user_id: &str,
    content_hash: &str,
) -> Result<Option<NotebookImage>> {
    find_one(
        pool,
        format!(
            "SELECT {SELECT_MEDIA} FROM notebook_media_references reference
             JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
             WHERE blob.content_hash=$1 AND reference.user_id=$2 AND blob.state='ready'
             ORDER BY reference.created_at,reference.id LIMIT 1"
        ),
        content_hash,
        user_id,
    )
    .await
}

pub async fn find_notebook_image_for_note_hash(
    pool: &PgPool,
    user_id: &str,
    note_id: &str,
    content_hash: &str,
) -> Result<Option<NotebookImage>> {
    let sql = format!(
        "SELECT {SELECT_MEDIA} FROM notebook_media_references reference
         JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
         WHERE reference.note_id=$1 AND blob.content_hash=$2
           AND reference.user_id=$3 AND blob.state='ready'"
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(note_id)
        .bind(content_hash)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .context("Failed to find notebook media for note and hash")?;
    row.as_ref().map(row_to_notebook_image).transpose()
}

async fn find_one(
    pool: &PgPool,
    sql: String,
    value: &str,
    user_id: &str,
) -> Result<Option<NotebookImage>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(value)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .context("Failed to find notebook media")?;
    row.as_ref().map(row_to_notebook_image).transpose()
}

fn row_to_notebook_image(row: &sqlx::postgres::PgRow) -> Result<NotebookImage> {
    Ok(NotebookImage {
        id: row.try_get(0)?,
        note_id: row.try_get(1)?,
        user_id: row.try_get(2)?,
        workspace_id: row.try_get(3)?,
        object_key: row.try_get(4)?,
        secure_url: String::new(),
        width: row.try_get(5)?,
        height: row.try_get(6)?,
        format: row.try_get(7)?,
        bytes: row.try_get(8)?,
        original_filename: row.try_get(9)?,
        media_type: row.try_get(10)?,
        content_type: row.try_get(11)?,
        duration_seconds: row.try_get(12)?,
        created_at: row.try_get(13)?,
        content_hash: row.try_get(14)?,
    })
}
