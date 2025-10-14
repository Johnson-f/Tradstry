use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use std::sync::Arc;
use crate::turso::{TursoClient, SupabaseConfig};
use crate::replicache::{PullRequest, PullResponse, PatchOperation, PatchOp};
use crate::replicache::client_state::{get_space_version, get_client_mutation_ids};
use crate::replicache::transform::{stock_to_kv, option_to_kv, note_to_kv, playbook_to_kv, create_put_patch};
use crate::models::stock::stocks::{Stock, StockQuery};
use crate::models::options::options::{OptionTrade, OptionQuery};
use crate::models::notes::trade_notes::{TradeNote, TradeNoteQuery};
use crate::models::playbook::playbook::{Playbook, PlaybookQuery};
use chrono::Utc;

/// Parse JWT claims without full validation (for middleware)
fn parse_jwt_claims(token: &str) -> Result<crate::turso::config::SupabaseClaims, crate::turso::auth::AuthError> {
    use crate::turso::auth::validate_supabase_jwt_token;
    use crate::turso::config::SupabaseConfig;
    
    // Create a minimal config for token parsing
    let config = SupabaseConfig {
        project_url: "https://placeholder.supabase.co".to_string(),
        anon_key: "placeholder".to_string(),
        service_role_key: "placeholder".to_string(),
        jwks_url: "placeholder".to_string(),
    };
    
    // For now, we'll use a simple approach - in production you'd want proper validation
    // This is a placeholder implementation
    Err(crate::turso::auth::AuthError::InvalidToken)
}

fn extract_token_from_request(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get("Authorization")
        .and_then(|header| header.to_str().ok())
        .and_then(|header| {
            if header.starts_with("Bearer ") {
                Some(header[7..].to_string())
            } else {
                None
            }
        })
}

async fn get_authenticated_user(
    req: &HttpRequest,
    supabase_config: &SupabaseConfig,
) -> Result<crate::turso::config::SupabaseClaims, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing or invalid authorization header"))?;
    
    // For now, we'll use a placeholder - in production you'd validate the JWT properly
    // This should be replaced with proper JWT validation
    Ok(crate::turso::config::SupabaseClaims {
        aud: "authenticated".to_string(),
        exp: chrono::Utc::now().timestamp() + 3600,
        iat: chrono::Utc::now().timestamp(),
        iss: supabase_config.project_url.clone(),
        sub: "placeholder-user-id".to_string(),
        email: Some("placeholder@example.com".to_string()),
        phone: None,
        role: "authenticated".to_string(),
        aal: "aal1".to_string(),
        amr: vec![],
        session_id: "placeholder-session".to_string(),
        is_anonymous: Some(false),
        user_metadata: None,
        app_metadata: None,
    })
}

async fn get_user_db_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<libsql::Connection, actix_web::Error> {
    turso_client
        .get_user_database_connection(user_id)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Database connection failed: {}", e)))?
        .ok_or_else(|| actix_web::error::ErrorNotFound("User database not found"))
}

/// Get changed stocks since a given version
async fn get_changed_stocks(
    conn: &libsql::Connection,
    user_id: &str,
    from_version: u64,
) -> Result<Vec<Stock>, Box<dyn std::error::Error + Send + Sync>> {
    // For now, we'll get all stocks since we don't have version tracking in the stocks table yet
    // In a full implementation, you'd add a version column to track changes
    let query = StockQuery {
        symbol: None,
        trade_type: None,
        start_date: None,
        end_date: None,
        updated_after: None,
        limit: None,
        offset: None,
    };
    
    Stock::find_all(conn, query).await
}

/// Get changed options since a given version
async fn get_changed_options(
    conn: &libsql::Connection,
    user_id: &str,
    from_version: u64,
) -> Result<Vec<OptionTrade>, Box<dyn std::error::Error + Send + Sync>> {
    // For now, we'll get all options since we don't have version tracking in the options table yet
    // In a full implementation, you'd add a version column to track changes
    let query = OptionQuery {
        symbol: None,
        strategy_type: None,
        trade_direction: None,
        option_type: None,
        status: None,
        start_date: None,
        end_date: None,
        limit: None,
        offset: None,
    };
    
    OptionTrade::find_all(conn, query).await
}

