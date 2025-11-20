use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use std::sync::Arc;
use log::{info, error, warn};
use uuid::Uuid;
use chrono::Utc;
use libsql::Connection;

use crate::turso::{
    AppState, 
    client::TursoClient, 
    config::{SupabaseConfig, SupabaseClaims
    }};

use crate::turso::auth::{
    validate_supabase_jwt_token, 
    get_supabase_user_id
     };
     
use crate::service::transform;
use crate::models::stock::stocks::{Stock, CreateStockRequest, TradeType, OrderType};
use crate::models::options::option_trade::{OptionTrade, CreateOptionRequest, OptionType};

/// HTTP client for communicating with Go SnapTrade microservice
#[derive(Clone)]
pub struct SnapTradeClient {
    base_url: String,
    http: Client,
}

impl SnapTradeClient {
    pub fn new(base_url: String) -> anyhow::Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;
        
        Ok(Self { base_url, http })
    }

    pub async fn call_go_service<T: Serialize>(
        &self,
        method: &str,
        path: &str,
        body: Option<&T>,
        user_id: &str,
        user_secret: Option<&str>,
    ) -> anyhow::Result<reqwest::Response> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = match method {
            "GET" => self.http.get(&url),
            "POST" => self.http.post(&url),
            "PUT" => self.http.put(&url),
            "DELETE" => self.http.delete(&url),
            _ => return Err(anyhow::anyhow!("Unsupported method")),
        };

        req = req.header("X-User-Id", user_id);
        req = req.header("Content-Type", "application/json");
        
        if let Some(secret) = user_secret {
            req = req.header("X-User-Secret", secret);
        }
        
        if let Some(b) = body {
            req = req.json(b);
        }

        let resp = req.send().await?;
        Ok(resp)
    }
}

/// Helper function to get existing account ID by snaptrade_account_id
async fn get_existing_account_id(
    conn: &Connection,
    connection_id: &str,
    snaptrade_account_id: &str,
) -> Option<String> {
    let stmt = match conn
        .prepare("SELECT id FROM brokerage_accounts WHERE connection_id = ? AND snaptrade_account_id = ?")
        .await
    {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to prepare account query: {}", e);
            return None;
        }
    };

    let mut rows = match stmt.query(libsql::params![connection_id, snaptrade_account_id]).await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to query account: {}", e);
            return None;
        }
    };

    if let Ok(Some(row)) = rows.next().await
        && let Ok(id) = row.get::<String>(0) {
            return Some(id);
    }
    None
}

/// Helper function to get existing holding ID by account_id and symbol
async fn get_existing_holding_id(
    conn: &Connection,
    account_id: &str,
    symbol: &str,
) -> Option<String> {
    let stmt = match conn
        .prepare("SELECT id FROM brokerage_holdings WHERE account_id = ? AND symbol = ?")
        .await
    {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to prepare holding query: {}", e);
            return None;
        }
    };

    let mut rows = match stmt.query(libsql::params![account_id, symbol]).await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to query holding: {}", e);
            return None;
        }
    };

    if let Ok(Some(row)) = rows.next().await
        && let Ok(id) = row.get::<String>(0) {
            return Some(id);
    }
    None
}

/// Helper function to check if transaction already exists
async fn transaction_exists(
    conn: &Connection,
    account_id: &str,
    snaptrade_transaction_id: &str,
) -> bool {
    let stmt = match conn
        .prepare("SELECT 1 FROM brokerage_transactions WHERE account_id = ? AND snaptrade_transaction_id = ? LIMIT 1")
        .await
    {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to prepare transaction check query: {}", e);
            return false;
        }
    };

    let mut rows = match stmt.query(libsql::params![account_id, snaptrade_transaction_id]).await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to query transaction: {}", e);
            return false;
        }
    };

    matches!(rows.next().await, Ok(Some(_)))
}

/// Response wrapper
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    fn error(message: &str) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message.to_string()),
        }
    }
}

