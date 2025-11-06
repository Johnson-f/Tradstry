use actix_web::{web, HttpRequest, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use log::{info, error};
use std::sync::Arc;

use crate::turso::{AppState, client::TursoClient};
use crate::turso::config::SupabaseConfig;
use crate::turso::auth::validate_supabase_jwt_token;
use crate::service::market_engine::{
    watchlist_price::{
        get_watchlist_entries, get_price_alert_entries,
        create_watchlist_entry, get_watchlist_entry_by_id, update_watchlist_entry, delete_watchlist_entry,
        create_price_alert_entry, get_price_alert_entry_by_id, update_price_alert_entry, delete_price_alert_entry,
        refresh_watchlist_and_alerts, update_watchlist_prices, update_price_alert_prices, check_price_alerts,
    },
    client::MarketClient,
};

#[derive(Debug, Serialize)]
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

    fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message),
        }
    }
}

// =====================================================
// AUTHENTICATION HELPERS
// =====================================================

fn extract_token_from_request(req: &HttpRequest) -> Option<String> {
    let auth_header = req.headers().get("authorization")?;
    let header_str = auth_header.to_str().ok()?;
    header_str.strip_prefix("Bearer ").map(|s| s.to_string())
}

async fn get_authenticated_user(
    req: &HttpRequest,
    supabase_config: &SupabaseConfig,
) -> Result<crate::turso::SupabaseClaims, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing authorization token"))?;
    validate_supabase_jwt_token(&token, supabase_config)
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid or expired authentication token"))
}

async fn get_user_database_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<libsql::Connection, actix_web::Error> {
    turso_client
        .get_user_database_connection(user_id)
        .await
        .map_err(|e| {
            error!("Failed to connect to user database: {}", e);
            actix_web::error::ErrorInternalServerError("Database connection failed")
        })?
        .ok_or_else(|| {
            error!("No database found for user: {}", user_id);
            actix_web::error::ErrorNotFound("User database not found")
        })
}

fn client_from_state(app_state: &web::Data<AppState>) -> anyhow::Result<MarketClient> {
    MarketClient::new(&app_state.config.finance_query)
}

// =====================================================
// WATCHLIST ROUTES
// =====================================================

#[derive(Debug, Deserialize)]
pub struct CreateWatchlistRequest {
    stock_name: Option<String>,
    ticker_symbol: Option<String>,
    logo: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWatchlistRequest {
    stock_name: Option<String>,
    ticker_symbol: Option<String>,
    logo: Option<String>,
}

/// Get all watchlist entries
pub async fn get_all_watchlist(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Getting all watchlist entries");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match get_watchlist_entries(&conn).await {
        Ok(entries) => {
            info!("Successfully retrieved {} watchlist entries", entries.len());
            Ok(HttpResponse::Ok().json(ApiResponse::success(entries)))
        }
        Err(e) => {
            error!("Failed to get watchlist entries: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to get watchlist entries: {}", e)
            )))
        }
    }
}

/// Get a single watchlist entry by ID
pub async fn get_watchlist_by_id(
    req: HttpRequest,
    watchlist_id: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Getting watchlist entry: {}", watchlist_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match get_watchlist_entry_by_id(&conn, &watchlist_id).await {
        Ok(entry) => {
            info!("Successfully retrieved watchlist entry: {}", entry.id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(entry)))
        }
        Err(e) => {
            error!("Failed to get watchlist entry: {}", e);
            if e.to_string().contains("not found") {
                Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                    "Watchlist entry not found".to_string()
                )))
            } else {
                Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                    format!("Failed to get watchlist entry: {}", e)
                )))
            }
        }
    }
}

/// Create a new watchlist entry
pub async fn create_watchlist(
    req: HttpRequest,
    payload: web::Json<CreateWatchlistRequest>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let symbol_or_name = payload.ticker_symbol.as_deref()
        .or_else(|| payload.stock_name.as_deref())
        .unwrap_or("unknown");
    info!("Creating watchlist entry for: {}", symbol_or_name);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;

    match create_watchlist_entry(
        &conn,
        &client,
        payload.stock_name.as_deref(),
        payload.ticker_symbol.as_deref(),
        payload.logo.as_deref(),
    ).await {
        Ok(entry) => {
            info!("Successfully created watchlist entry: {}", entry.id);
            Ok(HttpResponse::Created().json(ApiResponse::success(entry)))
        }
        Err(e) => {
            error!("Failed to create watchlist entry: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to create watchlist entry: {}", e)
            )))
        }
    }
}

