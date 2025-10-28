use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use chrono::Utc;
use libsql::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use log::{info, error};

use crate::models::playbook::{
    CreatePlaybookRequest, Playbook, PlaybookQuery, TagTradeRequest, TradeType, UpdatePlaybookRequest,
};
use crate::models::stock::stocks::TimeRange;
use crate::turso::client::TursoClient;
use crate::turso::config::{SupabaseClaims, SupabaseConfig};
use crate::turso::auth::AuthError;
use crate::service::cache_service::CacheService;
use crate::service::analytics_engine::playbook_analytics::calculate_playbook_analytics;
use crate::websocket::{broadcast_playbook_update, ConnectionManager};
use tokio::sync::Mutex;
use actix_web::web::Data;
use std::sync::Arc as StdArc;

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
            auth_header.strip_prefix("Bearer ")
                .map(|token| token.to_string())
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
    turso_client
        .get_user_database_connection(user_id)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Database error: {}", e)))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("User database not found"))
}

/// Create a new playbook setup
/// Create a playbook with cache invalidation
pub async fn create_playbook(
    req: HttpRequest,
    payload: web::Json<CreatePlaybookRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    cache_service: web::Data<Arc<CacheService>>,
    ws_manager: Data<StdArc<Mutex<ConnectionManager>>>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::create(&conn, payload.into_inner()).await {
        Ok(playbook) => {
            // Invalidate cache after successful creation
            let cache_service_clone = cache_service.get_ref().clone();
            let user_id_clone = user_id.clone();
            
            tokio::spawn(async move {
                match cache_service_clone.invalidate_table_cache(&user_id_clone, "playbook").await {
                    Ok(count) => info!("Invalidated {} playbook cache keys for user: {}", count, user_id_clone),
                    Err(e) => error!("Failed to invalidate playbook cache for user {}: {}", user_id_clone, e),
                }
            });
            
            // Broadcast create
            let ws_manager_clone = ws_manager.clone();
            let user_id_ws = user_id.clone();
            let playbook_ws = playbook.clone();
            tokio::spawn(async move {
                broadcast_playbook_update(ws_manager_clone, &user_id_ws, "created", &playbook_ws).await;
            });

            Ok(HttpResponse::Created().json(PlaybookResponse {
                success: true,
                message: "Playbook created successfully".to_string(),
                data: Some(playbook),
            }))
        }
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
/// Get playbooks with caching
pub async fn get_playbooks(
    req: HttpRequest,
    query: web::Query<PlaybookQueryParams>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    cache_service: web::Data<Arc<CacheService>>,
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

    // Generate cache key based on query parameters
    let query_hash = format!("{:?}", playbook_query);
    let cache_key = format!("db:{}:playbook:list:{}", user_id, query_hash);
    
    // Try to get from cache first (1 hour TTL as per plan)
    match cache_service.get_or_fetch(&cache_key, 3600, || async {
        info!("Cache miss for playbooks list, fetching from database");
        
        let playbooks_result = Playbook::find_all(&conn, playbook_query.clone()).await;
        let total_result = Playbook::total_count(&conn).await;
        
        match (playbooks_result, total_result) {
            (Ok(playbooks), Ok(total)) => Ok((playbooks, total)),
            (Err(e), _) | (_, Err(e)) => Err(anyhow::anyhow!("{}", e)),
        }
    }).await {
        Ok((playbooks, total)) => {
            info!("✓ Retrieved {} playbooks (cached)", playbooks.len());
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
    ws_manager: Data<StdArc<Mutex<ConnectionManager>>>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::update(&conn, &playbook_id, payload.into_inner()).await {
        Ok(Some(playbook)) => {
            // Broadcast update
            let ws_manager_clone = ws_manager.clone();
            let user_id_ws = user_id.clone();
            let playbook_ws = playbook.clone();
            tokio::spawn(async move {
                broadcast_playbook_update(ws_manager_clone, &user_id_ws, "updated", &playbook_ws).await;
            });
            Ok(HttpResponse::Ok().json(PlaybookResponse {
                success: true,
                message: "Playbook updated successfully".to_string(),
                data: Some(playbook),
            }))
        },
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
    ws_manager: Data<StdArc<Mutex<ConnectionManager>>>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    match Playbook::delete(&conn, &playbook_id).await {
        Ok(true) => {
            // Broadcast delete
            let ws_manager_clone = ws_manager.clone();
            let user_id_ws = user_id.clone();
            let id_ws = playbook_id.clone();
            tokio::spawn(async move {
                broadcast_playbook_update(ws_manager_clone, &user_id_ws, "deleted", serde_json::json!({"id": id_ws})).await;
            });
            Ok(HttpResponse::Ok().json(PlaybookResponse {
                success: true,
                message: "Playbook deleted successfully".to_string(),
                data: None,
            }))
        },
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
            // Existing playbook CRUD
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
            // Rules management
            .route("/{id}/rules", web::post().to(create_playbook_rule))
            .route("/{id}/rules", web::get().to(get_playbook_rules))
            .route("/{id}/rules/{rule_id}", web::put().to(update_playbook_rule))
            .route("/{id}/rules/{rule_id}", web::delete().to(delete_playbook_rule))
            // Missed trades
            .route("/{id}/missed-trades", web::post().to(create_missed_trade))
            .route("/{id}/missed-trades", web::get().to(get_missed_trades))
            .route("/{id}/missed-trades/{missed_id}", web::delete().to(delete_missed_trade))
            // Analytics
            .route("/{id}/analytics", web::get().to(get_playbook_analytics))
            .route("/analytics", web::get().to(get_all_playbooks_analytics))
    );
}

// New route handlers (placeholders - will implement)
async fn create_playbook_rule() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

async fn get_playbook_rules() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

async fn update_playbook_rule() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

async fn delete_playbook_rule() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

async fn create_missed_trade() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

async fn get_missed_trades() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

async fn delete_missed_trade() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Not implemented yet"
    })))
}

