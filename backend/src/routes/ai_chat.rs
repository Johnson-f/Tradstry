use crate::models::ai::chat::{
    ChatRequest
};
use crate::service::ai_chat_service::AIChatService;
use crate::turso::client::TursoClient;
use crate::turso::config::SupabaseConfig;
use crate::turso::auth::validate_supabase_jwt_token;
use actix_web::{web, HttpRequest, HttpResponse, Result};
use log::{info, error};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Authenticate user and get user ID
async fn get_authenticated_user(req: &HttpRequest, supabase_config: &SupabaseConfig) -> Result<String> {
    let auth_header = req.headers().get("Authorization")
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing Authorization header"))?
        .to_str()
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid Authorization header"))?;

    let token = auth_header.strip_prefix("Bearer ")
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Invalid token format"))?;

    let claims = validate_supabase_jwt_token(token, supabase_config)
        .await
        .map_err(|e| {
            error!("JWT validation failed: {}", e);
            actix_web::error::ErrorUnauthorized("Invalid or expired authentication token")
        })?;

    Ok(claims.sub)
}

/// Get user's database connection with authentication
async fn get_user_database_connection(
    req: &HttpRequest,
    turso_client: &TursoClient,
    supabase_config: &SupabaseConfig,
) -> Result<libsql::Connection> {
    let user_id = get_authenticated_user(req, supabase_config).await?;
    
    let conn = turso_client.get_user_database_connection(&user_id).await
        .map_err(|e| {
            error!("Failed to get database connection for user {}: {}", user_id, e);
            actix_web::error::ErrorInternalServerError("Database connection failed")
        })?
        .ok_or_else(|| {
            error!("No database found for user: {}", user_id);
            actix_web::error::ErrorNotFound("User database not found")
        })?;

    Ok(conn)
}
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// Chat request for streaming
#[derive(Debug, Deserialize)]
pub struct StreamingChatRequest {
    pub message: String,
    pub session_id: Option<String>,
    pub include_context: Option<bool>,
    pub max_context_vectors: Option<usize>,
}

/// Session list query parameters
#[derive(Debug, Deserialize)]
pub struct SessionListQuery {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Update session title request
#[derive(Debug, Deserialize)]
pub struct UpdateSessionTitleRequest {
    pub title: String,
}

/// Send a chat message and get response
pub async fn send_chat_message(
    req: HttpRequest,
    payload: web::Json<ChatRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    info!("Processing chat message");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_chat_service.generate_response(&user_id, payload.into_inner(), &conn).await {
        Ok(response) => {
            info!("Successfully generated chat response for user: {}", user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
        }
        Err(e) => {
            error!("Failed to generate chat response for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to generate chat response".to_string()
            )))
        }
    }
}

/// Send a streaming chat message
pub async fn send_streaming_chat_message(
    req: HttpRequest,
    payload: web::Json<StreamingChatRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    info!("Processing streaming chat message");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    let chat_request = ChatRequest {
        message: payload.message.clone(),
        session_id: payload.session_id.clone(),
        include_context: payload.include_context,
        max_context_vectors: payload.max_context_vectors,
    };

    match ai_chat_service.generate_streaming_response(&user_id, chat_request, &conn).await {
        Ok((mut stream_receiver, session_id, message_id)) => {
            info!("Successfully started streaming chat response for user: {}", user_id);
            
            // Create Server-Sent Events response
            let stream = futures_util::stream::unfold(stream_receiver, |mut receiver| async move {
                match receiver.recv().await {
                    Some(token) => {
                        let chunk = format!("data: {{\"type\":\"token\",\"content\":\"{}\"}}\n\n", 
                            token.replace("\"", "\\\"").replace("\n", "\\n"));
                        Some((Ok::<web::Bytes, std::io::Error>(web::Bytes::from(chunk)), receiver))
                    },
                    None => None,
                }
            });

            Ok(HttpResponse::Ok()
                .content_type("text/event-stream")
                .append_header(("Cache-Control", "no-cache"))
                .append_header(("Connection", "keep-alive"))
                .streaming(stream))
        }
        Err(e) => {
            error!("Failed to generate streaming chat response for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to generate streaming chat response".to_string()
            )))
        }
    }
}