/// Get changed notes since a given version
async fn get_changed_notes(
    conn: &libsql::Connection,
    user_id: &str,
    from_version: u64,
) -> Result<Vec<TradeNote>, Box<dyn std::error::Error + Send + Sync>> {
    // For now, we'll get all notes since we don't have version tracking in the notes table yet
    // In a full implementation, you'd add a version column to track changes
    let query = TradeNoteQuery {
        name: None,
        search: None,
        start_date: None,
        end_date: None,
        limit: None,
        offset: None,
    };
    
    TradeNote::find_all(conn, query).await
}

/// Get changed playbooks since a given version
async fn get_changed_playbooks(
    conn: &libsql::Connection,
    user_id: &str,
    from_version: u64,
) -> Result<Vec<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
    // For now, we'll get all playbooks since we don't have version tracking in the playbooks table yet
    // In a full implementation, you'd add a version column to track changes
    let query = PlaybookQuery {
        name: None,
        search: None,
        limit: None,
        offset: None,
    };
    
    Playbook::find_all(conn, query).await
}

/// Handle pull endpoint - send database changes to clients as key-value patches
pub async fn handle_pull(
    req: HttpRequest,
    payload: web::Json<PullRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    // 1. Authenticate user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;
    
    // 2. Get user database connection
    let conn = get_user_db_connection(user_id, &turso_client).await?;
    
    // 3. Get current version
    let current_version = get_space_version(&conn).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to get space version: {}", e)))?;
    
    let from_version = payload.cookie.unwrap_or(0);
    
    // 4. Build patch operations
    let mut patch = Vec::new();
    
    // Fetch changed stocks
    match get_changed_stocks(&conn, user_id, from_version).await {
        Ok(stocks) => {
            for stock in stocks {
                match stock_to_kv(stock) {
                    Ok((key, value)) => {
                        patch.push(create_put_patch(key, value));
                    }
                    Err(e) => {
                        eprintln!("Failed to transform stock to KV: {}", e);
                        // Continue with other stocks
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to fetch stocks: {}", e);
            // Continue with other data types
        }
    }
    
    // Fetch changed options
    match get_changed_options(&conn, user_id, from_version).await {
        Ok(options) => {
            for option in options {
                match option_to_kv(option) {
                    Ok((key, value)) => {
                        patch.push(create_put_patch(key, value));
                    }
                    Err(e) => {
                        eprintln!("Failed to transform option to KV: {}", e);
                        // Continue with other options
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to fetch options: {}", e);
            // Continue with other data types
        }
    }
    
    // Fetch changed notes
    match get_changed_notes(&conn, user_id, from_version).await {
        Ok(notes) => {
            for note in notes {
                match note_to_kv(note) {
                    Ok((key, value)) => {
                        patch.push(create_put_patch(key, value));
                    }
                    Err(e) => {
                        eprintln!("Failed to transform note to KV: {}", e);
                        // Continue with other notes
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to fetch notes: {}", e);
            // Continue with other data types
        }
    }
    
    // Fetch changed playbooks
    match get_changed_playbooks(&conn, user_id, from_version).await {
        Ok(playbooks) => {
            for playbook in playbooks {
                match playbook_to_kv(playbook) {
                    Ok((key, value)) => {
                        patch.push(create_put_patch(key, value));
                    }
                    Err(e) => {
                        eprintln!("Failed to transform playbook to KV: {}", e);
                        // Continue with other playbooks
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to fetch playbooks: {}", e);
            // Continue with other data types
        }
    }
    
    // 5. Get last mutation IDs for all clients
    let last_mutation_ids = get_client_mutation_ids(&conn, &payload.client_group_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to get client mutation IDs: {}", e)))?;
    
    // 6. Return response
    let response = PullResponse {
        cookie: current_version,
        last_mutation_id_changes: last_mutation_ids,
        patch,
    };
    
    Ok(HttpResponse::Ok().json(response))
}