/// Request/Response types
#[derive(Deserialize)]
pub struct ConnectBrokerageRequest {
    pub brokerage_id: String,
    pub connection_type: Option<String>, // "read" or "trade"
    #[allow(dead_code)]
    pub redirect_uri: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ConnectBrokerageResponse {
    pub redirect_url: String,
    pub connection_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct SyncAccountsResponse {
    pub accounts: Vec<serde_json::Value>,
    pub holdings: Vec<serde_json::Value>,
    pub transactions: Vec<serde_json::Value>,
}

#[derive(Serialize)]
pub struct SyncSummary {
    pub accounts_synced: usize,
    pub holdings_synced: usize,
    pub transactions_synced: usize,
    pub last_sync_at: String,
}

/// Helper: Extract and validate auth from request
async fn get_authenticated_user(
    req: &HttpRequest,
    supabase_config: &SupabaseConfig,
) -> Result<SupabaseClaims, actix_web::Error> {
    let auth_header = req.headers().get("authorization");
    
    let token = if let Some(header_value) = auth_header {
        let header_str = header_value.to_str()
            .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid authorization header"))?;
        
        if let Some(token) = header_str.strip_prefix("Bearer ") {
            token.to_string()
        } else {
            return Err(actix_web::error::ErrorUnauthorized("Missing Bearer token"));
        }
    } else {
        return Err(actix_web::error::ErrorUnauthorized("Missing authorization header"));
    };

    validate_supabase_jwt_token(&token, supabase_config)
        .await
        .map_err(|e| {
            error!("JWT validation failed: {}", e);
            actix_web::error::ErrorUnauthorized("Invalid or expired authentication token")
        })
}

/// Helper: Get user database connection
async fn get_user_db_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<Connection, actix_web::Error> {
    turso_client
        .get_user_database_connection(user_id)
        .await
        .map_err(|e| {
            error!("Error getting user database connection: {}", e);
            actix_web::error::ErrorInternalServerError("Database access error")
        })?
        .ok_or_else(|| actix_web::error::ErrorNotFound("User database not found"))
}

/// Helper: Get or create SnapTrade user
async fn get_or_create_snaptrade_user(
    conn: &Connection,
    user_id: &str,
    snaptrade_client: &SnapTradeClient,
) -> Result<(String, String), actix_web::Error> {
    // Check if user already has a SnapTrade user
    let rows = conn
        .prepare("SELECT snaptrade_user_id, snaptrade_user_secret FROM brokerage_connections WHERE user_id = ? LIMIT 1")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut result = rows.query(libsql::params![user_id]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let snaptrade_user_id: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_user_secret: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        return Ok((snaptrade_user_id, snaptrade_user_secret));
    }

    // Create new SnapTrade user
    let create_user_req = serde_json::json!({
        "user_id": user_id
    });

    let response = snaptrade_client
        .call_go_service("POST", "/api/v1/users", Some(&create_user_req), user_id, None)
        .await
        .map_err(|e| {
            error!("Failed to create SnapTrade user: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to create SnapTrade user")
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("SnapTrade service error ({}): {}", status, error_text);
        
        // If user already exists (400), check if we have credentials stored
        // If not, return clear error message explaining user needs to reconnect
        if status.as_u16() == 400 {
            // Check again if credentials were stored (race condition check)
            let rows = conn
                .prepare("SELECT snaptrade_user_id, snaptrade_user_secret FROM brokerage_connections WHERE user_id = ? LIMIT 1")
                .await
                .map_err(|e| {
                    error!("Database error: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;

            let mut result = rows.query(libsql::params![user_id]).await
                .map_err(|e| {
                    error!("Database query error: {}", e);
                    actix_web::error::ErrorInternalServerError("Database query error")
                })?;

            if let Some(row) = result.next().await
                .map_err(|e| {
                    error!("Database row error: {}", e);
                    actix_web::error::ErrorInternalServerError("Database row error")
                })? {
                let snaptrade_user_id: String = row.get(0)
                    .map_err(|e| {
                        error!("Database get error: {}", e);
                        actix_web::error::ErrorInternalServerError("Database get error")
                    })?;
                let snaptrade_user_secret: String = row.get(1)
                    .map_err(|e| {
                        error!("Database get error: {}", e);
                        actix_web::error::ErrorInternalServerError("Database get error")
                    })?;
                // Credentials found, return them
                return Ok((snaptrade_user_id, snaptrade_user_secret));
            }
            
            // User exists in SnapTrade but we don't have credentials stored
            // Try to delete the user and recreate with proper credentials
            info!("User exists in SnapTrade but credentials not stored. Attempting to delete and recreate user: {}", user_id);
            
            // Try to delete the user using the correct endpoint
            // Endpoint: DELETE /api/v1/snapTrade/deleteUser
            // Note: Deletion is async and user is queued for deletion
            // We need user_secret to delete, but we don't have it, so try with user_id as secret
            let delete_req = serde_json::json!({
                "user_secret": user_id  // Try using user_id as secret for deletion
            });
            
            let delete_response = snaptrade_client
                .call_go_service("DELETE", &format!("/api/v1/users/{}", user_id), Some(&delete_req), user_id, None)
                .await;
            
            let deletion_queued = match delete_response {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let delete_result: serde_json::Value = resp.json().await.unwrap_or_default();
                        if let Some(status) = delete_result.get("status").and_then(|s| s.as_str()) {
                            if status == "deleted" {
                                info!("SnapTrade user queued for deletion: {}. Detail: {}", 
                                    user_id, 
                                    delete_result.get("detail").and_then(|d| d.as_str()).unwrap_or(""));
                                true
                            } else {
                                warn!("Unexpected deletion status: {}", status);
                                false
                            }
                        } else {
                            info!("SnapTrade user deletion request sent: {}", user_id);
                            true
                        }
                    } else {
                        let delete_error = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                        warn!("Failed to delete SnapTrade user (may require user_secret): {}. Will attempt to recreate anyway.", delete_error);
                        false
                    }
                }
                Err(e) => {
                    warn!("Error attempting to delete SnapTrade user: {}. Will attempt to recreate anyway.", e);
                    false
                }
            };
            
            // Wait for async deletion to process (if it was queued)
            // SnapTrade queues deletion, so we need to wait longer
            if deletion_queued {
                info!("Waiting for SnapTrade user deletion to complete...");
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
            }
            
            // Now try to create the user again
            let create_user_req_retry = serde_json::json!({
                "user_id": user_id
            });

            let retry_response = snaptrade_client
                .call_go_service("POST", "/api/v1/users", Some(&create_user_req_retry), user_id, None)
                .await;

            match retry_response {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let user_data: serde_json::Value = resp.json().await
                            .map_err(|e| {
                                error!("Failed to parse response: {}", e);
                                actix_web::error::ErrorInternalServerError("Failed to parse response")
                            })?;

                        let snaptrade_user_id = user_data["user_id"]
                            .as_str()
                            .ok_or_else(|| actix_web::error::ErrorInternalServerError("Invalid response format"))?
                            .to_string();
                        let snaptrade_user_secret = user_data["user_secret"]
                            .as_str()
                            .ok_or_else(|| actix_web::error::ErrorInternalServerError("Invalid response format"))?
                            .to_string();

                        // Store the new credentials immediately
                        let now = Utc::now().to_rfc3339();
                        conn.execute(
                            "INSERT OR REPLACE INTO brokerage_connections (id, user_id, snaptrade_user_id, snaptrade_user_secret, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            libsql::params![
                                Uuid::new_v4().to_string(),
                                user_id,
                                snaptrade_user_id.clone(),
                                snaptrade_user_secret.clone(),
                                "pending",
                                now.clone(),
                                now
                            ],
                        ).await.ok(); // Don't fail if insert fails

                        info!("Successfully recreated SnapTrade user with new credentials: {}", user_id);
                        return Ok((snaptrade_user_id, snaptrade_user_secret));
                    } else {
                        let retry_status_code = resp.status().as_u16();
                        let retry_error_text = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                        error!("Failed to recreate SnapTrade user: {}", retry_error_text);
                        
                        // If user still exists, deletion didn't work (requires user_secret)
                        if retry_error_text.contains("already exist") || retry_status_code == 400 {
                            return Err(actix_web::error::ErrorBadRequest(
                                format!("Cannot delete existing SnapTrade user without credentials. Please contact support to reset your SnapTrade account, or wait a few minutes and try again. Error: {}", retry_error_text)
                            ));
                        }
                        
                        return Err(actix_web::error::ErrorInternalServerError(
                            format!("Failed to recreate SnapTrade user after deletion. Please try again in a few moments. Error: {}", retry_error_text)
                        ));
                    }
                }
                Err(e) => {
                    error!("Failed to recreate SnapTrade user after deletion: {}", e);
                    return Err(actix_web::error::ErrorInternalServerError(
                        format!("Failed to recreate SnapTrade user. Please try again in a few moments. Error: {}", e)
                    ));
                }
            }
        }
        
        return Err(actix_web::error::ErrorInternalServerError(
            format!("Failed to create SnapTrade user: {}", error_text)
        ));
    }

    let user_data: serde_json::Value = response.json().await
        .map_err(|e| {
            error!("Failed to parse response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    let snaptrade_user_id = user_data["user_id"]
        .as_str()
        .ok_or_else(|| actix_web::error::ErrorInternalServerError("Invalid response format"))?
        .to_string();
    let snaptrade_user_secret = user_data["user_secret"]
        .as_str()
        .ok_or_else(|| actix_web::error::ErrorInternalServerError("Invalid response format"))?
        .to_string();

    // Store user_id and user_secret immediately after successful registration
    // This ensures we have credentials even if no connection is created yet
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO brokerage_connections (id, user_id, snaptrade_user_id, snaptrade_user_secret, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        libsql::params![
            Uuid::new_v4().to_string(),
            user_id,
            snaptrade_user_id.clone(),
            snaptrade_user_secret.clone(),
            "pending",
            now.clone(),
            now
        ],
    ).await.ok(); // Don't fail if insert fails (might already exist from race condition)

    Ok((snaptrade_user_id, snaptrade_user_secret))
}

/// Route: Initiate brokerage connection
pub async fn initiate_connection(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    body: web::Json<ConnectBrokerageRequest>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    info!("Initiating connection for user: {}", user_id);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Initialize SnapTrade client
    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    // Get or create SnapTrade user
    let (snaptrade_user_id, snaptrade_user_secret) = get_or_create_snaptrade_user(
        &conn,
        &user_id,
        &snaptrade_client,
    ).await?;

    // Call Go service to generate connection portal URL
    let initiate_req = serde_json::json!({
        "brokerage_id": body.brokerage_id,
        "connection_type": body.connection_type.as_deref().unwrap_or("read"),
        "user_secret": snaptrade_user_secret
    });

    let response = snaptrade_client
        .call_go_service("POST", "/api/v1/connections/initiate", Some(&initiate_req), &user_id, None)
        .await
        .map_err(|e| {
            error!("Failed to call SnapTrade service: {}", e);
            actix_web::error::ErrorInternalServerError("SnapTrade service error")
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("SnapTrade service error: {}", error_text);
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&error_text)));
    }

    let response_text = response.text().await
        .map_err(|e| {
            error!("Failed to read response text: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to read response")
        })?;
    
    info!("SnapTrade service response: {}", response_text);
    
    let data: ConnectBrokerageResponse = serde_json::from_str(&response_text)
        .map_err(|e| {
            error!("Failed to parse response JSON: {}. Response was: {}", e, response_text);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;
    
    info!("Parsed connection response - redirect_url: {}, connection_id: {}", 
          data.redirect_url, data.connection_id);

    // Store connection in database
    let connection_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let brokerage_id = body.brokerage_id.clone();
    let connection_id_from_data = data.connection_id.clone();

    conn.execute(
        "INSERT INTO brokerage_connections (id, user_id, snaptrade_user_id, snaptrade_user_secret, connection_id, brokerage_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        libsql::params![
            connection_id,
            user_id,
            snaptrade_user_id,
            snaptrade_user_secret, // Store unencrypted for now (should encrypt in production)
            connection_id_from_data,
            brokerage_id,
            "pending",
            now.clone(),
            now
        ],
    ).await.map_err(|e| {
        error!("Failed to store connection: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(data)))
}

/// Route: Get connection status
pub async fn get_connection_status(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let connection_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get connection from database
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, connection_id FROM brokerage_connections WHERE id = ? AND user_id = ?")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let connection_id_clone = connection_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![connection_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_connection_id) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let conn_id: Option<String> = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, conn_id)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Connection not found")));
    };

    let snaptrade_connection_id = snaptrade_connection_id
        .ok_or_else(|| actix_web::error::ErrorNotFound("Connection not found"))?;

    // Call Go service to check status
    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    let response = snaptrade_client
        .call_go_service("GET", &format!("/api/v1/connections/{}/status", snaptrade_connection_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
        .await
        .map_err(|e| {
            error!("Failed to call SnapTrade service: {}", e);
            actix_web::error::ErrorInternalServerError("SnapTrade service error")
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&error_text)));
    }

    let status_data: serde_json::Value = response.json().await
        .map_err(|e| {
            error!("Failed to parse response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    // Update database if connection is completed
    if let Some(status_str) = status_data.get("status").and_then(|s| s.as_str())
        && status_str == "connected" {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "UPDATE brokerage_connections SET status = ?, updated_at = ? WHERE id = ?",
                libsql::params!["connected", now, connection_id],
            ).await.ok(); // Don't fail if update fails
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(status_data)))
}

/// Route: List connections
pub async fn list_connections(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let rows = conn
        .prepare("SELECT id, connection_id, brokerage_name, status, last_sync_at, created_at, updated_at FROM brokerage_connections WHERE user_id = ? ORDER BY created_at DESC")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut result = rows.query(libsql::params![user_id]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let mut connections = Vec::new();
    while let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let id: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let connection_id: Option<String> = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let brokerage_name: String = row.get(2)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let status: String = row.get(3)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let last_sync_at: Option<String> = row.get(4)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let created_at: String = row.get(5)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let updated_at: String = row.get(6)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;

        connections.push(serde_json::json!({
            "id": id,
            "connection_id": connection_id,
            "brokerage_name": brokerage_name,
            "status": status,
            "last_sync_at": last_sync_at,
            "created_at": created_at,
            "updated_at": updated_at
        }));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(connections)))
}

/// Route: Delete connection
pub async fn delete_connection(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let connection_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get connection details
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, connection_id FROM brokerage_connections WHERE id = ? AND user_id = ?")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let connection_id_clone = connection_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![connection_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_connection_id) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let conn_id: Option<String> = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, conn_id)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Connection not found")));
    };

    if let Some(snaptrade_conn_id) = snaptrade_connection_id {
        // Call Go service to delete from SnapTrade
        let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
            .map_err(|e| {
                error!("Failed to create SnapTrade client: {}", e);
                actix_web::error::ErrorInternalServerError("Service configuration error")
            })?;

        let user_id_clone = user_id.clone();
        let _response = snaptrade_client
            .call_go_service("DELETE", &format!("/api/v1/connections/{}", snaptrade_conn_id), None::<&serde_json::Value>, &user_id_clone, Some(&user_secret))
            .await
            .map_err(|e| {
                error!("Failed to delete from SnapTrade: {}", e);
                // Continue with database deletion even if SnapTrade deletion fails
            });
    }

    // Delete from database (cascade will handle accounts, transactions, holdings)
    let connection_id_clone = connection_id.clone();
    conn.execute(
        "DELETE FROM brokerage_connections WHERE id = ? AND user_id = ?",
        libsql::params![connection_id_clone, user_id],
    ).await.map_err(|e| {
        error!("Failed to delete connection: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "success": true,
        "message": "Connection deleted successfully"
    }))))
}

/// Route: List accounts
pub async fn list_accounts(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let rows = conn
        .prepare("SELECT id, connection_id, snaptrade_account_id, account_number, account_name, account_type, balance, currency, institution_name, created_at, updated_at FROM brokerage_accounts WHERE connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?) ORDER BY created_at DESC")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut result = rows.query(libsql::params![user_id]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let mut accounts = Vec::new();
    while let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let id: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let connection_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_account_id: String = row.get(2)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let account_number: Option<String> = row.get(3)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let account_name: Option<String> = row.get(4)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let account_type: Option<String> = row.get(5)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let balance: Option<f64> = row.get(6)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let currency: Option<String> = row.get(7)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let institution_name: Option<String> = row.get(8)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let created_at: String = row.get(9)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let updated_at: String = row.get(10)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;

        accounts.push(serde_json::json!({
            "id": id,
            "connection_id": connection_id,
            "snaptrade_account_id": snaptrade_account_id,
            "account_number": account_number,
            "account_name": account_name,
            "account_type": account_type,
            "balance": balance,
            "currency": currency,
            "institution_name": institution_name,
            "created_at": created_at,
            "updated_at": updated_at
        }));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(accounts)))
}

