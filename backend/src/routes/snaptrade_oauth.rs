use std::sync::Arc;

use actix_web::{HttpResponse, web};
use serde::Deserialize;

use crate::service::brokerage::client::BrokerageClient;
use crate::service::brokerage::oauth::{self, SnapTradeOAuthConfig};
use crate::service::db::Db;

#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

pub async fn callback(
    query: web::Query<OAuthCallbackQuery>,
    db: web::Data<Arc<Db>>,
    brokerage: web::Data<Arc<BrokerageClient>>,
    config: web::Data<SnapTradeOAuthConfig>,
) -> HttpResponse {
    let state = query.state.as_deref().unwrap_or_default();
    let result = oauth::callback(
        db.pool(),
        brokerage.get_ref(),
        config.get_ref(),
        state,
        query.code.as_deref(),
        query.error.as_deref(),
    )
    .await;
    match result {
        Ok(result) => {
            if result.platform == "desktop" {
                let message = if result.status == "authorized" {
                    "SnapTrade access approved. You can close this window and return to Tradstry."
                } else {
                    "SnapTrade access was not approved. You can close this window and return to Tradstry."
                };
                return HttpResponse::Ok()
                    .content_type("text/html; charset=utf-8")
                    .body(format!(
                        "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Tradstry</title></head><body><main><h1>Return to Tradstry</h1><p>{message}</p></main></body></html>"
                    ));
            }
            match config.return_url(&result.attempt_id, &result.status) {
                Ok(location) => HttpResponse::Found()
                    .append_header(("Location", location))
                    .finish(),
                Err(error) => {
                    log::error!("SnapTrade OAuth return URL is invalid: {error}");
                    HttpResponse::InternalServerError().finish()
                }
            }
        }
        Err(error) => {
            log::warn!("rejected SnapTrade OAuth callback: {error}");
            HttpResponse::BadRequest().body("This SnapTrade authorization is invalid or expired.")
        }
    }
}
