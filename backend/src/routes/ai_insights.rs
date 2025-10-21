#![allow(dead_code)]

use crate::models::ai::insights::{
    InsightRequest, InsightType
};
use crate::models::stock::stocks::TimeRange;
use crate::service::ai_service::insights_service::AIInsightsService;
use crate::turso::client::TursoClient;
use crate::turso::config::SupabaseConfig;
use crate::turso::auth::validate_supabase_jwt_token;
use actix_web::{web, HttpRequest, HttpResponse, Result};
use log::{info, error};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Authenticate user and get user ID
async fn get_authenticated_user(req: &HttpRequest, supabase_config: &SupabaseConfig) -> Result<String> {
    let auth_header = req.headers().get("Authorization")
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing Authorization header"))?
        .to_str()
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid Authorization header"))?;

    let token = auth_header.strip_prefix("Bearer ")
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Invalid token format"))?;

    let claims = validate_supabase_jwt_token(token, supabase_config)
        .await
        .map_err(|e| {
            error!("JWT validation failed: {}", e);
            actix_web::error::ErrorUnauthorized("Invalid or expired authentication token")
        })?;

    Ok(claims.sub)
}

/// Get user's database connection with authentication
async fn get_user_database_connection(
    req: &HttpRequest,
    turso_client: &TursoClient,
    supabase_config: &SupabaseConfig,
) -> Result<libsql::Connection> {
    let user_id = get_authenticated_user(req, supabase_config).await?;
    
    let conn = turso_client.get_user_database_connection(&user_id).await
        .map_err(|e| {
            error!("Failed to get database connection for user {}: {}", user_id, e);
            actix_web::error::ErrorInternalServerError("Database connection failed")
        })?
        .ok_or_else(|| {
            error!("No database found for user: {}", user_id);
            actix_web::error::ErrorNotFound("User database not found")
        })?;

    Ok(conn)
}
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// Generate insights request
#[derive(Debug, Deserialize)]
pub struct GenerateInsightsRequest {
    pub time_range: String,
    pub insight_type: String,
    pub include_predictions: Option<bool>,
    pub force_regenerate: Option<bool>,
}

/// Generate insights asynchronously request
#[derive(Debug, Deserialize)]
pub struct GenerateInsightsAsyncRequest {
    pub time_range: String,
    pub insight_type: String,
    pub include_predictions: Option<bool>,
    pub force_regenerate: Option<bool>,
}

/// Insights list query parameters
#[derive(Debug, Deserialize)]
pub struct InsightsListQuery {
    pub time_range: Option<String>,
    pub insight_type: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Generation task status response
#[derive(Debug, Serialize)]
pub struct GenerationTaskStatus {
    pub task_id: String,
    pub status: String,
    pub progress_percentage: Option<u8>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub error_message: Option<String>,
    pub result_insight_id: Option<String>,
}

/// Generate insights synchronously
pub async fn generate_insights(
    req: HttpRequest,
    payload: web::Json<GenerateInsightsRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_insights_service: web::Data<Arc<AIInsightsService>>,
) -> Result<HttpResponse> {
    info!("Generating insights synchronously");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    // Parse time range and insight type
    let time_range = parse_time_range(&payload.time_range)?;
    let insight_type = parse_insight_type(&payload.insight_type)?;

    let insight_request = InsightRequest {
        time_range,
        insight_type,
        include_predictions: payload.include_predictions,
        force_regenerate: payload.force_regenerate,
    };

    match ai_insights_service.generate_insights(&user_id, insight_request, &conn).await {
        Ok(insight) => {
            info!("Successfully generated insights for user: {}", user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(insight)))
        }
        Err(e) => {
            error!("Failed to generate insights for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to generate insights".to_string()
            )))
        }
    }
}

