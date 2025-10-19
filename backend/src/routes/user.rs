use actix_web::{web, HttpRequest, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use log::{info, error, warn};
use std::sync::Arc;
use crate::turso::client::TursoClient;
use crate::turso::config::{SupabaseConfig, SupabaseClaims};
use crate::turso::auth::{validate_supabase_jwt_token, AuthError};
use crate::turso::schema::get_current_schema_version;
use crate::service::cache_service::CacheService;

/// Request payload for user database initialization
#[derive(Debug, Deserialize)]
pub struct InitializeUserRequest {
    pub email: String,
    pub user_id: String,
}

/// Response payload for user database initialization
#[derive(Debug, Serialize)]
pub struct InitializeUserResponse {
    pub success: bool,
    pub message: String,
    pub database_url: Option<String>,
    pub database_token: Option<String>,
    pub schema_synced: Option<bool>,
    pub schema_version: Option<String>,
    pub cache_preloaded: Option<bool>,
    pub cache_status: Option<String>,
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

/// Initialize user database with trading schema and preload cache
pub async fn initialize_user_database(
    req: HttpRequest,
    payload: web::Json<InitializeUserRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    cache_service: web::Data<Arc<CacheService>>,
) -> Result<HttpResponse> {
    info!("=== Initialize User Database Called ===");
    info!("User: {} ({})", payload.email, payload.user_id);
    
    // Log that extractors worked
    info!("✓ TursoClient extracted successfully");
    info!("✓ SupabaseConfig extracted successfully");
    info!("✓ Request payload extracted successfully");

    // Get authenticated user with detailed error logging
    info!("Attempting authentication...");
    let claims = match get_authenticated_user(&req, &supabase_config).await {
        Ok(c) => {
            info!("✓ Authentication successful for user: {}", c.sub);
            c
        }
        Err(e) => {
            error!("✗ Authentication failed: {:?}", e);
            return Err(e);
        }
    };

    // Validate that the authenticated user matches the requested user_id
    if claims.sub != payload.user_id {
        warn!("User ID mismatch: JWT sub={}, payload user_id={}", claims.sub, payload.user_id);
        return Ok(HttpResponse::Forbidden().json(InitializeUserResponse {
            success: false,
            message: "User ID mismatch - you can only initialize your own database".to_string(),
            database_url: None,
            database_token: None,
            schema_synced: None,
            schema_version: None,
            cache_preloaded: None,
            cache_status: Some("Not attempted - authentication failed".to_string()),
        }));
    }
    
    match create_user_database_internal(&turso_client, &payload.user_id, &payload.email).await {
        Ok((db_url, db_token, schema_synced, schema_version)) => {
            info!("Successfully initialized database for user: {}", payload.email);
            
            // Preload user data into cache asynchronously
            let cache_service_clone = cache_service.get_ref().clone();
            let user_id_clone = payload.user_id.clone();
            
            tokio::spawn(async move {
                match turso_client.get_user_database_connection(&user_id_clone).await {
                    Ok(Some(user_conn)) => {
                        info!("Starting cache preload for user: {}", user_id_clone);
                        match cache_service_clone.preload_user_data(&user_conn, &user_id_clone).await {
                            Ok(_) => {
                                info!("✓ Cache preload completed successfully for user: {}", user_id_clone);
                            }
                            Err(e) => {
                                error!("✗ Cache preload failed for user {}: {}", user_id_clone, e);
                            }
                        }
                    }
                    Ok(None) => {
                        warn!("No database connection available for cache preload for user: {}", user_id_clone);
                    }
                    Err(e) => {
                        error!("Failed to get database connection for cache preload for user {}: {}", user_id_clone, e);
                    }
                }
            });
            
            Ok(HttpResponse::Ok().json(InitializeUserResponse {
                success: true,
                message: "User database initialized successfully. Cache preload started in background.".to_string(),
                database_url: Some(db_url),
                database_token: Some(db_token),
                schema_synced: Some(schema_synced),
                schema_version: Some(schema_version),
                cache_preloaded: Some(false), // Will be true when background task completes
                cache_status: Some("Preloading in background".to_string()),
            }))
        }
        Err(e) => {
            error!("Failed to initialize database for user {}: {}", payload.email, e);
            Ok(HttpResponse::InternalServerError().json(InitializeUserResponse {
                success: false,
                message: format!("Failed to initialize database: {}", e),
                database_url: None,
                database_token: None,
                schema_synced: None,
                schema_version: None,
                cache_preloaded: None,
                cache_status: Some("Not attempted - database initialization failed".to_string()),
            }))
        }
    }
}

/// Check if user database exists and is properly initialized
pub async fn check_user_database(
    req: HttpRequest,
    user_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Checking database status for user: {}", user_id);

    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;

    // Validate that the authenticated user matches the requested user_id
    if claims.sub != *user_id {
        warn!("User ID mismatch: JWT sub={}, requested user_id={}", claims.sub, user_id);
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "You can only check your own database status"
        })));
    }
    
    match turso_client.get_user_database(&user_id).await {
        Ok(Some(db_entry)) => {
            info!("Database found for user: {}", user_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "exists": true,
                "database_url": db_entry.db_url,
                "created_at": db_entry.created_at
            })))
        }
        Ok(None) => {
            info!("No database found for user: {}", user_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "exists": false
            })))
        }
        Err(e) => {
            error!("Error checking database for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to check database status"
            })))
        }
    }
}

