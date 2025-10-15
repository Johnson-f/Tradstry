use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use actix_web::HttpMessage;
use std::sync::Arc;
use crate::turso::TursoClient;
use crate::turso::config::SupabaseClaims;
use crate::replicache::{PushRequest, Mutation, MutationResult, MutationError};
use crate::replicache::client_state::{update_client_mutation_id, increment_space_version};
use crate::replicache::transform::{apply_mutation_to_db};
use libsql::params;


fn get_authenticated_user(req: &HttpRequest) -> Result<SupabaseClaims, actix_web::Error> {
    req
        .extensions()
        .get::<SupabaseClaims>()
        .cloned()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing authentication claims"))
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
    // Log the mutation for debugging
    log::info!("Processing mutation: {} with args: {:?}", mutation.name, mutation.args);
    
    apply_mutation_to_db(conn, user_id, &mutation.name, mutation.args.clone()).await
        .map_err(|e| {
            log::error!("Mutation {} failed: {}", mutation.name, e);
            MutationError::GenericError(e.into())
        })
}

/// Handle push endpoint - receive mutations from clients and apply to LibSQL database
pub async fn handle_push(
    req: HttpRequest,
    payload: web::Json<PushRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
) -> ActixResult<HttpResponse> {
    // Log the incoming request
    log::info!("Push request received for client_group_id: {}", payload.client_group_id);
    log::info!("Number of mutations: {}", payload.mutations.len());
    
    // 1. Authenticate user
    let claims = get_authenticated_user(&req)?;
    let user_id = &claims.sub;
    log::info!("Authenticated user: {}", user_id);
    
    // 2. Get user database connection
    let conn = get_user_db_connection(user_id, &turso_client).await?;
    
    // 3. Begin transaction
    conn.execute("BEGIN TRANSACTION", params![]).await
        .map_err(|e| {
            log::error!("Failed to begin transaction: {}", e);
            actix_web::error::ErrorInternalServerError(format!("Failed to begin transaction: {}", e))
        })?;
    
    // 4. Process mutations
    for (idx, mutation) in payload.mutations.iter().enumerate() {
        log::info!("Processing mutation {}/{}: {}", idx + 1, payload.mutations.len(), mutation.name);
        
        if let Err(e) = process_mutation(&conn, user_id, mutation).await {
            // Rollback on error
            log::error!("Mutation failed, rolling back transaction: {}", e);
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
            log::error!("Failed to update client state, rolling back: {}", e);
            let _ = conn.execute("ROLLBACK", params![]).await;
            return Err(actix_web::error::ErrorInternalServerError(format!("Failed to update client state: {}", e)));
        }
    }
    
    // 5. Increment space version
    if let Err(e) = increment_space_version(&conn).await {
        log::error!("Failed to increment space version, rolling back: {}", e);
        let _ = conn.execute("ROLLBACK", params![]).await;
        return Err(actix_web::error::ErrorInternalServerError(format!("Failed to increment space version: {}", e)));
    }
    
    // 6. Commit transaction
    conn.execute("COMMIT", params![]).await
        .map_err(|e| {
            log::error!("Failed to commit transaction: {}", e);
            actix_web::error::ErrorInternalServerError(format!("Failed to commit transaction: {}", e))
        })?;
    
    log::info!("Push request completed successfully for user: {}", user_id);
    Ok(HttpResponse::Ok().finish())
}