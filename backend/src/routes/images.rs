use actix_web::{web, HttpRequest, HttpResponse, Result, ResponseError};
use actix_multipart::Multipart;
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use log::{info, error};
use std::sync::Arc;

use crate::turso::{AppState, client::TursoClient};
use crate::turso::config::{SupabaseConfig, SupabaseClaims};
use crate::turso::auth::{validate_supabase_jwt_token, AuthError};
use crate::models::images::{
    Image, CreateImageRequest, UpdateImageRequest, ImageQuery
};
use crate::service::image_upload::{
    ImageUploadService, SupabaseStorageConfig
};

/// Response wrapper for image operations
#[derive(Debug, Serialize)]
pub struct ImageResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Image>,
}

/// Response wrapper for image list operations
#[derive(Debug, Serialize)]
pub struct ImageListResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<Vec<Image>>,
    pub total: Option<i64>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Query parameters for image endpoints
#[derive(Debug, Deserialize)]
pub struct ImageQueryParams {
    pub trade_note_id: Option<String>,
    pub mime_type: Option<String>,
    pub is_deleted: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Image upload request (used for documentation purposes)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ImageUploadRequest {
    pub trade_note_id: String,
    pub alt_text: Option<String>,
    pub caption: Option<String>,
    pub position_in_note: Option<i32>,
}

/// Parse JWT claims without full validation (for middleware)
fn parse_jwt_claims(token: &str) -> Result<SupabaseClaims, AuthError> {
    use base64::{Engine as _, engine::general_purpose};
    
    info!("Parsing JWT token, length: {}", token.len());
    
    let parts: Vec<&str> = token.split('.').collect();
    info!("JWT parts count: {}", parts.len());
    
    if parts.len() != 3 {
        error!("Invalid JWT format: expected 3 parts, got {}", parts.len());
        return Err(AuthError::InvalidToken);
    }

    let payload_b64 = parts[1];
    info!("Payload base64 length: {}", payload_b64.len());
    
    let payload_bytes = general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .map_err(|e| {
            error!("Base64 decode error: {}", e);
            AuthError::InvalidToken
        })?;
    
    info!("Decoded payload bytes length: {}", payload_bytes.len());
    let payload_str = String::from_utf8_lossy(&payload_bytes);
    info!("Payload JSON: {}", payload_str);
    
    let claims: SupabaseClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| {
            error!("JSON parsing error: {}", e);
            AuthError::InvalidToken
        })?;
        
    info!("Successfully parsed claims for user: {}", claims.sub);
    Ok(claims)
}

/// Extract JWT token from request headers
fn extract_token_from_request(req: &HttpRequest) -> Option<String> {
    let auth_header = req.headers().get("authorization");
    info!("Authorization header present: {}", auth_header.is_some());
    
    if let Some(header_value) = auth_header {
        let header_str = header_value.to_str().ok()?;
        info!("Authorization header value: '{}'", header_str);
        
        if let Some(token) = header_str.strip_prefix("Bearer ") {
            info!("Token extracted, length: {}", token.len());
            info!("Token first 20 chars: {}", &token[..token.len().min(20)]);
            Some(token.to_string())
        } else {
            error!("Authorization header doesn't start with 'Bearer '");
            None
        }
    } else {
        error!("No authorization header found");
        None
    }
}

/// Extract and validate auth from request
async fn get_authenticated_user(
    req: &HttpRequest,
    supabase_config: &SupabaseConfig,
) -> Result<SupabaseClaims, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing authorization token"))?;

    // Parse claims first (quick check)
    let claims = parse_jwt_claims(&token)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token format"))?;

    // Validate with Supabase
    validate_supabase_jwt_token(&token, supabase_config)
        .await
        .map_err(|e| {
            error!("JWT validation failed: {}", e);
            actix_web::error::ErrorUnauthorized("Invalid or expired authentication token")
        })?;

    Ok(claims)
}

