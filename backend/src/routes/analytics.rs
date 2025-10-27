use actix_web::{web, HttpResponse, Result, HttpRequest};
use crate::models::analytics::{AnalyticsOptions, TimeSeriesInterval};
use crate::models::analytics::options::GroupingType;
use crate::models::stock::stocks::TimeRange;
use crate::service::analytics_engine::AnalyticsEngine;
use crate::turso::{AppState, config::SupabaseConfig, SupabaseClaims};
use serde::{Deserialize, Serialize};
use base64::Engine;

/// Parse JWT claims without full validation (for middleware)
fn parse_jwt_claims(token: &str) -> Result<SupabaseClaims, actix_web::Error> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(actix_web::error::ErrorUnauthorized("Invalid token format"));
    }

    let payload = parts[1];
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token encoding"))?;

    let claims: SupabaseClaims = serde_json::from_slice(&decoded)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token claims"))?;

    Ok(claims)
}

/// Extract JWT token from Authorization header
fn extract_token_from_request(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get("Authorization")
        .and_then(|header| header.to_str().ok())
        .and_then(|auth_header| {
            auth_header.strip_prefix("Bearer ")
                .map(|token| token.to_string())
        })
}

/// Analytics service for providing comprehensive trading analytics
pub struct AnalyticsService {
    analytics_engine: AnalyticsEngine,
}

impl AnalyticsService {
    pub fn new() -> Self {
        Self {
            analytics_engine: AnalyticsEngine::new(),
        }
    }
}

/// Get authenticated user from request
async fn get_authenticated_user(
    req: &HttpRequest,
    _supabase_config: &SupabaseConfig,
) -> Result<String, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing or invalid authorization header"))?;

    let claims = parse_jwt_claims(&token)?;
    Ok(claims.sub)
}

/// Request parameters for analytics endpoints
#[derive(Debug, Deserialize)]
pub struct AnalyticsRequest {
    pub time_range: Option<String>,
    pub include_time_series: Option<bool>,
    pub time_series_interval: Option<String>,
    pub include_grouped_analytics: Option<bool>,
    pub grouping_types: Option<Vec<String>>,
    pub risk_free_rate: Option<f64>,
}

/// Response wrapper for analytics data
#[derive(Debug, Serialize)]
pub struct AnalyticsResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> AnalyticsResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

/// Get core analytics metrics (from core_metrics.rs)
pub async fn get_core_analytics(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    query: web::Query<AnalyticsRequest>,
) -> Result<HttpResponse> {
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    let conn = app_state
        .get_user_db_connection(&user_id)
        .await?
        .ok_or_else(|| actix_web::error::ErrorBadRequest("User database not found"))?;

    let time_range = parse_time_range(&query.time_range);
    let analytics_service = AnalyticsService::new();

    match analytics_service.analytics_engine.calculate_core_metrics(&conn, &time_range).await {
        Ok(metrics) => Ok(HttpResponse::Ok().json(AnalyticsResponse::success(metrics))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(AnalyticsResponse::<()>::error(e.to_string()))),
    }
}

/// Get risk analytics metrics (from risk_metrics.rs)
pub async fn get_risk_analytics(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    query: web::Query<AnalyticsRequest>,
) -> Result<HttpResponse> {
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    let conn = app_state
        .get_user_db_connection(&user_id)
        .await?
        .ok_or_else(|| actix_web::error::ErrorBadRequest("User database not found"))?;

    let time_range = parse_time_range(&query.time_range);
    let options = parse_analytics_options(&query);
    let analytics_service = AnalyticsService::new();

    match analytics_service.analytics_engine.calculate_risk_metrics(&conn, &time_range, &options).await {
        Ok(metrics) => Ok(HttpResponse::Ok().json(AnalyticsResponse::success(metrics))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(AnalyticsResponse::<()>::error(e.to_string()))),
    }
}

/// Get performance analytics metrics (from performance_metrics.rs)
pub async fn get_performance_analytics(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    query: web::Query<AnalyticsRequest>,
) -> Result<HttpResponse> {
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    let conn = app_state
        .get_user_db_connection(&user_id)
        .await?
        .ok_or_else(|| actix_web::error::ErrorBadRequest("User database not found"))?;

    let time_range = parse_time_range(&query.time_range);
    let analytics_service = AnalyticsService::new();

    match analytics_service.analytics_engine.calculate_performance_metrics(&conn, &time_range).await {
        Ok(metrics) => Ok(HttpResponse::Ok().json(AnalyticsResponse::success(metrics))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(AnalyticsResponse::<()>::error(e.to_string()))),
    }
}

