use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use chrono::Utc;
use libsql::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::models::playbook::playbook::{
    CreatePlaybookRequest, Playbook, PlaybookQuery, TagTradeRequest, TradeType, UpdatePlaybookRequest,
};
use crate::turso::client::TursoClient;
use crate::turso::config::{SupabaseClaims, SupabaseConfig};
use crate::turso::auth::AuthError;

/// Response wrapper for playbook operations
#[derive(Debug, Serialize)]
pub struct PlaybookResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Playbook>,
}

/// Response wrapper for playbook list operations
#[derive(Debug, Serialize)]
pub struct PlaybookListResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Vec<Playbook>>,
    pub total: Option<i64>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Query parameters for playbook endpoints
#[derive(Debug, Deserialize)]
pub struct PlaybookQueryParams {
    pub name: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Response for trade tagging operations
#[derive(Debug, Serialize)]
pub struct TagTradeResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// Parse JWT claims without full validation (for middleware)
fn parse_jwt_claims(token: &str) -> Result<SupabaseClaims, AuthError> {
    use base64::Engine;
    
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(AuthError::InvalidToken);
    }

    let payload = parts[1];
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| AuthError::InvalidToken)?;

    let claims: SupabaseClaims = serde_json::from_slice(&decoded)
        .map_err(|_| AuthError::InvalidToken)?;

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
) -> Result<SupabaseClaims, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing or invalid authorization header"))?;

    let claims = parse_jwt_claims(&token)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token"))?;

    Ok(claims)
}

