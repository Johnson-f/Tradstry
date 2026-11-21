use std::{
    io::Cursor,
    path::{Path as DiskPath, PathBuf},
    time::Duration,
};

use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use image::{ImageFormat, ImageReader, Limits};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use tokio::{fs, io::AsyncWriteExt};
use uuid::Uuid;

use super::service::{TradeError, anchor_fill};
use crate::{
    app::AppState,
    auth::{AuthClaims, TokenKind},
    db::new_id,
    users,
};

const MAX_BYTES: usize = 8 * 1024 * 1024;
// Decoding uses much more memory than the compressed upload.
static DECODERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
const COLLECTION: &str = "/workspaces/{workspace}/trades/{trade}/note-images";
const ITEM: &str = "/workspaces/{workspace}/trades/{trade}/note-images/{image}";

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            COLLECTION,
            post(upload).layer(DefaultBodyLimit::max(MAX_BYTES)),
        )
        .route(ITEM, get(download))
        .route(
            "/workspaces/{workspace}/trades/{trade}/note-images/{image}/discard",
            post(discard_pending),
        )
}

struct ImageError(StatusCode, &'static str);
impl IntoResponse for ImageError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"message": self.1}))).into_response()
    }
}
fn internal(error: impl std::fmt::Display) -> ImageError {
    tracing::error!(%error, "note image storage failed");
    ImageError(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Image storage is unavailable. Try again.",
    )
}
const NOT_FOUND: ImageError = ImageError(StatusCode::NOT_FOUND, "Image or trade not found.");

async fn owner(state: &AppState, claims: &AuthClaims) -> Result<Uuid, ImageError> {
    if claims.kind != TokenKind::Session {
        return Err(ImageError(
            StatusCode::FORBIDDEN,
            "A web session is required.",
        ));
    }
    users::find_by_stytch_id(&state.pool, &claims.sub)
        .await
        .map_err(internal)?
        .map(|user| user.id)
        .ok_or(NOT_FOUND)
}

fn check_image(data: &[u8], declared: &str) -> Result<&'static str, ImageError> {
    let unsupported = || {
        ImageError(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Paste a PNG, JPEG or WebP image.",
        )
    };
    let format = image::guess_format(data).map_err(|_| unsupported())?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => return Err(unsupported()),
    };
    if mime != declared {
        return Err(unsupported());
    }
    let invalid = |_| {
        ImageError(
            StatusCode::UNPROCESSABLE_ENTITY,
            "This image is damaged or too large to open.",
        )
    };
    let (w, h) = ImageReader::with_format(Cursor::new(data), format)
        .into_dimensions()
        .map_err(invalid)?;
    if w == 0 || h == 0 || w > 8192 || h > 8192 || u64::from(w) * u64::from(h) > 24_000_000 {
        return Err(ImageError(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Image dimensions exceed the supported size.",
        ));
    }
    let mut reader = ImageReader::with_format(Cursor::new(data), format);
    let mut limits = Limits::default();
    limits.max_alloc = Some(128 * 1024 * 1024);
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    reader.limits(limits);
    reader.decode().map_err(invalid)?;
    Ok(mime)
}

