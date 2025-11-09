use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use std::sync::Arc;
use log::{info, error, warn};
use uuid::Uuid;
use chrono::Utc;
use libsql::Connection;

use crate::turso::{AppState, client::TursoClient, config::{SupabaseConfig, SupabaseClaims}};
use crate::turso::auth::{validate_supabase_jwt_token, get_supabase_user_id};

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
    if let Some(status_str) = status_data.get("status").and_then(|s| s.as_str()) {
        if status_str == "connected" {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "UPDATE brokerage_connections SET status = ?, updated_at = ? WHERE id = ?",
                libsql::params!["connected", now, connection_id],
            ).await.ok(); // Don't fail if update fails
        }
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

                let account_uuid = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                let raw_data = serde_json::to_string(&account).unwrap_or_default();
                let connection_id_clone = connection_id.clone();

                conn.execute(
                    "INSERT OR REPLACE INTO brokerage_accounts (id, connection_id, snaptrade_account_id, account_number, account_name, account_type, balance, currency, institution_name, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM brokerage_accounts WHERE snaptrade_account_id = ?), ?), ?)",
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
                        snaptrade_account_id,
                        now.clone(),
                        now
                    ],
                ).await.ok(); // Don't fail entire sync if one account fails

                total_accounts += 1;

                // Store holdings for this account
                for holding in &sync_data.holdings {
                    if let Some(holding_account_id) = holding.get("account_id").and_then(|v| v.as_str()) {
                        if holding_account_id == snaptrade_account_id {
                            let symbol = holding.get("symbol").and_then(|v| v.as_str()).unwrap_or("");
                            let quantity = holding.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
                            let average_cost = holding.get("average_cost").and_then(|v| v.as_f64());
                            let current_price = holding.get("current_price").and_then(|v| v.as_f64());
                            let market_value = holding.get("market_value").and_then(|v| v.as_f64());
                            let currency = holding.get("currency").and_then(|v| v.as_str()).unwrap_or("USD");
                            let raw_data = serde_json::to_string(holding).unwrap_or_default();

                            let holding_uuid = Uuid::new_v4().to_string();
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
                }

                // Store transactions for this account
                for transaction in &sync_data.transactions {
                    if let Some(trans_account_id) = transaction.get("account_id").and_then(|v| v.as_str()) {
                        if trans_account_id == snaptrade_account_id {
                            let snaptrade_transaction_id = transaction.get("id").and_then(|v| v.as_str()).unwrap_or("");
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
                                "INSERT OR IGNORE INTO brokerage_transactions (id, account_id, snaptrade_transaction_id, symbol, transaction_type, quantity, price, amount, currency, trade_date, settlement_date, fees, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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

        // Update last_sync_at
        let sync_now = Utc::now().to_rfc3339();
        let connection_id_clone = connection_id.clone();
        conn.execute(
            "UPDATE brokerage_connections SET last_sync_at = ?, updated_at = ? WHERE id = ?",
            libsql::params![sync_now.clone(), sync_now, connection_id_clone],
        ).await.ok();
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
    let mut sql = "SELECT id, account_id, snaptrade_transaction_id, symbol, transaction_type, quantity, price, amount, currency, trade_date, settlement_date, fees, created_at FROM brokerage_transactions WHERE account_id IN (SELECT id FROM brokerage_accounts WHERE connection_id IN (SELECT id FROM brokerage_connections WHERE user_id = ?))".to_string();

    if let Some(_acc_id) = account_id {
        sql.push_str(" AND account_id = ?");
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
            "created_at": created_at
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
        if let Some(account_obj) = account.as_object() {
            if let Some(snaptrade_account_id) = account_obj.get("id").and_then(|v| v.as_str()) {
                // Store account in database
                let account_number = account_obj.get("number").and_then(|v| v.as_str());
                let account_name = account_obj.get("name").and_then(|v| v.as_str());
                let account_type = account_obj.get("raw_type").or_else(|| account_obj.get("type")).and_then(|v| v.as_str());
                let balance_obj = account_obj.get("balance");
                let balance = balance_obj.and_then(|b| b.get("total")).and_then(|t| t.get("amount")).and_then(|v| v.as_f64());
                let currency = balance_obj.and_then(|b| b.get("total")).and_then(|t| t.get("currency")).and_then(|v| v.as_str()).unwrap_or("USD");
                let institution_name = account_obj.get("institution_name").and_then(|v| v.as_str());

                let account_uuid = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                let raw_data = serde_json::to_string(&account).unwrap_or_default();
                let connection_id_clone = connection_id.clone();

                conn.execute(
                    "INSERT OR REPLACE INTO brokerage_accounts (id, connection_id, snaptrade_account_id, account_number, account_name, account_type, balance, currency, institution_name, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM brokerage_accounts WHERE snaptrade_account_id = ?), ?), ?)",
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
                        snaptrade_account_id,
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

                if let Some(equity) = equity_response {
                    if equity.status().is_success() {
                        if let Ok(equity_data) = equity.json::<serde_json::Value>().await {
                            if let Some(positions) = equity_data.get("positions").and_then(|v| v.as_array()) {
                                info!("Got {} equity positions for account: {}", positions.len(), snaptrade_account_id);
                                
                                // Store equity positions
                                for position in positions {
                                    if let Some(pos_obj) = position.as_object() {
                                        let symbol_obj = pos_obj.get("symbol");
                                        let symbol = symbol_obj.and_then(|s| s.get("symbol")).and_then(|v| v.as_str()).unwrap_or("");
                                        let quantity = pos_obj.get("units").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                        let average_cost = pos_obj.get("average_purchase_price").and_then(|v| v.as_f64());
                                        let current_price = pos_obj.get("price").and_then(|v| v.as_f64());
                                        let market_value = pos_obj.get("value").and_then(|v| v.as_f64());
                                        let currency = pos_obj.get("currency").and_then(|c| c.get("code")).and_then(|v| v.as_str()).unwrap_or("USD");
                                        let raw_data = serde_json::to_string(position).unwrap_or_default();

                                        let holding_uuid = Uuid::new_v4().to_string();
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
                        }
                    }
                }

                // Get option positions
                let options_response = snaptrade_client
                    .call_go_service("GET", &format!("/api/v1/accounts/{}/holdings/options", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
                    .await
                    .ok();

                if let Some(options) = options_response {
                    if options.status().is_success() {
                        if let Ok(options_data) = options.json::<serde_json::Value>().await {
                            if let Some(positions) = options_data.get("positions").and_then(|v| v.as_array()) {
                                info!("Got {} option positions for account: {}", positions.len(), snaptrade_account_id);
                                
                                // Store option positions
                                for position in positions {
                                    if let Some(pos_obj) = position.as_object() {
                                        let symbol_obj = pos_obj.get("symbol");
                                        let symbol = symbol_obj.and_then(|s| s.get("symbol")).and_then(|v| v.as_str()).unwrap_or("");
                                        let quantity = pos_obj.get("units").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                        let average_cost = pos_obj.get("average_purchase_price").and_then(|v| v.as_f64());
                                        let current_price = pos_obj.get("price").and_then(|v| v.as_f64());
                                        let market_value = pos_obj.get("value").and_then(|v| v.as_f64());
                                        let currency = pos_obj.get("currency").and_then(|c| c.get("code")).and_then(|v| v.as_str()).unwrap_or("USD");
                                        let raw_data = serde_json::to_string(position).unwrap_or_default();

                                        let holding_uuid = Uuid::new_v4().to_string();
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
                        }
                    }
                }

                // Get transactions (with pagination - fetch first page)
                let transactions_response = snaptrade_client
                    .call_go_service("GET", &format!("/api/v1/accounts/{}/transactions?limit=1000&offset=0", snaptrade_account_id), None::<&serde_json::Value>, &user_id, Some(&user_secret))
                    .await
                    .ok();

                if let Some(transactions) = transactions_response {
                    if transactions.status().is_success() {
                        if let Ok(trans_data) = transactions.json::<serde_json::Value>().await {
                            if let Some(data_array) = trans_data.get("data").and_then(|v| v.as_array()) {
                                info!("Got {} transactions for account: {}", data_array.len(), snaptrade_account_id);
                                
                                // Store transactions
                                for transaction in data_array {
                                    if let Some(trans_obj) = transaction.as_object() {
                                        let snaptrade_transaction_id = trans_obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
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

                                        let transaction_uuid = Uuid::new_v4().to_string();
                                        let transaction_now = Utc::now().to_rfc3339();

                                        conn.execute(
                                            "INSERT OR IGNORE INTO brokerage_transactions (id, account_id, snaptrade_transaction_id, symbol, transaction_type, quantity, price, amount, currency, trade_date, settlement_date, fees, raw_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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

    let summary = serde_json::json!({
        "accounts_synced": total_accounts,
        "holdings_synced": total_holdings,
        "transactions_synced": total_transactions,
        "last_sync_at": sync_now,
    });

    Ok(HttpResponse::Ok().json(ApiResponse::success(summary)))
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
    );
}