/// Get user database connection info (URL and token)
pub async fn get_user_database_info(
    req: HttpRequest,
    user_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Getting database info for user: {}", user_id);

    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;

    // Validate that the authenticated user matches the requested user_id
    if claims.sub != *user_id {
        warn!("User ID mismatch: JWT sub={}, requested user_id={}", claims.sub, user_id);
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "You can only access your own database info"
        })));
    }
    
    match turso_client.get_user_database(&user_id).await {
        Ok(Some(db_entry)) => {
            // Generate a fresh token for the user's database
            match turso_client.create_database_token(&db_entry.db_name).await {
                Ok(fresh_token) => {
                    info!("Generated fresh token for user: {}", user_id);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "database_url": db_entry.db_url,
                        "database_token": fresh_token,
                        "database_name": db_entry.db_name
                    })))
                }
                Err(e) => {
                    error!("Failed to generate token for user {}: {}", user_id, e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": "Failed to generate database token"
                    })))
                }
            }
        }
        Ok(None) => {
            info!("No database found for user: {}", user_id);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "User database not found"
            })))
        }
        Err(e) => {
            error!("Error getting database info for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to get database info"
            })))
        }
    }
}

/// Internal function to create user database and initialize schema
async fn create_user_database_internal(
    turso_client: &Arc<TursoClient>,
    user_id: &str,
    email: &str,
) -> Result<(String, String, bool, String), anyhow::Error> {
    let current_schema_version = get_current_schema_version();
    let mut schema_synced = false;
    
    // Check if database already exists
    match turso_client.get_user_database(user_id).await? {
        Some(existing_db) => {
            info!("Database already exists for user: {}, checking schema version", user_id);
            
            // Ensure schema is up-to-date for existing database (adds missing columns like stocks.version)
            match turso_client.ensure_user_schema_on_login(user_id).await {
                Ok(_) => {
                    info!("Schema ensured successfully for existing user: {}", user_id);
                    schema_synced = true;
                }
                Err(e) => {
                    warn!("Failed to ensure schema for user {}: {}", user_id, e);
                    // Continue anyway, as the database exists and is functional
                }
            }
            
            // Generate a fresh token for existing database
            let fresh_token = turso_client.create_database_token(&existing_db.db_name).await?;
            return Ok((existing_db.db_url, fresh_token, schema_synced, current_schema_version.version));
        }
        None => {
            info!("Creating new database for user: {}", user_id);
        }
    }

    // Create new database for user
    let user_db_entry = turso_client.create_user_database(user_id, email).await?;
    
    // For new databases, schema is automatically initialized with the latest version
    schema_synced = true;
    
    info!("Successfully created database for user: {} at {}", user_id, user_db_entry.db_url);
    Ok((user_db_entry.db_url, user_db_entry.db_token, schema_synced, current_schema_version.version))
}