/// Update a watchlist entry
pub async fn update_watchlist(
    req: HttpRequest,
    watchlist_id: web::Path<String>,
    payload: web::Json<UpdateWatchlistRequest>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Updating watchlist entry: {}", watchlist_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match update_watchlist_entry(
        &conn,
        &watchlist_id,
        payload.stock_name.as_deref(),
        payload.ticker_symbol.as_deref(),
        payload.logo.as_deref(),
    ).await {
        Ok(entry) => {
            info!("Successfully updated watchlist entry: {}", entry.id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(entry)))
        }
        Err(e) => {
            error!("Failed to update watchlist entry: {}", e);
            if e.to_string().contains("not found") {
                Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                    "Watchlist entry not found".to_string()
                )))
            } else {
                Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                    format!("Failed to update watchlist entry: {}", e)
                )))
            }
        }
    }
}

/// Delete a watchlist entry
pub async fn delete_watchlist(
    req: HttpRequest,
    watchlist_id: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Deleting watchlist entry: {}", watchlist_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match delete_watchlist_entry(&conn, &watchlist_id).await {
        Ok(true) => {
            info!("Successfully deleted watchlist entry: {}", watchlist_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success("Watchlist entry deleted successfully")))
        }
        Ok(false) => {
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Watchlist entry not found".to_string()
            )))
        }
        Err(e) => {
            error!("Failed to delete watchlist entry: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to delete watchlist entry: {}", e)
            )))
        }
    }
}

/// Refresh watchlist prices from external API
pub async fn refresh_watchlist_prices(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Refreshing watchlist prices");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;

    match update_watchlist_prices(&conn, &client).await {
        Ok(updated_symbols) => {
            info!("Successfully refreshed {} watchlist prices", updated_symbols.len());
            Ok(HttpResponse::Ok().json(ApiResponse::success(updated_symbols)))
        }
        Err(e) => {
            error!("Failed to refresh watchlist prices: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to refresh watchlist prices: {}", e)
            )))
        }
    }
}

// =====================================================
// PRICE ALERT ROUTES
// =====================================================

#[derive(Debug, Deserialize)]
pub struct CreatePriceAlertRequest {
    stock_name: Option<String>,
    symbol: Option<String>,
    alert_price: f64,
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePriceAlertRequest {
    stock_name: Option<String>,
    symbol: Option<String>,
    alert_price: Option<f64>,
    note: Option<String>,
}

/// Get all price alert entries
pub async fn get_all_price_alerts(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Getting all price alert entries");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match get_price_alert_entries(&conn).await {
        Ok(entries) => {
            info!("Successfully retrieved {} price alert entries", entries.len());
            Ok(HttpResponse::Ok().json(ApiResponse::success(entries)))
        }
        Err(e) => {
            error!("Failed to get price alert entries: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to get price alert entries: {}", e)
            )))
        }
    }
}

/// Get a single price alert entry by ID
pub async fn get_price_alert_by_id(
    req: HttpRequest,
    alert_id: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Getting price alert entry: {}", alert_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match get_price_alert_entry_by_id(&conn, &alert_id).await {
        Ok(entry) => {
            info!("Successfully retrieved price alert entry: {}", entry.id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(entry)))
        }
        Err(e) => {
            error!("Failed to get price alert entry: {}", e);
            if e.to_string().contains("not found") {
                Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                    "Price alert entry not found".to_string()
                )))
            } else {
                Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                    format!("Failed to get price alert entry: {}", e)
                )))
            }
        }
    }
}

/// Create a new price alert entry
pub async fn create_price_alert(
    req: HttpRequest,
    payload: web::Json<CreatePriceAlertRequest>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let symbol_or_name = payload.symbol.as_deref()
        .or_else(|| payload.stock_name.as_deref())
        .unwrap_or("unknown");
    info!("Creating price alert for: {} at price: {}", symbol_or_name, payload.alert_price);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;

    match create_price_alert_entry(
        &conn,
        &client,
        payload.stock_name.as_deref(),
        payload.symbol.as_deref(),
        payload.alert_price,
        payload.note.as_deref(),
    ).await {
        Ok(entry) => {
            info!("Successfully created price alert entry: {}", entry.id);
            Ok(HttpResponse::Created().json(ApiResponse::success(entry)))
        }
        Err(e) => {
            error!("Failed to create price alert entry: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to create price alert entry: {}", e)
            )))
        }
    }
}

