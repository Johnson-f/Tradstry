use actix_web::{web, HttpRequest, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use log::{info, error};
use std::sync::Arc;
use chrono::{DateTime, Utc};
use libsql::{Connection, Builder};

use crate::turso::client::TursoClient;
use crate::turso::config::{SupabaseConfig, SupabaseClaims};
use crate::turso::auth::{validate_supabase_jwt_token, AuthError};
use crate::models::notes::{
    TradeNote, CreateTradeNoteRequest, UpdateTradeNoteRequest, TradeNoteQuery
};
use crate::service::cache_service::CacheService;

/// Response wrapper for trade notes operations
#[derive(Debug, Serialize)]
pub struct TradeNoteResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<TradeNote>,
}

/// Response wrapper for trade notes list operations
#[derive(Debug, Serialize)]
pub struct TradeNoteListResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Vec<TradeNote>>,
    pub total: Option<i64>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Query parameters for trade notes endpoints
#[derive(Debug, Deserialize)]
pub struct TradeNoteQueryParams {
    pub name: Option<String>,
    pub search: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Parse JWT claims without full validation (for middleware)
fn parse_jwt_claims(token: &str) -> Result<SupabaseClaims, AuthError> {
    use base64::{Engine as _, engine::general_purpose};
    
    info!("Parsing JWT token, length: {}", token.len());
    
    let parts: Vec<&str> = token.split('.').collect();
    info!("JWT parts count: {}", parts.len());
    
    if parts.len() != 3 {
        error!("Invalid JWT format: expected 3 parts, got {}", parts.len());
        return Err(AuthError::InvalidToken);
    }

    let payload_b64 = parts[1];
    info!("Payload base64 length: {}", payload_b64.len());
    
    let payload_bytes = general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .map_err(|e| {
            error!("Base64 decode error: {}", e);
            AuthError::InvalidToken
        })?;
    
    info!("Decoded payload bytes length: {}", payload_bytes.len());
    let payload_str = String::from_utf8_lossy(&payload_bytes);
    info!("Payload JSON: {}", payload_str);
    
    let claims: SupabaseClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| {
            error!("JSON parsing error: {}", e);
            AuthError::InvalidToken
        })?;
        
    info!("Successfully parsed claims for user: {}", claims.sub);
    Ok(claims)
}

/// Extract JWT token from request headers
fn extract_token_from_request(req: &HttpRequest) -> Option<String> {
    let auth_header = req.headers().get("authorization");
    info!("Authorization header present: {}", auth_header.is_some());
    
    if let Some(header_value) = auth_header {
        let header_str = header_value.to_str().ok()?;
        info!("Authorization header value: '{}'", header_str);
        
        if let Some(token) = header_str.strip_prefix("Bearer ") {
            info!("Token extracted, length: {}", token.len());
            info!("Token first 20 chars: {}", &token[..token.len().min(20)]);
            Some(token.to_string())
        } else {
            error!("Authorization header doesn't start with 'Bearer '");
            None
        }
    } else {
        error!("No authorization header found");
        None
    }
}

/// Extract and validate auth from request
async fn get_authenticated_user(
    req: &HttpRequest,
    supabase_config: &SupabaseConfig,
) -> Result<SupabaseClaims, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing authorization token"))?;

    // Parse claims first (quick check)
    let claims = parse_jwt_claims(&token)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token format"))?;

    // Validate with Supabase
    validate_supabase_jwt_token(&token, supabase_config)
        .await
        .map_err(|e| {
            error!("JWT validation failed: {}", e);
            actix_web::error::ErrorUnauthorized("Invalid or expired authentication token")
        })?;

    Ok(claims)
}

/// Get user database connection
async fn get_user_database_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<Connection, actix_web::Error> {
    let user_db_entry = turso_client.get_user_database(user_id).await
        .map_err(|e| {
            error!("Failed to get user database: {}", e);
            actix_web::error::ErrorInternalServerError("Database connection failed")
        })?;

    let db_entry = user_db_entry.ok_or_else(|| {
        error!("No database found for user: {}", user_id);
        actix_web::error::ErrorNotFound("User database not found")
    })?;

    // Create libsql remote connection
    let db = Builder::new_remote(db_entry.db_url.clone(), db_entry.db_token.clone())
        .build()
        .await
        .map_err(|e| {
            error!("Failed to build libsql database: {}", e);
            actix_web::error::ErrorInternalServerError("Database connection failed")
        })?;

    let conn = db.connect().map_err(|e| {
        error!("Failed to connect to libsql database: {}", e);
        actix_web::error::ErrorInternalServerError("Database connection failed")
    })?;

    Ok(conn)
}

