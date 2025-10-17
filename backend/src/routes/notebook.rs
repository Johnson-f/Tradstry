use actix_web::{web, HttpRequest, HttpResponse, Result};
use serde::{Deserialize, Serialize};
// use log::info;
use std::sync::Arc;
use libsql::{Connection, Builder};

use crate::turso::client::TursoClient;
use crate::turso::config::SupabaseConfig;
use crate::turso::auth::validate_supabase_jwt_token;
use crate::models::notebook::{
    NotebookNote, CreateNoteRequest, UpdateNoteRequest,
    NotebookTag, CreateTagRequest, UpdateTagRequest,
    NotebookTemplate, CreateTemplateRequest, UpdateTemplateRequest,
    NotebookReminder, CreateReminderRequest, UpdateReminderRequest,
    CalendarEvent,
};
use crate::service::calendar_service::CalendarService;

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
pub async fn create_note(
    req: HttpRequest,
    payload: web::Json<CreateNoteRequest>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match NotebookNote::create(&conn, payload.into_inner()).await {
        Ok(note) => Ok(HttpResponse::Created().json(ApiItem { success: true, message: "Note created".into(), data: Some(note) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiItem::<NotebookNote> { success: false, message: e.to_string(), data: None })),
    }
}

#[derive(Deserialize)]
pub struct NotesQuery { parent_id: Option<String> }

pub async fn list_notes(
    req: HttpRequest,
    query: web::Query<NotesQuery>,
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    let parent_opt = query.parent_id.as_deref();
    match NotebookNote::find_all(&conn, parent_opt).await {
        Ok(notes) => Ok(HttpResponse::Ok().json(ApiList { success: true, message: "Notes".into(), data: Some(notes) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiList::<NotebookNote> { success: false, message: e.to_string(), data: None })),
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
    match NotebookReminder::create(&conn, payload.into_inner()).await {
        Ok(rem) => Ok(HttpResponse::Created().json(ApiItem { success: true, message: "Reminder created".into(), data: Some(rem) })),
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
    turso_client: web::Data<Arc<TursoClient>>,
    supabase_config: web::Data<SupabaseConfig>,
) -> Result<HttpResponse> {
    let claims = get_authenticated_user(&req, &supabase_config).await?;
    let conn = get_user_database_connection(&claims.sub, &turso_client).await?;
    match CalendarEvent::find_all(&conn).await {
        Ok(events) => Ok(HttpResponse::Ok().json(ApiList { success: true, message: "Events".into(), data: Some(events) })),
        Err(e) => Ok(HttpResponse::InternalServerError().json(ApiList::<CalendarEvent> { success: false, message: e.to_string(), data: None })),
    }
}

pub fn configure_notebook_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/notebook")
            // Notes
            .route("/notes", web::post().to(create_note))
            .route("/notes", web::get().to(list_notes))
            .route("/notes/{id}", web::get().to(get_note))
            .route("/notes/{id}", web::put().to(update_note))
            .route("/notes/{id}", web::delete().to(delete_note))
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
            .route("/calendar/connect/{provider}", web::post().to(connect_calendar))
            .route("/calendar/connections/{id}", web::delete().to(disconnect_calendar))
            .route("/calendar/sync/{id}", web::post().to(sync_calendar))
            .route("/calendar/oauth/google", web::post().to(google_oauth_exchange))
            .route("/calendar/oauth/microsoft", web::post().to(microsoft_oauth_exchange))
    );
}

// ==== External calendar connect/sync stubs ====
#[derive(Deserialize)]
struct ConnectPayload { access_token: String, refresh_token: String, token_expiry: String, calendar_id: Option<String> }
#[derive(Deserialize)]
struct OAuthCodePayload { code: String, redirect_uri: String, client_id: String, client_secret: String, tenant: Option<String> }

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
    let n = CalendarService::sync_external_events(&conn, &id).await.map_err(|_| actix_web::error::ErrorInternalServerError("Sync failed"))?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"success": true, "synced": n})))
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


