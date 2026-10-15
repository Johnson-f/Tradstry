use actix_web::{HttpMessage, HttpRequest, error};

use crate::service::auth::AuthClaims;
use crate::service::db::client::{Db, UserDb};
use crate::service::read_service::users::{self, AccountRequired, Provisioning};

/// Resolve the caller of a REST route behind `AuthMiddleware`.
pub(crate) async fn request_user_db(req: &HttpRequest, db: &Db) -> actix_web::Result<UserDb> {
    let claims = req
        .extensions()
        .get::<AuthClaims>()
        .cloned()
        .ok_or_else(|| error::ErrorUnauthorized("Unauthorized"))?;

    let user = users::load_user(
        db,
        &claims.sub,
        claims.full_name(),
        claims.email(),
        Provisioning::from(claims.kind),
    )
    .await
    .map_err(|err| {
        if err.is::<AccountRequired>() {
            error::ErrorForbidden(err.to_string())
        } else {
            error::ErrorUnauthorized(err)
        }
    })?;
    Ok(db.get_user_db(&user.id))
}
