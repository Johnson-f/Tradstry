mod turso;
mod routes;
mod models;
mod service;
mod replicache;

use actix_cors::Cors;
use actix_web::{
    dev::ServiceRequest,
    middleware::Logger,
    web::{self, Data, Json},
    App, HttpMessage, HttpServer, Result as ActixResult,
};
use actix_web_httpauth::{
    extractors::{
        bearer::{BearerAuth, Config},
        AuthenticationError,
    },
    middleware::HttpAuthentication,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use turso::{
    AppState,
    get_user_id,
    get_supabase_user_id,
    validate_jwt_token,
    validate_supabase_jwt_token,
    AuthError,
    SupabaseClaims,
};
use routes::{configure_analytics_routes, configure_user_routes, configure_options_routes, configure_stocks_routes, configure_trade_notes_routes, configure_images_routes, configure_playbook_routes, configure_notebook_routes, configure_ai_chat_routes, configure_ai_insights_routes, configure_ai_reports_routes};
use replicache::{handle_push, handle_pull};

#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

impl<T> ApiResponse<T> {
    fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    #[allow(dead_code)]
    fn error(message: &str) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message.to_string()),
        }
    }
}

#[derive(Serialize)]
struct HealthCheck {
    status: String,
    database: String,
    timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct UserQuery {
    limit: Option<i32>,
    offset: Option<i32>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logging
    env_logger::init();

    // Load environment variables
    dotenvy::dotenv().ok();

    // Initialize application state
    let app_state = AppState::new().await.expect("Failed to initialize app state");
    let app_data = Data::new(app_state);

    // Get port from environment or default
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "9000".to_string())
        .parse::<u16>()
        .expect("Invalid PORT value");

    log::info!("Server starting on http://127.0.0.1:{}", port);
    log::info!("Registering routes...");

