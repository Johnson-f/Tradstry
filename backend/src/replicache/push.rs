use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use std::sync::Arc;
use crate::turso::{TursoClient, config::SupabaseConfig};
use crate::replicache::{PushRequest, Mutation, MutationResult, MutationError};
use crate::replicache::client_state::{update_client_mutation_id, increment_space_version};
use crate::replicache::transform::{apply_mutation_to_db};
use libsql::params;


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
    
    // Validate JWT token with Supabase
    crate::turso::auth::validate_supabase_jwt_token(&token, supabase_config)
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid JWT token"))
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
    apply_mutation_to_db(conn, user_id, &mutation.name, mutation.args.clone()).await
        .map_err(|e| MutationError::GenericError(e.into()))
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
    conn.execute("BEGIN TRANSACTION", params![]).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to begin transaction: {}", e)))?;
    
    // 4. Process mutations
    for mutation in &payload.mutations {
        if let Err(e) = process_mutation(&conn, user_id, mutation).await {
            // Rollback on error
            let _ = conn.execute("ROLLBACK", params![]).await;
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
            let _ = conn.execute("ROLLBACK", params![]).await;
            return Err(actix_web::error::ErrorInternalServerError(format!("Failed to update client state: {}", e)));
        }
    }
    
    // 5. Increment space version
    if let Err(e) = increment_space_version(&conn).await {
        let _ = conn.execute("ROLLBACK", params![]).await;
        return Err(actix_web::error::ErrorInternalServerError(format!("Failed to increment space version: {}", e)));
    }
    
    // 6. Commit transaction
    conn.execute("COMMIT", params![]).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to commit transaction: {}", e)))?;
    
    Ok(HttpResponse::Ok().finish())
}
