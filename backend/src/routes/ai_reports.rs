use crate::models::ai::reports::{
    ReportRequest, ReportType
};
use crate::models::stock::stocks::TimeRange;
use crate::turso::{AppState, config::SupabaseConfig, SupabaseClaims};
use actix_web::{HttpRequest, Result, HttpResponse, web};
use log::{info, error};
use serde::{Deserialize, Serialize};
use libsql::Connection;
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
            if auth_header.starts_with("Bearer ") {
                Some(auth_header[7..].to_string())
            } else {
                None
            }
        })
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

/// Get user database connection
async fn get_user_database_connection(
    req: &HttpRequest,
    app_state: &AppState,
) -> Result<Connection, actix_web::Error> {
    let user_id = get_authenticated_user(req, &app_state.config.supabase).await?;
    
    let conn = app_state.turso_client.get_user_database_connection(&user_id).await
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

/// Query parameters for getting reports
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ReportQuery {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
    pub report_type: Option<String>,
    pub time_range: Option<String>,
}

/// Generate a comprehensive trading report
pub async fn generate_report(
    req: HttpRequest,
    report_request: web::Json<ReportRequest>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    info!("Generating AI report");

    let conn = get_user_database_connection(&req, &app_state).await?;
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    match app_state.ai_reports_service.generate_report(&conn, &user_id, report_request.into_inner()).await {
        Ok(report) => {
            info!("Successfully generated report {} for user: {}", report.id, user_id);
            Ok(HttpResponse::Created().json(ApiResponse::success(report)))
        }
        Err(e) => {
            error!("Failed to generate report for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to generate report".to_string()
            )))
        }
    }
}

/// Generate a report asynchronously
pub async fn generate_report_async(
    req: HttpRequest,
    _report_request: web::Json<ReportRequest>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    info!("Starting async report generation");

    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    // For now, return a task ID - in a real implementation, you'd start a background task
    let task_id = uuid::Uuid::new_v4().to_string();

    info!("Started async report generation task {} for user: {}", task_id, user_id);
    Ok(HttpResponse::Accepted().json(ApiResponse::success(serde_json::json!({
        "task_id": task_id,
        "status": "pending",
        "message": "Report generation started"
    }))))
}

/// Get all reports for a user
pub async fn get_reports(
    req: HttpRequest,
    query: web::Query<ReportQuery>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    info!("Getting reports for user");

    let conn = get_user_database_connection(&req, &app_state).await?;
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    match app_state.ai_reports_service.get_reports(&conn, query.limit, query.offset).await {
        Ok(reports) => {
            info!("Successfully retrieved {} reports for user: {}", reports.reports.len(), user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(reports)))
        }
        Err(e) => {
            error!("Failed to get reports for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to retrieve reports".to_string()
            )))
        }
    }
}

/// Get a specific report by ID
pub async fn get_report(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    let report_id = path.into_inner();
    info!("Getting report: {}", report_id);

    let conn = get_user_database_connection(&req, &app_state).await?;
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    match app_state.ai_reports_service.get_report(&conn, &report_id).await {
        Ok(Some(report)) => {
            info!("Successfully retrieved report {} for user: {}", report_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(report)))
        }
        Ok(None) => {
            info!("Report {} not found for user: {}", report_id, user_id);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Report not found".to_string()
            )))
        }
        Err(e) => {
            error!("Failed to get report {} for user {}: {}", report_id, user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to retrieve report".to_string()
            )))
        }
    }
}

/// Delete a report
pub async fn delete_report(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    let report_id = path.into_inner();
    info!("Deleting report: {}", report_id);

    let conn = get_user_database_connection(&req, &app_state).await?;
    let user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    match app_state.ai_reports_service.delete_report(&conn, &report_id).await {
        Ok(true) => {
            info!("Successfully deleted report {} for user: {}", report_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "success": true,
                "message": "Report deleted successfully"
            }))))
        }
        Ok(false) => {
            info!("Report {} not found for user: {}", report_id, user_id);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Report not found".to_string()
            )))
        }
        Err(e) => {
            error!("Failed to delete report {} for user {}: {}", report_id, user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to delete report".to_string()
            )))
        }
    }
}

/// Get the status of a report generation task
pub async fn get_generation_task_status(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse> {
    let task_id = path.into_inner();
    info!("Getting task status: {}", task_id);

    let _user_id = get_authenticated_user(&req, &app_state.config.supabase).await?;

    // For now, return a mock status - in a real implementation, you'd check the actual task status
    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "task_id": task_id,
        "status": "completed",
        "progress_percentage": 100,
        "result_report_id": "mock-report-id",
        "created_at": chrono::Utc::now().to_rfc3339(),
        "completed_at": chrono::Utc::now().to_rfc3339()
    }))))
}

/// Parse time range string to enum
#[allow(dead_code)]
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

/// Parse report type string to enum
#[allow(dead_code)]
fn parse_report_type(report_type: &str) -> Result<ReportType> {
    match report_type.to_lowercase().as_str() {
        "comprehensive" => Ok(ReportType::Comprehensive),
        "performance" => Ok(ReportType::Performance),
        "risk" => Ok(ReportType::Risk),
        "trading" => Ok(ReportType::Trading),
        "behavioral" => Ok(ReportType::Behavioral),
        "market" => Ok(ReportType::Market),
        _ => Err(actix_web::error::ErrorBadRequest(format!("Invalid report type: {}", report_type))),
    }
}

/// Configure AI reports routes
pub fn configure_ai_reports_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/ai/reports")
            .route("", web::post().to(generate_report))
            .route("/async", web::post().to(generate_report_async))
            .route("", web::get().to(get_reports))
            .route("/{id}", web::get().to(get_report))
            .route("/{id}", web::delete().to(delete_report))
            .route("/tasks/{task_id}", web::get().to(get_generation_task_status))
    );
}

/// API Response wrapper
#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    pub fn error(message: String) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_time_range() {
        assert!(parse_time_range("7d").is_ok());
        assert!(parse_time_range("thirty_days").is_ok());
        assert!(parse_time_range("invalid").is_err());
    }

    #[test]
    fn test_parse_report_type() {
        assert!(parse_report_type("comprehensive").is_ok());
        assert!(parse_report_type("performance").is_ok());
        assert!(parse_report_type("invalid").is_err());
    }
}
