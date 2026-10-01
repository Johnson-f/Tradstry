//! Notebook notes and their attached media.
//!
//! Each tool resolves the calling user from the per-request `UserContext`, scopes the
//! read-service call to them, and serializes through the shared envelope.

use rmcp::{
    ErrorData, RoleServer, handler::server::wrapper::Parameters, model::*, service::RequestContext,
    tool, tool_router,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use base64::Engine as _;
use tradstry_backend::service::notebook::blocks::extract_notebook_blocks;
use tradstry_backend::service::read_service::notebook as notebook_service;
use tradstry_backend::service::upload::media::extract_keyframes;

use crate::server::{TradstryMcp, envelope, internal};

/// Parameters for `get_notebook`.
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct GetNotebookParams {
    /// Optional single note id. When supplied, returns that one note; when
    /// omitted, all of the user's notes are returned (optionally scoped by
    /// workspace_id).
    pub note_id: Option<String>,
    /// Optional account id to scope the listing to a single trading account.
    pub workspace_id: Option<String>,
    /// Maximum number of notes to return. Defaults to 20 (max 100). Notes carry their
    /// full text, so an unbounded listing can be very large.
    pub limit: Option<u32>,
    /// Opaque pagination cursor from a previous response's `next_cursor`.
    pub after_cursor: Option<String>,
}

/// Parameters for `view_media`.
#[derive(Debug, Deserialize, Serialize, JsonSchema)]
pub struct ViewMediaParams {
    /// The media_id of the image or video to fetch. Obtain media_ids from the
    /// `get_notebook` tool's media manifest. The media must belong to the
    /// authenticated user — foreign ids are rejected.
    pub media_id: String,
}

/// Claude rejects images over 5 MB, and a larger inline image would dominate the
/// model's context anyway.
const MAX_INLINE_IMAGE_BYTES: i64 = 5 * 1024 * 1024;
/// Keyframe extraction buffers the whole file in memory before ffmpeg runs.
const MAX_KEYFRAME_VIDEO_BYTES: i64 = 100 * 1024 * 1024;

fn too_large(kind: &str, bytes: i64, limit: i64) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(format!(
        "This {kind} is {:.1} MB, over the {} MB this tool can return. Ask the user to open \
         it in Tradstry instead.",
        bytes as f64 / (1024.0 * 1024.0),
        limit / (1024 * 1024),
    ))])
}

#[tool_router(router = notebook_router, vis = "pub")]
impl TradstryMcp {
    #[tool(
        title = "Get notebook notes",
        description = "Get the user's notebook notes with their full text content and a media manifest \
                       listing attached images and videos, plus the folder tree for the account(s) in \
                       view. Each media item exposes a media_id for the view_media tool. Each folder \
                       carries its id, parent_folder_id (for nesting) and is_system flag — use these ids \
                       as the folder_id/parent_folder_id when creating notes or folders (the System \
                       folder is where agent notes land by default). Pass note_id for a single note; \
                       pass workspace_id to scope to one trading account; omit both to list all notes.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    pub async fn get_notebook(
        &self,
        Parameters(params): Parameters<GetNotebookParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let u = self.user(&ctx)?;
        let user_db = self.synced_user_db(&u.user_id).await?;

        let page_size = params.limit.unwrap_or(20).clamp(1, 100) as usize;
        let (notes, next_cursor) = match params.note_id {
            Some(ref id) => {
                match notebook_service::get_notebook_note(&user_db, id)
                    .await
                    .map_err(internal)?
                {
                    Some(note) => (vec![note], None),
                    None => {
                        return Ok(CallToolResult::success(vec![ContentBlock::text(
                            "Notebook note not found.",
                        )]));
                    }
                }
            }
            // Notes carry their full text, so a listing is one of the largest payloads
            // this server emits. Paged in SQL so only the requested page is loaded.
            None => {
                let (page, has_more) = notebook_service::list_notebook_notes_page(
                    &user_db,
                    params.workspace_id.as_deref(),
                    params.after_cursor.as_deref(),
                    page_size,
                )
                .await
                .map_err(|e| ErrorData::invalid_params(e.to_string(), None))?;
                let next_cursor = has_more
                    .then(|| page.last().map(|n| n.id.clone()))
                    .flatten();
                (page, next_cursor)
            }
        };

