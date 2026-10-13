use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, web};
use serde_json::Value;
use tracing::{error, info, warn};

use crate::service::db::client::Db;
use crate::service::db::schema::tables::users_table;
use crate::service::upload::r2::R2Client;
use crate::service::users::purge::purge_user;
use crate::service::webhooks::svix::verify_svix_signature;

/// Stytch names the event in the Svix envelope, not the body. The body of both
/// `direct.user.delete` and `dashboard.user.delete` is a user DELETE.
pub fn deleted_user_id(payload: &Value) -> Option<&str> {
    let text = |name: &str| payload.get(name).and_then(Value::as_str);
    if text("object_type")? != "user" || !text("action")?.eq_ignore_ascii_case("delete") {
        return None;
    }
    text("id")
}

fn header<'a>(req: &'a HttpRequest, name: &str) -> Option<&'a str> {
    req.headers().get(name)?.to_str().ok()
}

pub async fn stytch_webhook(
    req: HttpRequest,
    body: web::Bytes,
    db: web::Data<Arc<Db>>,
    r2: web::Data<Arc<R2Client>>,
) -> HttpResponse {
    let Ok(secret) = std::env::var("STYTCH_WEBHOOK_SECRET") else {
        error!("STYTCH_WEBHOOK_SECRET is not set; refusing the webhook");
        return HttpResponse::InternalServerError().finish();
    };

    let (Some(svix_id), Some(timestamp), Some(signature)) = (
        header(&req, "svix-id"),
        header(&req, "svix-timestamp"),
        header(&req, "svix-signature"),
    ) else {
        return HttpResponse::BadRequest().body("missing svix headers");
    };

    let now = chrono::Utc::now().timestamp();
    if let Err(err) = verify_svix_signature(&secret, svix_id, timestamp, signature, &body, now) {
        warn!(error = %err, "rejected a stytch webhook");
        return HttpResponse::Unauthorized().finish();
    }

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return HttpResponse::BadRequest().body("body is not json");
    };

    let Some(stytch_user_id) = deleted_user_id(&payload) else {
        return HttpResponse::Ok().finish();
    };

    let user_id = match users_table::find_by_stytch_user_id(db.connection(), stytch_user_id).await {
        Ok(Some(user)) => user.id,
        Ok(None) => return HttpResponse::Ok().finish(),
        Err(err) => {
            error!(error = %err, "failed to look up the deleted user");
            return HttpResponse::InternalServerError().finish();
        }
    };

    // A 500 makes Svix retry, rather than silently leaking blobs.
    match purge_user(db.connection(), r2.get_ref(), &user_id).await {
        Ok(_) => {
            info!(user_id = %user_id, "purged a deleted stytch user");
            HttpResponse::Ok().finish()
        }
        Err(err) => {
            error!(error = %err, "failed to purge the deleted user");
            HttpResponse::InternalServerError().finish()
        }
    }
}