/// Get user's chat sessions
pub async fn get_chat_sessions(
    req: HttpRequest,
    query: web::Query<SessionListQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    info!("Getting chat sessions for user");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_chat_service.get_user_sessions(&conn, &user_id, query.limit, query.offset).await {
        Ok(response) => {
            info!("Successfully retrieved {} chat sessions for user: {}", response.total_count, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
        }
        Err(e) => {
            error!("Failed to get chat sessions for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to get chat sessions".to_string()
            )))
        }
    }
}

/// Get specific chat session with messages
pub async fn get_chat_session(
    req: HttpRequest,
    path: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    let session_id = path.into_inner();
    info!("Getting chat session: {}", session_id);

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_chat_service.get_session_details(&conn, &session_id, &user_id).await {
        Ok(response) => {
            info!("Successfully retrieved chat session {} for user: {}", session_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(response)))
        }
        Err(e) => {
            error!("Failed to get chat session {} for user {}: {}", session_id, user_id, e);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Chat session not found".to_string()
            )))
        }
    }
}

/// Create a new chat session
pub async fn create_chat_session(
    req: HttpRequest,
    payload: web::Json<serde_json::Value>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    info!("Creating new chat session");

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    let title = payload.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());

    match ai_chat_service.create_session(&conn, &user_id, title).await {
        Ok(session) => {
            info!("Successfully created chat session {} for user: {}", session.id, user_id);
            Ok(HttpResponse::Created().json(ApiResponse::success(session)))
        }
        Err(e) => {
            error!("Failed to create chat session for user {}: {}", user_id, e);
            Ok(HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Failed to create chat session".to_string()
            )))
        }
    }
}

/// Update chat session title
pub async fn update_chat_session_title(
    req: HttpRequest,
    path: web::Path<String>,
    payload: web::Json<UpdateSessionTitleRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    let session_id = path.into_inner();
    info!("Updating chat session title: {}", session_id);

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_chat_service.update_session_title(&conn, &session_id, &user_id, payload.title.clone()).await {
        Ok(_) => {
            info!("Successfully updated chat session title {} for user: {}", session_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "success": true,
                "message": "Session title updated successfully"
            }))))
        }
        Err(e) => {
            error!("Failed to update chat session title {} for user {}: {}", session_id, user_id, e);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Chat session not found".to_string()
            )))
        }
    }
}

/// Delete a chat session
pub async fn delete_chat_session(
    req: HttpRequest,
    path: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    ai_chat_service: web::Data<Arc<AIChatService>>,
) -> Result<HttpResponse> {
    let session_id = path.into_inner();
    info!("Deleting chat session: {}", session_id);

    let conn = get_user_database_connection(&req, &turso_client, &supabase_config).await?;
    let user_id = get_authenticated_user(&req, &supabase_config).await?;

    match ai_chat_service.delete_session(&conn, &session_id, &user_id).await {
        Ok(_) => {
            info!("Successfully deleted chat session {} for user: {}", session_id, user_id);
            Ok(HttpResponse::Ok().json(ApiResponse::success(serde_json::json!({
                "success": true,
                "message": "Session deleted successfully"
            }))))
        }
        Err(e) => {
            error!("Failed to delete chat session {} for user {}: {}", session_id, user_id, e);
            Ok(HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Chat session not found".to_string()
            )))
        }
    }
}

/// Configure AI chat routes
pub fn configure_ai_chat_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/ai/chat")
            .route("", web::post().to(send_chat_message))
            .route("/stream", web::post().to(send_streaming_chat_message))
            .route("/sessions", web::get().to(get_chat_sessions))
            .route("/sessions", web::post().to(create_chat_session))
            .route("/sessions/{id}", web::get().to(get_chat_session))
            .route("/sessions/{id}/title", web::put().to(update_chat_session_title))
            .route("/sessions/{id}", web::delete().to(delete_chat_session))
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_response_success() {
        let response = ApiResponse::success("test data");
        assert!(response.success);
        assert_eq!(response.data, Some("test data"));
        assert!(response.error.is_none());
    }

    #[test]
    fn test_api_response_error() {
        let response = ApiResponse::<()>::error("test error".to_string());
        assert!(!response.success);
        assert!(response.data.is_none());
        assert_eq!(response.error, Some("test error".to_string()));
    }
}
