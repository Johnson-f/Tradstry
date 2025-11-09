use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use std::sync::Arc;
use log::{info, error};
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
        
        // If user already exists (400), we can't retrieve their secret
        // This is a limitation of SnapTrade API - we need to handle this case
        if status.as_u16() == 400 {
            return Err(actix_web::error::ErrorBadRequest(
                format!("User may already exist in SnapTrade. Error: {}", error_text)
            ));
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

    if let Some(acc_id) = account_id {
        sql.push_str(" AND account_id = ?");
    }

    sql.push_str(" ORDER BY trade_date DESC LIMIT 100");

    let mut rows = conn
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

    if let Some(acc_id) = account_id {
        sql.push_str(" AND account_id = ?");
    }

    sql.push_str(" ORDER BY symbol");

    let mut rows = conn
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

/// Configure brokerage routes
pub fn configure_brokerage_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/brokerage")
            .route("/connections/initiate", web::post().to(initiate_connection))
            .route("/connections", web::get().to(list_connections))
            .route("/connections/{id}/status", web::get().to(get_connection_status))
            .route("/connections/{id}", web::delete().to(delete_connection))
            .route("/accounts", web::get().to(list_accounts))
            .route("/accounts/sync", web::post().to(sync_accounts))
            .route("/transactions", web::get().to(get_transactions))
            .route("/holdings", web::get().to(get_holdings))
    );
}

