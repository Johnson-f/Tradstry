use async_graphql::{Context, Object, Result};

use crate::graphql::auth::user_db;
use crate::service::agents::{AgentActor, AgentService};
use crate::service::auth::AuthClaims;
use crate::service::notebook::library::{
    self, DeletedNotebookNotePage, NotebookFolderNoteCount, NotebookNoteFilter,
    NotebookNoteSummaryPage, NotebookSearchHit,
};
use std::sync::Arc;

#[derive(Default)]
pub struct NotebookLibraryQuery;

#[Object]
impl NotebookLibraryQuery {
    /// Live notes without their bodies, pinned first then most recently updated.
    async fn notebook_note_summaries(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        filter: Option<NotebookNoteFilter>,
        first: Option<i32>,
        after: Option<String>,
    ) -> Result<NotebookNoteSummaryPage> {
        let db = user_db(ctx).await?;
        Ok(library::note_summaries(
            db.pool(),
            db.user_id(),
            &workspace_id,
            filter.unwrap_or_default(),
            first,
            after.as_deref(),
        )
        .await?)
    }

    /// Notes whose content matches `query`, best first.
    async fn search_notebook(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        query: String,
        limit: Option<i32>,
    ) -> Result<Vec<NotebookSearchHit>> {
        let db = user_db(ctx).await?;
        let knowledge = ctx
            .data::<Arc<AgentService>>()?
            .knowledge()
            .cloned()
            .ok_or("SEARCH_UNAVAILABLE: note search is not configured")?;
        let actor = AgentActor {
            user_id: db.user_id().to_string(),
            subject: ctx.data::<AuthClaims>()?.sub.clone(),
        };
        Ok(
            library::search_notes(db.pool(), &knowledge, &actor, &workspace_id, &query, limit)
                .await?,
        )
    }

    async fn notebook_folder_note_counts(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<NotebookFolderNoteCount>> {
        let db = user_db(ctx).await?;
        Ok(library::folder_note_counts(db.pool(), db.user_id(), &workspace_id).await?)
    }

    /// Notes deleted recently enough to restore, most recent first.
    async fn deleted_notebook_notes(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        first: Option<i32>,
        after: Option<String>,
    ) -> Result<DeletedNotebookNotePage> {
        let db = user_db(ctx).await?;
        Ok(library::deleted_notes(
            db.pool(),
            db.user_id(),
            &workspace_id,
            first,
            after.as_deref(),
        )
        .await?)
    }
}

#[derive(Default)]
pub struct NotebookLibraryMutation;

#[Object]
impl NotebookLibraryMutation {
    /// Links and unlinks trades in one step and returns the note's linked trade ids.
    async fn link_notebook_note_trades(
        &self,
        ctx: &Context<'_>,
        id: String,
        #[graphql(default)] add: Vec<String>,
        #[graphql(default)] remove: Vec<String>,
    ) -> Result<Vec<String>> {
        let db = user_db(ctx).await?;
        Ok(library::link_trades(db.pool(), db.user_id(), &id, &add, &remove).await?)
    }

    /// Brings back a note deleted within the last 30 days.
    async fn restore_notebook_note(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let db = user_db(ctx).await?;
        library::restore_note(db.pool(), db.user_id(), &id).await?;
        Ok(true)
    }
}