/// Get time series analytics data (from time_series.rs)
pub async fn get_time_series_analytics(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    query: web::Query<AnalyticsRequest>,
) -> Result<HttpResponse> {
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    let conn = app_state
        .get_user_db_connection(&user_id)
        .await?
        .ok_or_else(|| actix_web::error::ErrorBadRequest("User database not found"))?;

    let time_range = parse_time_range(&query.time_range);
    let options = parse_analytics_options(&query);
    let analytics_service = AnalyticsService::new();

    match analytics_service.analytics_engine.calculate_time_series_data(&conn, &time_range, &options).await {
        Ok(data) => Ok(HttpResponse::Ok().json(AnalyticsResponse::success(data))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(AnalyticsResponse::<()>::error(e.to_string()))),
    }
}

/// Get grouped analytics data (from grouping.rs)
pub async fn get_grouped_analytics(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    query: web::Query<AnalyticsRequest>,
) -> Result<HttpResponse> {
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    let conn = app_state
        .get_user_db_connection(&user_id)
        .await?
        .ok_or_else(|| actix_web::error::ErrorBadRequest("User database not found"))?;

    let time_range = parse_time_range(&query.time_range);
    let options = parse_analytics_options(&query);
    let analytics_service = AnalyticsService::new();

    match analytics_service.analytics_engine.calculate_grouped_analytics(&conn, &time_range, &options).await {
        Ok(data) => Ok(HttpResponse::Ok().json(AnalyticsResponse::success(data))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(AnalyticsResponse::<()>::error(e.to_string()))),
    }
}

/// Get comprehensive analytics (all metrics combined from core_metrics.rs, risk_metrics.rs, performance_metrics.rs, time_series.rs, grouping.rs)
pub async fn get_comprehensive_analytics(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    query: web::Query<AnalyticsRequest>,
) -> Result<HttpResponse> {
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    let conn = app_state
        .get_user_db_connection(&user_id)
        .await?
        .ok_or_else(|| actix_web::error::ErrorBadRequest("User database not found"))?;

    let time_range = parse_time_range(&query.time_range);
    let options = parse_analytics_options(&query);
    let analytics_service = AnalyticsService::new();

    match analytics_service.analytics_engine.calculate_comprehensive_analytics(&conn, &time_range, options).await {
        Ok(data) => Ok(HttpResponse::Ok().json(AnalyticsResponse::success(data))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(AnalyticsResponse::<()>::error(e.to_string()))),
    }
}

/// Parse time range from query parameter
fn parse_time_range(time_range_str: &Option<String>) -> TimeRange {
    match time_range_str {
        Some(range) => match range.as_str() {
            "7d" => TimeRange::SevenDays,
            "30d" => TimeRange::ThirtyDays,
            "90d" => TimeRange::NinetyDays,
            "1y" => TimeRange::OneYear,
            "ytd" => TimeRange::YearToDate,
            "all_time" => TimeRange::AllTime,
            _ => TimeRange::AllTime,
        },
        None => TimeRange::AllTime,
    }
}

/// Parse analytics options from query parameters
fn parse_analytics_options(query: &AnalyticsRequest) -> AnalyticsOptions {
    let time_range = parse_time_range(&query.time_range);
    
    let time_series_interval = match query.time_series_interval.as_ref() {
        Some(interval) => match interval.as_str() {
            "daily" => TimeSeriesInterval::Daily,
            "weekly" => TimeSeriesInterval::Weekly,
            "monthly" => TimeSeriesInterval::Monthly,
            _ => TimeSeriesInterval::Daily,
        },
        None => TimeSeriesInterval::Daily,
    };

    let grouping_types = query.grouping_types.as_ref().map(|types| {
        types.iter().map(|t| match t.as_str() {
            "symbol" => GroupingType::Symbol,
            "strategy" => GroupingType::Strategy,
            "trade_direction" => GroupingType::TradeDirection,
            "time_period" => GroupingType::TimePeriod,
            _ => GroupingType::Symbol,
        }).collect()
    }).unwrap_or_else(|| vec![GroupingType::Symbol]);

    AnalyticsOptions {
        time_range,
        include_time_series: query.include_time_series.unwrap_or(true),
        time_series_interval,
        include_grouped_analytics: query.include_grouped_analytics.unwrap_or(false),
        grouping_types,
        risk_free_rate: query.risk_free_rate.unwrap_or(0.02),
        confidence_levels: vec![0.95, 0.99],
    }
}

/// Configure analytics routes
pub fn configure_analytics_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/analytics")
            .route("/core", web::get().to(get_core_analytics))
            .route("/risk", web::get().to(get_risk_analytics))
            .route("/performance", web::get().to(get_performance_analytics))
            .route("/time-series", web::get().to(get_time_series_analytics))
            .route("/grouped", web::get().to(get_grouped_analytics))
            .route("/comprehensive", web::get().to(get_comprehensive_analytics))
    );
}
