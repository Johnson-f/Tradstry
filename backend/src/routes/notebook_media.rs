use actix_multipart::form::{MultipartForm, tempfile::TempFile, text::Text};
use actix_web::http::{StatusCode, header};
use actix_web::{HttpMessage, HttpRequest, HttpResponse, Result, error, web};
use anyhow::anyhow;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::service::db::Db;
use crate::service::db::schema::tables::notebook::images::NotebookImage;
use crate::service::notebook::media::{MediaLifecycleError, remove_reference, storage_keys};
use crate::service::read_service::images as image_service;
use crate::service::read_service::users::ensure_user;
use crate::service::upload::notebook::{
    HashPolicy, NotebookUploadError, NotebookUploadRequest, upload,
};
use crate::service::upload::r2::R2Client;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadNotebookMediaResponse {
    image: NotebookImage,
}

#[derive(Debug, MultipartForm)]
pub struct UploadNotebookMediaForm {
    #[multipart(rename = "noteId", limit = "200B")]
    note_id: Text<String>,
    #[multipart(limit = "64B")]
    hash: Text<String>,
    #[multipart(rename = "idempotencyKey", limit = "200B")]
    idempotency_key: Option<Text<String>>,
    #[multipart(limit = "250MB")]
    file: TempFile,
}

#[derive(Deserialize)]
pub struct DeleteQuery {
    note_id: Option<String>,
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

pub async fn upload_notebook_media(
    req: HttpRequest,
    MultipartForm(form): MultipartForm<UploadNotebookMediaForm>,
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
            hash_policy: HashPolicy::ClientDeclared(form.hash.into_inner().trim().to_string()),
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
    .map_err(map_upload_error)?;
    Ok(HttpResponse::Ok().json(UploadNotebookMediaResponse { image }))
}

pub(super) fn map_upload_error(error: NotebookUploadError) -> actix_web::Error {
    match error {
        NotebookUploadError::Validation(message) => error::ErrorBadRequest(message),
        NotebookUploadError::Lifecycle(error) => map_lifecycle_error(error),
        NotebookUploadError::Internal(error) => error::ErrorInternalServerError(error),
    }
}

pub(super) fn map_lifecycle_error(error: MediaLifecycleError) -> actix_web::Error {
    match error {
        MediaLifecycleError::Validation(message) => error::ErrorBadRequest(message),
        MediaLifecycleError::NotFound => error::ErrorNotFound("Notebook media not found"),
        MediaLifecycleError::Conflict | MediaLifecycleError::Deleting => {
            error::ErrorConflict(error.to_string())
        }
        MediaLifecycleError::QuotaExceeded => error::ErrorForbidden(error.to_string()),
        MediaLifecycleError::Database(_) => error::ErrorInternalServerError(error),
    }
}

pub async fn get_notebook_media(
    req: HttpRequest,
    path: web::Path<String>,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> Result<HttpResponse> {
    let user_db = get_user_db(&req, db.get_ref())
        .await
        .map_err(error::ErrorUnauthorized)?;
    let hash = path.into_inner();

    let image = image_service::find_notebook_image_by_hash(&user_db, &hash)
        .await
        .map_err(error::ErrorInternalServerError)?
        .ok_or_else(|| error::ErrorNotFound("Notebook media not found"))?;

    let range = request_range(&req, image.bytes)?;
    let object = r2
        .get_object_stream(&image.object_key, range.as_deref())
        .await
        .map_err(error::ErrorInternalServerError)?;
    Ok(stream_response(object, &image.content_type))
}

pub async fn get_notebook_media_thumb(
    req: HttpRequest,
    path: web::Path<String>,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> Result<HttpResponse> {
    let user_db = get_user_db(&req, db.get_ref())
        .await
        .map_err(error::ErrorUnauthorized)?;
    let hash = path.into_inner();

    let image = image_service::find_notebook_image_by_hash(&user_db, &hash)
        .await
        .map_err(error::ErrorInternalServerError)?
        .ok_or_else(|| error::ErrorNotFound("Notebook media not found"))?;

    let storage = storage_keys(user_db.pool(), user_db.user_id(), &hash)
        .await
        .map_err(map_lifecycle_error)?;
    let thumbnail_key = storage
        .and_then(|storage| storage.derivative_key)
        .unwrap_or_else(|| format!("{}.thumb", image.object_key));
    let object = r2
        .get_object_stream(&thumbnail_key, None)
        .await
        .map_err(|_| error::ErrorNotFound("Thumbnail not found"))?;
    Ok(stream_response(object, "image/jpeg"))
}

fn request_range(req: &HttpRequest, length: i64) -> Result<Option<String>> {
    let Some(value) = req.headers().get(header::RANGE) else {
        return Ok(None);
    };
    let value = value
        .to_str()
        .map_err(|_| error::ErrorBadRequest("Invalid Range header"))?;
    if value.len() > 100 || !value.starts_with("bytes=") || value.contains(',') || length <= 0 {
        return Err(range_not_satisfiable(length));
    }
    let range = &value[6..];
    let (start, end) = range
        .split_once('-')
        .ok_or_else(|| range_not_satisfiable(length))?;
    let (start, end) = if start.is_empty() {
        let suffix = end
            .parse::<i64>()
            .ok()
            .filter(|suffix| *suffix > 0)
            .ok_or_else(|| range_not_satisfiable(length))?;
        (length.saturating_sub(suffix), length - 1)
    } else {
        let start = start
            .parse::<i64>()
            .ok()
            .filter(|start| *start >= 0 && *start < length)
            .ok_or_else(|| range_not_satisfiable(length))?;
        let end = if end.is_empty() {
            length - 1
        } else {
            end.parse::<i64>()
                .ok()
                .filter(|end| *end >= start)
                .map(|end| end.min(length - 1))
                .ok_or_else(|| range_not_satisfiable(length))?
        };
        (start, end)
    };
    Ok(Some(format!("bytes={start}-{end}")))
}

fn range_not_satisfiable(length: i64) -> actix_web::Error {
    error::InternalError::from_response(
        "Range not satisfiable",
        HttpResponse::RangeNotSatisfiable()
            .insert_header((header::CONTENT_RANGE, format!("bytes */{}", length.max(0))))
            .finish(),
    )
    .into()
}

fn stream_response(
    object: crate::service::upload::r2::StreamedObject,
    fallback_type: &str,
) -> HttpResponse {
    let status = if object.content_range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let mut response = HttpResponse::build(status);
    response.content_type(object.content_type.as_deref().unwrap_or(fallback_type));
    response.insert_header((header::CONTENT_LENGTH, object.content_length));
    response.insert_header((
        header::ACCEPT_RANGES,
        object.accept_ranges.as_deref().unwrap_or("bytes"),
    ));
    if let Some(value) = object.content_range {
        response.insert_header((header::CONTENT_RANGE, value));
    }
    if let Some(value) = object.etag {
        response.insert_header((header::ETAG, value));
    }
    let stream = futures_util::stream::unfold(Some(object.body), |state| async move {
        let mut body = state?;
        match body.try_next().await {
            Ok(Some(bytes)) => Some((Ok::<_, actix_web::Error>(bytes), Some(body))),
            Ok(None) => None,
            Err(error) => Some((Err(error::ErrorBadGateway(error.to_string())), None)),
        }
    });
    response.streaming(stream)
}

pub async fn delete_notebook_media(
    req: HttpRequest,
    path: web::Path<String>,
    query: web::Query<DeleteQuery>,
    db: web::Data<Arc<Db>>,
) -> Result<HttpResponse> {
    let user_db = get_user_db(&req, db.get_ref())
        .await
        .map_err(error::ErrorUnauthorized)?;
    let hash = path.into_inner();
    let note_id = query
        .into_inner()
        .note_id
        .ok_or_else(|| error::ErrorBadRequest("noteId query parameter is required"))?;

    remove_reference(user_db.pool(), user_db.user_id(), &note_id, &hash)
        .await
        .map_err(map_lifecycle_error)?;

    Ok(HttpResponse::NoContent().finish())
}

#[cfg(test)]
mod tests {
    use actix_web::http::StatusCode;

    use super::request_range;

    #[test]
    fn normalizes_single_byte_ranges() {
        let request = actix_web::test::TestRequest::default()
            .insert_header(("range", "bytes=10-"))
            .to_http_request();
        assert_eq!(
            request_range(&request, 100).unwrap().as_deref(),
            Some("bytes=10-99")
        );

        let request = actix_web::test::TestRequest::default()
            .insert_header(("range", "bytes=-20"))
            .to_http_request();
        assert_eq!(
            request_range(&request, 100).unwrap().as_deref(),
            Some("bytes=80-99")
        );
    }

    #[test]
    fn rejects_unsatisfiable_ranges() {
        let request = actix_web::test::TestRequest::default()
            .insert_header(("range", "bytes=100-200"))
            .to_http_request();
        let response = request_range(&request, 100).unwrap_err().error_response();
        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(
            response.headers().get("content-range").unwrap(),
            "bytes */100"
        );
    }
}