/// Get user database connection
async fn get_user_database_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<libsql::Connection, actix_web::Error> {
    let conn = turso_client.get_user_database_connection(user_id).await
        .map_err(|e| {
            error!("Failed to connect to user database: {}", e);
            actix_web::error::ErrorInternalServerError("Database connection failed")
        })?
        .ok_or_else(|| {
            error!("No database found for user: {}", user_id);
            actix_web::error::ErrorNotFound("User database not found")
        })?;

    Ok(conn)
}

/// Upload a new image for a trade note
pub async fn upload_image(
    req: HttpRequest,
    payload: Multipart,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Upload Image Called ===");
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;
    info!("✓ Database connection established");

    // Initialize Supabase Storage service
    let storage_config = SupabaseStorageConfig::from_env()
        .map_err(|e| {
            error!("Failed to load Supabase Storage config: {}", e);
            actix_web::error::ErrorInternalServerError("Storage configuration error")
        })?;
    
    let upload_service = ImageUploadService::new(storage_config)
        .map_err(|e| {
            error!("Failed to initialize storage service: {}", e);
            actix_web::error::ErrorInternalServerError("Storage service initialization error")
        })?;

    // Parse multipart form data
    let mut trade_note_id: Option<String> = None;
    let mut alt_text: Option<String> = None;
    let mut caption: Option<String> = None;
    let mut position_in_note: Option<i32> = None;
    let mut file_data: Option<Vec<u8>> = None;
    let mut filename: Option<String> = None;
    let mut content_type: Option<String> = None;

    let mut payload = payload;
    while let Some(item) = payload.try_next().await
        .map_err(|e| {
            error!("Failed to parse multipart data: {}", e);
            actix_web::error::ErrorBadRequest("Invalid multipart data")
        })? {
        
        match item.name() {
            "trade_note_id" => {
                let mut bytes = Vec::new();
                let mut field = item;
                while let Some(chunk) = field.try_next().await
                    .map_err(|e| {
                        error!("Failed to read trade_note_id: {}", e);
                        actix_web::error::ErrorBadRequest("Invalid trade_note_id")
                    })? {
                    bytes.extend_from_slice(&chunk);
                }
                trade_note_id = Some(String::from_utf8_lossy(&bytes).to_string());
            }
            "alt_text" => {
                let mut bytes = Vec::new();
                let mut field = item;
                while let Some(chunk) = field.try_next().await
                    .map_err(|e| {
                        error!("Failed to read alt_text: {}", e);
                        actix_web::error::ErrorBadRequest("Invalid alt_text")
                    })? {
                    bytes.extend_from_slice(&chunk);
                }
                let text = String::from_utf8_lossy(&bytes).to_string();
                if !text.is_empty() {
                    alt_text = Some(text);
                }
            }
            "caption" => {
                let mut bytes = Vec::new();
                let mut field = item;
                while let Some(chunk) = field.try_next().await
                    .map_err(|e| {
                        error!("Failed to read caption: {}", e);
                        actix_web::error::ErrorBadRequest("Invalid caption")
                    })? {
                    bytes.extend_from_slice(&chunk);
                }
                let text = String::from_utf8_lossy(&bytes).to_string();
                if !text.is_empty() {
                    caption = Some(text);
                }
            }
            "position_in_note" => {
                let mut bytes = Vec::new();
                let mut field = item;
                while let Some(chunk) = field.try_next().await
                    .map_err(|e| {
                        error!("Failed to read position_in_note: {}", e);
                        actix_web::error::ErrorBadRequest("Invalid position_in_note")
                    })? {
                    bytes.extend_from_slice(&chunk);
                }
                let text = String::from_utf8_lossy(&bytes).to_string();
                if let Ok(pos) = text.parse::<i32>() {
                    position_in_note = Some(pos);
                }
            }
            "file" => {
                let content_disposition = item.content_disposition();
                filename = content_disposition.get_filename().map(|f| f.to_string());
                content_type = item.content_type().map(|ct| ct.to_string());
                
                let mut bytes = Vec::new();
                let mut field = item;
                while let Some(chunk) = field.try_next().await
                    .map_err(|e| {
                        error!("Failed to read file data: {}", e);
                        actix_web::error::ErrorBadRequest("Invalid file data")
                    })? {
                    bytes.extend_from_slice(&chunk);
                }
                file_data = Some(bytes);
            }
            _ => {
                info!("Ignoring unknown field: {}", item.name());
            }
        }
    }

    // Validate required fields
    let trade_note_id = trade_note_id.ok_or_else(|| {
        error!("Missing required field: trade_note_id");
        actix_web::error::ErrorBadRequest("Missing required field: trade_note_id")
    })?;

    let file_data = file_data.ok_or_else(|| {
        error!("Missing required field: file");
        actix_web::error::ErrorBadRequest("Missing required field: file")
    })?;

    let filename = filename.unwrap_or_else(|| "unknown".to_string());
    let content_type = content_type.unwrap_or_else(|| "application/octet-stream".to_string());

    info!("Uploading image for trade note: {}", trade_note_id);
    info!("File: {} ({} bytes, {})", filename, file_data.len(), content_type);
    info!("User: {}", claims.sub);

    // Upload to Supabase Storage
    let stored = upload_service.upload_file(&claims.sub, &file_data, &filename, &content_type).await
        .map_err(|e| {
            error!("Failed to upload image: {}", e);
            actix_web::error::ErrorInternalServerError("Image upload failed")
        })?;

    info!("Stored object path='{}' size={} mime='{}'", stored.path, stored.size, stored.mime_type);

    // We are not decoding to get dimensions here
    let (width, height) = (None, None);

    // Check storage quota before creating image record (metadata stored in Turso)
    let stored_path_for_cleanup = stored.path.clone();
    if let Err(e) = app_state.storage_quota_service.check_storage_quota(&claims.sub, &conn).await {
        error!("Storage quota check failed for user {}: {}", claims.sub, e);
        // Try to delete the uploaded file from Supabase Storage since quota is exceeded
        let _ = upload_service.delete_file(&stored_path_for_cleanup).await;
        return Ok(e.error_response());
    }

    // Create image record in database
    let create_request = CreateImageRequest {
        trade_note_id: trade_note_id.clone(),
        uploadcare_file_id: stored.path.clone(), // store Supabase object path in existing column
        original_filename: stored.original_filename.clone(),
        mime_type: stored.mime_type.clone(),
        file_size: stored.size,
        width,
        height,
        alt_text,
        caption,
        position_in_note,
    };

    match Image::create(&conn, create_request).await {
        Ok(image) => {
            info!("✓ Image uploaded and saved successfully: {}", image.id);
            Ok(HttpResponse::Created().json(ImageResponse {
                success: true,
                message: "Image uploaded successfully".to_string(),
                data: Some(image),
            }))
        }
        Err(e) => {
            error!("Failed to save image record: {}", e);
            // Try to delete the uploaded file from Supabase Storage
            let _ = upload_service.delete_file(&stored.path).await;
            Ok(HttpResponse::InternalServerError().json(ImageResponse {
                success: false,
                message: format!("Failed to save image: {}", e),
                data: None,
            }))
        }
    }
}

