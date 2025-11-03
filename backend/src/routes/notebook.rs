use actix_web::{web, HttpRequest, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use chrono::{Utc, Datelike};
use log::{info, error};
use std::sync::Arc;
use libsql::{Connection, Builder};

use crate::turso::{AppState, client::TursoClient};
use crate::turso::config::SupabaseConfig;
use crate::turso::auth::validate_supabase_jwt_token;
use crate::models::notebook::{
    NotebookNote, CreateNoteRequest, UpdateNoteRequest,
    NotebookTag, CreateTagRequest, UpdateTagRequest,
    NotebookTemplate, CreateTemplateRequest, UpdateTemplateRequest,
    NotebookReminder, CreateReminderRequest, UpdateReminderRequest,
    CalendarEvent, ExternalCalendarConnection, ExternalCalendarEvent,
};
use crate::service::calendar_service::CalendarService;
use crate::service::holidays_service::HolidaysService;
use crate::service::cache_service::CacheService;

#[derive(Debug, Serialize)]
struct ApiList<T> { success: bool, message: String, data: Option<Vec<T>> }
#[derive(Debug, Serialize)]
struct ApiItem<T> { success: bool, message: String, data: Option<T> }

// ==== Auth helpers (mirrors trade_notes.rs pattern) ====
fn extract_token_from_request(req: &HttpRequest) -> Option<String> {
    let auth_header = req.headers().get("authorization")?;
    let header_str = auth_header.to_str().ok()?;
    header_str.strip_prefix("Bearer ").map(|s| s.to_string())
}

async fn get_authenticated_user(
    req: &HttpRequest,
    supabase_config: &SupabaseConfig,
) -> Result<crate::turso::SupabaseClaims, actix_web::Error> {
    let token = extract_token_from_request(req)
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing authorization token"))?;
    validate_supabase_jwt_token(&token, supabase_config)
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid or expired authentication token"))
}

async fn get_user_database_connection(
    user_id: &str,
    turso_client: &Arc<TursoClient>,
) -> Result<Connection, actix_web::Error> {
    let user_db_entry = turso_client.get_user_database(user_id).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))?;

    let db_entry = user_db_entry.ok_or_else(|| actix_web::error::ErrorNotFound("User database not found"))?;

    let db = Builder::new_remote(db_entry.db_url.clone(), db_entry.db_token.clone())
        .build()
        .await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))?;

    db.connect().map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))
}

// ==== Notes ====
/// Create a note with cache invalidation
pub async fn create_note(
    req: HttpRequest,
    payload: web::Json<CreateNoteRequest>,
    app_state: web::Data<AppState>,
    supabase_config: web::Data<SupabaseConfig>,
    cache_service: web::Data<Arc<CacheService>>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &app_state.turso_client).await?;
    
    // Check storage quota before creating
    app_state.storage_quota_service.check_storage_quota(&claims.sub, &conn).await
        .map_err(|e| {
            error!("Storage quota check failed for user {}: {}", claims.sub, e);
            e
        })?;
    
    match NotebookNote::create(&conn, payload.into_inner()).await {
        Ok(note) => {
            // Invalidate cache after successful creation
            let cache_service_clone = cache_service.get_ref().clone();
            let user_id_clone = claims.sub.clone();
            
            tokio::spawn(async move {
                match cache_service_clone.invalidate_table_cache(&user_id_clone, "notebook_notes").await {
                    Ok(count) => info!("Invalidated {} notebook notes cache keys for user: {}", count, user_id_clone),
                    Err(e) => error!("Failed to invalidate notebook notes cache for user {}: {}", user_id_clone, e),
                }
            });
            
            Ok(HttpResponse::Created().json(ApiItem { 
                success: true, 
                message: "Note created".into(), 
                data: Some(note) 
            }))
        }
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookNote> { 
            success: false, 
            message: e.to_string(), 
            data: None 
        })),
    }
}

#[derive(Deserialize)]
pub struct NotesQuery { parent_id: Option<String> }

