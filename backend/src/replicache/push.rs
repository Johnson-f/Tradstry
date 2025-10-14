use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use std::sync::Arc;
use crate::turso::{TursoClient, SupabaseConfig};
use crate::replicache::{PushRequest, Mutation, MutationError, MutationResult, parse_mutation_key};
use crate::replicache::client_state::{update_client_mutation_id, increment_space_version};
use crate::replicache::transform::{kv_to_stock_data, kv_to_option_data, kv_to_note_data, kv_to_playbook_data};
use crate::models::stock::stocks::Stock;
use crate::models::options::options::OptionTrade;
use crate::models::notes::trade_notes::TradeNote;
use crate::models::playbook::playbook::Playbook;
use serde_json::Value;

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

/// Process a single mutation
async fn process_mutation(
    conn: &libsql::Connection,
    user_id: &str,
    mutation: &Mutation,
) -> MutationResult<()> {
    match mutation.name.as_str() {
        "createStock" => {
            let stock_kv: crate::replicache::StockKV = serde_json::from_value(mutation.args.clone())?;
            let stock_data = kv_to_stock_data(&stock_kv)?;
            Stock::create(conn, stock_data).await?;
        }
        "updateStock" => {
            let args: serde_json::Value = mutation.args.clone();
            let id = args.get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing stock ID".to_string()))?;
            
            let updates = args.get("updates")
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing updates".to_string()))?;
            
            // Convert updates to proper format
            let mut update_request = crate::models::stock::stocks::UpdateStockRequest {
                symbol: None,
                trade_type: None,
                order_type: None,
                entry_price: None,
                exit_price: None,
                stop_loss: None,
                commissions: None,
                number_shares: None,
                take_profit: None,
                entry_date: None,
                exit_date: None,
            };
            
            if let Some(symbol) = updates.get("symbol").and_then(|v| v.as_str()) {
                update_request.symbol = Some(symbol.to_string());
            }
            if let Some(entry_price) = updates.get("entryPrice").and_then(|v| v.as_f64()) {
                update_request.entry_price = Some(entry_price);
            }
            if let Some(exit_price) = updates.get("exitPrice").and_then(|v| v.as_f64()) {
                update_request.exit_price = Some(exit_price);
            }
            // Add more fields as needed
            
            Stock::update(conn, id, update_request).await?;
        }
        "deleteStock" => {
            let id = mutation.args.get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing stock ID".to_string()))?;
            Stock::delete(conn, id).await?;
        }
        "createOption" => {
            let option_kv: crate::replicache::OptionKV = serde_json::from_value(mutation.args.clone())?;
            let option_data = kv_to_option_data(&option_kv)?;
            OptionTrade::create(conn, option_data).await?;
        }
        "updateOption" => {
            let args: serde_json::Value = mutation.args.clone();
            let id = args.get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing option ID".to_string()))?;
            
            let updates = args.get("updates")
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing updates".to_string()))?;
            
            // Convert updates to proper format
            let mut update_request = crate::models::options::options::UpdateOptionRequest {
                symbol: None,
                strategy_type: None,
                trade_direction: None,
                number_of_contracts: None,
                option_type: None,
                strike_price: None,
                expiration_date: None,
                entry_price: None,
                exit_price: None,
                total_premium: None,
                commissions: None,
                implied_volatility: None,
                entry_date: None,
                exit_date: None,
                status: None,
            };
            
            if let Some(symbol) = updates.get("symbol").and_then(|v| v.as_str()) {
                update_request.symbol = Some(symbol.to_string());
            }
            if let Some(entry_price) = updates.get("entryPrice").and_then(|v| v.as_f64()) {
                update_request.entry_price = Some(entry_price);
            }
            if let Some(exit_price) = updates.get("exitPrice").and_then(|v| v.as_f64()) {
                update_request.exit_price = Some(exit_price);
            }
            // Add more fields as needed
            
            OptionTrade::update(conn, id, update_request).await?;
        }
        "deleteOption" => {
            let id = mutation.args.get("id")
                .and_then(|v| v.as_i64())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing option ID".to_string()))?;
            OptionTrade::delete(conn, id).await?;
        }
        "createNote" => {
            let note_kv: crate::replicache::NoteKV = serde_json::from_value(mutation.args.clone())?;
            let note_data = kv_to_note_data(&note_kv)?;
            TradeNote::create(conn, note_data).await?;
        }
        "updateNote" => {
            let args: serde_json::Value = mutation.args.clone();
            let id = args.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing note ID".to_string()))?;
            
            let updates = args.get("updates")
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing updates".to_string()))?;
            
            let mut update_request = crate::models::notes::trade_notes::UpdateTradeNoteRequest {
                name: None,
                content: None,
            };
            
            if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
                update_request.name = Some(name.to_string());
            }
            if let Some(content) = updates.get("content").and_then(|v| v.as_str()) {
                update_request.content = Some(content.to_string());
            }
            
            TradeNote::update(conn, id, update_request).await?;
        }
        "deleteNote" => {
            let id = mutation.args.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing note ID".to_string()))?;
            TradeNote::delete(conn, id).await?;
        }
        "createPlaybook" => {
            let playbook_kv: crate::replicache::PlaybookKV = serde_json::from_value(mutation.args.clone())?;
            let playbook_data = kv_to_playbook_data(&playbook_kv)?;
            Playbook::create(conn, playbook_data).await?;
        }
        "updatePlaybook" => {
            let args: serde_json::Value = mutation.args.clone();
            let id = args.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing playbook ID".to_string()))?;
            
            let updates = args.get("updates")
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing updates".to_string()))?;
            
            let mut update_request = crate::models::playbook::playbook::UpdatePlaybookRequest {
                name: None,
                description: None,
            };
            
            if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
                update_request.name = Some(name.to_string());
            }
            if let Some(description) = updates.get("description").and_then(|v| v.as_str()) {
                update_request.description = Some(description.to_string());
            }
            
            Playbook::update(conn, id, update_request).await?;
        }
        "deletePlaybook" => {
            let id = mutation.args.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| MutationError::InvalidKeyFormat("Missing playbook ID".to_string()))?;
            Playbook::delete(conn, id).await?;
        }
        _ => {
            return Err(MutationError::InvalidMutationName(mutation.name.clone()));
        }
    }
    
    Ok(())
}

