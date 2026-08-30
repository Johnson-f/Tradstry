use std::{io::Cursor, sync::Arc, time::Duration};

use anyhow::{Result, anyhow, ensure};
use aws_sdk_s3::primitives::ByteStream;
use image::ImageFormat;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use tokio::io::AsyncWriteExt;

use crate::service::db::Db;
use crate::service::upload::r2::R2Client;

const POLL_INTERVAL: Duration = Duration::from_secs(5);
const LEASE_TIMEOUT: Duration = Duration::from_secs(120);
const BATCH_SIZE: i64 = 10;

#[derive(Debug)]
struct Job {
    id: i64,
    blob_id: String,
    user_id: String,
    action: String,
    attempt_count: i32,
    lease_owner: String,
}

#[derive(Debug)]
struct BlobWork {
    id: String,
    object_key: String,
    media_type: String,
    derivative_key: Option<String>,
}

pub async fn process_once(pool: &PgPool, r2: &R2Client, owner: &str) -> Result<usize> {
    reconcile_expired_references(pool).await?;
    let jobs = claim(pool, owner).await?;
    let mut handled = 0;
    for job in jobs {
        let result = match job.action.as_str() {
            "derive" => derive(pool, r2, &job).await,
            "delete" => delete(pool, r2, &job).await,
            "expire_upload" => expire_upload(pool, &job).await,
            "reconcile" => complete_job(pool, &job).await,
            _ => Err(anyhow!("unknown notebook media action {}", job.action)),
        };
        match result {
            Ok(()) => handled += 1,
            Err(error) => {
                log::warn!("notebook media job {} failed: {error:#}", job.id);
                fail_job(pool, &job, "media_worker_failed").await?;
            }
        }
    }
    Ok(handled)
}

async fn reconcile_expired_references(pool: &PgPool) -> Result<()> {
    let notes: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT note_id FROM notebook_media_references
         WHERE provisional_until<=now() ORDER BY note_id LIMIT 50",
    )
    .fetch_all(pool)
    .await?;
    for note_id in notes {
        let mut tx = pool.begin().await?;
        let document: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT document_json::jsonb FROM notebook_notes
             WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        )
        .bind(&note_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(document) = document else {
            tx.commit().await?;
            continue;
        };
        crate::service::notebook::media::reconcile_note_references_tx(&mut tx, &note_id, &document)
            .await?;
        tx.commit().await?;
    }
    Ok(())
}

pub async fn run_media_worker(
    db: Arc<Db>,
    r2: Arc<R2Client>,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    let owner = format!("media-worker-{}", uuid::Uuid::new_v4());
    log::info!("notebook media worker started");
    loop {
        tokio::select! {
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
            _ = shutdown.changed() => {}
        }
        if *shutdown.borrow() {
            log::info!("notebook media worker stopped");
            return;
        }
        if let Err(error) = process_once(db.pool(), &r2, &owner).await {
            log::error!("notebook media worker tick failed: {error:#}");
        }
    }
}

async fn claim(pool: &PgPool, owner: &str) -> Result<Vec<Job>> {
    let stale_seconds = i64::try_from(LEASE_TIMEOUT.as_secs())?;
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET completed_at=now(),last_error_code='missing_blob',lease_owner=NULL,leased_at=NULL
         WHERE completed_at IS NULL AND blob_id IS NULL",
    )
    .execute(pool)
    .await?;
    let rows = sqlx::query(
        "WITH candidates AS (
             SELECT id FROM notebook_media_outbox
             WHERE completed_at IS NULL AND available_at <= now()
               AND blob_id IS NOT NULL
               AND (action IN ('delete','expire_upload') OR attempt_count < max_attempts)
               AND (leased_at IS NULL OR leased_at < now()-make_interval(secs=>$2))
             ORDER BY available_at,id
             FOR UPDATE SKIP LOCKED LIMIT $3
         )
         UPDATE notebook_media_outbox job
         SET lease_owner=$1 || ':' || gen_random_uuid()::text,leased_at=now()
         FROM candidates WHERE job.id=candidates.id
         RETURNING job.id,job.blob_id,job.user_id,job.action,job.attempt_count,
                   job.lease_owner",
    )
    .bind(owner)
    .bind(stale_seconds)
    .bind(BATCH_SIZE)
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            Ok(Job {
                id: row.try_get("id")?,
                blob_id: row
                    .try_get::<Option<String>, _>("blob_id")?
                    .ok_or_else(|| anyhow!("media job has no blob"))?,
                user_id: row.try_get("user_id")?,
                action: row.try_get("action")?,
                attempt_count: row.try_get("attempt_count")?,
                lease_owner: row.try_get("lease_owner")?,
            })
        })
        .collect()
}