/// List notes with caching
pub async fn list_notes(
    req: HttpRequest,
    query: web::Query<NotesQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
    cache_service: web::Data<Arc<CacheService>>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    let parent_opt = query.parent_id.as_deref();

    // Generate cache key based on query parameters
    let query_hash = format!("{:?}", query.parent_id);
    let cache_key = format!("db:{}:notebook_notes:list:{}", claims.sub, query_hash);
    
    // Try to get from cache first (10 min TTL as per plan)
    match cache_service.get_or_fetch(&cache_key, 600, || async {
        info!("Cache miss for notebook notes list, fetching from database");
        NotebookNote::find_all(&conn, parent_opt).await.map_err(|e| anyhow::anyhow!("{}", e))
    }).await {
        Ok(notes) => {
            info!("✓ Retrieved {} notebook notes (cached)", notes.len());
            Ok(HttpResponse::Ok().json(ApiList { 
                success: true, 
                message: "Notes".into(), 
                data: Some(notes) 
            }))
        }
        Err(e) => {
            error!("Failed to get notebook notes: {}", e);
            Ok(HttpResponse::InternalServerError().json(ApiList::<NotebookNote> { 
                success: false, 
                message: e.to_string(), 
                data: None 
            }))
        }
    }
}

pub async fn get_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::find_by_id(&conn, &note_id).await {
        Ok(note) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Note".into(), data: Some(note) })),
        Err(_) => Ok(HttpResponse::NotFound().json(ApiItem::<NotebookNote> { success: false, message: "Not found".into(), data: None })),
    }
}

pub async fn get_note_tree(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::find_tree(&conn, &note_id).await {
        Ok((root, children)) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Tree",
            "data": {"root": root, "children": children}
        })) ),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

