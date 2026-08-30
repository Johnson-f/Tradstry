use async_graphql::{Context, Enum, InputObject, Object, Result};
use std::sync::Arc;

use crate::service::db::schema::tables::notebook::folders::{
    self, MoveNotebookNodeInput as TableMoveNotebookNodeInput, NotebookFolder, NotebookNodeType,
};
use crate::service::db::schema::tables::notebook::notes::{
    self, CreateNotebookNoteInput, NotebookNote, UpdateNotebookNoteInput,
};
use crate::service::read_service::notebook as notebook_service;
use crate::service::upload::r2::R2Client;

/// GraphQL-facing mirror of the table-layer `NotebookNodeType` enum.
#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum NotebookNodeTypeGql {
    Folder,
    Note,
}

impl From<NotebookNodeTypeGql> for NotebookNodeType {
    fn from(value: NotebookNodeTypeGql) -> Self {
        match value {
            NotebookNodeTypeGql::Folder => NotebookNodeType::Folder,
            NotebookNodeTypeGql::Note => NotebookNodeType::Note,
        }
    }
}

#[derive(InputObject)]
pub struct CreateNotebookFolderInput {
    pub id: Option<String>,
    pub workspace_id: String,
    pub parent_folder_id: Option<String>,
    pub name: String,
}

#[derive(InputObject)]
pub struct MoveNotebookNodeInput {
    pub workspace_id: String,
    pub node_id: String,
    pub node_type: NotebookNodeTypeGql,
    pub new_parent_folder_id: Option<String>,
    pub new_sort_order: i64,
}

pub(super) async fn get_user_db(ctx: &Context<'_>) -> Result<crate::service::db::client::UserDb> {
    crate::graphql::auth::user_db(ctx).await
}

// Presigned R2 GET URLs expire; 7 days is the SigV4 max and is re-signed on
// every note fetch, so a normal session never sees expiry.
const PRESIGN_TTL: std::time::Duration = std::time::Duration::from_secs(604_800);

/// Overwrite each note image's (empty) `secure_url` with a freshly presigned
/// R2 GET URL derived from its object key.
async fn presign_note_images(ctx: &Context<'_>, notes: &mut [NotebookNote]) -> Result<()> {
    let r2 = ctx.data::<Arc<R2Client>>()?;

    // Collect the indices + object keys of images that still need a URL. Only
    // R2-backed rows have an empty secure_url; rows still on Cloudinary keep
    // their existing URL until migrated.
    let mut targets: Vec<(usize, usize, String)> = Vec::new();
    for (note_idx, note) in notes.iter().enumerate() {
        for (img_idx, image) in note.images.iter().enumerate() {
            if image.secure_url.is_empty() {
                targets.push((note_idx, img_idx, image.object_key.clone()));
            }
        }
    }

    // Presign concurrently — each call is an independent R2 network round-trip.
    let urls = futures_util::future::join_all(
        targets
            .iter()
            .map(|(_, _, key)| r2.presigned_get_url(key, PRESIGN_TTL)),
    )
    .await;

    // Write successful URLs back by index; a presign error leaves the URL empty.
    for ((note_idx, img_idx, _), url) in targets.iter().zip(urls) {
        if let Ok(url) = url {
            notes[*note_idx].images[*img_idx].secure_url = url;
        }
    }

    Ok(())
}

#[derive(Default)]
pub struct NotebookQuery;

#[Object]
impl NotebookQuery {
    async fn notebook_notes(
        &self,
        ctx: &Context<'_>,
        workspace_id: Option<String>,
    ) -> Result<Vec<NotebookNote>> {
        let user_db = get_user_db(ctx).await?;
        let mut notes =
            notebook_service::list_notebook_notes(&user_db, workspace_id.as_deref()).await?;
        presign_note_images(ctx, &mut notes).await?;
        Ok(notes)
    }

    async fn notebook_note(&self, ctx: &Context<'_>, id: String) -> Result<Option<NotebookNote>> {
        let user_db = get_user_db(ctx).await?;
        let mut note = notebook_service::get_notebook_note(&user_db, &id).await?;
        if let Some(note) = note.as_mut() {
            presign_note_images(ctx, std::slice::from_mut(note)).await?;
        }
        Ok(note)
    }