async fn derive(pool: &PgPool, r2: &R2Client, job: &Job) -> Result<()> {
    let blob = load_ready_blob(pool, &job.blob_id, &job.user_id).await?;
    let input = spool_object(r2, &blob.object_key).await?;
    let thumbnail = if blob.media_type == "video" {
        crate::service::upload::media::extract_keyframes_from_file(input.path(), 1)
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("video thumbnail was not produced"))?
    } else {
        let path = input.path().to_path_buf();
        tokio::task::spawn_blocking(move || thumbnail_image_file(&path)).await??
    };
    let derivative_hash = hex::encode(Sha256::digest(&thumbnail));
    let derivative_key = format!("{}.thumb/v1", blob.object_key);
    let mut tx = pool.begin().await?;
    let ready: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM notebook_media_blobs
         WHERE id=$1 AND user_id=$2 AND state='ready' FOR UPDATE",
    )
    .bind(&blob.id)
    .bind(&job.user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let owns_job: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM notebook_media_outbox
         WHERE id=$1 AND lease_owner=$2 AND completed_at IS NULL FOR UPDATE",
    )
    .bind(job.id)
    .bind(&job.lease_owner)
    .fetch_optional(&mut *tx)
    .await?;
    if ready.is_none() || owns_job.is_none() {
        tx.commit().await?;
        return Ok(());
    }
    r2.put_object(&derivative_key, thumbnail.clone(), "image/jpeg")
        .await?;
    sqlx::query(
        "UPDATE notebook_media_blobs
         SET derivative_key=$2,derivative_bytes=$3,updated_at=now()
         WHERE id=$1 AND state='ready'",
    )
    .bind(&blob.id)
    .bind(&derivative_key)
    .bind(i64::try_from(thumbnail.len())?)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET completed_at=now(),lease_owner=NULL,leased_at=NULL,last_error_code=NULL
         WHERE id=$1 AND lease_owner=$2",
    )
    .bind(job.id)
    .bind(&job.lease_owner)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    log::debug!("created media derivative {derivative_key} ({derivative_hash})");
    Ok(())
}

fn thumbnail_image_file(path: &std::path::Path) -> Result<Vec<u8>> {
    let image = image::ImageReader::open(path)?
        .with_guessed_format()?
        .decode()?;
    let thumbnail = image.thumbnail(640, 640);
    let mut output = Cursor::new(Vec::new());
    thumbnail.write_to(&mut output, ImageFormat::Jpeg)?;
    Ok(output.into_inner())
}