    // Start HTTP server
    HttpServer::new(move || {
        log::info!("Creating new App instance");

        // Production CORS configuration - only allow https://tradstry.com
        let allowed_origins = std::env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "https://tradstry.com".to_string());
        
        let cors = if std::env::var("RUST_ENV").unwrap_or_default() == "production" {
            // Production: strict CORS
            Cors::default()
                .allowed_origin(&allowed_origins)
                .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
                .allowed_headers(vec![
                    actix_web::http::header::AUTHORIZATION,
                    actix_web::http::header::CONTENT_TYPE,
                    actix_web::http::header::HeaderName::from_static("x-requested-with"),
                ])
                .allow_credentials(true)
                .max_age(3600)
        } else {
            // Development: allow localhost
            Cors::default()
                .allowed_origin("http://localhost:3000")
                .allowed_origin("https://tradstry.com")
                .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
                .allowed_headers(vec![
                    actix_web::http::header::AUTHORIZATION,
                    actix_web::http::header::CONTENT_TYPE,
                    actix_web::http::header::HeaderName::from_static("x-requested-with"),
                ])
                .allow_credentials(true)
                .max_age(3600)
        };

        App::new()
            .app_data(app_data.clone())
            // CRITICAL: Add TursoClient as separate app_data for user routes
            .app_data(Data::new(app_data.as_ref().turso_client.clone()))
            // CRITICAL: Add SupabaseConfig as separate app_data for user routes
            .app_data(Data::new(app_data.as_ref().config.supabase.clone()))
            // CRITICAL: Add CacheService as separate app_data for user routes
            .app_data(Data::new(app_data.as_ref().cache_service.clone()))
            // CRITICAL: Add AIInsightsService as separate app_data for AI insights routes
            .app_data(Data::new(app_data.as_ref().ai_insights_service.clone()))
            // CRITICAL: Add AIReportsService as separate app_data for AI reports routes
            .app_data(Data::new(app_data.as_ref().ai_reports_service.clone()))
            .wrap(cors)
            .wrap(Logger::default())
            // Register user routes FIRST with explicit logging
            .configure(|cfg| {
                log::info!("Configuring user routes");
                configure_user_routes(cfg);
            })
            // Register options routes
            .configure(|cfg| {
                log::info!("Configuring options routes");
                configure_options_routes(cfg);
            })
            // Register stocks routes
            .configure(|cfg| {
                log::info!("Configuring stocks routes");
                configure_stocks_routes(cfg);
            })
            // Register trade notes routes
            .configure(|cfg| {
                log::info!("Configuring trade notes routes");
                configure_trade_notes_routes(cfg);
            })
            // Register images routes
            .configure(|cfg| {
                log::info!("Configuring images routes");
                configure_images_routes(cfg);
            })
            // Register playbook routes
            .configure(|cfg| {
                log::info!("Configuring playbook routes");
                configure_playbook_routes(cfg);
            })
            // Register notebook routes
            .configure(|cfg| {
                log::info!("Configuring notebook routes");
                configure_notebook_routes(cfg);
                
                // AI Routes
                configure_ai_chat_routes(cfg);
                configure_ai_insights_routes(cfg);
                configure_ai_reports_routes(cfg);
                
                // Analytics Routes
                configure_analytics_routes(cfg);
            })
            // Register replicache routes
            .configure(|cfg| {
                log::info!("Configuring replicache routes");
                cfg.service(
                    web::scope("/api/replicache")
                        .wrap(HttpAuthentication::bearer(jwt_validator))
                        .route("/push", web::post().to(handle_push))
                        .route("/pull", web::post().to(handle_pull))
                );
            })
            .configure(configure_auth_routes)
            .configure(configure_public_routes)
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}

// Public routes configuration
fn configure_public_routes(cfg: &mut web::ServiceConfig) {
    log::info!("Configuring public routes");
    cfg
        .route("/", web::get().to(root_handler))
        .route("/health", web::get().to(health_check))
        .route("/webhooks/supabase", web::post().to(supabase_webhook_handler))
        .route("/webhooks/clerk", web::post().to(clerk_webhook_handler))
        .route("/profile", web::get().to(get_profile));
}

// Protected routes configuration
fn configure_auth_routes(cfg: &mut web::ServiceConfig) {
    log::info!("Configuring auth routes");
    cfg.service(
        web::scope("")
            .wrap(HttpAuthentication::bearer(jwt_validator))
            .route("/me", web::get().to(get_current_user))
            .route("/my-data", web::get().to(get_user_data))
    );
}

// JWT validation middleware - Updated for Supabase Auth
async fn jwt_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (actix_web::Error, ServiceRequest)> {
    let config = req
        .app_data::<Config>()
        .cloned()
        .unwrap_or_else(Default::default);

    let app_state = req
        .app_data::<Data<AppState>>()
        .expect("AppState not found");

    // Try Supabase JWT validation first (no caching)
    match validate_supabase_jwt_token(
        credentials.token(),
        &app_state.config.supabase
    ).await {
        Ok(claims) => {
            // Store Supabase claims in request extensions
            req.extensions_mut().insert(claims);
            Ok(req)
        },
        Err(AuthError::InvalidIssuer) | Err(AuthError::InvalidToken) => {
            // Fallback to Clerk validation for migration period
            match validate_jwt_token(credentials.token(), &app_state.config).await {
                Ok(claims) => {
                    // Store Clerk claims in request extensions
                    req.extensions_mut().insert(claims);
                    Ok(req)
                },
                Err(_) => {
                    let error = AuthenticationError::from(config).into();
                    Err((error, req))
                }
            }
        },
        Err(_) => {
            let error = AuthenticationError::from(config).into();
            Err((error, req))
        }
    }
}

// Route handlers

async fn root_handler() -> ActixResult<Json<ApiResponse<HashMap<String, String>>>> {
    let mut data = HashMap::new();
    data.insert("message".to_string(), "Tradistry API - Turso & Supabase Auth".to_string());
    data.insert("version".to_string(), "1.1.0".to_string());
    data.insert("auth_provider".to_string(), "supabase".to_string());
    Ok(Json(ApiResponse::success(data)))
}

async fn health_check(app_state: Data<AppState>) -> ActixResult<Json<ApiResponse<HealthCheck>>> {
    match app_state.health_check().await {
        Ok(_) => {
            let health = HealthCheck {
                status: "healthy".to_string(),
                database: "connected".to_string(),
                timestamp: chrono::Utc::now(),
            };
            Ok(Json(ApiResponse::success(health)))
        }
        Err(_) => {
            let health = HealthCheck {
                status: "unhealthy".to_string(),
                database: "disconnected".to_string(),
                timestamp: chrono::Utc::now(),
            };
            Ok(Json(ApiResponse::success(health)))
        }
    }
}

async fn get_profile(req: actix_web::HttpRequest) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    // Try Supabase claims first
    if let Some(claims) = req.extensions().get::<SupabaseClaims>() {
        let profile = serde_json::json!({
            "user_id": claims.sub,
            "email": claims.email,
            "authenticated": true,
            "auth_provider": "supabase"
        });
        return Ok(Json(ApiResponse::success(profile)));
    }

