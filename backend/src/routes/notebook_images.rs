use actix_multipart::form::{MultipartForm, tempfile::TempFile, text::Text};
use actix_web::{HttpMessage, HttpRequest, HttpResponse, Result, error, web};
use anyhow::anyhow;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;

use crate::service::db::Db;
use crate::service::db::schema::tables::notebook::images::NotebookImage;
use crate::service::notebook::media::remove_reference_by_id;
use crate::service::read_service::images as image_service;
use crate::service::read_service::users::ensure_user;
use crate::service::upload::notebook::{HashPolicy, NotebookUploadRequest, upload};
use crate::service::upload::r2::R2Client;

// R2/SigV4 presigned URLs max out at 7 days.
const PRESIGN_TTL: Duration = Duration::from_secs(604_800);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadNotebookImageResponse {
    image: NotebookImage,
}

#[derive(Debug, MultipartForm)]
pub struct UploadNotebookImageForm {
    #[multipart(rename = "noteId", limit = "200B")]
    note_id: Text<String>,
    #[multipart(rename = "idempotencyKey", limit = "200B")]
    idempotency_key: Option<Text<String>>,
    #[multipart(limit = "250MB")]
    file: TempFile,
}

/// Overwrite the stored (empty) `secure_url` with a freshly presigned R2 GET
/// URL derived from the object key. Falls back to leaving it empty on failure.
async fn presign(r2: &R2Client, mut image: NotebookImage) -> NotebookImage {
    // Only R2-backed rows store an empty secure_url; rows still on Cloudinary
    // keep their existing URL until migrated (dual-read safety).
    if image.secure_url.is_empty()
        && let Ok(url) = r2
            .presigned_get_url(&image.cloudinary_public_id, PRESIGN_TTL)
            .await
    {
        image.secure_url = url;
    }
    image
}

async fn get_user_db(
    req: &HttpRequest,
    db: &Arc<Db>,
) -> anyhow::Result<crate::service::db::client::UserDb> {
    let jwt = req
        .extensions()
        .get::<ClerkJwt>()
        .cloned()
        .ok_or_else(|| anyhow!("Unauthorized"))?;
    let full_name = jwt
        .other
        .get("full_name")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let email = jwt
        .other
        .get("email")
        .and_then(|value| value.as_str())
        .unwrap_or("");

    let user = ensure_user(db, &jwt.sub, full_name, email).await?;

    Ok(db.get_user_db(&user.id))
}

pub async fn upload_notebook_image(
    req: HttpRequest,
    MultipartForm(form): MultipartForm<UploadNotebookImageForm>,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> Result<HttpResponse> {
    let user_db = get_user_db(&req, db.get_ref())
        .await
        .map_err(error::ErrorUnauthorized)?;
    let image = upload(
        &user_db,
        r2.get_ref(),
        NotebookUploadRequest {
            note_id: form.note_id.into_inner().trim().to_string(),
            idempotency_key: form.idempotency_key.map(Text::into_inner),
            hash_policy: HashPolicy::Compute,
            file_path: form.file.file.path().to_path_buf(),
            file_size: form.file.size,
            original_filename: form.file.file_name,
            declared_content_type: form
                .file
                .content_type
                .map(|mime| mime.essence_str().to_string()),
        },
    )
    .await
    .map_err(super::notebook_media::map_upload_error)?;
    Ok(HttpResponse::Ok().json(UploadNotebookImageResponse { image }))
}

pub async fn get_notebook_image(
    req: HttpRequest,
    path: web::Path<String>,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> Result<HttpResponse> {
    let user_db = get_user_db(&req, db.get_ref())
        .await
        .map_err(error::ErrorUnauthorized)?;
    let image_id = path.into_inner();

    let image = image_service::get_notebook_image(&user_db, &image_id)
        .await
        .map_err(error::ErrorInternalServerError)?
        .ok_or_else(|| error::ErrorNotFound("Notebook media not found"))?;

    let image = presign(r2.get_ref(), image).await;
    Ok(HttpResponse::Ok().json(image))
}

pub async fn delete_notebook_image(
    req: HttpRequest,
    path: web::Path<String>,
    db: web::Data<Arc<Db>>,
) -> Result<HttpResponse> {
    let user_db = get_user_db(&req, db.get_ref())
        .await
        .map_err(error::ErrorUnauthorized)?;
    let image_id = path.into_inner();

    let image = image_service::get_notebook_image(&user_db, &image_id)
        .await
        .map_err(error::ErrorInternalServerError)?
        .ok_or_else(|| error::ErrorNotFound("Notebook media not found"))?;

    remove_reference_by_id(user_db.pool(), user_db.user_id(), &image.id)
        .await
        .map_err(super::notebook_media::map_lifecycle_error)?;

    Ok(HttpResponse::NoContent().finish())
}