/// Update a price alert entry
pub async fn update_price_alert(
    req: HttpRequest,
    alert_id: web::Path<String>,
    payload: web::Json<UpdatePriceAlertRequest>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Updating price alert entry: {}", alert_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match update_price_alert_entry(
        &conn,
        &alert_id,
        payload.stock_name.as_deref(),
        payload.symbol.as_deref(),
        payload.alert_price,
        payload.note.as_deref(),
    ).await {
        Ok(entry) => {
            info!("Successfully updated price alert entry: {}", entry.id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(entry)))
        }
        Err(e) => {
            error!("Failed to update price alert entry: {}", e);
            if e.to_string().contains("not found") {
                Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                    "Price alert entry not found".to_string()
                )))
            } else {
                Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                    format!("Failed to update price alert entry: {}", e)
                )))
            }
        }
    }
}

/// Delete a price alert entry
pub async fn delete_price_alert(
    req: HttpRequest,
    alert_id: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Deleting price alert entry: {}", alert_id);

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match delete_price_alert_entry(&conn, &alert_id).await {
        Ok(true) => {
            info!("Successfully deleted price alert entry: {}", alert_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success("Price alert entry deleted successfully")))
        }
        Ok(false) => {
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Price alert entry not found".to_string()
            )))
        }
        Err(e) => {
            error!("Failed to delete price alert entry: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to delete price alert entry: {}", e)
            )))
        }
    }
}

/// Refresh price alert prices from external API
pub async fn refresh_price_alert_prices(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Refreshing price alert prices");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;

    match update_price_alert_prices(&conn, &client).await {
        Ok(updated_symbols) => {
            info!("Successfully refreshed {} price alert prices", updated_symbols.len());
            Ok(HttpResponse::Ok().json(ApiResponse::success(updated_symbols)))
        }
        Err(e) => {
            error!("Failed to refresh price alert prices: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to refresh price alert prices: {}", e)
            )))
        }
    }
}

/// Check for triggered price alerts
pub async fn check_alerts(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Checking for triggered price alerts");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;

    match check_price_alerts(&conn).await {
        Ok(triggered_alerts) => {
            info!("Found {} triggered alerts", triggered_alerts.len());
            Ok(HttpResponse::Ok().json(ApiResponse::success(triggered_alerts)))
        }
        Err(e) => {
            error!("Failed to check price alerts: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to check price alerts: {}", e)
            )))
        }
    }
}

/// Refresh both watchlist and price alerts, then check for triggered alerts
pub async fn refresh_and_check_alerts(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("Refreshing watchlist and price alerts, then checking for triggers");

    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;
    let conn = get_user_database_connection(user_id, &app_state.turso_client).await?;
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    let web_push_config = &app_state.config.web_push;

    match refresh_watchlist_and_alerts(&conn, &client, Some(user_id), Some(web_push_config)).await {
        Ok(triggered_alerts) => {
            info!("Found {} triggered alerts after refresh", triggered_alerts.len());
            Ok(HttpResponse::Ok().json(ApiResponse::success(triggered_alerts)))
        }
        Err(e) => {
            error!("Failed to refresh and check alerts: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                format!("Failed to refresh and check alerts: {}", e)
            )))
        }
    }
}