/// Route: Get account detail
pub async fn get_account_detail(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let account_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get user secret and verify account belongs to user
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, snaptrade_account_id FROM brokerage_accounts WHERE id = ? AND connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?)")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let account_id_clone = account_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![account_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_account_id) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, snaptrade_id)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Account not found")));
    };

    // Call Go service to get account detail
    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    let response = snaptrade_client
        .call_go_service("GET", &format!("/api/v1/accounts/{}", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
        .await
        .map_err(|e| {
            error!("Failed to call SnapTrade service: {}", e);
            actix_web::error::ErrorInternalServerError("SnapTrade service error")
        })?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("SnapTrade service error: {}", error_text);
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&error_text)));
    }

    let account_detail: serde_json::Value = response.json().await
        .map_err(|e| {
            error!("Failed to parse response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(account_detail)))
}

/// Route: Sync accounts
pub async fn sync_accounts(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    info!("Syncing accounts for user: {}", user_id);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get all connections for user
    let rows = conn
        .prepare("SELECT id, snaptrade_user_secret FROM brokerage_connections WHERE user_id = ? AND status = 'connected'")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    let mut total_accounts = 0;
    let mut total_holdings = 0;
    let mut total_transactions = 0;

    while let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let connection_id: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let user_secret: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;

        // Call Go service to sync
        let sync_req = serde_json::json!({
            "user_secret": user_secret
        });

        let user_id_clone = user_id.clone();
        let response = match snaptrade_client
            .call_go_service("POST", "/api/v1/accounts/sync", Some(&sync_req), &user_id_clone, None)
            .await
        {
            Ok(resp) => resp,
            Err(e) => {
                error!("Failed to sync accounts for connection {}: {}", connection_id, e);
                continue; // Continue with other connections
            }
        };

        if !response.status().is_success() {
            error!("Sync failed for connection {}", connection_id);
            continue; // Continue with other connections
        }

        let sync_data: SyncAccountsResponse = match response.json().await {
            Ok(data) => data,
            Err(e) => {
                error!("Failed to parse sync response for connection {}: {}", connection_id, e);
                continue; // Continue with other connections
            }
        };

        // Store synced data in database
        // This is a simplified version - in production, you'd want more robust error handling
        for account in sync_data.accounts {
            if account.get("id").is_some() {
                let snaptrade_account_id = account.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let account_number = account.get("account_number").and_then(|v| v.as_str());
                let account_name = account.get("name").and_then(|v| v.as_str());
                let account_type = account.get("type").and_then(|v| v.as_str());
                let balance = account.get("balance").and_then(|v| v.as_f64());
                let currency = account.get("currency").and_then(|v| v.as_str()).unwrap_or("USD");
                let institution_name = account.get("institution_name").and_then(|v| v.as_str());

                // Check if account already exists to prevent duplicates
                let connection_id_clone = connection_id.clone();
                let account_uuid = match get_existing_account_id(&conn, &connection_id_clone, snaptrade_account_id).await {
                    Some(existing_id) => {
                        info!("Account {} already exists, updating: {}", snaptrade_account_id, existing_id);
                        existing_id
                    },
                    None => {
                        let new_id = Uuid::new_v4().to_string();
                        info!("Creating new account: {} with ID: {}", snaptrade_account_id, new_id);
                        new_id
                    }
                };

                let now = Utc::now().to_rfc3339();
                let raw_data = serde_json::to_string(&account).unwrap_or_default();

                conn.execute(
                    "INSERT OR REPLACE INTO brokerage_accounts (id, connection_id, snaptrade_account_id, account_number, account_name, account_type, balance, currency, institution_name, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM brokerage_accounts WHERE id = ?), ?), ?)",
                    libsql::params![
                        account_uuid.clone(),
                        connection_id_clone,
                        snaptrade_account_id,
                        account_number,
                        account_name,
                        account_type,
                        balance,
                        currency,
                        institution_name,
                        raw_data,
                        account_uuid.clone(),
                        now.clone(),
                        now
                    ],
                ).await.ok(); // Don't fail entire sync if one account fails

                total_accounts += 1;

                // Store holdings for this account
                for holding in &sync_data.holdings {
                    if let Some(holding_account_id) = holding.get("account_id").and_then(|v| v.as_str())
                        && holding_account_id == snaptrade_account_id {
                            let symbol = holding.get("symbol").and_then(|v| v.as_str()).unwrap_or("");
                            if symbol.is_empty() {
                                continue; // Skip holdings without symbols
                            }
                            
                            let quantity = holding.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
                            let average_cost = holding.get("average_cost").and_then(|v| v.as_f64());
                            let current_price = holding.get("current_price").and_then(|v| v.as_f64());
                            let market_value = holding.get("market_value").and_then(|v| v.as_f64());
                            let currency = holding.get("currency").and_then(|v| v.as_str()).unwrap_or("USD");
                            let raw_data = serde_json::to_string(holding).unwrap_or_default();

                            // Check if holding already exists to prevent duplicates
                            let holding_uuid = match get_existing_holding_id(&conn, &account_uuid, symbol).await {
                                Some(existing_id) => {
                                    info!("Holding {} for account {} already exists, updating: {}", symbol, account_uuid, existing_id);
                                    existing_id
                                },
                                None => {
                                    let new_id = Uuid::new_v4().to_string();
                                    info!("Creating new holding: {} for account: {}", symbol, account_uuid);
                                    new_id
                                }
                            };

                            let now = Utc::now().to_rfc3339();

                            conn.execute(
                                "INSERT OR REPLACE INTO brokerage_holdings (id, account_id, symbol, quantity, average_cost, current_price, market_value, currency, last_updated, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                libsql::params![
                                    holding_uuid,
                                    account_uuid.clone(),
                                    symbol,
                                    quantity,
                                    average_cost,
                                    current_price,
                                    market_value,
                                    currency,
                                    now,
                                    raw_data
                                ],
                            ).await.ok();

                            total_holdings += 1;
                    }
                }

                // Store transactions for this account
                for transaction in &sync_data.transactions {
                    if let Some(trans_account_id) = transaction.get("account_id").and_then(|v| v.as_str())
                        && trans_account_id == snaptrade_account_id {
                            let snaptrade_transaction_id = transaction.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            if snaptrade_transaction_id.is_empty() {
                                continue; // Skip transactions without IDs
                            }

                            // Check if transaction already exists to prevent duplicates
                            if transaction_exists(&conn, &account_uuid, snaptrade_transaction_id).await {
                                info!("Transaction {} for account {} already exists, skipping", snaptrade_transaction_id, account_uuid);
                                continue;
                            }

                            let symbol = transaction.get("symbol").and_then(|v| v.as_str());
                            let transaction_type = transaction.get("type").and_then(|v| v.as_str());
                            let quantity = transaction.get("quantity").and_then(|v| v.as_f64());
                            let price = transaction.get("price").and_then(|v| v.as_f64());
                            let amount = transaction.get("amount").and_then(|v| v.as_f64());
                            let currency = transaction.get("currency").and_then(|v| v.as_str()).unwrap_or("USD");
                            let default_trade_date = Utc::now().to_rfc3339();
                            let trade_date = transaction.get("date").and_then(|v| v.as_str()).unwrap_or(&default_trade_date);
                            let settlement_date = transaction.get("settlement_date").and_then(|v| v.as_str());
                            let fees = transaction.get("fees").and_then(|v| v.as_f64());
                            let raw_data = serde_json::to_string(transaction).unwrap_or_default();

                            let transaction_uuid = Uuid::new_v4().to_string();
                            let transaction_now = Utc::now().to_rfc3339();

                            conn.execute(
                                "INSERT INTO brokerage_transactions (id, account_id, snaptrade_transaction_id, symbol, transaction_type, quantity, price, amount, currency, trade_date, settlement_date, fees, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                libsql::params![
                                    transaction_uuid,
                                    account_uuid.clone(),
                                    snaptrade_transaction_id,
                                    symbol,
                                    transaction_type,
                                    quantity,
                                    price,
                                    amount,
                                    currency,
                                    trade_date,
                                    settlement_date,
                                    fees,
                                    raw_data,
                                    transaction_now.clone(),
                                    transaction_now
                                ],
                            ).await.ok();

                            total_transactions += 1;
                    }
                }
            }
        }

        // Update last_sync_at
        let sync_now = Utc::now().to_rfc3339();
        let connection_id_clone = connection_id.clone();
        conn.execute(
            "UPDATE brokerage_connections SET last_sync_at = ?, updated_at = ? WHERE id = ?",
            libsql::params![sync_now.clone(), sync_now, connection_id_clone],
        ).await.ok();
    }

    // Transform brokerage transactions to stocks/options trades
    info!("Starting transformation of brokerage transactions to trades");
    if let Err(e) = transform::migrate_add_brokerage_name_column(&conn).await {
        warn!("Failed to migrate brokerage_name column: {}", e);
    }
    
    // Get vectorization service from app state
    let vectorization_service = app_state.vectorization_service.clone();
    if let Err(e) = transform::transform_brokerage_transactions(&conn, &user_id, Some(vectorization_service)).await {
        error!("Failed to transform brokerage transactions: {}", e);
        // Don't fail the entire sync if transformation fails
    }

    let summary = SyncSummary {
        accounts_synced: total_accounts,
        holdings_synced: total_holdings,
        transactions_synced: total_transactions,
        last_sync_at: Utc::now().to_rfc3339(),
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(summary)))
}

/// Route: Get transactions
pub async fn get_transactions(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let account_id = query.get("account_id");
    let exclude_transformed = query.get("exclude_transformed")
        .and_then(|v| v.parse::<bool>().ok())
        .unwrap_or(false);
    
    let mut sql = "SELECT id, account_id, snaptrade_transaction_id, symbol, transaction_type, quantity, price, amount, currency, trade_date, settlement_date, fees, created_at, is_transformed, raw_data FROM brokerage_transactions WHERE account_id IN (SELECT id FROM brokerage_accounts WHERE connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?))".to_string();

    if let Some(_acc_id) = account_id {
        sql.push_str(" AND account_id = ?");
    }

    if exclude_transformed {
        sql.push_str(" AND (is_transformed IS NULL OR is_transformed = 0)");
    }

    sql.push_str(" ORDER BY trade_date DESC LIMIT 100");

    let rows = conn
        .prepare(&sql)
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut result = if let Some(acc_id) = account_id {
        rows.query(libsql::params![user_id, acc_id.clone()]).await
    } else {
        rows.query(libsql::params![user_id]).await
    }
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let mut transactions = Vec::new();
    while let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let id: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let account_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_transaction_id: String = row.get(2)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let symbol: Option<String> = row.get(3)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let transaction_type: Option<String> = row.get(4)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let quantity: Option<f64> = row.get(5)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let price: Option<f64> = row.get(6)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let amount: Option<f64> = row.get(7)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let currency: Option<String> = row.get(8)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let trade_date: String = row.get(9)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let settlement_date: Option<String> = row.get(10)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let fees: Option<f64> = row.get(11)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let created_at: String = row.get(12)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let is_transformed: Option<i64> = row.get(13)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let raw_data: Option<String> = row.get(14)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;

        transactions.push(serde_json::json!({
            "id": id,
            "account_id": account_id,
            "snaptrade_transaction_id": snaptrade_transaction_id,
            "symbol": symbol,
            "transaction_type": transaction_type,
            "quantity": quantity,
            "price": price,
            "amount": amount,
            "currency": currency,
            "trade_date": trade_date,
            "settlement_date": settlement_date,
            "fees": fees,
            "created_at": created_at,
            "is_transformed": is_transformed.map(|v| v != 0),
            "raw_data": raw_data
        }));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(transactions)))
}

