use std::sync::Arc;
use std::time::Duration;

use actix_web::{HttpMessage, HttpRequest, HttpResponse, web};
use anyhow::anyhow;
use clerk_rs::validators::authorizer::ClerkJwt;
use serde_json::Value;
use tracing::error;

use crate::service::db::client::{Db, UserDb};
use crate::service::read_service::users::ensure_user;
use crate::service::upload::r2::R2Client;
use crate::service::users::export::build_export;

const MEDIA_URL_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 7);

/// Returns the per-user database alongside the Clerk id, which analytics needs
/// as the distinct id.
async fn get_user_db(req: &HttpRequest, db: &Arc<Db>) -> anyhow::Result<UserDb> {
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

pub async fn export_user_data(
    req: HttpRequest,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> HttpResponse {
    let Ok(user_db) = get_user_db(&req, db.get_ref()).await else {
        return HttpResponse::Unauthorized().finish();
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
