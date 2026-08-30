use std::time::Duration;

use serde_json::Value;
use sqlx::{PgConnection, PgPool, Row};
use thiserror::Error;
use uuid::Uuid;

const UPLOAD_TTL: Duration = Duration::from_secs(30 * 60);
const GC_GRACE: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Error)]
pub enum MediaLifecycleError {
    #[error("notebook media input is invalid: {0}")]
    Validation(String),
    #[error("notebook media was not found")]
    NotFound,
    #[error("notebook media request conflicts with existing state")]
    Conflict,
    #[error("notebook media storage quota exceeded")]
    QuotaExceeded,
    #[error("notebook media is being deleted; retry later")]
    Deleting,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub type MediaLifecycleResult<T> = Result<T, MediaLifecycleError>;

#[derive(Clone, Debug)]
pub struct ReserveMediaUploadInput {
    pub note_id: String,
    pub idempotency_key: String,
    pub content_hash: String,
    pub expected_bytes: i64,
    pub content_type: String,
    pub original_filename: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaUploadReservation {
    pub upload_id: String,
    pub blob_id: String,
    pub reference_id: String,
    pub object_key: String,
    pub already_ready: bool,
    pub reserved_bytes: i64,
}

#[derive(Clone, Debug)]
pub struct FinalizeMediaInput {
    pub etag: Option<String>,
    pub width: i64,
    pub height: i64,
    pub duration_seconds: f64,
    pub format: String,
    pub content_type: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MediaBlob {
    pub id: String,
    pub object_key: String,
    pub state: String,
    pub content_hash: String,
    pub bytes: i64,
    pub content_type: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MediaStorageKeys {
    pub object_key: String,
    pub derivative_key: Option<String>,
}

pub async fn storage_keys(
    pool: &PgPool,
    user_id: &str,
    content_hash: &str,
) -> MediaLifecycleResult<Option<MediaStorageKeys>> {
    let row = sqlx::query(
        "SELECT object_key,derivative_key FROM notebook_media_blobs
         WHERE user_id=$1 AND content_hash=$2 AND state IN ('ready','gc_pending')",
    )
    .bind(user_id)
    .bind(content_hash)
    .fetch_optional(pool)
    .await?;
    row.map(|row| {
        Ok(MediaStorageKeys {
            object_key: row.try_get("object_key")?,
            derivative_key: row.try_get("derivative_key")?,
        })
    })
    .transpose()
}

pub async fn reserve_upload(
    pool: &PgPool,
    user_id: &str,
    input: ReserveMediaUploadInput,
) -> MediaLifecycleResult<MediaUploadReservation> {
    validate_reservation(&input)?;
    let mut tx = pool.begin().await?;
    let workspace_id: Option<String> = sqlx::query_scalar(
        "SELECT workspace_id FROM notebook_notes
         WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(&input.note_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let workspace_id = workspace_id.ok_or(MediaLifecycleError::NotFound)?;

    lock_hash(&mut tx, user_id, &input.content_hash).await?;
    if let Some(existing) = existing_upload(&mut tx, user_id, &input.idempotency_key).await? {
        if existing.note_id != input.note_id
            || existing.expected_hash != input.content_hash
            || existing.expected_bytes != input.expected_bytes
            || existing.content_type != input.content_type
        {
            return Err(MediaLifecycleError::Conflict);
        }
        let mut blob = blob_by_id(&mut tx, user_id, &existing.blob_id).await?;
        if blob.state == "deleting" {
            return Err(MediaLifecycleError::Deleting);
        }
        if blob.state == "gc_pending" {
            if !blob.quota_counted {
                return Err(MediaLifecycleError::Conflict);
            }
            revive_blob(&mut tx, &blob.id).await?;
            blob.state = "ready".to_string();
        }
        if blob.bytes != input.expected_bytes || blob.content_type != input.content_type {
            return Err(MediaLifecycleError::Conflict);
        }
        let reference_id = upsert_reference(
            &mut tx,
            &blob.id,
            user_id,
            &workspace_id,
            &input.note_id,
            &input.original_filename,
        )
        .await?;
        tx.commit().await?;
        return Ok(MediaUploadReservation {
            upload_id: existing.id,
            blob_id: blob.id,
            reference_id,
            object_key: blob.object_key,
            already_ready: blob.state == "ready",
            reserved_bytes: existing.reserved_bytes,
        });
    }

    let mut reserved_bytes = 0;
    let blob = match blob_by_hash(&mut tx, user_id, &input.content_hash).await? {
        Some(mut blob) => {
            if blob.state == "deleting" {
                return Err(MediaLifecycleError::Deleting);
            }
            if blob.state == "failed" {
                return Err(MediaLifecycleError::Conflict);
            }
            if blob.state == "gc_pending" {
                if !blob.quota_counted {
                    return Err(MediaLifecycleError::Conflict);
                }
                revive_blob(&mut tx, &blob.id).await?;
                blob.state = "ready".to_string();
            }
            if blob.bytes != input.expected_bytes || blob.content_type != input.content_type {
                return Err(MediaLifecycleError::Conflict);
            }
            blob
        }
        None => {
            reserve_quota(&mut tx, user_id, input.expected_bytes).await?;
            reserved_bytes = input.expected_bytes;
            let id = Uuid::new_v4().to_string();
            let object_key = format!("notebook/{user_id}/media/{}", input.content_hash);
            let media_type = media_type(&input.content_type).to_string();
            let format = format_from_content_type(&input.content_type).to_string();
            let expires_at = chrono::Utc::now()
                + chrono::Duration::from_std(UPLOAD_TTL)
                    .map_err(|error| MediaLifecycleError::Validation(error.to_string()))?;
            sqlx::query(
                "INSERT INTO notebook_media_blobs
                 (id,user_id,content_hash,object_key,state,content_type,media_type,format,
                  bytes,checksum_sha256,upload_expires_at)
                 VALUES($1,$2,$3,$4,'uploading',$5,$6,$7,$8,$3,$9)",
            )
            .bind(&id)
            .bind(user_id)
            .bind(&input.content_hash)
            .bind(&object_key)
            .bind(&input.content_type)
            .bind(media_type)
            .bind(format)
            .bind(input.expected_bytes)
            .bind(expires_at)
            .execute(&mut *tx)
            .await?;
            BlobRow {
                id,
                object_key,
                state: "uploading".to_string(),
                content_hash: input.content_hash.clone(),
                bytes: input.expected_bytes,
                content_type: input.content_type.clone(),
                quota_counted: false,
            }
        }
    };

    let reference_id = upsert_reference(
        &mut tx,
        &blob.id,
        user_id,
        &workspace_id,
        &input.note_id,
        &input.original_filename,
    )
    .await?;
    let upload_id = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now()
        + chrono::Duration::from_std(UPLOAD_TTL)
            .map_err(|error| MediaLifecycleError::Validation(error.to_string()))?;
    sqlx::query(
        "INSERT INTO notebook_media_uploads
         (id,blob_id,user_id,workspace_id,note_id,idempotency_key,expected_hash,
          expected_bytes,reserved_bytes,content_type,original_filename,state,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    )
    .bind(&upload_id)
    .bind(&blob.id)
    .bind(user_id)
    .bind(&workspace_id)
    .bind(&input.note_id)
    .bind(&input.idempotency_key)
    .bind(&input.content_hash)
    .bind(input.expected_bytes)
    .bind(reserved_bytes)
    .bind(&input.content_type)
    .bind(&input.original_filename)
    .bind(if blob.state == "ready" {
        "ready"
    } else {
        "uploading"
    })
    .bind(expires_at)
    .execute(&mut *tx)
    .await?;
    if blob.state == "uploading" {
        sqlx::query(
            "INSERT INTO notebook_media_outbox(blob_id,user_id,action,available_at)
             VALUES($1,$2,'expire_upload',$3)",
        )
        .bind(&blob.id)
        .bind(user_id)
        .bind(expires_at)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(MediaUploadReservation {
        upload_id,
        blob_id: blob.id,
        reference_id,
        object_key: blob.object_key,
        already_ready: blob.state == "ready",
        reserved_bytes,
    })
}

pub async fn finalize_upload(
    pool: &PgPool,
    user_id: &str,
    upload_id: &str,
    input: FinalizeMediaInput,
) -> MediaLifecycleResult<MediaBlob> {
    let mut tx = pool.begin().await?;
    let upload = sqlx::query(
        "SELECT blob_id FROM notebook_media_uploads
         WHERE id=$1 AND user_id=$2 FOR UPDATE",
    )
    .bind(upload_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(MediaLifecycleError::NotFound)?;
    let blob_id: String = upload.try_get("blob_id")?;
    let blob = blob_by_id(&mut tx, user_id, &blob_id).await?;
    if blob.state == "deleting" {
        return Err(MediaLifecycleError::Deleting);
    }
    if blob.state == "gc_pending" || blob.state == "failed" {
        return Err(MediaLifecycleError::Conflict);
    }
    if blob.state != "ready" {
        let upload_rows = sqlx::query(
            "SELECT reserved_bytes FROM notebook_media_uploads
             WHERE blob_id=$1 AND user_id=$2 FOR UPDATE",
        )
        .bind(&blob_id)
        .bind(user_id)
        .fetch_all(&mut *tx)
        .await?;
        let reserved = upload_rows.iter().try_fold(0_i64, |sum, row| {
            let value: i64 = row.try_get("reserved_bytes")?;
            sum.checked_add(value).ok_or(sqlx::Error::Protocol(
                "media reservation exceeds i64".to_string(),
            ))
        })?;
        sqlx::query(
            "UPDATE users
             SET media_bytes_reserved=media_bytes_reserved-$2,
                 media_bytes_used=media_bytes_used+$3,
                 usage_recomputed_at=now()
             WHERE id=$1",
        )
        .bind(user_id)
        .bind(reserved)
        .bind(blob.bytes)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE notebook_media_blobs
             SET state='ready',content_type=$2,format=$3,width=$4,height=$5,
                 duration_seconds=$6,etag=$7,upload_expires_at=NULL,
                 quota_counted=true,last_error_code=NULL,updated_at=now()
             WHERE id=$1",
        )
        .bind(&blob_id)
        .bind(&input.content_type)
        .bind(&input.format)
        .bind(input.width)
        .bind(input.height)
        .bind(input.duration_seconds)
        .bind(&input.etag)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE notebook_media_uploads
             SET state='ready',reserved_bytes=0,completed_at=COALESCE(completed_at,now()),
                 updated_at=now(),error_code=NULL
             WHERE blob_id=$1 AND user_id=$2",
        )
        .bind(&blob_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO notebook_media_outbox(blob_id,user_id,action)
             SELECT $1,$2,'derive'
             WHERE NOT EXISTS(
                 SELECT 1 FROM notebook_media_outbox
                 WHERE blob_id=$1 AND action='derive' AND completed_at IS NULL
             )",
        )
        .bind(&blob_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            "UPDATE notebook_media_uploads
             SET state='ready',reserved_bytes=0,completed_at=COALESCE(completed_at,now()),
                 updated_at=now()
             WHERE id=$1 AND user_id=$2",
        )
        .bind(upload_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    }
    let ready = blob_by_id(&mut tx, user_id, &blob_id).await?;
    tx.commit().await?;
    Ok(ready.into())
}

pub async fn remove_reference(
    pool: &PgPool,
    user_id: &str,
    note_id: &str,
    content_hash: &str,
) -> MediaLifecycleResult<bool> {
    let mut tx = pool.begin().await?;
    lock_hash(&mut tx, user_id, content_hash).await?;
    let Some(blob) = blob_by_hash(&mut tx, user_id, content_hash).await? else {
        tx.commit().await?;
        return Ok(false);
    };
    let reference_id: Option<String> = sqlx::query_scalar(
        "DELETE FROM notebook_media_references
         WHERE user_id=$1 AND note_id=$2 AND blob_id=$3
         RETURNING id",
    )
    .bind(user_id)
    .bind(note_id)
    .bind(&blob.id)
    .fetch_optional(&mut *tx)
    .await?;
    if reference_id.is_none() {
        tx.commit().await?;
        return Ok(false);
    }
    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE blob_id=$1")
            .bind(&blob.id)
            .fetch_one(&mut *tx)
            .await?;
    if remaining == 0 && blob.state == "ready" {
        let delete_after = chrono::Utc::now()
            + chrono::Duration::from_std(GC_GRACE)
                .map_err(|error| MediaLifecycleError::Validation(error.to_string()))?;
        sqlx::query(
            "UPDATE notebook_media_blobs
             SET state='gc_pending',delete_after=$2,updated_at=now()
             WHERE id=$1",
        )
        .bind(&blob.id)
        .bind(delete_after)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO notebook_media_outbox(blob_id,user_id,action,available_at)
             SELECT $1,$2,'delete',$3
             WHERE NOT EXISTS(
                 SELECT 1 FROM notebook_media_outbox
                 WHERE blob_id=$1 AND action='delete' AND completed_at IS NULL
             )",
        )
        .bind(&blob.id)
        .bind(user_id)
        .bind(delete_after)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(true)
}

pub async fn reconcile_note_references_tx(
    connection: &mut PgConnection,
    note_id: &str,
    document: &Value,
) -> MediaLifecycleResult<()> {
    let note = sqlx::query(
        "SELECT user_id,workspace_id FROM notebook_notes
         WHERE id=$1 AND deleted_at IS NULL",
    )
    .bind(note_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or(MediaLifecycleError::NotFound)?;
    let user_id: String = note.try_get("user_id")?;
    let workspace_id: String = note.try_get("workspace_id")?;
    let desired = super::document::media_hashes(document);

    let current = sqlx::query(
        "SELECT reference.id,reference.blob_id,blob.content_hash,blob.state,
                reference.provisional_until
         FROM notebook_media_references reference
         JOIN notebook_media_blobs blob ON blob.id=reference.blob_id
         WHERE reference.note_id=$1 AND reference.user_id=$2
         ORDER BY blob.id FOR UPDATE OF blob",
    )
    .bind(note_id)
    .bind(&user_id)
    .fetch_all(&mut *connection)
    .await?;

    for hash in &desired {
        let blob = sqlx::query(
            "SELECT id,state,quota_counted FROM notebook_media_blobs
             WHERE user_id=$1 AND content_hash=$2 FOR UPDATE",
        )
        .bind(&user_id)
        .bind(hash)
        .fetch_optional(&mut *connection)
        .await?;
        let Some(blob) = blob else {
            continue;
        };
        let blob_id: String = blob.try_get("id")?;
        let state: String = blob.try_get("state")?;
        let quota_counted: bool = blob.try_get("quota_counted")?;
        if state == "deleting" || state == "failed" {
            continue;
        }
        if state == "gc_pending" {
            if !quota_counted {
                continue;
            }
            revive_blob(&mut *connection, &blob_id).await?;
        }
        sqlx::query(
            "INSERT INTO notebook_media_references
             (id,blob_id,user_id,workspace_id,note_id,original_filename,provisional_until)
             VALUES($1,$2,$3,$4,$5,'media',NULL)
             ON CONFLICT(note_id,blob_id) DO UPDATE SET provisional_until=NULL",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&blob_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(note_id)
        .execute(&mut *connection)
        .await?;
    }

    for row in current {
        let hash: Option<String> = row.try_get("content_hash")?;
        let provisional_until: Option<chrono::DateTime<chrono::Utc>> =
            row.try_get("provisional_until")?;
        let keep = hash.as_ref().is_some_and(|hash| desired.contains(hash))
            || provisional_until.is_some_and(|until| until > chrono::Utc::now());
        if keep {
            continue;
        }
        let reference_id: String = row.try_get("id")?;
        let blob_id: String = row.try_get("blob_id")?;
        let state: String = row.try_get("state")?;
        sqlx::query("DELETE FROM notebook_media_references WHERE id=$1")
            .bind(&reference_id)
            .execute(&mut *connection)
            .await?;
        let remaining: i64 =
            sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE blob_id=$1")
                .bind(&blob_id)
                .fetch_one(&mut *connection)
                .await?;
        if remaining == 0 && state == "ready" {
            schedule_gc(&mut *connection, &blob_id, &user_id).await?;
        }
    }
    Ok(())
}

pub async fn remove_note_references_tx(
    connection: &mut PgConnection,
    user_id: &str,
    note_ids: &[String],
) -> MediaLifecycleResult<()> {
    if note_ids.is_empty() {
        return Ok(());
    }
    let rows = sqlx::query(
        "SELECT blob.id,blob.state
         FROM notebook_media_blobs blob
         WHERE blob.id IN (
             SELECT reference.blob_id FROM notebook_media_references reference
             WHERE reference.user_id=$1 AND reference.note_id=ANY($2)
         )
         ORDER BY blob.id FOR UPDATE OF blob",
    )
    .bind(user_id)
    .bind(note_ids)
    .fetch_all(&mut *connection)
    .await?;
    sqlx::query("DELETE FROM notebook_media_references WHERE user_id=$1 AND note_id=ANY($2)")
        .bind(user_id)
        .bind(note_ids)
        .execute(&mut *connection)
        .await?;
    for row in rows {
        let blob_id: String = row.try_get("id")?;
        let state: String = row.try_get("state")?;
        let remaining: i64 =
            sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE blob_id=$1")
                .bind(&blob_id)
                .fetch_one(&mut *connection)
                .await?;
        if remaining == 0 && state == "ready" {
            schedule_gc(&mut *connection, &blob_id, user_id).await?;
        }
    }
    Ok(())
}

async fn schedule_gc(
    connection: &mut PgConnection,
    blob_id: &str,
    user_id: &str,
) -> MediaLifecycleResult<()> {
    let delete_after = chrono::Utc::now()
        + chrono::Duration::from_std(GC_GRACE)
            .map_err(|error| MediaLifecycleError::Validation(error.to_string()))?;
    sqlx::query(
        "UPDATE notebook_media_blobs
         SET state='gc_pending',delete_after=$2,updated_at=now()
         WHERE id=$1",
    )
    .bind(blob_id)
    .bind(delete_after)
    .execute(&mut *connection)
    .await?;
    sqlx::query(
        "INSERT INTO notebook_media_outbox(blob_id,user_id,action,available_at)
         SELECT $1,$2,'delete',$3
         WHERE NOT EXISTS(
             SELECT 1 FROM notebook_media_outbox
             WHERE blob_id=$1 AND action='delete' AND completed_at IS NULL
         )",
    )
    .bind(blob_id)
    .bind(user_id)
    .bind(delete_after)
    .execute(&mut *connection)
    .await?;
    Ok(())
}

fn validate_reservation(input: &ReserveMediaUploadInput) -> MediaLifecycleResult<()> {
    if input.note_id.trim().is_empty()
        || input.idempotency_key.trim().is_empty()
        || input.expected_bytes <= 0
        || input.content_hash.trim().is_empty()
        || input.content_type.trim().is_empty()
    {
        return Err(MediaLifecycleError::Validation(
            "missing or invalid upload field".to_string(),
        ));
    }
    Ok(())
}

async fn reserve_quota(
    connection: &mut PgConnection,
    user_id: &str,
    bytes: i64,
) -> MediaLifecycleResult<()> {
    let row = sqlx::query(
        "SELECT u.media_bytes_used,u.media_bytes_reserved,pl.media_bytes,
                EXISTS(SELECT 1 FROM founder_grants fg
                       WHERE fg.user_id=u.id AND fg.revoked_at IS NULL) AS founder
         FROM users u LEFT JOIN plan_limits pl ON pl.plan=u.plan
         WHERE u.id=$1 FOR UPDATE OF u",
    )
    .bind(user_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or(MediaLifecycleError::NotFound)?;
    let used: i64 = row.try_get("media_bytes_used")?;
    let reserved: i64 = row.try_get("media_bytes_reserved")?;
    let limit: Option<i64> = row.try_get("media_bytes")?;
    let founder: bool = row.try_get("founder")?;
    let requested = used
        .checked_add(reserved)
        .and_then(|value| value.checked_add(bytes))
        .ok_or(MediaLifecycleError::QuotaExceeded)?;
    if !founder && limit.is_some_and(|limit| requested > limit) {
        return Err(MediaLifecycleError::QuotaExceeded);
    }
    sqlx::query(
        "UPDATE users SET media_bytes_reserved=media_bytes_reserved+$2,
                          usage_recomputed_at=now()
         WHERE id=$1",
    )
    .bind(user_id)
    .bind(bytes)
    .execute(&mut *connection)
    .await?;
    Ok(())
}

async fn lock_hash(
    connection: &mut PgConnection,
    user_id: &str,
    content_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(format!("notebook-media:{user_id}:{content_hash}"))
        .execute(connection)
        .await?;
    Ok(())
}

#[derive(Debug)]
struct UploadRow {
    id: String,
    blob_id: String,
    note_id: String,
    expected_hash: String,
    expected_bytes: i64,
    content_type: String,
    reserved_bytes: i64,
}

async fn existing_upload(
    connection: &mut PgConnection,
    user_id: &str,
    idempotency_key: &str,
) -> Result<Option<UploadRow>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id,blob_id,note_id,expected_hash,expected_bytes,content_type,reserved_bytes
         FROM notebook_media_uploads
         WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE",
    )
    .bind(user_id)
    .bind(idempotency_key)
    .fetch_optional(connection)
    .await?;
    row.map(|row| {
        Ok(UploadRow {
            id: row.try_get("id")?,
            blob_id: row.try_get("blob_id")?,
            note_id: row.try_get("note_id")?,
            expected_hash: row.try_get("expected_hash")?,
            expected_bytes: row.try_get("expected_bytes")?,
            content_type: row.try_get("content_type")?,
            reserved_bytes: row.try_get("reserved_bytes")?,
        })
    })
    .transpose()
}

#[derive(Clone, Debug)]
struct BlobRow {
    id: String,
    object_key: String,
    state: String,
    content_hash: String,
    bytes: i64,
    content_type: String,
    quota_counted: bool,
}

impl From<BlobRow> for MediaBlob {
    fn from(value: BlobRow) -> Self {
        Self {
            id: value.id,
            object_key: value.object_key,
            state: value.state,
            content_hash: value.content_hash,
            bytes: value.bytes,
            content_type: value.content_type,
        }
    }
}

async fn blob_by_hash(
    connection: &mut PgConnection,
    user_id: &str,
    content_hash: &str,
) -> Result<Option<BlobRow>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id,object_key,state,content_hash,bytes,content_type,quota_counted
         FROM notebook_media_blobs
         WHERE user_id=$1 AND content_hash=$2 FOR UPDATE",
    )
    .bind(user_id)
    .bind(content_hash)
    .fetch_optional(connection)
    .await?;
    row.map(row_to_blob).transpose()
}

async fn blob_by_id(
    connection: &mut PgConnection,
    user_id: &str,
    blob_id: &str,
) -> MediaLifecycleResult<BlobRow> {
    let row = sqlx::query(
        "SELECT id,object_key,state,content_hash,bytes,content_type,quota_counted
         FROM notebook_media_blobs
         WHERE id=$1 AND user_id=$2 FOR UPDATE",
    )
    .bind(blob_id)
    .bind(user_id)
    .fetch_optional(connection)
    .await?
    .ok_or(MediaLifecycleError::NotFound)?;
    Ok(row_to_blob(row)?)
}

fn row_to_blob(row: sqlx::postgres::PgRow) -> Result<BlobRow, sqlx::Error> {
    Ok(BlobRow {
        id: row.try_get("id")?,
        object_key: row.try_get("object_key")?,
        state: row.try_get("state")?,
        content_hash: row
            .try_get::<Option<String>, _>("content_hash")?
            .unwrap_or_default(),
        bytes: row.try_get("bytes")?,
        content_type: row.try_get("content_type")?,
        quota_counted: row.try_get("quota_counted")?,
    })
}

async fn revive_blob(connection: &mut PgConnection, blob_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE notebook_media_blobs
         SET state='ready',delete_after=NULL,updated_at=now() WHERE id=$1",
    )
    .bind(blob_id)
    .execute(&mut *connection)
    .await?;
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET completed_at=now(),lease_owner=NULL,leased_at=NULL
         WHERE blob_id=$1 AND action='delete' AND completed_at IS NULL",
    )
    .bind(blob_id)
    .execute(connection)
    .await?;
    Ok(())
}

async fn upsert_reference(
    connection: &mut PgConnection,
    blob_id: &str,
    user_id: &str,
    workspace_id: &str,
    note_id: &str,
    original_filename: &str,
) -> Result<String, sqlx::Error> {
    sqlx::query_scalar(
        "INSERT INTO notebook_media_references
         (id,blob_id,user_id,workspace_id,note_id,original_filename,provisional_until)
         VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 minutes')
         ON CONFLICT(note_id,blob_id) DO UPDATE
         SET original_filename=EXCLUDED.original_filename
         RETURNING id",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(blob_id)
    .bind(user_id)
    .bind(workspace_id)
    .bind(note_id)
    .bind(original_filename)
    .fetch_one(connection)
    .await
}

fn media_type(content_type: &str) -> &str {
    if content_type.starts_with("video/") {
        "video"
    } else {
        "image"
    }
}

fn format_from_content_type(content_type: &str) -> &str {
    content_type.rsplit('/').next().unwrap_or_default()
}