/// Get a specific image by ID
pub async fn get_image(
    req: HttpRequest,
    image_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Image Called ===");
    info!("Image ID: {}", image_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get the image
    match Image::find_by_id(&conn, &image_id).await {
        Ok(Some(image)) => {
            info!("✓ Image found: {}", image.id);
            Ok(HttpResponse::Ok().json(ImageResponse {
                success: true,
                message: "Image retrieved successfully".to_string(),
                data: Some(image),
            }))
        }
        Ok(None) => {
            info!("Image not found: {}", image_id);
            Ok(HttpResponse::NotFound().json(ImageResponse {
                success: false,
                message: "Image not found".to_string(),
                data: None,
            }))
        }
        Err(e) => {
            error!("Failed to get image: {}", e);
            Ok(HttpResponse::InternalServerError().json(ImageResponse {
                success: false,
                message: format!("Failed to get image: {}", e),
                data: None,
            }))
        }
    }
}

/// Get all images for a specific trade note
pub async fn get_images_by_trade_note(
    req: HttpRequest,
    trade_note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Images by Trade Note Called ===");
    info!("Trade Note ID: {}", trade_note_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get images for the trade note
    match Image::find_by_trade_note_id(&conn, &trade_note_id).await {
        Ok(images) => {
            info!("✓ Retrieved {} images for trade note", images.len());
            Ok(HttpResponse::Ok().json(ImageListResponse {
                success: true,
                message: "Images retrieved successfully".to_string(),
                data: Some(images.clone()),
                total: Some(images.len() as i64),
                page: None,
                page_size: None,
            }))
        }
        Err(e) => {
            error!("Failed to get images: {}", e);
            Ok(HttpResponse::InternalServerError().json(ImageListResponse {
                success: false,
                message: format!("Failed to get images: {}", e),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Get all images with optional filtering
pub async fn get_images(
    req: HttpRequest,
    query: web::Query<ImageQueryParams>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Images Called ===");
    info!("Query params: {:?}", query);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Convert query params to ImageQuery
    let image_query = ImageQuery {
        trade_note_id: query.trade_note_id.clone(),
        mime_type: query.mime_type.clone(),
        is_deleted: query.is_deleted,
        limit: query.limit,
        offset: query.offset,
    };

    // Get images and total count
    let images_result = Image::find_all(&conn, image_query.clone()).await;
    let count_result = Image::count(&conn, &ImageQuery {
        trade_note_id: query.trade_note_id.clone(),
        mime_type: query.mime_type.clone(),
        is_deleted: query.is_deleted,
        limit: None,
        offset: None,
    }).await;

    match (images_result, count_result) {
        (Ok(images), Ok(total)) => {
            info!("✓ Retrieved {} images", images.len());
            Ok(HttpResponse::Ok().json(ImageListResponse {
                success: true,
                message: "Images retrieved successfully".to_string(),
                data: Some(images.clone()),
                total: Some(total),
                page: query.page,
                page_size: query.page_size,
            }))
        }
        (Err(e), _) | (_, Err(e)) => {
            error!("Failed to get images: {}", e);
            Ok(HttpResponse::InternalServerError().json(ImageListResponse {
                success: false,
                message: format!("Failed to get images: {}", e),
                data: None,
                total: None,
                page: None,
                page_size: None,
            }))
        }
    }
}

/// Update an image
pub async fn update_image(
    req: HttpRequest,
    image_id: web::Path<String>,
    payload: web::Json<UpdateImageRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Update Image Called ===");
    info!("Image ID: {}", image_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Update the image
    match Image::update(&conn, &image_id, payload.into_inner()).await {
        Ok(Some(image)) => {
            info!("✓ Image updated successfully: {}", image.id);
            Ok(HttpResponse::Ok().json(ImageResponse {
                success: true,
                message: "Image updated successfully".to_string(),
                data: Some(image),
            }))
        }
        Ok(None) => {
            info!("Image not found for update: {}", image_id);
            Ok(HttpResponse::NotFound().json(ImageResponse {
                success: false,
                message: "Image not found".to_string(),
                data: None,
            }))
        }
        Err(e) => {
            error!("Failed to update image: {}", e);
            Ok(HttpResponse::InternalServerError().json(ImageResponse {
                success: false,
                message: format!("Failed to update image: {}", e),
                data: None,
            }))
        }
    }
}

/// Delete an image (soft delete)
pub async fn delete_image(
    req: HttpRequest,
    image_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Delete Image Called ===");
    info!("Image ID: {}", image_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get image info before deletion
    let image = match Image::find_by_id(&conn, &image_id).await {
        Ok(Some(img)) => img,
        Ok(None) => {
            info!("Image not found for deletion: {}", image_id);
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "success": false,
                "message": "Image not found"
            })));
        }
        Err(e) => {
            error!("Failed to get image for deletion: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to get image: {}", e)
            })));
        }
    };

    // Soft delete the image
    match Image::delete(&conn, &image_id).await {
        Ok(true) => {
            info!("✓ Image deleted successfully: {}", image_id);
            
            // Optionally delete from Supabase Storage as well
            if let Ok(storage_config) = SupabaseStorageConfig::from_env()
                && let Ok(upload_service) = ImageUploadService::new(storage_config)
            {
                let _ = upload_service.delete_file(&image.uploadcare_file_id).await;
            }
            
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Image deleted successfully"
            })))
        }
        Ok(false) => {
            info!("Image not found for deletion: {}", image_id);
            Ok(HttpResponse::NotFound().json(serde_json::json!({
                "success": false,
                "message": "Image not found"
            })))
        }
        Err(e) => {
            error!("Failed to delete image: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to delete image: {}", e)
            })))
        }
    }
}

