use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult};
use std::sync::Arc;
use crate::turso::{TursoClient, get_supabase_user_id, SupabaseClaims};
use crate::replicache::{PullRequest, PullResponse};
use crate::replicache::client_state::{get_space_version, get_client_mutation_ids};
use crate::replicache::transform::{generate_patches_from_db_changes};

/// Get user database connection
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

/// Handle pull endpoint - send changes to clients
pub async fn handle_pull(
    req: HttpRequest,
    payload: web::Json<PullRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
) -> ActixResult<HttpResponse> {
    // 1. Get user from middleware (already authenticated)
    let claims = req.extensions()
        .get::<SupabaseClaims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No authentication claims found"))?;
    let user_id = get_supabase_user_id(claims);
    
    // 2. Get user database connection
    let conn = get_user_db_connection(&user_id, &turso_client).await?;
    
    // 3. Get current space version
    let current_space_version = get_space_version(&conn).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to get space version: {}", e)))?;
    
    // 4. Get last mutation IDs for all clients
    let last_mutation_id_changes = get_client_mutation_ids(&conn, &payload.client_group_id).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to get client mutation IDs: {}", e)))?;
    
    // 5. Generate patches from database changes
    let last_modified_version = payload.cookie.unwrap_or(0);
    let patches = generate_patches_from_db_changes(&conn, &user_id, last_modified_version, current_space_version).await
        .map_err(|e| actix_web::error::ErrorInternalServerError(format!("Failed to generate patches: {}", e)))?;
    
    // 6. Convert patches to patch operations
    let patch_operations: Vec<crate::replicache::PatchOperation> = patches.into_iter().map(|patch| {
        crate::replicache::PatchOperation {
            op: patch.op,
            key: patch.key,
            value: patch.value,
        }
    }).collect();
    
    // 7. Return pull response
    let response = PullResponse {
        cookie: current_space_version,
        last_mutation_id_changes,
        patch: patch_operations,
    };
    
    Ok(HttpResponse::Ok().json(response))
}