pub async fn update_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    payload: web::Json<UpdateNoteRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::update(&conn, &note_id, payload.into_inner()).await {
        Ok(note) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Updated".into(), data: Some(note) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookNote> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn delete_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::soft_delete(&conn, &note_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Deleted"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

pub async fn list_deleted_notes(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::find_deleted(&conn).await {
        Ok(notes) => Ok(HttpResponse::Ok().json(ApiList { success: true, message: "Deleted notes".into(), data: Some(notes) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiList::<NotebookNote> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn restore_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::restore(&conn, &note_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Restored"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

pub async fn permanent_delete_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::permanent_delete(&conn, &note_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Permanently deleted"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

#[derive(Deserialize)]
pub struct ReorderPayload { position: i64 }

pub async fn reorder_note(
    req: HttpRequest,
    note_id: web::Path<String>,
    payload: web::Json<ReorderPayload>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::reorder(&conn, &note_id, payload.position).await {
        Ok(note) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Reordered".into(), data: Some(note) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookNote> { success: false, message: e.to_string(), data: None })),
    }
}

// ==== Tags ====
pub async fn create_tag(
    req: HttpRequest,
    payload: web::Json<CreateTagRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::create(&conn, payload.into_inner()).await {
        Ok(tag) => Ok(HttpResponse::Created().json(ApiItem { success: true, message: "Tag created".into(), data: Some(tag) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookTag> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn list_tags(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::find_all(&conn).await {
        Ok(tags) => Ok(HttpResponse::Ok().json(ApiList { success: true, message: "Tags".into(), data: Some(tags) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiList::<NotebookTag> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn get_tag(
    req: HttpRequest,
    tag_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::find_by_id(&conn, &tag_id).await {
        Ok(tag) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Tag".into(), data: Some(tag) })),
        Err(_) => Ok(HttpResponse::NotFound().json(ApiItem::<NotebookTag> { success: false, message: "Not found".into(), data: None })),
    }
}

pub async fn update_tag(
    req: HttpRequest,
    tag_id: web::Path<String>,
    payload: web::Json<UpdateTagRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::update(&conn, &tag_id, payload.into_inner()).await {
        Ok(tag) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Updated".into(), data: Some(tag) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookTag> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn delete_tag(
    req: HttpRequest,
    tag_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::delete(&conn, &tag_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Deleted"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

pub async fn tag_note(
    req: HttpRequest,
    path: web::Path<(String, String)>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let (note_id, tag_id) = path.into_inner();
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::tag_note(&conn, &note_id, &tag_id).await {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Tagged"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

pub async fn untag_note(
    req: HttpRequest,
    path: web::Path<(String, String)>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let (note_id, tag_id) = path.into_inner();
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTag::untag_note(&conn, &note_id, &tag_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Untagged"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

// ==== Templates ====
pub async fn create_template(
    req: HttpRequest,
    payload: web::Json<CreateTemplateRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTemplate::create(&conn, payload.into_inner()).await {
        Ok(tpl) => Ok(HttpResponse::Created().json(ApiItem { success: true, message: "Template created".into(), data: Some(tpl) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookTemplate> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn list_templates(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTemplate::find_all(&conn).await {
        Ok(items) => Ok(HttpResponse::Ok().json(ApiList { success: true, message: "Templates".into(), data: Some(items) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiList::<NotebookTemplate> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn get_template(
    req: HttpRequest,
    tpl_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTemplate::find_by_id(&conn, &tpl_id).await {
        Ok(tpl) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Template".into(), data: Some(tpl) })),
        Err(_) => Ok(HttpResponse::NotFound().json(ApiItem::<NotebookTemplate> { success: false, message: "Not found".into(), data: None })),
    }
}

pub async fn update_template(
    req: HttpRequest,
    tpl_id: web::Path<String>,
    payload: web::Json<UpdateTemplateRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTemplate::update(&conn, &tpl_id, payload.into_inner()).await {
        Ok(tpl) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Updated".into(), data: Some(tpl) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookTemplate> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn delete_template(
    req: HttpRequest,
    tpl_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookTemplate::delete(&conn, &tpl_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Deleted"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

// ==== Reminders ====
pub async fn create_reminder(
    req: HttpRequest,
    payload: web::Json<CreateReminderRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    
    let reminder_data = payload.into_inner();
    
    // Create the reminder first
    match NotebookReminder::create(&conn, reminder_data.clone()).await {
        Ok(rem) => {
            // Parse the reminder_time to extract date and time components
            let reminder_time = chrono::DateTime::parse_from_rfc3339(&rem.reminder_time)
                .map_err(|_| actix_web::error::ErrorBadRequest("Invalid reminder_time format"))?;
            
            let start_date = reminder_time.date_naive().format("%Y-%m-%d").to_string();
            let end_date = start_date.clone(); // Default to same day, can be modified later
            let start_time = Some(reminder_time.time().format("%H:%M").to_string());
            let end_time = Some((reminder_time.time() + chrono::Duration::hours(1)).format("%H:%M").to_string());
            
            // Ensure calendar_events table exists with new schema and migrate if needed
            use crate::turso::schema::{update_table_schema, get_expected_schema};
            
            // Get the expected schema for calendar_events
            let expected_schemas = get_expected_schema();
            if let Some(calendar_schema) = expected_schemas.iter().find(|s| s.name == "calendar_events") {
                // This will handle both creation and migration
                update_table_schema(&conn, calendar_schema).await.map_err(|e| {
                    log::error!("Failed to update calendar_events schema: {:?}", e);
                    actix_web::error::ErrorInternalServerError("Failed to update calendar_events schema")
                })?;
            }
            
            // Create corresponding calendar event
            let calendar_event_sql = r#"
                INSERT INTO calendar_events (
                    id, reminder_id, event_title, event_description, 
                    start_date, end_date, start_time, end_time, 
                    is_all_day, is_synced, created_at, updated_at
                ) VALUES (
                    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
                )
            "#;
            
            conn.execute(
                calendar_event_sql,
                libsql::params![
                    rem.id.clone(),
                    rem.title.clone(),
                    rem.description.clone(),
                    start_date.clone(),
                    end_date.clone(),
                    start_time.clone(),
                    end_time.clone(),
                    false, // is_all_day
                    false  // is_synced
                ],
            ).await.map_err(|e| {
                log::error!("Failed to create calendar event: {:?}", e);
                log::error!("SQL: {}", calendar_event_sql);
                log::error!("Params: reminder_id={}, title={}, description={:?}, start_date={}, end_date={}, start_time={:?}, end_time={:?}", 
                    rem.id, rem.title, rem.description, start_date, end_date, start_time, end_time);
                actix_web::error::ErrorInternalServerError("Failed to create calendar event")
            })?;
            
            Ok(HttpResponse::Created().json(ApiItem { success: true, message: "Reminder and calendar event created".into(), data: Some(rem) }))
        },
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookReminder> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn list_reminders(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    // For now list all by joining calendar_events not required; simple list upcoming could be added later
    // Fetch all reminders for simplicity
    // This endpoint can be expanded with filters later
    let stmt = conn
        .prepare("SELECT id FROM notebook_reminders ORDER BY reminder_time ASC")
        .await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
    let mut rows = stmt.query(libsql::params![]).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
    let mut items: Vec<NotebookReminder> = Vec::new();
    while let Some(row) = rows.next().await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))? {
        let id: String = row.get(0).unwrap_or_default();
        if let Ok(rem) = NotebookReminder::find_by_id(&conn, &id).await { items.push(rem); }
    }
    Ok(HttpResponse::Ok().json(ApiList { success: true, message: "Reminders".into(), data: Some(items) }))
}

pub async fn get_reminder(
    req: HttpRequest,
    rem_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookReminder::find_by_id(&conn, &rem_id).await {
        Ok(item) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Reminder".into(), data: Some(item) })),
        Err(_) => Ok(HttpResponse::NotFound().json(ApiItem::<NotebookReminder> { success: false, message: "Not found".into(), data: None })),
    }
}

pub async fn update_reminder(
    req: HttpRequest,
    rem_id: web::Path<String>,
    payload: web::Json<UpdateReminderRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookReminder::update(&conn, &rem_id, payload.into_inner()).await {
        Ok(item) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Updated".into(), data: Some(item) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookReminder> { success: false, message: e.to_string(), data: None })),
    }
}

pub async fn delete_reminder(
    req: HttpRequest,
    rem_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookReminder::delete(&conn, &rem_id).await {
        Ok(true) => Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Deleted"}))),
        Ok(false) => Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false, "message": "Not found"}))),
        Err(e) => Ok(HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": e.to_string()}))),
    }
}

pub async fn complete_reminder(
    req: HttpRequest,
    rem_id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookReminder::mark_completed(&conn, &rem_id).await {
        Ok(item) => Ok(HttpResponse::Ok().json(ApiItem { success: true, message: "Completed".into(), data: Some(item) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookReminder> { success: false, message: e.to_string(), data: None })),
    }
}

// ==== Calendar ====
pub async fn list_calendar_events(
    req: HttpRequest,
    query: web::Query<DateRangeQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    
    // Get local events
    let local_events = CalendarEvent::find_by_date_range(&conn, &query.start, &query.end).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to fetch local events"))?;
    
    // Get external events
    let external_events = ExternalCalendarEvent::find_by_date_range(&conn, &query.start, &query.end).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to fetch external events"))?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Calendar events".to_string(),
        "data": {
            "local_events": local_events,
            "external_events": external_events
        }
    })))
}

pub async fn list_calendar_connections(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    
    let connections = ExternalCalendarConnection::find_by_user(&conn).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to fetch connections"))?;
    
    Ok(HttpResponse::Ok().json(connections))
}

#[derive(Deserialize)]
pub struct DateRangeQuery {
    pub start: String,
    pub end: String,
}

pub fn configure_notebook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/notebook")
            // Notes
            .route("/notes", web::post().to(create_note))
            .route("/notes", web::get().to(list_notes))
            .route("/notes/deleted", web::get().to(list_deleted_notes))
            .route("/notes/{id}", web::get().to(get_note))
            .route("/notes/{id}", web::put().to(update_note))
            .route("/notes/{id}", web::delete().to(delete_note))
            .route("/notes/{id}/restore", web::post().to(restore_note))
            .route("/notes/{id}/permanent", web::delete().to(permanent_delete_note))
            .route("/notes/{id}/tree", web::get().to(get_note_tree))
            .route("/notes/{id}/reorder", web::post().to(reorder_note))
            // Tags
            .route("/tags", web::post().to(create_tag))
            .route("/tags", web::get().to(list_tags))
            .route("/tags/{id}", web::get().to(get_tag))
            .route("/tags/{id}", web::put().to(update_tag))
            .route("/tags/{id}", web::delete().to(delete_tag))
            .route("/notes/{note_id}/tags/{tag_id}", web::post().to(tag_note))
            .route("/notes/{note_id}/tags/{tag_id}", web::delete().to(untag_note))
            // Templates
            .route("/templates", web::post().to(create_template))
            .route("/templates", web::get().to(list_templates))
            .route("/templates/{id}", web::get().to(get_template))
            .route("/templates/{id}", web::put().to(update_template))
            .route("/templates/{id}", web::delete().to(delete_template))
            // Reminders
            .route("/reminders", web::post().to(create_reminder))
            .route("/reminders", web::get().to(list_reminders))
            .route("/reminders/{id}", web::get().to(get_reminder))
            .route("/reminders/{id}", web::put().to(update_reminder))
            .route("/reminders/{id}", web::delete().to(delete_reminder))
            .route("/reminders/{id}/complete", web::post().to(complete_reminder))
            // Calendar
            .route("/calendar/events", web::get().to(list_calendar_events))
            .route("/calendar/connections", web::get().to(list_calendar_connections))
            .route("/calendar/connections/{id}", web::delete().to(disconnect_calendar))
            .route("/calendar/connections/{id}/sync", web::post().to(sync_calendar))
            .route("/calendar/sync-all", web::post().to(sync_all_calendars))
            .route("/calendar/holidays", web::get().to(get_public_holidays))
            .route("/calendar/holidays/sync", web::post().to(sync_public_holidays))
            .route("/oauth/google/exchange", web::post().to(google_oauth_exchange))
            .route("/oauth/microsoft/exchange", web::post().to(microsoft_oauth_exchange))
    );
}

// ==== External calendar connect/sync stubs ====
#[derive(Deserialize)]
#[allow(dead_code)]
struct ConnectPayload { access_token: String, refresh_token: String, token_expiry: String, calendar_id: Option<String> }
#[derive(Deserialize)]
struct OAuthCodePayload { code: String, redirect_uri: String, client_id: String, client_secret: String, tenant: Option<String> }

#[allow(dead_code)]
async fn connect_calendar(
    req: HttpRequest,
    path: web::Path<String>,
    payload: web::Json<ConnectPayload>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let provider = path.into_inner();
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    let id = CalendarService::connect_provider(
        &conn,
        &provider,
        &payload.access_token,
        &payload.refresh_token,
        &payload.token_expiry,
        payload.calendar_id.as_deref(),
    ).await.map_err(|_| actix_web::error::ErrorInternalServerError("Connect failed"))?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "connection_id": id})))
}

async fn disconnect_calendar(
    req: HttpRequest,
    id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    let ok = CalendarService::disconnect_provider(&conn, &id).await.map_err(|_| actix_web::error::ErrorInternalServerError("Disconnect failed"))?;
    if ok { Ok(HttpResponse::Ok().json(serde_json::json!({"success": true}))) } else { Ok(HttpResponse::NotFound().json(serde_json::json!({"success": false}))) }
}

async fn sync_calendar(
    req: HttpRequest,
    id: web::Path<String>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    
    // Get Google config from environment
    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    
    let n = CalendarService::sync_external_events(&conn, &id, &client_id, &client_secret).await.map_err(|_| actix_web::error::ErrorInternalServerError("Sync failed"))?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "synced": n})))
}

async fn sync_all_calendars(
    req: HttpRequest,
    turso_client: web::Data<Arc<TursoClient>>,
) -> Result<HttpResponse> {
    // Verify cron secret from header
    let cron_secret = req.headers().get("X-Cron-Secret")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing cron secret"))?;
    
    if cron_secret != std::env::var("CRON_SECRET").unwrap_or_default() {
        return Err(actix_web::error::ErrorUnauthorized("Invalid cron secret"));
    }
    
    // Get Google config from environment
    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    
    // Get all users with active Google connections from registry
    let registry_conn = turso_client.get_registry_connection().await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Registry connection failed"))?;
    
    let stmt = registry_conn.prepare(
        "SELECT user_id FROM user_databases WHERE is_active = 1"
    ).await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
    
    let mut rows = stmt.query(libsql::params![]).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
    
    let mut total_synced = 0u64;
    let mut success_count = 0u64;
    let mut failure_count = 0u64;
    
    while let Some(row) = rows.next().await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))? {
        let user_id: String = row.get(0).unwrap_or_default();
        
        // Get user's database connection
        if let Ok(Some(user_db)) = turso_client.get_user_database(&user_id).await {
            let conn = libsql::Builder::new_remote(user_db.db_url.clone(), user_db.db_token.clone())
                .build()
                .await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))?
                .connect()
                .map_err(|_| actix_web::error::ErrorInternalServerError("Database connection failed"))?;
            
            // Get all active Google connections for this user
            let conn_stmt = conn.prepare(
                "SELECT id FROM external_calendar_connections WHERE provider = 'google' AND is_active = 1"
            ).await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
            
            let mut conn_rows = conn_stmt.query(libsql::params![]).await
                .map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))?;
            
            while let Some(conn_row) = conn_rows.next().await.map_err(|_| actix_web::error::ErrorInternalServerError("Query failed"))? {
                let connection_id: String = conn_row.get(0).unwrap_or_default();
                
                match CalendarService::sync_external_events(&conn, &connection_id, &client_id, &client_secret).await {
                    Ok(synced) => {
                        total_synced += synced;
                        success_count += 1;
                    },
                    Err(_) => {
                        failure_count += 1;
                    }
                }
            }
        }
    }
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "total_synced": total_synced,
        "success_count": success_count,
        "failure_count": failure_count
    })))
}

pub async fn sync_public_holidays(
    req: HttpRequest,
    query: web::Query<HolidaysSyncQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    
    let country_code = query.country_code.as_deref().unwrap_or("US");
    let year = query.year.unwrap_or_else(|| Utc::now().year());
    
    // Fetch holidays from Google
    let holidays = HolidaysService::fetch_google_holidays(country_code, year).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to fetch holidays"))?;
    
    // Store in database
    let inserted = HolidaysService::store_holidays(&conn, holidays).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to store holidays"))?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "synced": inserted,
        "country_code": country_code,
        "year": year
    })))
}

pub async fn get_public_holidays(
    req: HttpRequest,
    query: web::Query<DateRangeQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    
    // Get user's country from profile or default to US
    let country_code = "US"; // TODO: Get from user profile
    
    let holidays = HolidaysService::get_holidays(&conn, country_code, &query.start, &query.end).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Failed to fetch holidays"))?;
    
    Ok(HttpResponse::Ok().json(holidays))
}

#[derive(Deserialize)]
pub struct HolidaysSyncQuery {
    pub country_code: Option<String>,
    pub year: Option<i32>,
}

// Optional: exchange OAuth code and auto-connect
async fn google_oauth_exchange(
    req: HttpRequest,
    payload: web::Json<OAuthCodePayload>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    let (access, refresh, expiry) = CalendarService::google_exchange_code(&payload.code, &payload.client_id, &payload.client_secret, &payload.redirect_uri).await
        .map_err(|_| actix_web::error::ErrorBadRequest("Token exchange failed"))?;
    let id = CalendarService::connect_provider(&conn, "google", &access, &refresh, &expiry, None).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Connect failed"))?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "connection_id": id})))
}

async fn microsoft_oauth_exchange(
    req: HttpRequest,
    payload: web::Json<OAuthCodePayload>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    let tenant = payload.tenant.clone().unwrap_or_else(|| "common".to_string());
    let (access, refresh, expiry) = CalendarService::microsoft_exchange_code(&payload.code, &payload.client_id, &payload.client_secret, &payload.redirect_uri, &tenant).await
        .map_err(|_| actix_web::error::ErrorBadRequest("Token exchange failed"))?;
    let id = CalendarService::connect_provider(&conn, "microsoft", &access, &refresh, &expiry, None).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("Connect failed"))?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "connection_id": id})))
}