    // Fallback to Clerk claims
    if let Some(claims) = req.extensions().get::<turso::ClerkClaims>() {
        let profile = serde_json::json!({
            "user_id": claims.sub,
            "email": claims.email,
            "authenticated": true,
            "auth_provider": "clerk"
        });
        return Ok(Json(ApiResponse::success(profile)));
    }

    // No authentication
    let profile = serde_json::json!({
        "authenticated": false
    });
    Ok(Json(ApiResponse::success(profile)))
}

async fn get_current_user(
    app_state: Data<AppState>,
    req: actix_web::HttpRequest,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    let extensions = req.extensions();

    let (user_id, _email, auth_provider) = if let Some(supabase_claims) = extensions.get::<SupabaseClaims>() {
        // Handle Supabase claims
        let user_id = get_supabase_user_id(supabase_claims);
        (user_id, supabase_claims.email.clone(), "supabase")
    } else if let Some(clerk_claims) = extensions.get::<turso::ClerkClaims>() {
        // Handle Clerk claims (legacy)
        let user_id = get_user_id(clerk_claims.clone()).map_err(|_|
            actix_web::error::ErrorBadRequest("Invalid user ID"))?;
        (user_id, clerk_claims.email.clone(), "clerk")
    } else {
        return Err(actix_web::error::ErrorUnauthorized("No authentication claims found"));
    };

    // Get user database entry from registry
    match app_state.turso_client.get_user_database(&user_id).await {
        Ok(Some(user_db)) => {
            let user_info = serde_json::json!({
                "user_id": user_db.user_id,
                "email": user_db.email,
                "database_name": user_db.db_name,
                "created_at": user_db.created_at,
                "updated_at": user_db.updated_at,
                "auth_provider": auth_provider
            });
            Ok(Json(ApiResponse::success(user_info)))
        }
        Ok(None) => Err(actix_web::error::ErrorNotFound("User not found")),
        Err(_) => Err(actix_web::error::ErrorInternalServerError("Database error")),
    }
}

async fn get_user_data(
    app_state: Data<AppState>,
    req: actix_web::HttpRequest,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    let extensions = req.extensions();

    let user_id = if let Some(supabase_claims) = extensions.get::<SupabaseClaims>() {
        // Handle Supabase claims
        get_supabase_user_id(supabase_claims)
    } else if let Some(clerk_claims) = extensions.get::<turso::ClerkClaims>() {
        // Handle Clerk claims (legacy)
        get_user_id(clerk_claims.clone()).map_err(|_|
            actix_web::error::ErrorBadRequest("Invalid user ID"))?
    } else {
        return Err(actix_web::error::ErrorUnauthorized("No authentication claims found"));
    };

    // Get user's database connection
    match app_state.get_user_db_connection(&user_id).await {
        Ok(Some(conn)) => {
            // Query user's personal data from their database
            // This is a placeholder - you'll implement actual queries based on your schema
            let mut rows = conn
                .prepare("SELECT COUNT(*) as record_count FROM user_info")
                .await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database query failed"))?
                .query(libsql::params![])
                .await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database query failed"))?;

            let count = if let Some(row) = rows.next().await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database query failed"))? {
                row.get::<i64>(0).unwrap_or(0)
            } else {
                0
            };

            let data = serde_json::json!({
                "user_id": user_id,
                "record_count": count,
                "message": "User data from personal database"
            });

            Ok(Json(ApiResponse::success(data)))
        }
        Ok(None) => {
            let error_data = serde_json::json!({
                "error": "User database not found",
                "user_id": user_id
            });
            Ok(Json(ApiResponse::success(error_data)))
        }
        Err(_) => Err(actix_web::error::ErrorInternalServerError("Database connection error")),
    }
}