/// Get user database connection
async fn get_user_database_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<Connection, actix_web::Error> {
    Ok(turso_client
        .get_user_database_connection(user_id)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Database error: {}", e)))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("User database not found"))?)
}

/// Create a new playbook setup
pub async fn create_playbook(
    req: HttpRequest,
    payload: web::Json<CreatePlaybookRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::create(&conn, payload.into_inner()).await {
        Ok(playbook) => Ok(HttpResponse::Created().json(PlaybookResponse {
            success: true,
            message: "Playbook created successfully".to_string(),
            data: Some(playbook),
        })),
        Err(e) => {
            log::error!("Failed to create playbook: {}", e);
            Ok(HttpResponse::InternalServerError().json(PlaybookResponse {
                success: false,
                message: "Failed to create playbook".to_string(),
                data: None,
            }))
        }
    }
}

/// Get a playbook by ID
pub async fn get_playbook(
    req: HttpRequest,
    playbook_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::find_by_id(&conn, &playbook_id).await {
        Ok(Some(playbook)) => Ok(HttpResponse::Ok().json(PlaybookResponse {
            success: true,
            message: "Playbook retrieved successfully".to_string(),
            data: Some(playbook),
        })),
        Ok(None) => Ok(HttpResponse::NotFound().json(PlaybookResponse {
            success: false,
            message: "Playbook not found".to_string(),
            data: None,
        })),
        Err(e) => {
            log::error!("Failed to get playbook: {}", e);
            Ok(HttpResponse::InternalServerError().json(PlaybookResponse {
                success: false,
                message: "Failed to retrieve playbook".to_string(),
                data: None,
            }))
        }
    }
}

/// Get all playbooks with optional filtering
pub async fn get_playbooks(
    req: HttpRequest,
    query: web::Query<PlaybookQueryParams>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    let playbook_query = PlaybookQuery {
        name: query.name.clone(),
        search: query.search.clone(),
        limit: query.limit.or(query.page_size),
        offset: query.offset.or_else(|| {
            query.page.and_then(|page| {
                query.page_size.map(|page_size| (page - 1) * page_size)
            })
        }),
    };

    match Playbook::find_all(&conn, playbook_query).await {
        Ok(playbooks) => {
            let total = Playbook::total_count(&conn).await.unwrap_or(0);
            
            Ok(HttpResponse::Ok().json(PlaybookListResponse {
                success: true,
                message: "Playbooks retrieved successfully".to_string(),
                data: Some(playbooks),
                total: Some(total),
                page: query.page,
                page_size: query.page_size,
            }))
        }
        Err(e) => {
            log::error!("Failed to get playbooks: {}", e);
            Ok(HttpResponse::InternalServerError().json(PlaybookListResponse {
                success: false,
                message: "Failed to retrieve playbooks".to_string(),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Update a playbook setup
pub async fn update_playbook(
    req: HttpRequest,
    playbook_id: web::Path<String>,
    payload: web::Json<UpdatePlaybookRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::update(&conn, &playbook_id, payload.into_inner()).await {
        Ok(Some(playbook)) => Ok(HttpResponse::Ok().json(PlaybookResponse {
            success: true,
            message: "Playbook updated successfully".to_string(),
            data: Some(playbook),
        })),
        Ok(None) => Ok(HttpResponse::NotFound().json(PlaybookResponse {
            success: false,
            message: "Playbook not found".to_string(),
            data: None,
        })),
        Err(e) => {
            log::error!("Failed to update playbook: {}", e);
            Ok(HttpResponse::InternalServerError().json(PlaybookResponse {
                success: false,
                message: "Failed to update playbook".to_string(),
                data: None,
            }))
        }
    }
}

/// Delete a playbook setup
pub async fn delete_playbook(
    req: HttpRequest,
    playbook_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::delete(&conn, &playbook_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(PlaybookResponse {
            success: true,
            message: "Playbook deleted successfully".to_string(),
            data: None,
        })),
        Ok(false) => Ok(HttpResponse::NotFound().json(PlaybookResponse {
            success: false,
            message: "Playbook not found".to_string(),
            data: None,
        })),
        Err(e) => {
            log::error!("Failed to delete playbook: {}", e);
            Ok(HttpResponse::InternalServerError().json(PlaybookResponse {
                success: false,
                message: "Failed to delete playbook".to_string(),
                data: None,
            }))
        }
    }
}

/// Tag a trade with a playbook setup
pub async fn tag_trade(
    req: HttpRequest,
    payload: web::Json<TagTradeRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;
    let request = payload.into_inner();

    let result = match request.trade_type {
        TradeType::Stock => {
            Playbook::tag_stock_trade(&conn, request.trade_id, &request.setup_id).await
                .map(|association| serde_json::to_value(association).unwrap_or_default())
        }
        TradeType::Option => {
            Playbook::tag_option_trade(&conn, request.trade_id, &request.setup_id).await
                .map(|association| serde_json::to_value(association).unwrap_or_default())
        }
    };

    match result {
        Ok(association) => Ok(HttpResponse::Created().json(TagTradeResponse {
            success: true,
            message: "Trade tagged successfully".to_string(),
            data: Some(association),
        })),
        Err(e) => {
            log::error!("Failed to tag trade: {}", e);
            Ok(HttpResponse::InternalServerError().json(TagTradeResponse {
                success: false,
                message: "Failed to tag trade".to_string(),
                data: None,
            }))
        }
    }
}

/// Remove a playbook tag from a trade
pub async fn untag_trade(
    req: HttpRequest,
    payload: web::Json<TagTradeRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;
    let request = payload.into_inner();

    let result = match request.trade_type {
        TradeType::Stock => {
            Playbook::untag_stock_trade(&conn, request.trade_id, &request.setup_id).await
        }
        TradeType::Option => {
            Playbook::untag_option_trade(&conn, request.trade_id, &request.setup_id).await
        }
    };

    match result {
        Ok(true) => Ok(HttpResponse::Ok().json(TagTradeResponse {
            success: true,
            message: "Trade untagged successfully".to_string(),
            data: None,
        })),
        Ok(false) => Ok(HttpResponse::NotFound().json(TagTradeResponse {
            success: false,
            message: "Trade tag not found".to_string(),
            data: None,
        })),
        Err(e) => {
            log::error!("Failed to untag trade: {}", e);
            Ok(HttpResponse::InternalServerError().json(TagTradeResponse {
                success: false,
                message: "Failed to untag trade".to_string(),
                data: None,
            }))
        }
    }
}

/// Get playbook setups for a specific trade
pub async fn get_trade_playbooks(
    req: HttpRequest,
    trade_id: web::Path<i64>,
    query: web::Query<serde_json::Map<String, serde_json::Value>>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    // Get trade type from query parameters
    let trade_type = query
        .get("trade_type")
        .and_then(|v| v.as_str())
        .unwrap_or("stock");

    let result = match trade_type {
        "option" => Playbook::get_option_trade_playbooks(&conn, *trade_id).await,
        _ => Playbook::get_stock_trade_playbooks(&conn, *trade_id).await,
    };

    match result {
        Ok(playbooks) => Ok(HttpResponse::Ok().json(PlaybookListResponse {
            success: true,
            message: "Trade playbooks retrieved successfully".to_string(),
            data: Some(playbooks),
            total: None,
            page: None,
            page_size: None,
        })),
        Err(e) => {
            log::error!("Failed to get trade playbooks: {}", e);
            Ok(HttpResponse::InternalServerError().json(PlaybookListResponse {
                success: false,
                message: "Failed to retrieve trade playbooks".to_string(),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Get all trades tagged with a specific playbook setup
pub async fn get_playbook_trades(
    req: HttpRequest,
    setup_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::get_playbook_trades(&conn, &setup_id).await {
        Ok((stock_trades, option_trades)) => {
            let data = serde_json::json!({
                "stock_trades": stock_trades,
                "option_trades": option_trades
            });

            Ok(HttpResponse::Ok().json(TagTradeResponse {
                success: true,
                message: "Playbook trades retrieved successfully".to_string(),
                data: Some(data),
            }))
        }
        Err(e) => {
            log::error!("Failed to get playbook trades: {}", e);
            Ok(HttpResponse::InternalServerError().json(TagTradeResponse {
                success: false,
                message: "Failed to retrieve playbook trades".to_string(),
                data: None,
            }))
        }
    }
}

/// Get playbooks count
pub async fn get_playbooks_count(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::total_count(&conn).await {
        Ok(count) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Playbooks count retrieved successfully",
            "data": {
                "count": count
            }
        }))),
        Err(e) => {
            log::error!("Failed to get playbooks count: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": "Failed to retrieve playbooks count",
                "data": null
            })))
        }
    }
}

/// Test endpoint to verify playbook routes are working
async fn test_playbook_endpoint() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Playbook routes are working",
        "data": {
            "timestamp": Utc::now().to_rfc3339()
        }
    })))
}

/// Configure playbook routes
pub fn configure_playbook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/playbooks")
            .route("", web::post().to(create_playbook))
            .route("", web::get().to(get_playbooks))
            .route("/count", web::get().to(get_playbooks_count))
            .route("/test", web::get().to(test_playbook_endpoint))
            .route("/{id}", web::get().to(get_playbook))
            .route("/{id}", web::put().to(update_playbook))
            .route("/{id}", web::delete().to(delete_playbook))
            .route("/tag", web::post().to(tag_trade))
            .route("/untag", web::delete().to(untag_trade))
            .route("/trades/{trade_id}", web::get().to(get_trade_playbooks))
            .route("/{setup_id}/trades", web::get().to(get_playbook_trades))
    );
}