/// Route: Get holdings
pub async fn get_holdings(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let account_id = query.get("account_id");
    let mut sql = "SELECT id, account_id, symbol, quantity, average_cost, current_price, market_value, currency, last_updated FROM brokerage_holdings WHERE account_id IN (SELECT id FROM brokerage_accounts WHERE connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?))".to_string();

    if let Some(_acc_id) = account_id {
        sql.push_str(" AND account_id = ?");
    }

    sql.push_str(" ORDER BY symbol");

    let rows = conn
        .prepare(&sql)
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut result = if let Some(acc_id) = account_id {
        rows.query(libsql::params![user_id, acc_id.clone()]).await
    } else {
        rows.query(libsql::params![user_id]).await
    }
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let mut holdings = Vec::new();
    while let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let id: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let account_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let symbol: String = row.get(2)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let quantity: f64 = row.get(3)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let average_cost: Option<f64> = row.get(4)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let current_price: Option<f64> = row.get(5)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let market_value: Option<f64> = row.get(6)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let currency: Option<String> = row.get(7)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let last_updated: String = row.get(8)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;

        holdings.push(serde_json::json!({
            "id": id,
            "account_id": account_id,
            "symbol": symbol,
            "quantity": quantity,
            "average_cost": average_cost,
            "current_price": current_price,
            "market_value": market_value,
            "currency": currency,
            "last_updated": last_updated
        }));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(holdings)))
}

