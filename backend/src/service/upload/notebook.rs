use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, ensure};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::service::db::client::UserDb;
use crate::service::db::schema::tables::notebook::images::NotebookImage;
use crate::service::notebook::media::{
    FinalizeMediaInput, MediaLifecycleError, ReserveMediaUploadInput, finalize_upload,
    reserve_upload,
};
use crate::service::read_service::images as image_service;
use crate::service::upload::r2::R2Client;

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES: usize = 250 * 1024 * 1024;
const PRESIGN_TTL: Duration = Duration::from_secs(604_800);

#[derive(Debug, Error)]
pub enum NotebookUploadError {
    #[error("{0}")]
    Validation(String),
    #[error(transparent)]
    Lifecycle(#[from] MediaLifecycleError),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

#[derive(Clone, Debug)]
pub enum HashPolicy {
    ClientDeclared(String),
    Compute,
}

#[derive(Clone, Debug)]
pub struct NotebookUploadRequest {
    pub note_id: String,
    pub idempotency_key: Option<String>,
    pub hash_policy: HashPolicy,
    pub file_path: PathBuf,
    pub file_size: usize,
    pub original_filename: Option<String>,
    pub declared_content_type: Option<String>,
}

pub async fn upload(
    user_db: &UserDb,
    r2: &R2Client,
    request: NotebookUploadRequest,
) -> Result<NotebookImage, NotebookUploadError> {
    let filename = normalize_filename(request.original_filename.as_deref());
    let declared_type = request
        .declared_content_type
        .as_deref()
        .unwrap_or("application/octet-stream");
    let inspected = inspect_media(&request.file_path, declared_type)
        .await
        .map_err(|error| NotebookUploadError::Validation(error.to_string()))?;
    validate_size(request.file_size, &inspected.content_type)?;

    let computed_hash = hash_file(&request.file_path).await?;
    let hash = match request.hash_policy {
        HashPolicy::ClientDeclared(expected) if expected == computed_hash => expected,
        HashPolicy::ClientDeclared(_) => {
            return Err(NotebookUploadError::Validation("hash mismatch".to_string()));
        }
        HashPolicy::Compute => computed_hash,
    };
    let byte_len = i64::try_from(request.file_size)
        .map_err(|_| NotebookUploadError::Validation("File size exceeds i64".to_string()))?;
    let idempotency_key = request
        .idempotency_key
        .unwrap_or_else(|| format!("legacy:{}", uuid::Uuid::new_v4()));

    let reserved = reserve_upload(
        user_db.pool(),
        user_db.user_id(),
        ReserveMediaUploadInput {
            note_id: request.note_id.clone(),
            idempotency_key,
            content_hash: hash.clone(),
            expected_bytes: byte_len,
            content_type: inspected.content_type.clone(),
            original_filename: filename,
        },
    )
    .await?;

    if !reserved.already_ready {
        log::info!(
            "Uploading notebook media: user_id={} note_id={} hash={} type={}",
            user_db.user_id(),
            request.note_id,
            hash,
            inspected.content_type
        );
        let stored = r2
            .put_file_immutable(
                &reserved.object_key,
                &request.file_path,
                &inspected.content_type,
                &hash,
                byte_len,
            )
            .await
            .map_err(NotebookUploadError::Internal)?;
        finalize_upload(
            user_db.pool(),
            user_db.user_id(),
            &reserved.upload_id,
            FinalizeMediaInput {
                etag: stored.etag,
                width: inspected.width,
                height: inspected.height,
                duration_seconds: inspected.duration_seconds,
                format: inspected.format,
                content_type: inspected.content_type,
            },
        )
        .await?;
    }

    let image = image_service::find_notebook_image_for_note_hash(user_db, &request.note_id, &hash)
        .await
        .map_err(NotebookUploadError::Internal)?
        .ok_or_else(|| anyhow!("Media reference was not mirrored"))?;
    Ok(presign(r2, image).await)
}

pub fn media_key(user_id: &str, hash: &str) -> String {
    format!("notebook/{user_id}/media/{hash}")
}

pub fn verify_hash(bytes: &[u8], expected_hex: &str) -> anyhow::Result<()> {
    let got = hex::encode(Sha256::digest(bytes));
    ensure!(
        got == expected_hex,
        "hash mismatch: computed {got}, client sent {expected_hex}"
    );
    Ok(())
}

async fn hash_file(path: &Path) -> anyhow::Result<String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let mut file = std::fs::File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = file.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        Ok(hex::encode(hasher.finalize()))
    })
    .await
    .map_err(|error| anyhow!("hash task failed: {error}"))?
}

