use actix_web::http::header;
use actix_web::{HttpMessage, HttpRequest, error};
use clerk_rs::validators::authorizer::ClerkJwt;

use crate::service::db::client::{Db, UserDb};
use crate::service::read_service::users::{self, AccountRequired, Provisioning};

/// The provisioning rule for the token `ClerkMiddleware` validated. It reads the
/// `Authorization` header when present and only otherwise the `__session` cookie,
/// so this must classify the same token or a connected app's token could be
/// smuggled through the cookie to sign up.
pub(crate) fn provisioning(req: &HttpRequest) -> Provisioning {
    let token = match req.headers().get(header::AUTHORIZATION) {
        Some(value) => value
            .to_str()
            .ok()
            .map(|value| value.replace("Bearer ", "")),
        None => req
            .cookie("__session")
            .map(|cookie| cookie.value().to_owned()),
    };
    token.map_or(Provisioning::ExistingOnly, |token| {
        Provisioning::for_token(&token)
    })
}

/// Resolve the caller of a REST route behind `ClerkMiddleware`.
pub(crate) async fn request_user_db(req: &HttpRequest, db: &Db) -> actix_web::Result<UserDb> {
    let jwt = req
        .extensions()
        .get::<ClerkJwt>()
        .cloned()
        .ok_or_else(|| error::ErrorUnauthorized("Unauthorized"))?;
    let claim = |name: &str| {
        jwt.other
            .get(name)
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_owned()
    };

    let user = users::load_user(
        db,
        &jwt.sub,
        &claim("full_name"),
        &claim("email"),
        provisioning(req),
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

#[cfg(test)]
mod tests {
    use actix_web::cookie::Cookie;
    use actix_web::test::TestRequest;
    use base64::Engine as _;

    use super::*;

    fn token(typ: &str) -> String {
        let encode = |bytes: &[u8]| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
        let header = serde_json::json!({"alg": "RS256", "typ": typ}).to_string();
        format!("{}.{}.sig", encode(header.as_bytes()), encode(b"{}"))
    }

    #[test]
    fn web_session_tokens_may_sign_up() {
        let header = TestRequest::default()
            .insert_header((header::AUTHORIZATION, format!("Bearer {}", token("JWT"))))
            .to_http_request();
        assert_eq!(provisioning(&header), Provisioning::CreateIfMissing);

        let cookie = TestRequest::default()
            .cookie(Cookie::new("__session", token("JWT")))
            .to_http_request();
        assert_eq!(provisioning(&cookie), Provisioning::CreateIfMissing);
    }

    #[test]
    fn oauth_access_tokens_never_sign_up() {
        let header = TestRequest::default()
            .insert_header((header::AUTHORIZATION, format!("Bearer {}", token("at+jwt"))))
            .to_http_request();
        assert_eq!(provisioning(&header), Provisioning::ExistingOnly);

        let cookie = TestRequest::default()
            .cookie(Cookie::new("__session", token("at+jwt")))
            .to_http_request();
        assert_eq!(provisioning(&cookie), Provisioning::ExistingOnly);
    }

    #[test]
    fn classifies_the_header_token_the_middleware_validated() {
        let req = TestRequest::default()
            .insert_header((header::AUTHORIZATION, format!("Bearer {}", token("at+jwt"))))
            .cookie(Cookie::new("__session", token("JWT")))
            .to_http_request();
        assert_eq!(provisioning(&req), Provisioning::ExistingOnly);
    }

    #[test]
    fn requests_without_a_token_never_sign_up() {
        assert_eq!(
            provisioning(&TestRequest::default().to_http_request()),
            Provisioning::ExistingOnly
        );
    }
}