/// Synchronize user database schema with current application schema
pub async fn sync_user_schema(
    req: HttpRequest,
    user_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Schema synchronization requested for user: {}", user_id);

    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;

    // Validate that the authenticated user matches the requested user_id
    if claims.sub != *user_id {
        warn!("User ID mismatch: JWT sub={}, requested user_id={}", claims.sub, user_id);
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "You can only synchronize your own database schema"
        })));
    }

    // Check if user database exists
    match turso_client.get_user_database(&user_id).await {
        Ok(Some(_)) => {
            // Perform schema synchronization
            match turso_client.sync_user_database_schema(&user_id).await {
                Ok(_) => {
                    let current_version = get_current_schema_version();
                    info!("Schema synchronized successfully for user: {}", user_id);
                    Ok(HttpResponse::Ok().json(serde_json::json!({
                        "success": true,
                        "message": "Schema synchronized successfully",
                        "schema_version": current_version.version,
                        "synced_at": chrono::Utc::now().to_rfc3339()
                    })))
                }
                Err(e) => {
                    error!("Failed to synchronize schema for user {}: {}", user_id, e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "success": false,
                        "error": "Failed to synchronize schema",
                        "details": e.to_string()
                    })))
                }
            }
        }
        Ok(None) => {
            info!("No database found for user: {}", user_id);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "success": false,
                "error": "User database not found. Please initialize your database first."
            })))
        }
        Err(e) => {
            error!("Error checking database for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": "Failed to check database status"
            })))
        }
    }
}

/// Get current schema version for user database
pub async fn get_user_schema_version(
    req: HttpRequest,
    user_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Getting schema version for user: {}", user_id);

    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;

    // Validate that the authenticated user matches the requested user_id
    if claims.sub != *user_id {
        warn!("User ID mismatch: JWT sub={}, requested user_id={}", claims.sub, user_id);
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "error": "You can only check your own database schema version"
        })));
    }

    match turso_client.get_user_schema_version(&user_id).await {
        Ok(Some(version)) => {
            let current_version = get_current_schema_version();
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "user_schema_version": version.version,
                "user_schema_description": version.description,
                "user_schema_created_at": version.created_at,
                "current_app_version": current_version.version,
                "current_app_description": current_version.description,
                "is_up_to_date": version.version == current_version.version
            })))
        }
        Ok(None) => {
            let current_version = get_current_schema_version();
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "user_schema_version": null,
                "user_schema_description": "No schema version found (legacy database)",
                "user_schema_created_at": null,
                "current_app_version": current_version.version,
                "current_app_description": current_version.description,
                "is_up_to_date": false,
                "needs_sync": true
            })))
        }
        Err(e) => {
            error!("Error getting schema version for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to get schema version"
            })))
        }
    }
}

/// Simple test endpoint to verify routes are working
async fn test_endpoint() -> Result<HttpResponse> {
    info!("Test endpoint hit!");
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "User routes are working!",
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// Configure user routes
pub fn configure_user_routes(cfg: &mut web::ServiceConfig) {
    info!("Setting up /api/user routes");
    cfg.service(
        web::scope("/api/user")
            .route("/test", web::get().to(test_endpoint))
            .route("/initialize", web::post().to(initialize_user_database))
            .route("/check/{user_id}", web::get().to(check_user_database))
            .route("/database-info/{user_id}", web::get().to(get_user_database_info))
            .route("/sync-schema/{user_id}", web::post().to(sync_user_schema))
            .route("/schema-version/{user_id}", web::get().to(get_user_schema_version))
    );
}