        let out: Vec<serde_json::Value> = notes
            .iter()
            .map(|n| {
                let text = extract_notebook_blocks(&n.document_json)
                    .into_iter()
                    .map(|b| b.text)
                    .collect::<Vec<_>>()
                    .join("\n");
                let media: Vec<serde_json::Value> = n
                    .images
                    .iter()
                    .map(|m| {
                        serde_json::json!({
                            "media_id": m.id,
                            "media_type": m.media_type,
                            "content_type": m.content_type,
                            "width": m.width,
                            "height": m.height,
                            "duration_seconds": m.duration_seconds,
                        })
                    })
                    .collect();
                serde_json::json!({
                    "id": n.id,
                    "title": n.title,
                    "workspace_id": n.workspace_id,
                    "folder_id": n.folder_id,
                    "text": text,
                    "media": media,
                })
            })
            .collect();

        // Folder tree for the account(s) in view, so the agent can discover folder ids —
        // including the System folder — to file or nest notes and folders, rather than
        // guessing ids it would then pass to create_note / create_folder.
        let mut account_ids: Vec<String> = notes.iter().map(|n| n.workspace_id.clone()).collect();
        if let Some(workspace_id) = &params.workspace_id {
            account_ids.push(workspace_id.clone());
        }
        account_ids.sort();
        account_ids.dedup();

        let mut folders_out: Vec<serde_json::Value> = Vec::new();
        for workspace_id in &account_ids {
            let folders = notebook_service::list_notebook_folders(&user_db, workspace_id)
                .await
                .map_err(internal)?;
            for f in folders {
                folders_out.push(serde_json::json!({
                    "id": f.id,
                    "name": f.name,
                    "workspace_id": f.workspace_id,
                    "parent_folder_id": f.parent_folder_id,
                    "is_system": f.is_system,
                }));
            }
        }

        envelope(
            serde_json::json!({ "notes": out, "folders": folders_out }),
            next_cursor,
        )
    }

    #[tool(
        title = "View notebook media",
        description = "View an image or video from the user's notebook. Pass a media_id from the \
                       get_notebook tool's media manifest. Images up to 5 MB come back inline; a \
                       video up to 100 MB comes back as up to 8 keyframes in order. Larger files \
                       return a short text note instead.",
        annotations(
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    pub async fn view_media(
        &self,
        Parameters(params): Parameters<ViewMediaParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let u = self.user(&ctx)?;
        let user_db = self.synced_user_db(&u.user_id).await?;

        // Look up the media row scoped to the authenticated user.
        let media = notebook_service::find_notebook_image(&user_db, &params.media_id)
            .await
            .map_err(internal)?;

        let Some(media) = media else {
            return Ok(CallToolResult::success(vec![ContentBlock::text(
                "Media not found.",
            )]));
        };

        let key = &media.object_key;
        let content_type = media.content_type.clone();

        // The stored size can predate the upload limits, so ask R2 before downloading.
        let size = self
            .state
            .r2
            .object_metadata(key)
            .await
            .map_err(internal)?
            .map(|object| object.content_length)
            .ok_or_else(|| internal("media file is missing from storage"))?;

        match media.media_type.as_str() {
            "image" if size > MAX_INLINE_IMAGE_BYTES => {
                Ok(too_large("image", size, MAX_INLINE_IMAGE_BYTES))
            }
            "image" => {
                let bytes = self.state.r2.get_object(key).await.map_err(internal)?;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                Ok(CallToolResult::success(vec![ContentBlock::image(
                    b64,
                    content_type,
                )]))
            }
            _ if size > MAX_KEYFRAME_VIDEO_BYTES => {
                Ok(too_large("video", size, MAX_KEYFRAME_VIDEO_BYTES))
            }
            _ => {
                // Video: fetch bytes and extract keyframes via ffmpeg.
                let bytes = self.state.r2.get_object(key).await.map_err(internal)?;
                let frames = extract_keyframes(&bytes, 8).await;
                if frames.is_empty() {
                    return Ok(CallToolResult::success(vec![ContentBlock::text(
                        "Could not extract frames from this video (ffmpeg unavailable or unsupported format).",
                    )]));
                }
                let media_id = &params.media_id;
                let mut contents: Vec<ContentBlock> = Vec::with_capacity(frames.len() + 1);
                contents.push(ContentBlock::text(format!(
                    "{} keyframes extracted from video {} (in chronological order); analyze them as frames of one clip.",
                    frames.len(),
                    media_id,
                )));
                for frame in frames {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&frame);
                    contents.push(ContentBlock::image(b64, "image/jpeg"));
                }
                Ok(CallToolResult::success(contents))
            }
        }
    }
}