/// Generate insights asynchronously
pub async fn generate_insights_async(
    req: HttpRequest,
    payload: web::Json<GenerateInsightsAsyncRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_insights_service: web::Data<Arc<AIInsightsService>>,
) -> Result<HttpResponse> {
    info!("Generating insights asynchronously");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    // Parse time range and insight type
    let time_range = parse_time_range(&payload.time_range)?;
    let insight_type = parse_insight_type(&payload.insight_type)?;

    let insight_request = InsightRequest {
        time_range,
        insight_type,
        include_predictions: payload.include_predictions,
        force_regenerate: payload.force_regenerate,
    };

    match ai_insights_service.generate_insights_async(&user_id, insight_request, &conn).await {
        Ok(task_id) => {
            info!("Successfully started async insight generation for user: {} with task: {}", user_id, task_id);
            Ok(HttpResponse::Accepted().json(ApiResponse::success(serde_json::json!({
                "task_id": task_id,
                "status": "pending",
                "message": "Insight generation started"
            }))))
        }
        Err(e) => {
            error!("Failed to start async insight generation for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to start insight generation".to_string()
            )))
        }
    }
}

/// Get user's insights
pub async fn get_insights(
    req: HttpRequest,
    query: web::Query<InsightsListQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_insights_service: web::Data<Arc<AIInsightsService>>,
) -> Result<HttpResponse> {
    info!("Getting insights for user");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    // Parse optional filters
    let time_range = if let Some(tr) = &query.time_range {
        Some(parse_time_range(tr)?)
    } else {
        None
    };

    let insight_type = if let Some(it) = &query.insight_type {
        Some(parse_insight_type(it)?)
    } else {
        None
    };

    match ai_insights_service.get_user_insights(
        &conn,
        &user_id,
        time_range,
        insight_type,
        query.limit,
        query.offset,
    ).await {
        Ok(response) => {
            info!("Successfully retrieved {} insights for user: {}", response.total_count, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
        }
        Err(e) => {
            error!("Failed to get insights for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to get insights".to_string()
            )))
        }
    }
}

/// Get specific insight
pub async fn get_insight(
    req: HttpRequest,
    path: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_insights_service: web::Data<Arc<AIInsightsService>>,
) -> Result<HttpResponse> {
    let insight_id = path.into_inner();
    info!("Getting insight: {}", insight_id);

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_insights_service.get_insight(&conn, &insight_id, &user_id).await {
        Ok(insight) => {
            info!("Successfully retrieved insight {} for user: {}", insight_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(insight)))
        }
        Err(e) => {
            error!("Failed to get insight {} for user {}: {}", insight_id, user_id, e);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Insight not found".to_string()
            )))
        }
    }
}

/// Delete insight
pub async fn delete_insight(
    req: HttpRequest,
    path: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_insights_service: web::Data<Arc<AIInsightsService>>,
) -> Result<HttpResponse> {
    let insight_id = path.into_inner();
    info!("Deleting insight: {}", insight_id);

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_insights_service.delete_insight(&conn, &insight_id, &user_id).await {
        Ok(_) => {
            info!("Successfully deleted insight {} for user: {}", insight_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "success": true,
                "message": "Insight deleted successfully"
            }))))
        }
        Err(e) => {
            error!("Failed to delete insight {} for user {}: {}", insight_id, user_id, e);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Insight not found".to_string()
            )))
        }
    }
}

/// Get generation task status
pub async fn get_generation_task_status(
    req: HttpRequest,
    path: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_insights_service: web::Data<Arc<AIInsightsService>>,
) -> Result<HttpResponse> {
    let task_id = path.into_inner();
    info!("Getting generation task status: {}", task_id);

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_insights_service.get_generation_task(&conn, &task_id).await {
        Ok(task) => {
            // Verify task belongs to user
            if task.user_id != user_id {
                return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                    "Task not found".to_string()
                )));
            }

            let status = GenerationTaskStatus {
                task_id: task.task_id,
                status: format!("{:?}", task.status),
                progress_percentage: None, // Not implemented yet
                created_at: task.created_at.to_rfc3339(),
                started_at: task.started_at.map(|d| d.to_rfc3339()),
                completed_at: task.completed_at.map(|d| d.to_rfc3339()),
                error_message: task.error_message,
                result_insight_id: task.result_insight_id,
            };

            Ok(HttpResponse::Ok().json(ApiResponse::success(status)))
        }
        Err(e) => {
            error!("Failed to get generation task {} for user {}: {}", task_id, user_id, e);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Task not found".to_string()
            )))
        }
    }
}