/// Create a new trade note
pub async fn create_trade_note(
    req: HttpRequest,
    payload: web::Json<CreateTradeNoteRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Create Trade Note Called ===");
    info!("Note name: {}", payload.name);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Create the trade note
    match TradeNote::create(&conn, payload.into_inner()).await {
        Ok(note) => {
            info!("✓ Trade note created successfully: {}", note.id);
            Ok(HttpResponse::Created().json(TradeNoteResponse {
                success: true,
                message: "Trade note created successfully".to_string(),
                data: Some(note),
            }))
        }
        Err(e) => {
            error!("Failed to create trade note: {}", e);
            Ok(HttpResponse::InternalServerError().json(TradeNoteResponse {
                success: false,
                message: format!("Failed to create trade note: {}", e),
                data: None,
            }))
        }
    }
}

/// Get a specific trade note by ID
pub async fn get_trade_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Trade Note Called ===");
    info!("Note ID: {}", note_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get the trade note
    match TradeNote::find_by_id(&conn, &note_id).await {
        Ok(Some(note)) => {
            info!("✓ Trade note found: {}", note.id);
            Ok(HttpResponse::Ok().json(TradeNoteResponse {
                success: true,
                message: "Trade note retrieved successfully".to_string(),
                data: Some(note),
            }))
        }
        Ok(None) => {
            info!("Trade note not found: {}", note_id);
            Ok(HttpResponse::NotFound().json(TradeNoteResponse {
                success: false,
                message: "Trade note not found".to_string(),
                data: None,
            }))
        }
        Err(e) => {
            error!("Failed to get trade note: {}", e);
            Ok(HttpResponse::InternalServerError().json(TradeNoteResponse {
                success: false,
                message: format!("Failed to get trade note: {}", e),
                data: None,
            }))
        }
    }
}

/// Get all trade notes with optional filtering
/// Get trade notes with caching
pub async fn get_trade_notes(
    req: HttpRequest,
    query: web::Query<TradeNoteQueryParams>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    cache_service: web::Data<Arc<CacheService>>,
) -> Result<HttpResponse> {
    info!("=== Get Trade Notes Called ===");
    info!("Query params: {:?}", query);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Convert query params to TradeNoteQuery
    let trade_note_query = TradeNoteQuery {
        name: query.name.clone(),
        search: query.search.clone(),
        start_date: query.start_date,
        end_date: query.end_date,
        limit: query.limit,
        offset: query.offset,
    };

    // Generate cache key based on query parameters
    let query_hash = format!("{:?}", trade_note_query);
    let cache_key = format!("db:{}:trade_notes:list:{}", claims.sub, query_hash);
    
    // Try to get from cache first
    match cache_service.get_or_fetch(&cache_key, 1800, || async {
        info!("Cache miss for trade notes list, fetching from database");
        
        // Get trade notes and total count
        let notes_result = TradeNote::find_all(&conn, trade_note_query.clone()).await;
        let count_result = TradeNote::count(&conn, &TradeNoteQuery {
            name: query.name.clone(),
            search: query.search.clone(),
            start_date: query.start_date,
            end_date: query.end_date,
            limit: None,
            offset: None,
        }).await;

        match (notes_result, count_result) {
            (Ok(notes), Ok(total)) => Ok((notes, total)),
            (Err(e), _) | (_, Err(e)) => Err(anyhow::anyhow!("{}", e)),
        }
    }).await {
        Ok((notes, total)) => {
            info!("✓ Retrieved {} trade notes (cached)", notes.len());
            Ok(HttpResponse::Ok().json(TradeNoteListResponse {
                success: true,
                message: "Trade notes retrieved successfully".to_string(),
                data: Some(notes.clone()),
                total: Some(total),
                page: query.page,
                page_size: query.page_size,
            }))
        }
        Err(e) => {
            error!("Failed to get trade notes: {}", e);
            Ok(HttpResponse::InternalServerError().json(TradeNoteListResponse {
                success: false,
                message: format!("Failed to get trade notes: {}", e),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Update a trade note
pub async fn update_trade_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    payload: web::Json<UpdateTradeNoteRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Update Trade Note Called ===");
    info!("Note ID: {}", note_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Update the trade note
    match TradeNote::update(&conn, &note_id, payload.into_inner()).await {
        Ok(Some(note)) => {
            info!("✓ Trade note updated successfully: {}", note.id);
            Ok(HttpResponse::Ok().json(TradeNoteResponse {
                success: true,
                message: "Trade note updated successfully".to_string(),
                data: Some(note),
            }))
        }
        Ok(None) => {
            info!("Trade note not found for update: {}", note_id);
            Ok(HttpResponse::NotFound().json(TradeNoteResponse {
                success: false,
                message: "Trade note not found".to_string(),
                data: None,
            }))
        }
        Err(e) => {
            error!("Failed to update trade note: {}", e);
            Ok(HttpResponse::InternalServerError().json(TradeNoteResponse {
                success: false,
                message: format!("Failed to update trade note: {}", e),
                data: None,
            }))
        }
    }
}

/// Delete a trade note
pub async fn delete_trade_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Delete Trade Note Called ===");
    info!("Note ID: {}", note_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Delete the trade note
    match TradeNote::delete(&conn, &note_id).await {
        Ok(true) => {
            info!("✓ Trade note deleted successfully: {}", note_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Trade note deleted successfully"
            })))
        }
        Ok(false) => {
            info!("Trade note not found for deletion: {}", note_id);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "success": false,
                "message": "Trade note not found"
            })))
        }
        Err(e) => {
            error!("Failed to delete trade note: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to delete trade note: {}", e)
            })))
        }
    }
}

