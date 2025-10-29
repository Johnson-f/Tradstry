use actix_web::{web, HttpResponse, Result, HttpRequest};
use serde::Serialize;
use std::sync::Arc;

use crate::{
    turso::AppState,
    service::market_engine::{client::MarketClient, health, hours, quotes, historical, movers, news, indices, sectors, search as search_svc, indicators, ws_proxy::MarketWsProxy},
};

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self { Self { success: true, data: Some(data), error: None } }
    pub fn error(err: String) -> Self { Self { success: false, data: None, error: Some(err) } }
}

fn client_from_state(app_state: &web::Data<AppState>) -> anyhow::Result<MarketClient> {
    MarketClient::new(&app_state.config.finance_query)
}

pub async fn get_health(app_state: web::Data<AppState>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match health::get_health(&client).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

pub async fn get_hours(app_state: web::Data<AppState>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match hours::get_hours(&client).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

#[derive(serde::Deserialize)]
pub struct QuotesQuery { symbols: Option<String> }

pub async fn get_quotes_handler(app_state: web::Data<AppState>, query: web::Query<QuotesQuery>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    let symbols: Vec<String> = query
        .symbols
        .as_deref()
        .unwrap_or("")
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|s| s.trim().to_uppercase())
        .collect();
    match quotes::get_quotes(&client, &symbols).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

#[derive(serde::Deserialize)]
pub struct HistoricalQuery { symbol: String, range: Option<String>, interval: Option<String> }

pub async fn get_historical_handler(app_state: web::Data<AppState>, query: web::Query<HistoricalQuery>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match historical::get_historical(&client, &query.symbol, query.range.as_deref(), query.interval.as_deref()).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

pub async fn get_movers_handler(app_state: web::Data<AppState>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match movers::get_movers(&client).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

#[derive(serde::Deserialize)]
pub struct NewsQuery { symbol: Option<String>, limit: Option<u32> }

pub async fn get_news_handler(app_state: web::Data<AppState>, query: web::Query<NewsQuery>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match news::get_news(&client, query.symbol.as_deref(), query.limit).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

pub async fn get_indices_handler(app_state: web::Data<AppState>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match indices::get_indices(&client).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

pub async fn get_sectors_handler(app_state: web::Data<AppState>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match sectors::get_sectors(&client).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

#[derive(serde::Deserialize)]
pub struct SearchQuery { q: String }

pub async fn search_handler(app_state: web::Data<AppState>, query: web::Query<SearchQuery>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match search_svc::search(&client, &query.q).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

#[derive(serde::Deserialize)]
pub struct IndicatorQuery { symbol: String, indicator: String, interval: Option<String> }

pub async fn indicators_handler(app_state: web::Data<AppState>, query: web::Query<IndicatorQuery>) -> Result<HttpResponse> {
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    match indicators::get_indicator(&client, &query.symbol, &query.indicator, query.interval.as_deref()).await {
        Ok(res) => Ok(HttpResponse::Ok().json(ApiResponse::success(res))),
        Err(e) => Ok(HttpResponse::BadGateway().json(ApiResponse::<()>::error(e.to_string()))),
    }
}

#[derive(serde::Deserialize)]
pub struct SubscribeRequest {
    pub symbols: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct SubscribeResponse {
    pub success: bool,
    pub message: String,
    pub subscribed_symbols: Vec<String>,
}


async fn extract_user_id_from_request(req: &HttpRequest, supabase_config: &crate::turso::config::SupabaseConfig) -> Result<String, actix_web::Error> {
    let auth_header = req.headers().get(actix_web::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing Authorization header"))?;
    
    let token = auth_header.strip_prefix("Bearer ")
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Invalid token format"))?;
    
    let claims = crate::turso::auth::validate_supabase_jwt_token(token, supabase_config)
        .await
        .map_err(|e| actix_web::error::ErrorUnauthorized(format!("Invalid token: {}", e)))?;
    
    Ok(claims.sub)
}

pub async fn subscribe_to_quotes(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    market_proxy: web::Data<Arc<MarketWsProxy>>,
    payload: web::Json<SubscribeRequest>,
) -> Result<HttpResponse> {
    let user_id = extract_user_id_from_request(&req, &app_state.config.supabase).await?;
    
    match market_proxy.subscribe(&user_id, &payload.symbols).await {
        Ok(_) => {
            let subscribed = market_proxy.get_user_subscriptions(&user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(SubscribeResponse {
                success: true,
                message: format!("Subscribed to {} symbols", payload.symbols.len()),
                subscribed_symbols: subscribed,
            })))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(e.to_string())))
    }
}

pub async fn unsubscribe_from_quotes(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    market_proxy: web::Data<Arc<MarketWsProxy>>,
    payload: web::Json<SubscribeRequest>,
) -> Result<HttpResponse> {
    let user_id = extract_user_id_from_request(&req, &app_state.config.supabase).await?;
    
    match market_proxy.unsubscribe(&user_id, &payload.symbols).await {
        Ok(_) => {
            Ok(HttpResponse::Ok().json(ApiResponse::success(SubscribeResponse {
                success: true,
                message: format!("Unsubscribed from {} symbols", payload.symbols.len()),
                subscribed_symbols: market_proxy.get_user_subscriptions(&user_id),
            })))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(e.to_string())))
    }
}

pub fn configure_market_routes(cfg: &mut web::ServiceConfig) {
    cfg
        .route("/api/market/health", web::get().to(get_health))
        .route("/api/market/hours", web::get().to(get_hours))
        .route("/api/market/quotes", web::get().to(get_quotes_handler))
        .route("/api/market/historical", web::get().to(get_historical_handler))
        .route("/api/market/movers", web::get().to(get_movers_handler))
        .route("/api/market/news", web::get().to(get_news_handler))
        .route("/api/market/indices", web::get().to(get_indices_handler))
        .route("/api/market/sectors", web::get().to(get_sectors_handler))
        .route("/api/market/search", web::get().to(search_handler))
        .route("/api/market/indicators", web::get().to(indicators_handler))
        .route("/api/market/subscribe", web::post().to(subscribe_to_quotes))
        .route("/api/market/unsubscribe", web::post().to(unsubscribe_from_quotes));
}


