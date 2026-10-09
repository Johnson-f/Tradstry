use std::sync::Arc;
use std::time::Duration;

use actix_web::{HttpRequest, HttpResponse, web};
use serde_json::Value;
use tracing::error;

use super::auth::request_user_db;
use crate::service::db::client::Db;
use crate::service::upload::r2::R2Client;
use crate::service::users::export::build_export;

const MEDIA_URL_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 7);

pub async fn export_user_data(
    req: HttpRequest,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> HttpResponse {
    let user_db = match request_user_db(&req, db.get_ref()).await {
        Ok(user_db) => user_db,
        Err(err) => return err.error_response(),
    };

    let mut export = match build_export(user_db.connection(), user_db.user_id()).await {
        Ok(value) => value,
        Err(err) => {
            error!(error = %err, "failed to build the user export");
            return HttpResponse::InternalServerError().finish();
        }
    };

    if let Some(images) = export
        .get_mut("notebook_media")
        .and_then(Value::as_array_mut)
    {
        for image in images {
            let Some(key) = image
                .get("object_key")
                .and_then(Value::as_str)
                .map(str::to_owned)
            else {
                continue;
            };
            if let Ok(url) = r2.presigned_get_url(&key, MEDIA_URL_TTL).await {
                image["download_url"] = Value::String(url);
            }
        }
    }

    let filename = format!(
        "tradstry-export-{}.json",
        chrono::Utc::now().format("%Y-%m-%d")
    );

    HttpResponse::Ok()
        .content_type("application/json")
        .insert_header((
            actix_web::http::header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        ))
        .json(export)
}