/// Wrapper handler for Supabase webhooks
async fn supabase_webhook_handler(
    app_state: Data<AppState>,
    _req: actix_web::HttpRequest,
    body: web::Bytes,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    // Parse the webhook payload
    let payload: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|_| actix_web::error::ErrorBadRequest("Invalid JSON payload"))?;

    log::info!("Received Supabase webhook: {:?}", payload);

    // Handle different Supabase Auth events
    if let Some(event_type) = payload.get("type").and_then(|t| t.as_str()) {
        match event_type {
            "user.created" => handle_user_created(&app_state, &payload).await,
            "user.updated" => handle_user_updated(&app_state, &payload).await,
            "user.deleted" => handle_user_deleted(&app_state, &payload).await,
            _ => {
                log::warn!("Unhandled Supabase webhook event: {}", event_type);
                Ok(Json(ApiResponse::success(serde_json::json!({
                    "message": "Event received but not handled",
                    "event_type": event_type
                }))))
            }
        }
    } else {
        Err(actix_web::error::ErrorBadRequest("Missing event type"))
    }
}

/// Handle user creation from Supabase webhook
async fn handle_user_created(
    app_state: &Data<AppState>,
    payload: &serde_json::Value,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    if let Some(user_data) = payload.get("record") {
        if let Some(user_id) = user_data.get("id").and_then(|id| id.as_str()) {
            let email = user_data.get("email")
                .and_then(|e| e.as_str())
                .unwrap_or("unknown@example.com");

            // Create user database
            match app_state.turso_client.create_user_database(user_id, email).await {
                Ok(_) => {
                    log::info!("Created database for Supabase user: {}", user_id);
                    Ok(Json(ApiResponse::success(serde_json::json!({
                        "message": "User database created successfully",
                        "user_id": user_id
                    }))))
                }
                Err(e) => {
                    log::error!("Failed to create database for user {}: {}", user_id, e);
                    Err(actix_web::error::ErrorInternalServerError("Database creation failed"))
                }
            }
        } else {
            Err(actix_web::error::ErrorBadRequest("Missing user ID in payload"))
        }
    } else {
        Err(actix_web::error::ErrorBadRequest("Missing user record in payload"))
    }
}

/// Handle user update from Supabase webhook
async fn handle_user_updated(
    _app_state: &Data<AppState>,
    payload: &serde_json::Value,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    if let Some(user_data) = payload.get("record") {
        if let Some(user_id) = user_data.get("id").and_then(|id| id.as_str()) {
            log::info!("User updated: {}", user_id);
            Ok(Json(ApiResponse::success(serde_json::json!({
                "message": "User update acknowledged",
                "user_id": user_id
            }))))
        } else {
            Err(actix_web::error::ErrorBadRequest("Missing user ID in payload"))
        }
    } else {
        Err(actix_web::error::ErrorBadRequest("Missing user record in payload"))
    }
}

/// Handle user deletion from Supabase webhook
async fn handle_user_deleted(
    _app_state: &Data<AppState>,
    payload: &serde_json::Value,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    if let Some(user_data) = payload.get("old_record") {
        if let Some(user_id) = user_data.get("id").and_then(|id| id.as_str()) {
            // Optionally delete user database or mark as inactive
            log::info!("User deleted: {}", user_id);
            Ok(Json(ApiResponse::success(serde_json::json!({
                "message": "User deletion acknowledged",
                "user_id": user_id
            }))))
        } else {
            Err(actix_web::error::ErrorBadRequest("Missing user ID in payload"))
        }
    } else {
        Err(actix_web::error::ErrorBadRequest("Missing user record in payload"))
    }
}

/// Legacy wrapper handler for Clerk webhooks (kept during migration)
async fn clerk_webhook_handler(
    app_state: Data<AppState>,
    req: actix_web::HttpRequest,
    body: web::Bytes,
) -> ActixResult<Json<ApiResponse<serde_json::Value>>> {
    // Convert actix-web headers to http::HeaderMap for compatibility
    let mut headers = actix_web::http::header::HeaderMap::new();
    for (name, value) in req.headers() {
        headers.insert(name.clone(), value.clone());
    }

    match app_state.webhook_handler.handle_webhook(&headers, &body).await {
        Ok(response) => Ok(response),
        Err(status) => match status {
            actix_web::http::StatusCode::UNAUTHORIZED =>
                Err(actix_web::error::ErrorUnauthorized("Webhook authentication failed")),
            actix_web::http::StatusCode::BAD_REQUEST =>
                Err(actix_web::error::ErrorBadRequest("Invalid webhook payload")),
            _ => Err(actix_web::error::ErrorInternalServerError("Webhook processing failed")),
        }
    }
}