/// Route: Get account transactions from SnapTrade
pub async fn get_account_transactions(
    req: HttpRequest,
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let account_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get user secret and verify account belongs to user
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, snaptrade_account_id FROM brokerage_accounts WHERE id = ? AND connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?)")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let account_id_clone = account_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![account_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_account_id) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, snaptrade_id)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Account not found")));
    };

    // Build query string with pagination params
    let mut query_string = String::new();
    if let Some(start_date) = query.get("start_date") {
        query_string.push_str(&format!("&start_date={}", start_date));
    }
    if let Some(end_date) = query.get("end_date") {
        query_string.push_str(&format!("&end_date={}", end_date));
    }
    if let Some(offset) = query.get("offset") {
        query_string.push_str(&format!("&offset={}", offset));
    }
    if let Some(limit) = query.get("limit") {
        query_string.push_str(&format!("&limit={}", limit));
    }

    let path = if query_string.is_empty() {
        format!("/api/v1/accounts/{}/transactions", snaptrade_account_id)
    } else {
        format!("/api/v1/accounts/{}/transactions?{}", snaptrade_account_id, &query_string[1..]) // Skip first &
    };

    // Call Go service to get transactions
    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    let response = snaptrade_client
        .call_go_service("GET", &path, None::<&serde_json::Value>, &user_id, Some(&user_secret))
        .await
        .map_err(|e| {
            error!("Failed to call SnapTrade service: {}", e);
            actix_web::error::ErrorInternalServerError("SnapTrade service error")
        })?;

    let status_code = response.status().as_u16();
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("SnapTrade service error: {}", error_text);
        // Handle empty transactions gracefully - return empty array
        if status_code == 404 || status_code == 500 {
            return Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "data": [],
                "pagination": {
                    "offset": query.get("offset").and_then(|s| s.parse::<i32>().ok()).unwrap_or(0),
                    "limit": query.get("limit").and_then(|s| s.parse::<i32>().ok()).unwrap_or(1000),
                    "total": 0
                }
            }))));
        }
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&error_text)));
    }

    let transactions_data: serde_json::Value = response.json().await
        .map_err(|e| {
            error!("Failed to parse response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(transactions_data)))
}

/// Route: Get account equity positions
pub async fn get_account_positions(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let account_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get user secret and verify account belongs to user
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, snaptrade_account_id FROM brokerage_accounts WHERE id = ? AND connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?)")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let account_id_clone = account_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![account_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_account_id) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, snaptrade_id)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Account not found")));
    };

    // Call Go service to get equity positions
    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    let response = snaptrade_client
        .call_go_service("GET", &format!("/api/v1/accounts/{}/holdings", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
        .await
        .map_err(|e| {
            error!("Failed to call SnapTrade service: {}", e);
            actix_web::error::ErrorInternalServerError("SnapTrade service error")
        })?;

    let status_code = response.status().as_u16();
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("SnapTrade service error: {}", error_text);
        // Handle empty positions gracefully - return empty array
        if status_code == 404 || status_code == 500 {
            return Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "positions": []
            }))));
        }
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&error_text)));
    }

    let positions_data: serde_json::Value = response.json().await
        .map_err(|e| {
            error!("Failed to parse response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(positions_data)))
}

/// Route: Get account option positions
pub async fn get_account_option_positions(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let account_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get user secret and verify account belongs to user
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, snaptrade_account_id FROM brokerage_accounts WHERE id = ? AND connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?)")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let account_id_clone = account_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![account_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_account_id) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let snaptrade_id: String = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, snaptrade_id)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Account not found")));
    };

    // Call Go service to get option positions
    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    let response = snaptrade_client
        .call_go_service("GET", &format!("/api/v1/accounts/{}/holdings/options", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
        .await
        .map_err(|e| {
            error!("Failed to call SnapTrade service: {}", e);
            actix_web::error::ErrorInternalServerError("SnapTrade service error")
        })?;

    let status_code = response.status().as_u16();
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("SnapTrade service error: {}", error_text);
        // Handle empty positions gracefully - return empty array
        if status_code == 404 || status_code == 500 {
            return Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "positions": []
            }))));
        }
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&error_text)));
    }

    let positions_data: serde_json::Value = response.json().await
        .map_err(|e| {
            error!("Failed to parse response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    Ok(HttpResponse::Ok().json(ApiResponse::success(positions_data)))
}

/// Route: Complete post-connection sync
/// This endpoint is called after user returns from portal
/// It automatically syncs all accounts, positions, and transactions
pub async fn complete_connection_sync(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);
    let connection_id = path.into_inner();
    let connection_id_clone_for_log = connection_id.clone();

    info!("Completing connection sync for user: {}, connection: {}", user_id, connection_id_clone_for_log);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Verify connection exists and get user secret, connection_id, and status
    let rows = conn
        .prepare("SELECT snaptrade_user_secret, connection_id, status FROM brokerage_connections WHERE id = ? AND user_id = ?")
        .await
        .map_err(|e| {
            error!("Database error: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let connection_id_clone = connection_id.clone();
    let user_id_clone = user_id.clone();
    let mut result = rows.query(libsql::params![connection_id_clone, user_id_clone]).await
        .map_err(|e| {
            error!("Database query error: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    let (user_secret, snaptrade_connection_id, status) = if let Some(row) = result.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        let secret: String = row.get(0)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let conn_id: Option<String> = row.get(1)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        let conn_status: String = row.get(2)
            .map_err(|e| {
                error!("Database get error: {}", e);
                actix_web::error::ErrorInternalServerError("Database get error")
            })?;
        (secret, conn_id, conn_status)
    } else {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("Connection not found")));
    };

    let snaptrade_connection_id = snaptrade_connection_id
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Connection ID not found"))?;

    let snaptrade_client = SnapTradeClient::new(app_state.config.snaptrade_service_url.clone())
        .map_err(|e| {
            error!("Failed to create SnapTrade client: {}", e);
            actix_web::error::ErrorInternalServerError("Service configuration error")
        })?;

    // Check actual connection status from SnapTrade if status is "pending"
    // This allows users who just completed auth to proceed
    if status == "pending" {
        info!("Connection status is pending, checking actual status from SnapTrade");
        let status_response = snaptrade_client
            .call_go_service("GET", &format!("/api/v1/connections/{}/status", snaptrade_connection_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
            .await
            .map_err(|e| {
                error!("Failed to check connection status: {}", e);
                actix_web::error::ErrorInternalServerError("Failed to check connection status")
            })?;

        if status_response.status().is_success() {
            let status_data: serde_json::Value = status_response.json().await
                .map_err(|e| {
                    error!("Failed to parse status response: {}", e);
                    actix_web::error::ErrorInternalServerError("Failed to parse response")
                })?;

            // Update database if connection is completed
            if let Some(status_str) = status_data.get("status").and_then(|s| s.as_str()) {
                if status_str == "connected" {
                    let now = Utc::now().to_rfc3339();
                    let connection_id_for_update = connection_id.clone();
                    conn.execute(
                        "UPDATE brokerage_connections SET status = ?, updated_at = ? WHERE id = ?",
                        libsql::params!["connected", now, connection_id_for_update],
                    ).await.ok(); // Don't fail if update fails
                    info!("Updated connection status from pending to connected");
                } else if status_str != "pending" {
                    // If status is not connected or pending, reject
                    return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                        &format!("Connection is not ready. Current status: {}", status_str)
                    )));
                }
            }
        }
    } else if status != "connected" {
        // Reject if status is not "connected" or "pending"
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            &format!("Connection is not connected. Current status: {}", status)
        )));
    }

    // Step 1: List all accounts for the user
    let list_req = serde_json::json!({
        "user_secret": user_secret
    });

    let accounts_response = snaptrade_client
        .call_go_service("POST", "/api/v1/accounts/sync", Some(&list_req), &user_id, None)
        .await
        .map_err(|e| {
            error!("Failed to list accounts: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to list accounts")
        })?;

    if !accounts_response.status().is_success() {
        let error_text = accounts_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Failed to list accounts: {}", error_text);
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error(&format!("Failed to list accounts: {}", error_text))));
    }

    let sync_data: SyncAccountsResponse = accounts_response.json().await
        .map_err(|e| {
            error!("Failed to parse accounts response: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to parse response")
        })?;

    // Handle empty account list
    if sync_data.accounts.is_empty() {
        info!("No accounts found for user: {}", user_id);
        return Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
            "accounts_synced": 0,
            "holdings_synced": 0,
            "transactions_synced": 0,
            "message": "No accounts found"
        }))));
    }

    let mut total_accounts = 0;
    let mut total_holdings = 0;
    let mut total_transactions = 0;

    // Step 2: Store accounts and fetch/store positions and transactions for each account
    for account in sync_data.accounts {
        if let Some(account_obj) = account.as_object()
            && let Some(snaptrade_account_id) = account_obj.get("id").and_then(|v| v.as_str()) {
                // Store account in database
                let account_number = account_obj.get("number").and_then(|v| v.as_str());
                let account_name = account_obj.get("name").and_then(|v| v.as_str());
                let account_type = account_obj.get("raw_type").or_else(|| account_obj.get("type")).and_then(|v| v.as_str());
                let balance_obj = account_obj.get("balance");
                let balance = balance_obj.and_then(|b| b.get("total")).and_then(|t| t.get("amount")).and_then(|v| v.as_f64());
                let currency = balance_obj.and_then(|b| b.get("total")).and_then(|t| t.get("currency")).and_then(|v| v.as_str()).unwrap_or("USD");
                let institution_name = account_obj.get("institution_name").and_then(|v| v.as_str());

                // Check if account already exists to prevent duplicates
                let connection_id_clone = connection_id.clone();
                let account_uuid = match get_existing_account_id(&conn, &connection_id_clone, snaptrade_account_id).await {
                    Some(existing_id) => {
                        info!("Account {} already exists, updating: {}", snaptrade_account_id, existing_id);
                        existing_id
                    },
                    None => {
                        let new_id = Uuid::new_v4().to_string();
                        info!("Creating new account: {} with ID: {}", snaptrade_account_id, new_id);
                        new_id
                    }
                };

                let now = Utc::now().to_rfc3339();
                let raw_data = serde_json::to_string(&account).unwrap_or_default();

                conn.execute(
                    "INSERT OR REPLACE INTO brokerage_accounts (id, connection_id, snaptrade_account_id, account_number, account_name, account_type, balance, currency, institution_name, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM brokerage_accounts WHERE id = ?), ?), ?)",
                    libsql::params![
                        account_uuid.clone(),
                        connection_id_clone,
                        snaptrade_account_id,
                        account_number,
                        account_name,
                        account_type,
                        balance,
                        currency,
                        institution_name,
                        raw_data,
                        account_uuid.clone(),
                        now.clone(),
                        now
                    ],
                ).await.ok();

                total_accounts += 1;
                info!("Stored account: {}", snaptrade_account_id);

                // Get equity positions
                let equity_response = snaptrade_client
                    .call_go_service("GET", &format!("/api/v1/accounts/{}/holdings", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
                    .await
                    .ok();

            if let Some(equity) = equity_response
                && equity.status().is_success()
                && let Ok(equity_data) = equity.json::<serde_json::Value>().await
                && let Some(positions) = equity_data.get("positions").and_then(|v| v.as_array()) {
                                info!("Got {} equity positions for account: {}", positions.len(), snaptrade_account_id);
                                
                                // Store equity positions
                                for position in positions {
                                    if let Some(pos_obj) = position.as_object() {
                                        let symbol_obj = pos_obj.get("symbol");
                                        let symbol = symbol_obj.and_then(|s| s.get("symbol")).and_then(|v| v.as_str()).unwrap_or("");
                                        if symbol.is_empty() {
                                            continue; // Skip holdings without symbols
                                        }
                                        let quantity = pos_obj.get("units").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                        let average_cost = pos_obj.get("average_purchase_price").and_then(|v| v.as_f64());
                                        let current_price = pos_obj.get("price").and_then(|v| v.as_f64());
                                        let market_value = pos_obj.get("value").and_then(|v| v.as_f64());
                                        let currency = pos_obj.get("currency").and_then(|c| c.get("code")).and_then(|v| v.as_str()).unwrap_or("USD");
                                        let raw_data = serde_json::to_string(position).unwrap_or_default();

                                        // Check if holding already exists to prevent duplicates
                                        let holding_uuid = match get_existing_holding_id(&conn, &account_uuid, symbol).await {
                                            Some(existing_id) => {
                                                info!("Holding {} for account {} already exists, updating: {}", symbol, account_uuid, existing_id);
                                                existing_id
                                            },
                                            None => {
                                                let new_id = Uuid::new_v4().to_string();
                                                info!("Creating new holding: {} for account: {}", symbol, account_uuid);
                                                new_id
                                            }
                                        };

                                        let holding_now = Utc::now().to_rfc3339();

                                        conn.execute(
                                            "INSERT OR REPLACE INTO brokerage_holdings (id, account_id, symbol, quantity, average_cost, current_price, market_value, currency, last_updated, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                            libsql::params![
                                                holding_uuid,
                                                account_uuid.clone(),
                                                symbol,
                                                quantity,
                                                average_cost,
                                                current_price,
                                                market_value,
                                                currency,
                                                holding_now,
                                                raw_data
                                            ],
                                        ).await.ok();

                        total_holdings += 1;
                    }
                }
            }

            // Get option positions
                let options_response = snaptrade_client
                    .call_go_service("GET", &format!("/api/v1/accounts/{}/holdings/options", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
                    .await
                    .ok();

            if let Some(options) = options_response
                && options.status().is_success()
                && let Ok(options_data) = options.json::<serde_json::Value>().await
                && let Some(positions) = options_data.get("positions").and_then(|v| v.as_array()) {
                                info!("Got {} option positions for account: {}", positions.len(), snaptrade_account_id);
                                
                                // Store option positions
                                for position in positions {
                                    if let Some(pos_obj) = position.as_object() {
                                        let symbol_obj = pos_obj.get("symbol");
                                        let symbol = symbol_obj.and_then(|s| s.get("symbol")).and_then(|v| v.as_str()).unwrap_or("");
                                        if symbol.is_empty() {
                                            continue; // Skip holdings without symbols
                                        }
                                        let quantity = pos_obj.get("units").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                        let average_cost = pos_obj.get("average_purchase_price").and_then(|v| v.as_f64());
                                        let current_price = pos_obj.get("price").and_then(|v| v.as_f64());
                                        let market_value = pos_obj.get("value").and_then(|v| v.as_f64());
                                        let currency = pos_obj.get("currency").and_then(|c| c.get("code")).and_then(|v| v.as_str()).unwrap_or("USD");
                                        let raw_data = serde_json::to_string(position).unwrap_or_default();

                                        // Check if holding already exists to prevent duplicates
                                        let holding_uuid = match get_existing_holding_id(&conn, &account_uuid, symbol).await {
                                            Some(existing_id) => {
                                                info!("Holding {} for account {} already exists, updating: {}", symbol, account_uuid, existing_id);
                                                existing_id
                                            },
                                            None => {
                                                let new_id = Uuid::new_v4().to_string();
                                                info!("Creating new holding: {} for account: {}", symbol, account_uuid);
                                                new_id
                                            }
                                        };

                                        let holding_now = Utc::now().to_rfc3339();

                                        conn.execute(
                                            "INSERT OR REPLACE INTO brokerage_holdings (id, account_id, symbol, quantity, average_cost, current_price, market_value, currency, last_updated, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                            libsql::params![
                                                holding_uuid,
                                                account_uuid.clone(),
                                                symbol,
                                                quantity,
                                                average_cost,
                                                current_price,
                                                market_value,
                                                currency,
                                                holding_now,
                                                raw_data
                                            ],
                                        ).await.ok();

                                        total_holdings += 1;
                        }
                    }
                }

                // Get transactions (with pagination - fetch first page)
                let transactions_response = snaptrade_client
                    .call_go_service("GET", &format!("/api/v1/accounts/{}/transactions?limit=1000&offset=0", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
                    .await
                    .ok();

            if let Some(transactions) = transactions_response
                && transactions.status().is_success()
                && let Ok(trans_data) = transactions.json::<serde_json::Value>().await
                && let Some(data_array) = trans_data.get("data").and_then(|v| v.as_array()) {
                                info!("Got {} transactions for account: {}", data_array.len(), snaptrade_account_id);
                                
                                // Store transactions
                                for transaction in data_array {
                                    if let Some(trans_obj) = transaction.as_object() {
                                        let snaptrade_transaction_id = trans_obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                                        if snaptrade_transaction_id.is_empty() {
                                            continue; // Skip transactions without IDs
                                        }
                                        let symbol_obj = trans_obj.get("symbol");
                                        let symbol = symbol_obj.and_then(|s| s.get("symbol")).and_then(|v| v.as_str());
                                        let transaction_type = trans_obj.get("type").and_then(|v| v.as_str());
                                        let quantity = trans_obj.get("units").and_then(|v| v.as_f64());
                                        let price = trans_obj.get("price").and_then(|v| v.as_f64());
                                        let amount = trans_obj.get("amount").and_then(|v| v.as_f64());
                                        let currency_obj = trans_obj.get("currency");
                                        let currency = currency_obj.and_then(|c| c.get("code")).and_then(|v| v.as_str()).unwrap_or("USD");
                                        let default_trade_date = Utc::now().to_rfc3339();
                                        let trade_date = trans_obj.get("trade_date").and_then(|v| v.as_str()).unwrap_or(&default_trade_date);
                                        let settlement_date = trans_obj.get("settlement_date").and_then(|v| v.as_str());
                                        let fees = trans_obj.get("fee").and_then(|v| v.as_f64());
                                        let raw_data = serde_json::to_string(&transaction).unwrap_or_default();

                                        // Check if transaction already exists to prevent duplicates
                                        if transaction_exists(&conn, &account_uuid, snaptrade_transaction_id).await {
                                            info!("Transaction {} for account {} already exists, skipping", snaptrade_transaction_id, account_uuid);
                                            continue;
                                        }

                                        let transaction_uuid = Uuid::new_v4().to_string();
                                        let transaction_now = Utc::now().to_rfc3339();

                                        conn.execute(
                                            "INSERT INTO brokerage_transactions (id, account_id, snaptrade_transaction_id, symbol, transaction_type, quantity, price, amount, currency, trade_date, settlement_date, fees, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                            libsql::params![
                                                transaction_uuid,
                                                account_uuid.clone(),
                                                snaptrade_transaction_id,
                                                symbol,
                                                transaction_type,
                                                quantity,
                                                price,
                                                amount,
                                                currency,
                                                trade_date,
                                                settlement_date,
                                                fees,
                                                raw_data,
                                                transaction_now.clone(),
                                                transaction_now
                                            ],
                                        ).await.ok();

                                        total_transactions += 1;
                    }
                }
            }
        }
    }

    // Update last_sync_at for the connection
    let sync_now = Utc::now().to_rfc3339();
    let sync_now_clone = sync_now.clone();
    let connection_id_clone = connection_id.clone();
    conn.execute(
        "UPDATE brokerage_connections SET last_sync_at = ?, updated_at = ? WHERE id = ?",
        libsql::params![sync_now_clone.clone(), sync_now_clone, connection_id_clone],
    ).await.ok();

    // Transform brokerage transactions to stocks/options trades
    info!("Starting transformation of brokerage transactions to trades");
    if let Err(e) = transform::migrate_add_brokerage_name_column(&conn).await {
        warn!("Failed to migrate brokerage_name column: {}", e);
    }
    
    // Get vectorization service from app state
    let vectorization_service = app_state.vectorization_service.clone();
    if let Err(e) = transform::transform_brokerage_transactions(&conn, &user_id, Some(vectorization_service)).await {
        error!("Failed to transform brokerage transactions: {}", e);
        // Don't fail the entire sync if transformation fails
    }

    let summary = serde_json::json!({
        "accounts_synced": total_accounts,
        "holdings_synced": total_holdings,
        "transactions_synced": total_transactions,
        "last_sync_at": sync_now,
    }); // Semi colon

    Ok(HttpResponse::Ok().json(ApiResponse::success(summary)))
}

/// Unmatched transaction response model
#[derive(Serialize, Deserialize, Debug)]
pub struct UnmatchedTransactionResponse {
    pub id: String,
    pub user_id: String,
    pub transaction_id: String,
    pub snaptrade_transaction_id: String,
    pub symbol: String,
    pub trade_type: String,
    pub units: f64,
    pub price: f64,
    pub fee: f64,
    pub trade_date: String,
    pub brokerage_name: Option<String>,
    pub is_option: bool,
    pub difficulty_reason: Option<String>,
    pub confidence_score: Option<f64>,
    pub suggested_matches: Option<Vec<String>>,
    pub status: String,
    pub resolved_trade_id: Option<i64>,
    pub resolved_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Resolve unmatched transaction request
#[derive(Deserialize, Debug)]
pub struct ResolveUnmatchedRequest {
    pub matched_transaction_id: Option<String>, // ID of the transaction to match with (if merging)
    pub action: String, // "merge" or "create_open"
    pub entry_price: Option<f64>, // Required if action is "create_open"
    pub entry_date: Option<String>, // Required if action is "create_open"
}

/// Get all unmatched transactions for the authenticated user
async fn get_unmatched_transactions(
    req: HttpRequest,
    app_state: web::Data<AppState>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &app_state.config.supabase).await?;
    let user_id = get_supabase_user_id(&claims);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let stmt = conn
        .prepare(
            r#"
            SELECT id, user_id, transaction_id, snaptrade_transaction_id, symbol,
                   trade_type, units, price, fee, trade_date, brokerage_name,
                   is_option, difficulty_reason, confidence_score, suggested_matches,
                   status, resolved_trade_id, resolved_at, created_at, updated_at
            FROM unmatched_transactions
            WHERE user_id = ? AND status = 'pending'
            ORDER BY trade_date DESC, created_at DESC
            "#
        )
        .await
        .map_err(|e| {
            error!("Failed to prepare query: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut rows = stmt.query(libsql::params![user_id]).await
        .map_err(|e| {
            error!("Failed to query unmatched transactions: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut transactions = Vec::new();
    while let Some(row) = rows.next().await
        .map_err(|e| {
            error!("Failed to read row: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })? {
        let suggested_matches_str: Option<String> = row.get(14)
            .map_err(|e| {
                error!("Failed to get suggested_matches: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?;
        let suggested_matches: Option<Vec<String>> = suggested_matches_str
            .and_then(|s| serde_json::from_str(&s).ok());

        transactions.push(UnmatchedTransactionResponse {
            id: row.get(0).map_err(|e| {
                error!("Failed to get id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            user_id: row.get(1).map_err(|e| {
                error!("Failed to get user_id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            transaction_id: row.get(2).map_err(|e| {
                error!("Failed to get transaction_id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            snaptrade_transaction_id: row.get(3).map_err(|e| {
                error!("Failed to get snaptrade_transaction_id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            symbol: row.get(4).map_err(|e| {
                error!("Failed to get symbol: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            trade_type: row.get(5).map_err(|e| {
                error!("Failed to get trade_type: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            units: row.get(6).map_err(|e| {
                error!("Failed to get units: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            price: row.get(7).map_err(|e| {
                error!("Failed to get price: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            fee: row.get(8).map_err(|e| {
                error!("Failed to get fee: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            trade_date: row.get(9).map_err(|e| {
                error!("Failed to get trade_date: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            brokerage_name: row.get(10).map_err(|e| {
                error!("Failed to get brokerage_name: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            is_option: row.get::<Option<i64>>(11).map_err(|e| {
                error!("Failed to get is_option: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?.map(|v| v != 0).unwrap_or(false),
            difficulty_reason: row.get(12).map_err(|e| {
                error!("Failed to get difficulty_reason: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            confidence_score: row.get(13).map_err(|e| {
                error!("Failed to get confidence_score: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            suggested_matches,
            status: row.get(15).map_err(|e| {
                error!("Failed to get status: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            resolved_trade_id: row.get(16).map_err(|e| {
                error!("Failed to get resolved_trade_id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            resolved_at: row.get(17).map_err(|e| {
                error!("Failed to get resolved_at: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            created_at: row.get(18).map_err(|e| {
                error!("Failed to get created_at: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            updated_at: row.get(19).map_err(|e| {
                error!("Failed to get updated_at: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
        });
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(transactions)))
}

/// Resolve an unmatched transaction (merge with another or create open position)
async fn resolve_unmatched_transaction(
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<ResolveUnmatchedRequest>,
    app_state: web::Data<AppState>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &app_state.config.supabase).await?;
    let user_id = get_supabase_user_id(&claims);
    let unmatched_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get the unmatched transaction
    let stmt = conn
        .prepare(
            r#"
            SELECT id, symbol, trade_type, units, price, fee, trade_date,
                   brokerage_name, raw_data, is_option
            FROM unmatched_transactions
            WHERE id = ? AND user_id = ? AND status = 'pending'
            "#
        )
        .await
        .map_err(|e| {
            error!("Failed to prepare query: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut rows = stmt.query(libsql::params![unmatched_id.clone(), user_id.clone()]).await
        .map_err(|e| {
            error!("Failed to query unmatched transaction: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let row = rows.next().await
        .map_err(|e| {
            error!("Failed to read row: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Unmatched transaction not found"))?;

    let symbol: String = row.get(1).map_err(|e| {
        error!("Failed to get symbol: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let trade_type: String = row.get(2).map_err(|e| {
        error!("Failed to get trade_type: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let units: f64 = row.get(3).map_err(|e| {
        error!("Failed to get units: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let price: f64 = row.get(4).map_err(|e| {
        error!("Failed to get price: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let fee: f64 = row.get(5).map_err(|e| {
        error!("Failed to get fee: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let trade_date: String = row.get(6).map_err(|e| {
        error!("Failed to get trade_date: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let brokerage_name: Option<String> = row.get(7).map_err(|e| {
        error!("Failed to get brokerage_name: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let _raw_data: String = row.get(8).map_err(|e| {
        error!("Failed to get raw_data: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let is_option: bool = row.get::<Option<i64>>(9).map_err(|e| {
        error!("Failed to get is_option: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?.map(|v| v != 0).unwrap_or(false);

    let vectorization_service_opt = Some(app_state.vectorization_service.as_ref());

    let trade_id = match body.action.as_str() {
        "merge" => {
            // Merge with another transaction
            if let Some(matched_id) = &body.matched_transaction_id {
                // Get the matched transaction details
                let match_stmt = conn
                    .prepare(
                        r#"
                        SELECT symbol, trade_type, units, price, fee, trade_date,
                               brokerage_name, raw_data, is_option
                        FROM unmatched_transactions
                        WHERE id = ? AND user_id = ? AND status = 'pending'
                        "#
                    )
                    .await
                    .map_err(|e| {
                        error!("Failed to prepare match query: {}", e);
                        actix_web::error::ErrorInternalServerError("Database error")
                    })?;

                let mut match_rows = match_stmt.query(libsql::params![matched_id.as_str(), user_id.as_str()]).await
                    .map_err(|e| {
                        error!("Failed to query matched transaction: {}", e);
                        actix_web::error::ErrorInternalServerError("Database error")
                    })?;

                let match_row = match_rows.next().await
                    .map_err(|e| {
                        error!("Failed to read match row: {}", e);
                        actix_web::error::ErrorInternalServerError("Database error")
                    })?
                    .ok_or_else(|| actix_web::error::ErrorNotFound("Matched transaction not found"))?;

                let _match_symbol: String = match_row.get(0).map_err(|e| {
                    error!("Failed to get match symbol: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;
                let match_trade_type: String = match_row.get(1).map_err(|e| {
                    error!("Failed to get match trade_type: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;
                let match_units: f64 = match_row.get(2).map_err(|e| {
                    error!("Failed to get match units: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;
                let match_price: f64 = match_row.get(3).map_err(|e| {
                    error!("Failed to get match price: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;
                let match_fee: f64 = match_row.get(4).map_err(|e| {
                    error!("Failed to get match fee: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;
                let match_trade_date: String = match_row.get(5).map_err(|e| {
                    error!("Failed to get match trade_date: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;
                let match_brokerage_name: Option<String> = match_row.get(6).map_err(|e| {
                    error!("Failed to get match brokerage_name: {}", e);
                    actix_web::error::ErrorInternalServerError("Database error")
                })?;

                // Determine which is BUY and which is SELL
                let (_entry_price, _exit_price, _entry_date, _exit_date, _entry_fee, _exit_fee) = 
                    if trade_type == "BUY" && match_trade_type == "SELL" {
                        (price, match_price, trade_date.clone(), match_trade_date.clone(), fee, match_fee)
                    } else if trade_type == "SELL" && match_trade_type == "BUY" {
                        (match_price, price, match_trade_date.clone(), trade_date.clone(), match_fee, fee)
                    } else {
                        return Err(actix_web::error::ErrorBadRequest("Transactions must be one BUY and one SELL"));
                    };

                let _shares = units.min(match_units);
                let _brokerage_name_merged = brokerage_name.or(match_brokerage_name);

                if is_option {
                    return Err(actix_web::error::ErrorBadRequest("Option merging not yet implemented"));
                }

                // Note: Manual merge feature is now handled by the merge_transactions endpoint
                // This code path is for resolving unmatched transactions, which should use Stock::create directly
                return Err(actix_web::error::ErrorBadRequest("Please use the merge_transactions endpoint for merging trades"));
            } else {
                return Err(actix_web::error::ErrorBadRequest("matched_transaction_id required for merge action"));
            }
        }
        "create_open" => {
            // Create an open position
            let entry_price = body.entry_price
                .ok_or_else(|| actix_web::error::ErrorBadRequest("entry_price required for create_open action"))?;
            let entry_date = body.entry_date
                .as_ref()
                .ok_or_else(|| actix_web::error::ErrorBadRequest("entry_date required for create_open action"))?;

            if trade_type != "BUY" {
                return Err(actix_web::error::ErrorBadRequest("Only BUY transactions can be created as open positions"));
            }

            if is_option {
                return Err(actix_web::error::ErrorBadRequest("Option open positions not yet implemented"));
            }

            let trade_id = transform::create_open_stock_trade(
                &conn,
                &symbol,
                entry_price,
                units,
                entry_date.clone(),
                fee,
                brokerage_name,
                &user_id,
                vectorization_service_opt,
            ).await
            .map_err(|e| {
                error!("Failed to create open trade: {}", e);
                actix_web::error::ErrorInternalServerError("Failed to create trade")
            })?;

            // Mark as resolved
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "UPDATE unmatched_transactions SET status = 'resolved', resolved_trade_id = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                libsql::params![trade_id, now.clone(), now.clone(), unmatched_id, user_id],
            ).await
            .map_err(|e| {
                error!("Failed to update unmatched transaction: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?;

            trade_id
        }
        _ => {
            return Err(actix_web::error::ErrorBadRequest("Invalid action. Must be 'merge' or 'create_open'"));
        }
    };

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "trade_id": trade_id,
        "message": "Transaction resolved successfully"
    }))))
}

/// Ignore an unmatched transaction (mark as ignored)
async fn ignore_unmatched_transaction(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &app_state.config.supabase).await?;
    let user_id = get_supabase_user_id(&claims);
    let unmatched_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let now = Utc::now().to_rfc3339();
    let result = conn.execute(
        "UPDATE unmatched_transactions SET status = 'ignored', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'",
        libsql::params![now.clone(), unmatched_id, user_id],
    ).await
    .map_err(|e| {
        error!("Failed to update unmatched transaction: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;

    if result == 0 {
        return Err(actix_web::error::ErrorNotFound("Unmatched transaction not found or already resolved"));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
        "message": "Transaction ignored successfully"
    }))))
}

/// Get suggested matches for an unmatched transaction
async fn get_unmatched_suggestions(
    req: HttpRequest,
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &app_state.config.supabase).await?;
    let user_id = get_supabase_user_id(&claims);
    let unmatched_id = path.into_inner();

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    // Get the unmatched transaction
    let stmt = conn
        .prepare(
            r#"
            SELECT symbol, trade_type, units, price, trade_date, brokerage_name
            FROM unmatched_transactions
            WHERE id = ? AND user_id = ?
            "#
        )
        .await
        .map_err(|e| {
            error!("Failed to prepare query: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut rows = stmt.query(libsql::params![unmatched_id.clone(), user_id.clone()]).await
        .map_err(|e| {
            error!("Failed to query unmatched transaction: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let row = rows.next().await
        .map_err(|e| {
            error!("Failed to read row: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?
        .ok_or_else(|| actix_web::error::ErrorNotFound("Unmatched transaction not found"))?;

    let symbol: String = row.get(0).map_err(|e| {
        error!("Failed to get symbol: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let trade_type: String = row.get(1).map_err(|e| {
        error!("Failed to get trade_type: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let _units: f64 = row.get(2).map_err(|e| {
        error!("Failed to get units: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let _price: f64 = row.get(3).map_err(|e| {
        error!("Failed to get price: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let _trade_date: String = row.get(4).map_err(|e| {
        error!("Failed to get trade_date: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    let _brokerage_name: Option<String> = row.get(5).map_err(|e| {
        error!("Failed to get brokerage_name: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;

    // Find potential matches (opposite trade type, same symbol)
    let opposite_type = if trade_type == "BUY" { "SELL" } else { "BUY" };

    let match_stmt = conn
        .prepare(
            r#"
            SELECT id, symbol, trade_type, units, price, trade_date, brokerage_name,
                   confidence_score, difficulty_reason
            FROM unmatched_transactions
            WHERE user_id = ? AND symbol = ? AND trade_type = ? AND status = 'pending' AND id != ?
            ORDER BY trade_date ASC
            LIMIT 10
            "#
        )
        .await
        .map_err(|e| {
            error!("Failed to prepare match query: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut match_rows = match_stmt.query(libsql::params![user_id.as_str(), symbol.as_str(), opposite_type, unmatched_id.as_str()]).await
        .map_err(|e| {
            error!("Failed to query matches: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    let mut suggestions = Vec::new();
    while let Some(match_row) = match_rows.next().await
        .map_err(|e| {
            error!("Failed to read match row: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })? {
        suggestions.push(serde_json::json!({
            "id": match_row.get::<String>(0).map_err(|e| {
                error!("Failed to get suggestion id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "symbol": match_row.get::<String>(1).map_err(|e| {
                error!("Failed to get suggestion symbol: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "trade_type": match_row.get::<String>(2).map_err(|e| {
                error!("Failed to get suggestion trade_type: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "units": match_row.get::<f64>(3).map_err(|e| {
                error!("Failed to get suggestion units: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "price": match_row.get::<f64>(4).map_err(|e| {
                error!("Failed to get suggestion price: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "trade_date": match_row.get::<String>(5).map_err(|e| {
                error!("Failed to get suggestion trade_date: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "brokerage_name": match_row.get::<Option<String>>(6).map_err(|e| {
                error!("Failed to get suggestion brokerage_name: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "confidence_score": match_row.get::<Option<f64>>(7).map_err(|e| {
                error!("Failed to get suggestion confidence_score: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            "difficulty_reason": match_row.get::<Option<String>>(8).map_err(|e| {
                error!("Failed to get suggestion difficulty_reason: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
        }));
    }

    Ok(HttpResponse::Ok().json(ApiResponse::success(suggestions)))
}

/// Request structure for merging transactions
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeTransactionsRequest {
    pub transaction_ids: Vec<String>,
    pub trade_type: String, // "stock" or "option"
    // Stock fields
    pub symbol: String,
    pub order_type: String,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub initial_target: Option<f64>,
    pub profit_target: Option<f64>,
    pub trade_ratings: Option<i32>,
    pub reviewed: Option<bool>,
    pub mistakes: Option<String>,
    pub brokerage_name: Option<String>,
    // Option-specific fields
    #[allow(dead_code)]
    pub strategy_type: Option<String>,
    #[allow(dead_code)]
    pub trade_direction: Option<String>,
    pub option_type: Option<String>,
    pub strike_price: Option<f64>,
    pub expiration_date: Option<String>,
    #[allow(dead_code)]
    pub implied_volatility: Option<f64>,
}

/// Route: Merge brokerage transactions into a stock or option trade
pub async fn merge_transactions(
    req: HttpRequest,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
    payload: web::Json<MergeTransactionsRequest>,
) -> ActixResult<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = get_supabase_user_id(&claims);

    let conn = get_user_db_connection(&user_id, &app_state.turso_client).await?;

    let request = payload.into_inner();

    if request.transaction_ids.is_empty() {
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error("No transactions selected")));
    }

    // Fetch selected transactions
    let placeholders = request.transaction_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, account_id, symbol, transaction_type, quantity, price, fees, trade_date, raw_data 
         FROM brokerage_transactions 
         WHERE id IN ({}) AND account_id IN (SELECT id FROM brokerage_accounts WHERE connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?)) AND (is_transformed IS NULL OR is_transformed = 0)",
        placeholders
    );

    let stmt = conn
        .prepare(&sql)
        .await
        .map_err(|e| {
            error!("Failed to prepare transaction query: {}", e);
            actix_web::error::ErrorInternalServerError("Database error")
        })?;

    // Build params: transaction IDs + user_id
    let mut params: Vec<&str> = request.transaction_ids.iter().map(|s| s.as_str()).collect();
    params.push(&user_id);
    
    let mut rows = stmt.query(params)
        .await
        .map_err(|e| {
            error!("Failed to query transactions: {}", e);
            actix_web::error::ErrorInternalServerError("Database query error")
        })?;

    #[derive(Debug)]
    struct TransactionData {
        #[allow(dead_code)]
        id: String,
        #[allow(dead_code)]
        symbol: Option<String>,
        transaction_type: Option<String>,
        quantity: Option<f64>,
        price: Option<f64>,
        fees: Option<f64>,
        trade_date: String,
    }

    let mut transactions = Vec::new();
    while let Some(row) = rows.next().await
        .map_err(|e| {
            error!("Database row error: {}", e);
            actix_web::error::ErrorInternalServerError("Database row error")
        })? {
        transactions.push(TransactionData {
            id: row.get(0).map_err(|e| {
                error!("Failed to get id: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            symbol: row.get(2).map_err(|e| {
                error!("Failed to get symbol: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            transaction_type: row.get(3).map_err(|e| {
                error!("Failed to get transaction_type: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            quantity: row.get(4).map_err(|e| {
                error!("Failed to get quantity: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            price: row.get(5).map_err(|e| {
                error!("Failed to get price: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            fees: row.get(6).map_err(|e| {
                error!("Failed to get fees: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
            trade_date: row.get(7).map_err(|e| {
                error!("Failed to get trade_date: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?,
        });
    }

    if transactions.is_empty() {
        return Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error("No valid transactions found")));
    }

    // Separate BUY and SELL transactions
    let buys: Vec<&TransactionData> = transactions.iter()
        .filter(|t| t.transaction_type.as_deref() == Some("BUY"))
        .collect();
    let sells: Vec<&TransactionData> = transactions.iter()
        .filter(|t| t.transaction_type.as_deref() == Some("SELL"))
        .collect();

    // Calculate weighted averages
    let calculate_weighted_avg = |txns: &[&TransactionData]| -> (f64, f64, f64) {
        let mut total_value = 0.0;
        let mut total_quantity = 0.0;
        let mut total_fees = 0.0;

        for txn in txns {
            let qty = txn.quantity.unwrap_or(0.0);
            let price = txn.price.unwrap_or(0.0);
            total_value += price * qty;
            total_quantity += qty;
            total_fees += txn.fees.unwrap_or(0.0);
        }

        let avg_price = if total_quantity > 0.0 {
            total_value / total_quantity
        } else {
            0.0
        };

        (avg_price, total_quantity, total_fees)
    };

    let (entry_price, _entry_quantity, _entry_fees) = if !buys.is_empty() {
        calculate_weighted_avg(&buys)
    } else if !sells.is_empty() {
        calculate_weighted_avg(&sells)
    } else {
        return Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error("No BUY or SELL transactions found")));
    };

    let (_exit_price_opt, _exit_quantity, _exit_fees) = if !sells.is_empty() {
        let (price, qty, fees) = calculate_weighted_avg(&sells);
        (Some(price), qty, fees)
    } else {
        (None, 0.0, 0.0)
    };

    // Determine dates
    let entry_date = buys.iter()
        .chain(sells.iter())
        .map(|t| &t.trade_date)
        .min()
        .ok_or_else(|| {
            error!("No trade dates found");
            actix_web::error::ErrorInternalServerError("No trade dates")
        })?;

    let exit_date = if !sells.is_empty() {
        sells.iter()
            .map(|t| &t.trade_date)
            .max()
    } else {
        None
    };

    // Parse dates
    let parse_date = |date_str: &str| -> Result<chrono::DateTime<Utc>, actix_web::Error> {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(date_str) {
            return Ok(dt.with_timezone(&Utc));
        }
        if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S") {
            return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
        }
        if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            let ndt = date.and_hms_opt(0, 0, 0)
                .ok_or_else(|| actix_web::error::ErrorInternalServerError("Invalid date"))?;
            return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
        }
        Err(actix_web::error::ErrorInternalServerError("Unsupported date format"))
    };

    let entry_date_parsed = parse_date(entry_date)?;
    let _exit_date_parsed = exit_date.map(|d| parse_date(d)).transpose()?;

    // Create trade based on type
    if request.trade_type == "stock" {
        let order_type = request.order_type.parse::<OrderType>()
            .map_err(|_| actix_web::error::ErrorBadRequest("Invalid order_type"))?;

        // Generate trade_group_id for linking related trades
        let trade_group_id = Uuid::new_v4().to_string();
        
        // Create position ID
        let position_id = Uuid::new_v4().to_string();
        
        // Sort transactions by date
        let mut all_transactions: Vec<(&TransactionData, usize)> = transactions.iter().enumerate().map(|(idx, t)| (t, idx)).collect();
        all_transactions.sort_by_key(|(t, _)| &t.trade_date);

        let mut created_trades = Vec::new();
        let mut parent_trade_id: Option<i64> = None;
        let mut sequence = 1;

        // Create trade records for each transaction
        for (txn, _) in all_transactions {
            let is_entry = txn.transaction_type.as_deref() == Some("BUY");
            let trade_type = if is_entry { TradeType::BUY } else { TradeType::SELL };
            
            let txn_date = parse_date(&txn.trade_date)?;
            let txn_price = txn.price.unwrap_or(0.0);
            let txn_quantity = txn.quantity.unwrap_or(0.0);
            let txn_fees = txn.fees.unwrap_or(0.0);

            let create_request = CreateStockRequest {
                symbol: request.symbol.clone(),
                trade_type,
                order_type: order_type.clone(),
                entry_price: if is_entry { txn_price } else { entry_price },
                exit_price: if is_entry { txn_price } else { txn_price },
                stop_loss: request.stop_loss.unwrap_or(entry_price * 0.95),
                commissions: txn_fees,
                number_shares: txn_quantity,
                take_profit: request.take_profit,
                initial_target: request.initial_target,
                profit_target: request.profit_target,
                trade_ratings: request.trade_ratings,
                entry_date: if is_entry { txn_date } else { entry_date_parsed },
                exit_date: if is_entry { txn_date } else { txn_date },
                reviewed: request.reviewed,
                mistakes: request.mistakes.clone(),
                brokerage_name: request.brokerage_name.clone(),
                trade_group_id: Some(trade_group_id.clone()),
                parent_trade_id,
                total_quantity: Some(txn_quantity),
                transaction_sequence: Some(sequence),
            };

            match Stock::create(&conn, create_request).await {
                Ok(stock) => {
                    if parent_trade_id.is_none() {
                        parent_trade_id = Some(stock.id);
                    }
                    created_trades.push(stock.id);

                    // Create/update position
                    let trans_type = if is_entry { "entry" } else { "exit" };
                    crate::service::position_service::update_position_quantity(
                        &conn,
                        &position_id,
                        "stock",
                        txn_quantity,
                        txn_price,
                        trans_type,
                    ).await.map_err(|e| {
                        error!("Failed to update position: {}", e);
                        actix_web::error::ErrorInternalServerError("Failed to update position")
                    })?;

                    // Log transaction
                    let trans_log_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO position_transactions (id, position_id, position_type, trade_id, transaction_type, quantity, price, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        libsql::params![
                            trans_log_id,
                            position_id.clone(),
                            "stock",
                            stock.id,
                            trans_type,
                            txn_quantity,
                            txn_price,
                            txn_date.to_rfc3339()
                        ]
                    ).await.map_err(|e| {
                        error!("Failed to log transaction: {}", e);
                        actix_web::error::ErrorInternalServerError("Failed to log transaction")
                    })?;

                    sequence += 1;
                }
                Err(e) => {
                    error!("Failed to create stock trade: {}", e);
                    return Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error("Failed to create stock trade")));
                }
            }
        }

        // Mark transactions as transformed
        let update_sql = format!(
            "UPDATE brokerage_transactions SET is_transformed = 1 WHERE id IN ({})",
            placeholders
        );
        let update_params: Vec<&str> = request.transaction_ids.iter().map(|s| s.as_str()).collect();

        let update_stmt = conn.prepare(&update_sql).await
            .map_err(|e| {
                error!("Failed to prepare update statement: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?;

        update_stmt.query(update_params).await
            .map_err(|e| {
                error!("Failed to update transactions: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?;

        info!("Successfully merged {} transactions into {} stock trades (group: {})", 
              request.transaction_ids.len(), created_trades.len(), trade_group_id);
        Ok(HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "trade_group_id": trade_group_id,
            "created_trades": created_trades,
            "position_id": position_id
        }))))
    } else if request.trade_type == "option" {
        let option_type = request.option_type.ok_or_else(|| {
            actix_web::error::ErrorBadRequest("option_type required for option trades")
        })?.parse::<OptionType>()
            .map_err(|_| actix_web::error::ErrorBadRequest("Invalid option_type"))?;
        let strike_price = request.strike_price.ok_or_else(|| {
            actix_web::error::ErrorBadRequest("strike_price required for option trades")
        })?;
        let expiration_date = request.expiration_date.ok_or_else(|| {
            actix_web::error::ErrorBadRequest("expiration_date required for option trades")
        })?;
        let expiration_date_parsed = parse_date(&expiration_date)?;

        // Generate trade_group_id for linking related trades
        let trade_group_id = Uuid::new_v4().to_string();
        
        // Create position ID
        let position_id = Uuid::new_v4().to_string();
        
        // Sort transactions by date
        let mut all_transactions: Vec<(&TransactionData, usize)> = transactions.iter().enumerate().map(|(idx, t)| (t, idx)).collect();
        all_transactions.sort_by_key(|(t, _)| &t.trade_date);

        let mut created_trades = Vec::new();
        let mut parent_trade_id: Option<i64> = None;
        let mut sequence = 1;

        // Create trade records for each transaction
        for (txn, _) in all_transactions {
            let is_entry = txn.transaction_type.as_deref() == Some("BUY");
            
            let txn_date = parse_date(&txn.trade_date)?;
            let txn_price = txn.price.unwrap_or(0.0);
            let txn_quantity = txn.quantity.unwrap_or(0.0);
            let _txn_fees = txn.fees.unwrap_or(0.0);
            let premium = txn_price * txn_quantity;

            let create_request = CreateOptionRequest {
                symbol: request.symbol.clone(),
                option_type: option_type.clone(),
                strike_price,
                expiration_date: expiration_date_parsed,
                entry_price: if is_entry { txn_price } else { entry_price },
                exit_price: if is_entry { txn_price } else { txn_price },
                premium,
                entry_date: if is_entry { txn_date } else { entry_date_parsed },
                exit_date: if is_entry { txn_date } else { txn_date },
                initial_target: request.initial_target,
                profit_target: request.profit_target,
                trade_ratings: request.trade_ratings,
                reviewed: request.reviewed,
                mistakes: request.mistakes.clone(),
                brokerage_name: request.brokerage_name.clone(),
                trade_group_id: Some(trade_group_id.clone()),
                parent_trade_id,
                total_quantity: Some(txn_quantity),
                transaction_sequence: Some(sequence),
            };

            match OptionTrade::create(&conn, create_request).await {
                Ok(option) => {
                    if parent_trade_id.is_none() {
                        parent_trade_id = Some(option.id);
                    }
                    created_trades.push(option.id);

                    // Create/update position
                    let trans_type = if is_entry { "entry" } else { "exit" };
                    crate::service::position_service::update_position_quantity(
                        &conn,
                        &position_id,
                        "option",
                        txn_quantity,
                        txn_price,
                        trans_type,
                    ).await.map_err(|e| {
                        error!("Failed to update position: {}", e);
                        actix_web::error::ErrorInternalServerError("Failed to update position")
                    })?;

                    // Log transaction
                    let trans_log_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO position_transactions (id, position_id, position_type, trade_id, transaction_type, quantity, price, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        libsql::params![
                            trans_log_id,
                            position_id.clone(),
                            "option",
                            option.id,
                            trans_type,
                            txn_quantity,
                            txn_price,
                            txn_date.to_rfc3339()
                        ]
                    ).await.map_err(|e| {
                        error!("Failed to log transaction: {}", e);
                        actix_web::error::ErrorInternalServerError("Failed to log transaction")
                    })?;

                    sequence += 1;
                }
                Err(e) => {
                    error!("Failed to create option trade: {}", e);
                    return Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error("Failed to create option trade")));
                }
            }
        }

        // Mark transactions as transformed
        let update_sql = format!(
            "UPDATE brokerage_transactions SET is_transformed = 1 WHERE id IN ({})",
            placeholders
        );
        let update_params: Vec<&str> = request.transaction_ids.iter().map(|s| s.as_str()).collect();

        let update_stmt = conn.prepare(&update_sql).await
            .map_err(|e| {
                error!("Failed to prepare update statement: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?;

        update_stmt.query(update_params).await
            .map_err(|e| {
                error!("Failed to update transactions: {}", e);
                actix_web::error::ErrorInternalServerError("Database error")
            })?;

        info!("Successfully merged {} transactions into {} option trades (group: {})", 
              request.transaction_ids.len(), created_trades.len(), trade_group_id);
        Ok(HttpResponse::Created().json(ApiResponse::success(serde_json::json!({
            "trade_group_id": trade_group_id,
            "created_trades": created_trades,
            "position_id": position_id
        }))))
    } else {
        Ok(HttpResponse::BadRequest().json(ApiResponse::<()>::error("Invalid trade_type. Must be 'stock' or 'option'")))
    }
}

/// Configure brokerage routes
pub fn configure_brokerage_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/brokerage")
            .route("/connections/initiate", web::post().to(initiate_connection))
            .route("/connections", web::get().to(list_connections))
            .route("/connections/{id}/status", web::get().to(get_connection_status))
            .route("/connections/{id}/complete", web::post().to(complete_connection_sync))
            .route("/connections/{id}", web::delete().to(delete_connection))
            .route("/accounts", web::get().to(list_accounts))
            .route("/accounts/{id}/detail", web::get().to(get_account_detail))
            .route("/accounts/{id}/positions", web::get().to(get_account_positions))
            .route("/accounts/{id}/positions/options", web::get().to(get_account_option_positions))
            .route("/accounts/{id}/transactions", web::get().to(get_account_transactions))
            .route("/accounts/sync", web::post().to(sync_accounts))
            .route("/transactions", web::get().to(get_transactions))
            .route("/holdings", web::get().to(get_holdings))
            .route("/unmatched-transactions", web::get().to(get_unmatched_transactions))
            .route("/unmatched-transactions/{id}/resolve", web::post().to(resolve_unmatched_transaction))
            .route("/unmatched-transactions/{id}/ignore", web::post().to(ignore_unmatched_transaction))
            .route("/unmatched-transactions/{id}/suggestions", web::get().to(get_unmatched_suggestions))
            .route("/transactions/merge", web::post().to(merge_transactions))
    ); // Semi colon 
}