/// Search trade notes by content
pub async fn search_trade_notes(
    req: HttpRequest,
    query: web::Query<serde_json::Map<String, serde_json::Value>>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Search Trade Notes Called ===");
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Extract search term from query
    let search_term = query.get("q")
        .and_then(|v| v.as_str())
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Missing search query parameter 'q'"))?;

    let limit = query.get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(50);

    info!("Search term: {}, limit: {}", search_term, limit);

    // Search trade notes
    match TradeNote::search_by_content(&conn, search_term, Some(limit)).await {
        Ok(notes) => {
            info!("✓ Found {} trade notes matching search", notes.len());
            Ok(HttpResponse::Ok().json(TradeNoteListResponse {
                success: true,
                message: format!("Found {} trade notes matching '{}'", notes.len(), search_term),
                data: Some(notes.clone()),
                total: Some(notes.len() as i64),
                page: None,
                page_size: Some(limit),
            }))
        }
        Err(e) => {
            error!("Failed to search trade notes: {}", e);
            Ok(HttpResponse::InternalServerError().json(TradeNoteListResponse {
                success: false,
                message: format!("Failed to search trade notes: {}", e),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Get recent trade notes
pub async fn get_recent_trade_notes(
    req: HttpRequest,
    query: web::Query<serde_json::Map<String, serde_json::Value>>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Recent Trade Notes Called ===");
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Extract limit from query
    let limit = query.get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(10);

    info!("Limit: {}", limit);

    // Get recent trade notes
    match TradeNote::get_recent(&conn, limit).await {
        Ok(notes) => {
            info!("✓ Retrieved {} recent trade notes", notes.len());
            Ok(HttpResponse::Ok().json(TradeNoteListResponse {
                success: true,
                message: "Recent trade notes retrieved successfully".to_string(),
                data: Some(notes.clone()),
                total: Some(notes.len() as i64),
                page: None,
                page_size: Some(limit),
            }))
        }
        Err(e) => {
            error!("Failed to get recent trade notes: {}", e);
            Ok(HttpResponse::InternalServerError().json(TradeNoteListResponse {
                success: false,
                message: format!("Failed to get recent trade notes: {}", e),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Get trade notes count
pub async fn get_trade_notes_count(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Trade Notes Count Called ===");
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get total count
    match TradeNote::total_count(&conn).await {
        Ok(count) => {
            info!("✓ Total trade notes count: {}", count);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Trade notes count retrieved successfully",
                "count": count
            })))
        }
        Err(e) => {
            error!("Failed to get trade notes count: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to get trade notes count: {}", e)
            })))
        }
    }
}

/// Simple test endpoint to verify routes are working
async fn test_trade_notes_endpoint() -> Result<HttpResponse> {
    info!("Trade notes test endpoint hit!");
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Trade notes routes are working!",
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// Configure trade notes routes
pub fn configure_trade_notes_routes(cfg: &mut web::ServiceConfig) {
    info!("Setting up /api/trade-notes routes");
    cfg.service(
        web::scope("/api/trade-notes")
            .route("/test", web::get().to(test_trade_notes_endpoint))
            .route("", web::post().to(create_trade_note))
            .route("", web::get().to(get_trade_notes))
            .route("/search", web::get().to(search_trade_notes))
            .route("/recent", web::get().to(get_recent_trade_notes))
            .route("/count", web::get().to(get_trade_notes_count))
            .route("/{note_id}", web::get().to(get_trade_note))
            .route("/{note_id}", web::put().to(update_trade_note))
            .route("/{note_id}", web::delete().to(delete_trade_note))
    );
}