/// Get image count
pub async fn get_images_count(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Images Count Called ===");
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get total count
    match Image::total_count(&conn).await {
        Ok(count) => {
            info!("✓ Total images count: {}", count);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Images count retrieved successfully",
                "count": count
            })))
        }
        Err(e) => {
            error!("Failed to get images count: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to get images count: {}", e)
            })))
        }
    }
}

/// Get a signed URL for accessing an image
pub async fn get_image_url(
    req: HttpRequest,
    image_id: web::Path<String>,
    query: web::Query<ImageUrlQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    info!("=== Get Image URL Called ===");
    info!("Image ID: {}", image_id);
    
    // Get authenticated user
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    info!("✓ Authentication successful for user: {}", claims.sub);

    // Get user database connection
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    info!("✓ Database connection established");

    // Get the image
    let image = match Image::find_by_id(&conn, &image_id).await {
        Ok(Some(img)) => img,
        Ok(None) => {
            info!("Image not found: {}", image_id);
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "success": false,
                "message": "Image not found"
            })));
        }
        Err(e) => {
            error!("Failed to get image: {}", e);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to get image: {}", e)
            })));
        }
    };

    // Initialize Supabase Storage service
    let storage_config = SupabaseStorageConfig::from_env()
        .map_err(|e| {
            error!("Failed to load Supabase Storage config: {}", e);
            actix_web::error::ErrorInternalServerError("Storage configuration error")
        })?;
    let upload_service = ImageUploadService::new(storage_config)
        .map_err(|e| {
            error!("Failed to initialize storage service: {}", e);
            actix_web::error::ErrorInternalServerError("Storage service initialization error")
        })?;

    // Generate Supabase signed URL
    let expires_in = query.expires_in.unwrap_or(3600);
    let url = upload_service.generate_signed_url(&image.uploadcare_file_id, expires_in).await
        .map_err(|e| {
            error!("Failed to generate signed URL: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to generate signed URL")
        })?;

    info!("✓ Generated URL for image: {}", image.id);
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Image URL generated successfully",
        "url": url,
        "expires_in": expires_in
    })))
}

/// Query parameters for image URL endpoint
#[derive(Debug, Deserialize)]
pub struct ImageUrlQuery {
    pub expires_in: Option<i64>,
}

/// Simple test endpoint to verify routes are working
async fn test_images_endpoint() -> Result<HttpResponse> {
    info!("Images test endpoint hit!");
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Images routes are working!",
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// Configure images routes
pub fn configure_images_routes(cfg: &mut web::ServiceConfig) {
    info!("Setting up /api/images routes");
    cfg.service(
        web::scope("/api/images")
            .route("/test", web::get().to(test_images_endpoint))
            .route("/upload", web::post().to(upload_image))
            .route("", web::get().to(get_images))
            .route("/count", web::get().to(get_images_count))
            .route("/trade-note/{trade_note_id}", web::get().to(get_images_by_trade_note))
            .route("/{image_id}", web::get().to(get_image))
            .route("/{image_id}/url", web::get().to(get_image_url))
            .route("/{image_id}", web::put().to(update_image))
            .route("/{image_id}", web::delete().to(delete_image))
    );
}
