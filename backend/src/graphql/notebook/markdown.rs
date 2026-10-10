use async_graphql::{Context, InputObject, Object, Result};

use crate::graphql::auth::user_db;
use crate::service::notebook::exchange::{
    self, CreateFromMarkdown, NotebookEditResult, NotebookNoteDocument,
};
use crate::service::notebook::projector::{NoteEdit, TextEdit};

#[derive(InputObject)]
pub struct CreateNotebookNoteFromMarkdownInput {
    pub workspace_id: String,
    pub title: String,
    /// Tradstry Markdown. A leading `# title` is added unless the body starts with it.
    #[graphql(default)]
    pub markdown: String,
    /// Unfiled when absent.
    pub folder_id: Option<String>,
    #[graphql(default)]
    pub trade_ids: Vec<String>,
    pub client_id: String,
    pub mutation_id: String,
}

#[derive(InputObject)]
pub struct NotebookTextEditInput {
    pub old: String,
    pub new: String,
}

/// Exactly one of `replaceText`, `append`, `rewrite` and `setTitle`.
#[derive(InputObject)]
pub struct EditNotebookNoteInput {
    pub id: String,
    /// The revision the edit was based on. Required for every edit but `append`.
    pub expected_revision: Option<String>,
    pub client_id: String,
    pub mutation_id: String,
    /// Each `old` must appear exactly once in the note's Markdown.
    pub replace_text: Option<Vec<NotebookTextEditInput>>,
    pub append: Option<String>,
    /// The whole note in Tradstry Markdown; only blocks that differ change.
    pub rewrite: Option<String>,
    pub set_title: Option<String>,
}

impl EditNotebookNoteInput {
    fn edit(&mut self) -> Result<NoteEdit> {
        let mut edits = Vec::new();
        if let Some(replace) = self.replace_text.take() {
            edits.push(NoteEdit::ReplaceText {
                edits: replace
                    .into_iter()
                    .map(|e| TextEdit {
                        old: e.old,
                        new: e.new,
                    })
                    .collect(),
            });
        }
        if let Some(markdown) = self.append.take() {
            edits.push(NoteEdit::Append { markdown });
        }
        if let Some(markdown) = self.rewrite.take() {
            edits.push(NoteEdit::Rewrite { markdown });
        }
        if let Some(title) = self.set_title.take() {
            edits.push(NoteEdit::SetTitle { title });
        }
        let edit = match (edits.pop(), edits.is_empty()) {
            (Some(edit), true) => edit,
            _ => {
                return Err(
                    "INVALID_EDIT: set exactly one of replaceText, append, rewrite and setTitle"
                        .into(),
                );
            }
        };
        if !matches!(edit, NoteEdit::Append { .. }) && self.expected_revision.is_none() {
            return Err("INVALID_EDIT: expectedRevision is required for this edit".into());
        }
        Ok(edit)
    }
}

#[derive(Default)]
pub struct NotebookMarkdownQuery;

#[Object]
impl NotebookMarkdownQuery {
    /// The note's body as Tradstry Markdown, read from its update log.
    async fn notebook_note_document(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> Result<NotebookNoteDocument> {
        let db = user_db(ctx).await?;
        Ok(exchange::read_document(db.pool(), db.user_id(), &id).await?)
    }
}

#[derive(Default)]
pub struct NotebookMarkdownMutation;

#[Object]
impl NotebookMarkdownMutation {
    async fn create_notebook_note_from_markdown(
        &self,
        ctx: &Context<'_>,
        input: CreateNotebookNoteFromMarkdownInput,
    ) -> Result<NotebookNoteDocument> {
        let db = user_db(ctx).await?;
        Ok(exchange::create_from_markdown(
            db.pool(),
            db.user_id(),
            CreateFromMarkdown {
                workspace_id: input.workspace_id,
                title: input.title,
                markdown: input.markdown,
                folder_id: input.folder_id,
                trade_ids: input.trade_ids,
                client_id: input.client_id,
                mutation_id: input.mutation_id,
            },
        )
        .await?)
    }

    /// Edits a note's body, changing only the blocks that differ.
    async fn edit_notebook_note(
        &self,
        ctx: &Context<'_>,
        mut input: EditNotebookNoteInput,
    ) -> Result<NotebookEditResult> {
        let edit = input.edit()?;
        let db = user_db(ctx).await?;
        Ok(exchange::edit_document(
            db.pool(),
            db.user_id(),
            &input.id,
            edit,
            input.expected_revision,
            &input.client_id,
            &input.mutation_id,
        )
        .await?)
    }
}