async fn delete(pool: &PgPool, r2: &R2Client, job: &Job) -> Result<()> {
    let Some(blob) = prepare_delete(pool, job).await? else {
        return Ok(());
    };
    if let Some(key) = blob.derivative_key.as_deref() {
        r2.delete_object(key).await?;
    } else {
        let _ = r2
            .delete_object(&format!("{}.thumb", blob.object_key))
            .await;
    }
    r2.delete_object(&blob.object_key).await?;
    let mut tx = pool.begin().await?;
    let locked = sqlx::query(
        "SELECT bytes,quota_counted,user_id FROM notebook_media_blobs
         WHERE id=$1 AND state='deleting' AND lease_owner=$2 FOR UPDATE",
    )
    .bind(&blob.id)
    .bind(&job.lease_owner)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(locked) = locked else {
        tx.commit().await?;
        return Ok(());
    };
    let references: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE blob_id=$1")
            .bind(&blob.id)
            .fetch_one(&mut *tx)
            .await?;
    ensure!(
        references == 0,
        "media blob gained a reference while deleting"
    );
    let quota_counted: bool = locked.try_get("quota_counted")?;
    let bytes: i64 = locked.try_get("bytes")?;
    let user_id: String = locked.try_get("user_id")?;
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET completed_at=now(),lease_owner=NULL,leased_at=NULL,last_error_code=NULL
         WHERE blob_id=$1",
    )
    .bind(&blob.id)
    .execute(&mut *tx)
    .await?;
    let deleted = sqlx::query(
        "DELETE FROM notebook_media_blobs
         WHERE id=$1 AND state='deleting' AND lease_owner=$2",
    )
    .bind(&blob.id)
    .bind(&job.lease_owner)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if deleted == 1 && quota_counted {
        sqlx::query(
            "UPDATE users
             SET media_bytes_used=media_bytes_used-$2,usage_recomputed_at=now()
             WHERE id=$1",
        )
        .bind(&user_id)
        .bind(bytes)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn prepare_delete(pool: &PgPool, job: &Job) -> Result<Option<BlobWork>> {
    let mut tx = pool.begin().await?;
    let row = sqlx::query(
        "SELECT id,object_key,media_type,derivative_key,quota_counted,state,delete_after
         FROM notebook_media_blobs WHERE id=$1 AND user_id=$2 FOR UPDATE",
    )
    .bind(&job.blob_id)
    .bind(&job.user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(row) = row else {
        complete_job_in(&mut tx, job).await?;
        tx.commit().await?;
        return Ok(None);
    };
    let references: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notebook_media_references WHERE blob_id=$1")
            .bind(&job.blob_id)
            .fetch_one(&mut *tx)
            .await?;
    let state: String = row.try_get("state")?;
    let delete_after: Option<chrono::DateTime<chrono::Utc>> = row.try_get("delete_after")?;
    if references > 0
        || state == "ready"
        || delete_after.is_some_and(|due| due > chrono::Utc::now())
    {
        if references > 0 && state == "gc_pending" {
            ensure!(
                row.try_get::<bool, _>("quota_counted")?,
                "uncounted blob has references"
            );
            sqlx::query(
                "UPDATE notebook_media_blobs
                 SET state='ready',delete_after=NULL,updated_at=now() WHERE id=$1",
            )
            .bind(&job.blob_id)
            .execute(&mut *tx)
            .await?;
        }
        complete_job_in(&mut tx, job).await?;
        tx.commit().await?;
        return Ok(None);
    }
    ensure!(
        matches!(state.as_str(), "gc_pending" | "deleting"),
        "blob is not eligible for deletion"
    );
    sqlx::query(
        "UPDATE notebook_media_blobs
         SET state='deleting',lease_owner=$2,leased_at=now(),updated_at=now()
         WHERE id=$1",
    )
    .bind(&job.blob_id)
    .bind(&job.lease_owner)
    .execute(&mut *tx)
    .await?;
    let work = BlobWork {
        id: row.try_get("id")?,
        object_key: row.try_get("object_key")?,
        media_type: row.try_get("media_type")?,
        derivative_key: row.try_get("derivative_key")?,
    };
    tx.commit().await?;
    Ok(Some(work))
}

async fn load_ready_blob(pool: &PgPool, blob_id: &str, user_id: &str) -> Result<BlobWork> {
    let row = sqlx::query(
        "SELECT id,object_key,media_type,derivative_key
         FROM notebook_media_blobs WHERE id=$1 AND user_id=$2 AND state='ready'",
    )
    .bind(blob_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| anyhow!("media blob is not ready"))?;
    Ok(BlobWork {
        id: row.try_get("id")?,
        object_key: row.try_get("object_key")?,
        media_type: row.try_get("media_type")?,
        derivative_key: row.try_get("derivative_key")?,
    })
}

async fn expire_upload(pool: &PgPool, job: &Job) -> Result<()> {
    let mut tx = pool.begin().await?;
    let blob = sqlx::query(
        "SELECT state FROM notebook_media_blobs
         WHERE id=$1 AND user_id=$2 FOR UPDATE",
    )
    .bind(&job.blob_id)
    .bind(&job.user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(blob) = blob else {
        complete_job_in(&mut tx, job).await?;
        tx.commit().await?;
        return Ok(());
    };
    if blob.try_get::<String, _>("state")? == "ready" {
        complete_job_in(&mut tx, job).await?;
        tx.commit().await?;
        return Ok(());
    }
    let uploads = sqlx::query(
        "SELECT id,reserved_bytes FROM notebook_media_uploads
         WHERE blob_id=$1 AND user_id=$2 AND state='uploading' AND expires_at<=now()
         FOR UPDATE",
    )
    .bind(&job.blob_id)
    .bind(&job.user_id)
    .fetch_all(&mut *tx)
    .await?;
    let reserved = uploads.iter().try_fold(0_i64, |sum, row| {
        let value: i64 = row.try_get("reserved_bytes")?;
        sum.checked_add(value)
            .ok_or_else(|| sqlx::Error::Protocol("media reservation exceeds i64".into()))
    })?;
    if uploads.is_empty() {
        complete_job_in(&mut tx, job).await?;
        tx.commit().await?;
        return Ok(());
    }
    sqlx::query(
        "UPDATE notebook_media_uploads
         SET state='expired',reserved_bytes=0,error_code='upload_expired',updated_at=now()
         WHERE blob_id=$1 AND user_id=$2 AND state='uploading' AND expires_at<=now()",
    )
    .bind(&job.blob_id)
    .bind(&job.user_id)
    .execute(&mut *tx)
    .await?;
    let active_upload: Option<String> = sqlx::query_scalar(
        "SELECT id FROM notebook_media_uploads
         WHERE blob_id=$1 AND user_id=$2 AND state='uploading'
         ORDER BY expires_at,id LIMIT 1 FOR UPDATE",
    )
    .bind(&job.blob_id)
    .bind(&job.user_id)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(active_upload) = active_upload {
        sqlx::query(
            "UPDATE notebook_media_uploads
             SET reserved_bytes=reserved_bytes+$2,updated_at=now() WHERE id=$1",
        )
        .bind(active_upload)
        .bind(reserved)
        .execute(&mut *tx)
        .await?;
        complete_job_in(&mut tx, job).await?;
        tx.commit().await?;
        return Ok(());
    }
    sqlx::query(
        "UPDATE users
         SET media_bytes_reserved=media_bytes_reserved-$2,usage_recomputed_at=now()
         WHERE id=$1",
    )
    .bind(&job.user_id)
    .bind(reserved)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM notebook_media_references WHERE blob_id=$1")
        .bind(&job.blob_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE notebook_media_blobs
         SET state='gc_pending',delete_after=now(),upload_expires_at=NULL,
             last_error_code='upload_expired',updated_at=now()
         WHERE id=$1",
    )
    .bind(&job.blob_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO notebook_media_outbox(blob_id,user_id,action,available_at)
         SELECT $1,$2,'delete',now()
         WHERE NOT EXISTS(SELECT 1 FROM notebook_media_outbox
                          WHERE blob_id=$1 AND action='delete' AND completed_at IS NULL)",
    )
    .bind(&job.blob_id)
    .bind(&job.user_id)
    .execute(&mut *tx)
    .await?;
    complete_job_in(&mut tx, job).await?;
    tx.commit().await?;
    Ok(())
}

async fn spool_object(r2: &R2Client, object_key: &str) -> Result<tempfile::NamedTempFile> {
    let temporary = tempfile::NamedTempFile::new()?;
    let file = temporary.reopen()?;
    let mut output = tokio::fs::File::from_std(file);
    let mut body: ByteStream = r2.get_object_stream(object_key, None).await?.body;
    while let Some(bytes) = body.try_next().await? {
        output.write_all(&bytes).await?;
    }
    output.flush().await?;
    Ok(temporary)
}

async fn complete_job(pool: &PgPool, job: &Job) -> Result<()> {
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET completed_at=now(),lease_owner=NULL,leased_at=NULL,last_error_code=NULL
         WHERE id=$1 AND lease_owner=$2",
    )
    .bind(job.id)
    .bind(&job.lease_owner)
    .execute(pool)
    .await?;
    Ok(())
}

async fn complete_job_in(connection: &mut sqlx::PgConnection, job: &Job) -> Result<()> {
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET completed_at=now(),lease_owner=NULL,leased_at=NULL,last_error_code=NULL
         WHERE id=$1 AND lease_owner=$2",
    )
    .bind(job.id)
    .bind(&job.lease_owner)
    .execute(connection)
    .await?;
    Ok(())
}

async fn fail_job(pool: &PgPool, job: &Job, error_code: &str) -> Result<()> {
    let exponent = u32::try_from(job.attempt_count.clamp(0, 8))?;
    let delay = i64::from(2_i32.pow(exponent).min(300));
    sqlx::query(
        "UPDATE notebook_media_outbox
         SET attempt_count=attempt_count+1,available_at=now()+make_interval(secs=>$2),
             lease_owner=NULL,leased_at=NULL,last_error_code=$3
         WHERE id=$1 AND lease_owner=$4",
    )
    .bind(job.id)
    .bind(delay)
    .bind(error_code)
    .bind(&job.lease_owner)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image::{DynamicImage, ImageFormat};

    use super::thumbnail_image_file;

    #[test]
    fn thumbnails_an_extensionless_image_spool() {
        let temporary = tempfile::NamedTempFile::new().unwrap();
        let mut png = Cursor::new(Vec::new());
        DynamicImage::new_rgb8(4, 4)
            .write_to(&mut png, ImageFormat::Png)
            .unwrap();
        std::fs::write(temporary.path(), png.into_inner()).unwrap();

        assert!(thumbnail_image_file(temporary.path()).is_ok());
    }
}