/// Handle push endpoint - receive mutations from clients and apply to LibSQL database
pub async fn handle_push(
    req: HttpRequest,
    payload: web::Json<PushRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> ActixResult<HttpResponse> {
    // 1. Authenticate user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let user_id = &claims.sub;
    
    // 2. Get user database connection
    let conn = get_user_db_connection(user_id, &turso_client).await?;
    
    // 3. Begin transaction
    conn.execute("BEGIN TRANSACTION", []).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to begin transaction: {}", e)))?;
    
    // 4. Process mutations
    for mutation in &payload.mutations {
        if let Err(e) = process_mutation(&conn, user_id, mutation).await {
            // Rollback on error
            let _ = conn.execute("ROLLBACK", []).await;
            return Err(actix_web::error::ErrorBadRequest(format!("Mutation failed: {}", e)));
        }
        
        // Update client mutation ID
        if let Err(e) = update_client_mutation_id(
            &conn,
            &payload.client_group_id,
            &mutation.client_id,
            mutation.id,
            user_id,
        ).await {
            let _ = conn.execute("ROLLBACK", []).await;
            return Err(actix_web::error::ErrorInternalServerError(format!("Failed to update client state: {}", e)));
        }
    }
    
    // 5. Increment space version
    if let Err(e) = increment_space_version(&conn).await {
        let _ = conn.execute("ROLLBACK", []).await;
        return Err(actix_web::error::ErrorInternalServerError(format!("Failed to increment space version: {}", e)));
    }
    
    // 6. Commit transaction
    conn.execute("COMMIT", []).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to commit transaction: {}", e)))?;
    
    Ok(HttpResponse::Ok().finish())
}