struct InspectedMedia {
    content_type: String,
    format: String,
    width: i64,
    height: i64,
    duration_seconds: f64,
}

async fn inspect_media(path: &Path, declared_type: &str) -> anyhow::Result<InspectedMedia> {
    if declared_type.starts_with("video/") {
        ensure!(
            matches!(
                declared_type,
                "video/mp4" | "video/webm" | "video/quicktime"
            ),
            "Unsupported video type"
        );
        let metadata = crate::service::upload::media::probe_video_file(path).await?;
        return Ok(InspectedMedia {
            content_type: declared_type.to_string(),
            format: declared_type
                .rsplit('/')
                .next()
                .unwrap_or_default()
                .to_string(),
            width: metadata.width,
            height: metadata.height,
            duration_seconds: metadata.duration_seconds,
        });
    }

    let reader = image::ImageReader::open(path)?.with_guessed_format()?;
    let image_format = reader
        .format()
        .ok_or_else(|| anyhow!("Unknown image format"))?;
    let (content_type, format) = match image_format {
        image::ImageFormat::Jpeg => ("image/jpeg", "jpeg"),
        image::ImageFormat::Png => ("image/png", "png"),
        image::ImageFormat::Gif => ("image/gif", "gif"),
        image::ImageFormat::WebP => ("image/webp", "webp"),
        image::ImageFormat::Avif => ("image/avif", "avif"),
        _ => return Err(anyhow!("Unsupported image type")),
    };
    let dimensions = imagesize::size(path)?;
    Ok(InspectedMedia {
        content_type: content_type.to_string(),
        format: format.to_string(),
        width: i64::try_from(dimensions.width)?,
        height: i64::try_from(dimensions.height)?,
        duration_seconds: 0.0,
    })
}

fn validate_size(size: usize, content_type: &str) -> Result<(), NotebookUploadError> {
    let max_bytes = if content_type.starts_with("video/") {
        MAX_VIDEO_BYTES
    } else {
        MAX_IMAGE_BYTES
    };
    if size == 0 || size > max_bytes {
        return Err(NotebookUploadError::Validation(format!(
            "File exceeds the {}MB upload limit",
            max_bytes / (1024 * 1024)
        )));
    }
    Ok(())
}

fn normalize_filename(filename: Option<&str>) -> String {
    filename
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("upload")
        .chars()
        .take(255)
        .collect()
}

async fn presign(r2: &R2Client, mut image: NotebookImage) -> NotebookImage {
    if image.secure_url.is_empty()
        && let Ok(url) = r2.presigned_get_url(&image.object_key, PRESIGN_TTL).await
    {
        image.secure_url = url;
    }
    image
}

#[cfg(test)]
mod tests {
    use super::{MAX_IMAGE_BYTES, NotebookUploadError, normalize_filename, validate_size};

    #[test]
    fn normalizes_upload_filenames() {
        assert_eq!(normalize_filename(Some("  chart.png  ")), "chart.png");
        assert_eq!(normalize_filename(Some("  ")), "upload");
        assert_eq!(normalize_filename(None), "upload");
    }

    #[test]
    fn enforces_image_upload_limits() {
        assert!(validate_size(MAX_IMAGE_BYTES, "image/png").is_ok());
        assert!(matches!(
            validate_size(MAX_IMAGE_BYTES + 1, "image/png"),
            Err(NotebookUploadError::Validation(_))
        ));
        assert!(validate_size(0, "image/png").is_err());
    }
}