    async fn notebook_folders(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<NotebookFolder>> {
        let user_db = get_user_db(ctx).await?;
        Ok(notebook_service::list_notebook_folders(&user_db, &workspace_id).await?)
    }
}

#[derive(Default)]
pub struct NotebookMutation;

#[Object]
impl NotebookMutation {
    async fn create_notebook_note(
        &self,
        ctx: &Context<'_>,
        input: CreateNotebookNoteInput,
    ) -> Result<NotebookNote> {
        let user_db = get_user_db(ctx).await?;
        let note = notebook_service::create_notebook_note(&user_db, input).await?;
        super::sync::seed_new_note(user_db.pool(), &note.id).await;
        Ok(note)
    }

    async fn update_notebook_note(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: UpdateNotebookNoteInput,
    ) -> Result<NotebookNote> {
        let user_db = get_user_db(ctx).await?;
        let note = notebook_service::update_notebook_note(&user_db, &id, input).await?;
        Ok(note)
    }

    /// Toggle a note's star and/or pin flags. Metadata only — leave a flag null to keep it.
    /// No reindex: star/pin don't change the note's searchable content.
    async fn set_notebook_note_flags(
        &self,
        ctx: &Context<'_>,
        id: String,
        is_starred: Option<bool>,
        is_pinned: Option<bool>,
    ) -> Result<NotebookNote> {
        let user_db = get_user_db(ctx).await?;
        let note =
            notebook_service::set_notebook_note_flags(&user_db, &id, is_starred, is_pinned).await?;
        Ok(note)
    }

    async fn delete_notebook_note(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let user_db = get_user_db(ctx).await?;
        let mut tx = user_db.pool().begin().await?;
        let deleted = notes::delete_notebook_note_tx(
            &mut tx,
            &id,
            user_db.user_id(),
            &crate::service::hlc::stamp(),
        )
        .await?;
        if deleted {
            crate::service::notebook::media::remove_note_references_tx(
                &mut tx,
                user_db.user_id(),
                std::slice::from_ref(&id),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(deleted)
    }

    async fn create_notebook_folder(
        &self,
        ctx: &Context<'_>,
        input: CreateNotebookFolderInput,
    ) -> Result<NotebookFolder> {
        let user_db = get_user_db(ctx).await?;
        let table_input = folders::CreateNotebookFolderInput {
            id: input.id,
            user_id: user_db.user_id().to_string(),
            workspace_id: input.workspace_id,
            parent_folder_id: input.parent_folder_id,
            name: input.name,
        };
        Ok(notebook_service::create_notebook_folder(&user_db, table_input).await?)
    }

    async fn rename_notebook_folder(
        &self,
        ctx: &Context<'_>,
        id: String,
        name: String,
    ) -> Result<NotebookFolder> {
        let user_db = get_user_db(ctx).await?;
        notebook_service::rename_notebook_folder(&user_db, &id, &name).await?;
        // Return the freshly renamed folder via a direct lookup.
        folders::find_notebook_folder(user_db.pool(), &id)
            .await?
            .ok_or_else(|| async_graphql::Error::new("Notebook folder not found after rename"))
    }

    async fn delete_notebook_folder(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let user_db = get_user_db(ctx).await?;

        Ok(notebook_service::delete_notebook_folder(&user_db, &id).await?)
    }

    async fn move_notebook_node(
        &self,
        ctx: &Context<'_>,
        input: MoveNotebookNodeInput,
    ) -> Result<bool> {
        let user_db = get_user_db(ctx).await?;
        let table_input = TableMoveNotebookNodeInput {
            workspace_id: input.workspace_id,
            node_id: input.node_id,
            node_type: input.node_type.into(),
            new_parent_folder_id: input.new_parent_folder_id,
            new_sort_order: input.new_sort_order,
        };

        // Map the cycle-guard (and any other) anyhow error into a clean
        // async_graphql error so the client sees a readable message.
        notebook_service::move_notebook_node(&user_db, table_input)
            .await
            .map_err(|error| async_graphql::Error::new(error.to_string()))?;

        Ok(true)
    }
}