/// Get analytics for a specific playbook
async fn get_playbook_analytics(
    req: HttpRequest,
    path: web::Path<(String,)>,
    web::Query(params): web::Query<std::collections::HashMap<String, String>>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let playbook_id = &path.0;
    info!("Getting analytics for playbook: {}", playbook_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    // Parse time range from query params (default to all time)
    let time_range = params.get("timeRange")
        .and_then(|s| serde_json::from_str::<TimeRange>(s).ok())
        .unwrap_or(TimeRange::AllTime);

    match calculate_playbook_analytics(&conn, &playbook_id, &time_range).await {
        Ok(analytics) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Playbook analytics retrieved successfully",
            "data": analytics
        }))),
        Err(e) => {
            error!("Failed to calculate playbook analytics: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to retrieve playbook analytics: {}", e),
                "data": null
            })))
        }
    }
}

/// Get analytics for all playbooks
async fn get_all_playbooks_analytics(
    req: HttpRequest,
    web::Query(params): web::Query<std::collections::HashMap<String, String>>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    info!("Getting analytics for all playbooks");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;

    let conn = get_user_database_connection(user_id, &turso_client).await?;

    // Parse time range from query params (default to all time)
    let time_range = params.get("timeRange")
        .and_then(|s| serde_json::from_str::<TimeRange>(s).ok())
        .unwrap_or(TimeRange::AllTime);

    // Get all playbooks for this user
    match Playbook::find_all(&conn, PlaybookQuery {
        name: None,
        search: None,
        limit: None,
        offset: None,
    }).await {
        Ok(playbooks) => {
            let mut all_analytics = Vec::new();
            
            for playbook in playbooks {
                match calculate_playbook_analytics(&conn, &playbook.id, &time_range).await {
                    Ok(analytics) => all_analytics.push(analytics),
                    Err(e) => {
                        error!("Failed to calculate analytics for playbook {}: {}", playbook.id, e);
                    }
                }
            }

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "All playbooks analytics retrieved successfully",
                "data": all_analytics,
                "total": all_analytics.len()
            })))
        }
        Err(e) => {
            error!("Failed to get playbooks: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to retrieve playbooks: {}", e),
                "data": null
            })))
        }
    }
}