fn file_path(dir: &DiskPath, id: Uuid, mime: &str) -> PathBuf {
    let extension = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => unreachable!(),
    };
    dir.join(format!("{id}.{extension}"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadQuery {
    request_id: Uuid,
}

async fn upload(
    State(state): State<AppState>,
    claims: AuthClaims,
    Path((workspace, trade)): Path<(Uuid, String)>,
    Query(query): Query<UploadQuery>,
    headers: HeaderMap,
    data: Bytes,
) -> Result<Json<Value>, ImageError> {
    let user = owner(&state, &claims).await?;
    anchor_fill(&state.pool, user, workspace, &trade)
        .await
        .map_err(|e| match e {
            TradeError::NotFound => NOT_FOUND,
            other => internal(other),
        })?;
    let declared = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let permit = DECODERS.acquire().await.map_err(internal)?;
    let (data, mime, digest) = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let mime = check_image(&data, &declared)?;
        let digest = Sha256::digest(&data).to_vec();
        Ok::<_, ImageError>((data, mime, digest))
    })
    .await
    .map_err(internal)??;

    // Reserve a durable record first: a retry can finish an interrupted write, and cleanup can find it.
    sqlx::query("INSERT INTO trade_note_images (id, user_id, workspace_id, source_trade_id, request_id, digest, media_type)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, request_id) DO NOTHING")
        .bind(new_id()).bind(user).bind(workspace).bind(&trade).bind(query.request_id).bind(&digest).bind(mime)
        .execute(&state.pool).await.map_err(internal)?;
    let mut tx = state.pool.begin().await.map_err(internal)?;
    let (id, ready): (Uuid, bool) = sqlx::query_as("SELECT id, ready FROM trade_note_images
        WHERE user_id=$1 AND request_id=$2 AND workspace_id=$3 AND source_trade_id=$4 AND digest=$5 FOR UPDATE")
        .bind(user).bind(query.request_id).bind(workspace).bind(trade).bind(digest)
        .fetch_optional(&mut *tx).await.map_err(internal)?
        .ok_or(ImageError(StatusCode::CONFLICT, "This upload ID already belongs to a different image."))?;
    if !ready {
        fs::create_dir_all(&state.note_images_dir)
            .await
            .map_err(internal)?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut file = options
            .open(file_path(&state.note_images_dir, id, mime))
            .await
            .map_err(internal)?;
        file.write_all(&data).await.map_err(internal)?;
        file.sync_all().await.map_err(internal)?;
        sqlx::query("UPDATE trade_note_images SET ready=true WHERE id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(internal)?;
    }
    tx.commit().await.map_err(internal)?;
    Ok(Json(json!({"imageId": id})))
}

async fn download(
    State(state): State<AppState>,
    claims: AuthClaims,
    Path((workspace, trade, id)): Path<(Uuid, String, Uuid)>,
) -> Result<Response, ImageError> {
    let user = owner(&state, &claims).await?;
    let mime: String = sqlx::query_scalar("SELECT i.media_type FROM trade_note_images i
        JOIN trades t ON t.id=$3 AND t.workspace_id=$2 AND t.user_id=$1
        LEFT JOIN trade_annotations a ON a.id=i.annotation_id AND a.user_id=t.user_id AND a.workspace_id=t.workspace_id
        WHERE i.id=$4 AND i.user_id=$1 AND i.ready AND (i.delete_after IS NULL OR i.delete_after>now()) AND
          ((a.trade_id=t.id AND a.orphaned_at IS NULL) OR
           (i.annotation_id IS NULL AND i.workspace_id=$2 AND i.source_trade_id=t.id AND i.delete_after>now()))")
        .bind(user).bind(workspace).bind(trade).bind(id).fetch_optional(&state.pool).await.map_err(internal)?.ok_or(NOT_FOUND)?;
    let bytes = fs::read(file_path(&state.note_images_dir, id, &mime))
        .await
        .map_err(internal)?;
    Ok((
        [
            (header::CONTENT_TYPE, mime.as_str()),
            (header::CACHE_CONTROL, "private, no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        bytes,
    )
        .into_response())
}

// Only the uploading editor can discard an image that has not made it into a saved note.
// Once attached, removal goes through the note's version-checked save instead.
async fn discard_pending(
    State(state): State<AppState>,
    claims: AuthClaims,
    Path((workspace, trade, id)): Path<(Uuid, String, Uuid)>,
) -> Result<StatusCode, ImageError> {
    let user = owner(&state, &claims).await?;
    let discarded = sqlx::query("UPDATE trade_note_images SET delete_after=now()
        WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND source_trade_id=$4 AND annotation_id IS NULL")
        .bind(id).bind(user).bind(workspace).bind(trade).execute(&state.pool).await.map_err(internal)?;
    if discarded.rows_affected() > 0 {
        cleanup(&state.pool, &state.note_images_dir, Some(&[id]))
            .await
            .map_err(internal)?;
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn attach(
    tx: &mut Transaction<'_, Postgres>,
    user: Uuid,
    workspace: Uuid,
    trade: &str,
    annotation: Uuid,
    document: &Value,
) -> Result<Vec<Uuid>, TradeError> {
    fn collect(node: &Value, ids: &mut Vec<Uuid>) {
        if node["type"] == "note-image"
            && let Some(id) = node["imageId"]
                .as_str()
                .and_then(|v| Uuid::parse_str(v).ok())
        {
            ids.push(id);
        }
        if let Some(children) = node["children"].as_array() {
            for child in children {
                collect(child, ids);
            }
        }
    }
    let mut ids = Vec::new();
    collect(&document["root"], &mut ids);
    ids.sort_unstable();
    ids.dedup();
    if !ids.is_empty() {
        let bound = sqlx::query("UPDATE trade_note_images SET annotation_id=$1, workspace_id=$2, delete_after=NULL
            WHERE id=ANY($3) AND user_id=$4 AND ready AND (delete_after IS NULL OR delete_after>now()) AND (annotation_id=$1 OR
              (annotation_id IS NULL AND workspace_id=$2 AND source_trade_id=$5 AND delete_after>now()))")
            .bind(annotation).bind(workspace).bind(&ids).bind(user).bind(trade).execute(&mut **tx).await?;
        if bound.rows_affected() != ids.len() as u64 {
            return Err(TradeError::Invalid(
                "INVALID_NOTE_IMAGE",
                "An image is unavailable for this note.".into(),
            ));
        }
    }
    let removed = sqlx::query_scalar(
        "UPDATE trade_note_images SET delete_after=now()
                 WHERE annotation_id=$1 AND delete_after IS NULL AND NOT (id=ANY($2)) RETURNING id",
    )
    .bind(annotation)
    .bind(ids)
    .fetch_all(&mut **tx)
    .await?;
    Ok(removed)
}

/// The note transaction has committed. Files are no longer readable or attachable,
/// even if the process stops before unlinking them. The sweeper retries failed unlinks.
pub(super) async fn purge_removed(pool: &PgPool, dir: &DiskPath, removed: &[Uuid]) {
    if !removed.is_empty()
        && let Err(error) = cleanup(pool, dir, Some(removed)).await
    {
        tracing::warn!(%error, "note saved; disk image deletion will be retried");
    }
}

pub fn start_cleanup(pool: PgPool, dir: PathBuf) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(error) = cleanup(&pool, &dir, None).await {
                tracing::warn!(%error, "note image cleanup failed");
            }
        }
    });
}

async fn cleanup(pool: &PgPool, dir: &DiskPath, only: Option<&[Uuid]>) -> anyhow::Result<()> {
    loop {
        let mut tx = pool.begin().await?;
        let expired: Vec<(Uuid, String)> = sqlx::query_as(
            "SELECT id, media_type FROM trade_note_images
            WHERE ($1::uuid[] IS NULL OR id=ANY($1)) AND
               (user_id IS NULL OR workspace_id IS NULL OR delete_after<=now()
               OR (annotation_id IS NULL AND delete_after IS NULL))
            ORDER BY id LIMIT 64 FOR UPDATE",
        )
        .bind(only)
        .fetch_all(&mut *tx)
        .await?;
        if expired.is_empty() {
            return Ok(());
        }
        for (id, mime) in expired {
            match fs::remove_file(file_path(dir, id, &mime)).await {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.into()),
            }
            sqlx::query("DELETE FROM trade_note_images WHERE id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
    }
}