/// Cron endpoint: Check all users' price alerts and send notifications
/// This endpoint is called by an external cron service
pub async fn check_all_price_alerts(
    _req: HttpRequest,
    app_state: web::Data<AppState>,
    turso_client: web::Data<Arc<TursoClient>>,
) -> Result<HttpResponse> {
    // TODO: Re-enable cron secret validation after debugging
    // Verify cron secret from header
    // let cron_secret = req.headers().get("X-Cron-Secret")
    //     .and_then(|v| v.to_str().ok())
    //     .ok_or_else(|| {
    //         error!("Missing X-Cron-Secret header");
    //         actix_web::error::ErrorUnauthorized("Missing cron secret")
    //     })?;
    // 
    // let env_cron_secret = std::env::var("CRON_SECRET").unwrap_or_default();
    // 
    // info!("Cron secret validation:");
    // info!("  Header value: {}", cron_secret);
    // info!("  Env value length: {}", env_cron_secret.len());
    // info!("  Env value (first 20 chars): {}", 
    //       if env_cron_secret.len() > 20 { 
    //           &env_cron_secret[..20] 
    //       } else { 
    //           &env_cron_secret 
    //       });
    // info!("  Values match: {}", cron_secret == env_cron_secret);
    // 
    // if cron_secret != env_cron_secret {
    //     error!("Invalid cron secret - header and env do not match");
    //     return Err(actix_web::error::ErrorUnauthorized("Invalid cron secret"));
    // }

    info!("Starting price alert check for all users (cron secret validation disabled for debugging)");

    // Get all active users from registry
    let registry_conn = turso_client.get_registry_connection().await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Registry connection failed"))?;
    
    let stmt = registry_conn.prepare(
        "SELECT user_id FROM user_databases WHERE is_active = 1"
    ).await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
    
    let mut rows = stmt.query(libsql::params![]).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
    
    let mut total_processed = 0u64;
    let mut total_alerts_triggered = 0u64;
    let mut success_count = 0u64;
    let mut failure_count = 0u64;
    
    let client = client_from_state(&app_state).map_err(actix_web::error::ErrorInternalServerError)?;
    let web_push_config = &app_state.config.web_push;

    while let Some(row) = rows.next().await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))? {
        let user_id: String = row.get(0).unwrap_or_default();
        
        // Get user's database connection
        if let Ok(Some(user_db)) = turso_client.get_user_database(&user_id).await {
            let conn = libsql::Builder::new_remote(user_db.db_url.clone(), user_db.db_token.clone())
                .build()
                .await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))?
                .connect()
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))?;
            
            // Check if user has any price alerts
            let alert_check_stmt = conn.prepare(
                "SELECT COUNT(*) FROM price_alert"
            ).await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
            
            let mut alert_rows = alert_check_stmt.query(libsql::params![]).await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
            
            if let Some(alert_row) = alert_rows.next().await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))? {
                let alert_count: i64 = alert_row.get(0).unwrap_or(0);
                
                if alert_count > 0 {
                    // User has alerts, process them
                    match refresh_watchlist_and_alerts(&conn, &client, Some(&user_id), Some(web_push_config)).await {
                        Ok(triggered_alerts) => {
                            total_processed += 1;
                            total_alerts_triggered += triggered_alerts.len() as u64;
                            success_count += 1;
                            info!("Processed user {}: {} alerts triggered", user_id, triggered_alerts.len());
                        }
                        Err(e) => {
                            failure_count += 1;
                            error!("Failed to process alerts for user {}: {}", user_id, e);
                        }
                    }
                }
            }
        }
    }

    let summary = serde_json::json!({
        "total_users_processed": total_processed,
        "total_alerts_triggered": total_alerts_triggered,
        "success_count": success_count,
        "failure_count": failure_count,
    });

    info!("Price alert check completed: {:?}", summary);
    Ok(HttpResponse::Ok().json(ApiResponse::success(summary)))
}

// =====================================================
// ROUTE CONFIGURATION
// =====================================================

pub fn configure_watchlist_price_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/watchlist")
            .route("", web::get().to(get_all_watchlist))
            .route("", web::post().to(create_watchlist))
            .route("/{id}", web::get().to(get_watchlist_by_id))
            .route("/{id}", web::put().to(update_watchlist))
            .route("/{id}", web::delete().to(delete_watchlist))
            .route("/refresh", web::post().to(refresh_watchlist_prices))
    )
    .service(
        web::scope("/api/price-alerts")
            .route("", web::get().to(get_all_price_alerts))
            .route("", web::post().to(create_price_alert))
            .route("/{id}", web::get().to(get_price_alert_by_id))
            .route("/{id}", web::put().to(update_price_alert))
            .route("/{id}", web::delete().to(delete_price_alert))
            .route("/refresh", web::post().to(refresh_price_alert_prices))
            .route("/check", web::post().to(check_alerts))
            .route("/refresh-and-check", web::post().to(refresh_and_check_alerts))
    );
}