/// Parse time range string to enum
fn parse_time_range(time_range: &str) -> Result<TimeRange> {
    match time_range.to_lowercase().as_str() {
        "7d" | "seven_days" => Ok(TimeRange::SevenDays),
        "30d" | "thirty_days" => Ok(TimeRange::ThirtyDays),
        "90d" | "ninety_days" => Ok(TimeRange::NinetyDays),
        "ytd" | "year_to_date" => Ok(TimeRange::YearToDate),
        "1y" | "one_year" => Ok(TimeRange::OneYear),
        _ => Err(actix_web::error::ErrorBadRequest(format!("Invalid time range: {}", time_range))),
    }
}

/// Parse insight type string to enum
fn parse_insight_type(insight_type: &str) -> Result<InsightType> {
    match insight_type.to_lowercase().as_str() {
        "trading_patterns" => Ok(InsightType::TradingPatterns),
        "performance_analysis" => Ok(InsightType::PerformanceAnalysis),
        "risk_assessment" => Ok(InsightType::RiskAssessment),
        "behavioral_analysis" => Ok(InsightType::BehavioralAnalysis),
        "market_analysis" => Ok(InsightType::MarketAnalysis),
        "opportunity_detection" => Ok(InsightType::OpportunityDetection),
        _ => Err(actix_web::error::ErrorBadRequest(format!("Invalid insight type: {}", insight_type))),
    }
}

/// Configure AI insights routes
pub fn configure_ai_insights_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/ai/insights")
            .route("", web::post().to(generate_insights))
            .route("/async", web::post().to(generate_insights_async))
            .route("", web::get().to(get_insights))
            .route("/{id}", web::get().to(get_insight))
            .route("/{id}", web::delete().to(delete_insight))
            .route("/tasks/{task_id}", web::get().to(get_generation_task_status))
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_time_range() {
        assert_eq!(parse_time_range("7d").unwrap(), TimeRange::SevenDays);
        assert_eq!(parse_time_range("30d").unwrap(), TimeRange::ThirtyDays);
        assert_eq!(parse_time_range("90d").unwrap(), TimeRange::NinetyDays);
        assert_eq!(parse_time_range("ytd").unwrap(), TimeRange::YearToDate);
        assert_eq!(parse_time_range("1y").unwrap(), TimeRange::OneYear);
        
        assert!(parse_time_range("invalid").is_err());
    }

    #[test]
    fn test_parse_insight_type() {
        assert_eq!(parse_insight_type("trading_patterns").unwrap(), InsightType::TradingPatterns);
        assert_eq!(parse_insight_type("performance_analysis").unwrap(), InsightType::PerformanceAnalysis);
        assert_eq!(parse_insight_type("risk_assessment").unwrap(), InsightType::RiskAssessment);
        assert_eq!(parse_insight_type("behavioral_analysis").unwrap(), InsightType::BehavioralAnalysis);
        assert_eq!(parse_insight_type("market_analysis").unwrap(), InsightType::MarketAnalysis);
        assert_eq!(parse_insight_type("opportunity_detection").unwrap(), InsightType::OpportunityDetection);
        
        assert!(parse_insight_type("invalid").is_err());
    }

    #[test]
    fn test_api_response_success() {
        let response = ApiResponse::success("test data");
        assert!(response.success);
        assert_eq!(response.data, Some("test data"));
        assert!(response.error.is_none());
    }

    #[test]
    fn test_api_response_error() {
        let response = ApiResponse::<()>::error("test error".to_string());
        assert!(!response.success);
        assert!(response.data.is_none());
        assert_eq!(response.error, Some("test error".to_string()));
    }
}
