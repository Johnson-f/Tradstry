//! Reading and writing note bodies as Tradstry Markdown. Every write lands as an
//! incremental Yjs update that changes only the blocks that differ, so formatting,
//! media and trade chips the writer did not touch survive, and so does anything
//! a user types elsewhere in the note at the same time.

use std::collections::{BTreeSet, HashMap};
use std::time::Duration;

use anyhow::{Context, Result};
use async_graphql::SimpleObject;
use serde_json::{Value, json};
use sqlx::{PgPool, Row};

use crate::graphql::notebook::crdt as crdt_api;
use crate::service::db::schema::tables::notebook::crdt::{self, NoteState};
use crate::service::db::schema::tables::notebook::notes::{
    self, CreateNotebookNoteInput, NotebookNote,
};
use crate::service::mutations;
use crate::service::notebook::projector::{
    self, EditChanges, ExchangeContext, ExchangeMedia, ExchangeRejection, NoteEdit,
};

const SEEDING_WAIT: Duration = Duration::from_secs(5);
const SEEDING_POLL: Duration = Duration::from_millis(250);
const APPEND_ATTEMPTS: usize = 3;

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookNoteDocument {
    pub id: String,
    pub workspace_id: String,
    pub folder_id: Option<String>,
    pub title: String,
    /// The body in Tradstry Markdown. Leave `<!-- tradstry:keep … -->` lines as they are.
    pub markdown: String,
    /// Pass back as `expectedRevision` so an edit based on stale text is refused.
    pub revision: String,
    /// Blocks shown as keep placeholders because Markdown cannot carry them.
    pub placeholders: i32,
    pub is_starred: bool,
    pub is_pinned: bool,
    pub updated_at: String,
    pub linked_trades: Vec<NoteTradeLink>,
    pub media: Vec<NoteMedia>,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NoteTradeLink {
    pub id: String,
    /// Symbol and opening day in the journal's time zone, e.g. `AAPL · 2026-10-03`.
    pub label: String,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NoteMedia {
    pub hash: String,
    pub media_type: String,
    pub width: i64,
    pub height: i64,
    pub bytes: i64,
    pub original_filename: String,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookEditResult {
    pub note: NotebookNoteDocument,
    pub changes: NotebookEditChanges,
    /// Formatting Markdown cannot express that was dropped from rewritten blocks.
    pub formatting_lost: Vec<String>,
    /// True when this mutation had already been applied and its stored result was returned.
    pub replayed: bool,
}

#[derive(Debug, Clone, Default, SimpleObject, serde::Serialize, serde::Deserialize)]
pub struct NotebookEditChanges {
    pub kept: i32,
    pub changed: i32,
    pub inserted: i32,
    pub removed: i32,
}

impl From<EditChanges> for NotebookEditChanges {
    fn from(c: EditChanges) -> Self {
        Self {
            kept: c.kept,
            changed: c.changed,
            inserted: c.inserted,
            removed: c.removed,
        }
    }
}

pub struct CreateFromMarkdown {
    pub workspace_id: String,
    pub title: String,
    pub markdown: String,
    pub folder_id: Option<String>,
    pub trade_ids: Vec<String>,
    pub client_id: String,
    pub mutation_id: String,
}

fn reject(code: &str, message: impl std::fmt::Display) -> anyhow::Error {
    ExchangeRejection {
        code: code.to_string(),
        message: format!("{code}: {message}"),
    }
    .into()
}

async fn owned_note(pool: &PgPool, user_id: &str, note_id: &str) -> Result<NotebookNote> {
    notes::find_notebook_note(pool, note_id, user_id)
        .await?
        .ok_or_else(|| reject("NOT_FOUND", "note not found"))
}

/// Every write takes one path, so a note no client has opened yet is seeded first,
/// as creating a note does.
async fn ensure_crdt(pool: &PgPool, note_id: &str) -> Result<()> {
    let waited = std::time::Instant::now();
    loop {
        match crdt::note_state(pool, note_id).await? {
            NoteState::Crdt => return Ok(()),
            NoteState::Legacy => crdt::seed_note(pool, note_id).await?,
            NoteState::Seeding if waited.elapsed() < SEEDING_WAIT => {
                tokio::time::sleep(SEEDING_POLL).await
            }
            NoteState::Seeding => {
                return Err(reject("RETRY", "the note is being prepared; try again shortly"));
            }
        }
    }
}

async fn load_chain(pool: &PgPool, user_id: &str, note_id: &str) -> Result<(Vec<Vec<u8>>, i64)> {
    let rows = crdt_api::updates_since(pool, user_id, note_id, 0).await?;
    let max_seq = rows.last().map(|(seq, _)| *seq).unwrap_or(0);
    Ok((rows.into_iter().map(|(_, update)| update).collect(), max_seq))
}

/// `trade:<id>` and `media:<hash>` references written in Markdown.
fn references_in(texts: &[&str]) -> (BTreeSet<String>, BTreeSet<String>) {
    let mut trades = BTreeSet::new();
    let mut media = BTreeSet::new();
    for text in texts {
        for (at, _) in text.match_indices("(trade:") {
            let id: String = text[at + 7..]
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                .take(128)
                .collect();
            if !id.is_empty() {
                trades.insert(id);
            }
        }
        for (at, _) in text.match_indices("(media:") {
            let hash: String = text[at + 7..]
                .chars()
                .take_while(|c| c.is_ascii_hexdigit())
                .take(64)
                .collect();
            if hash.len() == 64 {
                media.insert(hash.to_ascii_lowercase());
            }
        }
    }
    (trades, media)
}

/// Labels for the live trades among `ids` in the workspace. Unknown or deleted
/// trades are left out, which is what makes a new reference to them invalid.
async fn trade_labels(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    ids: &BTreeSet<String>,
) -> Result<HashMap<String, String>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let timezone =
        crate::service::read_service::trade_set::journal_timezone(pool, user_id, workspace_id)
            .await?;
    let ids: Vec<&String> = ids.iter().collect();
    let rows = sqlx::query(
        "SELECT id, symbol, to_char(open_date AT TIME ZONE $4, 'YYYY-MM-DD') AS opened
         FROM journal_entries
         WHERE id = ANY($1) AND user_id = $2 AND workspace_id = $3 AND deleted_at IS NULL",
    )
    .bind(&ids)
    .bind(user_id)
    .bind(workspace_id)
    .bind(timezone.name())
    .fetch_all(pool)
    .await
    .context("Failed to label notebook trade references")?;
    rows.iter()
        .map(|row| {
            let symbol: String = row.try_get("symbol")?;
            let opened: Option<String> = row.try_get("opened")?;
            let label = match opened {
                Some(day) => format!("{symbol} · {day}"),
                None => symbol,
            };
            Ok((row.try_get("id")?, label))
        })
        .collect()
}

/// The user's media among `hashes` that a note may show.
async fn media_info(
    pool: &PgPool,
    user_id: &str,
    hashes: &BTreeSet<String>,
) -> Result<HashMap<String, ExchangeMedia>> {
    if hashes.is_empty() {
        return Ok(HashMap::new());
    }
    let hashes: Vec<&String> = hashes.iter().collect();
    let rows = sqlx::query(
        "SELECT content_hash, media_type, width, height FROM notebook_media_blobs
         WHERE user_id = $1 AND content_hash = ANY($2)
           AND (state = 'ready' OR (state = 'gc_pending' AND quota_counted))",
    )
    .bind(user_id)
    .bind(&hashes)
    .fetch_all(pool)
    .await
    .context("Failed to look up notebook media references")?;
    rows.iter()
        .map(|row| {
            Ok((
                row.try_get("content_hash")?,
                ExchangeMedia {
                    kind: row.try_get("media_type")?,
                    width: row.try_get("width")?,
                    height: row.try_get("height")?,
                },
            ))
        })
        .collect()
}

async fn context_for(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    existing_trades: BTreeSet<String>,
    texts: &[&str],
) -> Result<ExchangeContext> {
    let (mut trades, media) = references_in(texts);
    trades.extend(existing_trades);
    Ok(ExchangeContext {
        trades: trade_labels(pool, user_id, workspace_id, &trades).await?,
        media: media_info(pool, user_id, &media).await?,
    })
}

async fn document_view(
    pool: &PgPool,
    user_id: &str,
    note: NotebookNote,
    markdown: String,
    revision: String,
    placeholders: i32,
) -> Result<NotebookNoteDocument> {
    let linked: BTreeSet<String> = note.trade_ids.iter().cloned().collect();
    let labels = trade_labels(pool, user_id, &note.workspace_id, &linked).await?;
    Ok(NotebookNoteDocument {
        linked_trades: note
            .trade_ids
            .iter()
            .map(|id| NoteTradeLink {
                id: id.clone(),
                label: labels.get(id).cloned().unwrap_or_else(|| "deleted trade".into()),
            })
            .collect(),
        media: note
            .images
            .into_iter()
            .map(|m| NoteMedia {
                hash: m.content_hash,
                media_type: m.media_type,
                width: m.width,
                height: m.height,
                bytes: m.bytes,
                original_filename: m.original_filename,
                duration_seconds: m.duration_seconds,
            })
            .collect(),
        id: note.id,
        workspace_id: note.workspace_id,
        folder_id: note.folder_id,
        title: note.title,
        markdown,
        revision,
        placeholders,
        is_starred: note.is_starred,
        is_pinned: note.is_pinned,
        updated_at: note.updated_at,
    })
}

/// The note as it is now, built from its update log rather than a projection that
/// may lag behind the editor.
pub async fn read_document(pool: &PgPool, user_id: &str, note_id: &str) -> Result<NotebookNoteDocument> {
    let mut note = owned_note(pool, user_id, note_id).await?;
    ensure_crdt(pool, note_id).await?;
    let (updates, _) = load_chain(pool, user_id, note_id).await?;
    let context = context_for(
        pool,
        user_id,
        &note.workspace_id,
        super::document::trade_ids(&note.document_json),
        &[],
    )
    .await?;
    let exported = projector::export_note(&updates, &context).await?;
    if !crdt::is_projection_fresh(pool, note_id).await? {
        crdt::refresh_projection(pool, note_id).await?;
        note = owned_note(pool, user_id, note_id).await?;
    }
    document_view(
        pool,
        user_id,
        note,
        exported.markdown,
        exported.revision,
        exported.placeholders,
    )
    .await
}

fn body_with_title(title: &str, markdown: &str) -> String {
    let heading = format!("# {}", title.split_whitespace().collect::<Vec<_>>().join(" "));
    let markdown = markdown.trim();
    if markdown.lines().next().map(str::trim) == Some(heading.as_str()) {
        markdown.to_string()
    } else if markdown.is_empty() {
        heading
    } else {
        format!("{heading}\n\n{markdown}")
    }
}

pub async fn create_from_markdown(
    pool: &PgPool,
    user_id: &str,
    input: CreateFromMarkdown,
) -> Result<NotebookNoteDocument> {
    if input.title.trim().is_empty() {
        return Err(reject("INVALID_EDIT", "title must not be empty"));
    }
    let payload = json!({
        "kind": "createNotebookNote",
        "title": input.title,
        "markdown": input.markdown,
        "folder": input.folder_id,
        "trades": input.trade_ids,
    });
    let replayed = {
        let mut tx = pool.begin().await?;
        mutations::replay(&mut tx, user_id, &input.workspace_id, &input.client_id, &input.mutation_id, &payload).await?
    };
    if let Some(stored) = replayed {
        return read_document(pool, user_id, stored_note_id(&stored)?).await;
    }

    let body = body_with_title(&input.title, &input.markdown);
    let context = context_for(
        pool,
        user_id,
        &input.workspace_id,
        input.trade_ids.iter().cloned().collect(),
        &[&body],
    )
    .await?;
    let document = projector::markdown_document(&body, &context).await?;
    let mut trade_ids = input.trade_ids.clone();
    for id in document.references.trades {
        if !trade_ids.contains(&id) {
            trade_ids.push(id);
        }
    }

    let mut tx = pool.begin().await?;
    if let Some(stored) =
        mutations::replay(&mut tx, user_id, &input.workspace_id, &input.client_id, &input.mutation_id, &payload).await?
    {
        drop(tx);
        return read_document(pool, user_id, stored_note_id(&stored)?).await;
    }
    let note_id = notes::create_notebook_note_tx(
        &mut tx,
        user_id,
        CreateNotebookNoteInput {
            id: None,
            workspace_id: input.workspace_id.clone(),
            document_json: document.document_json.clone(),
            trade_ids,
            folder_id: input.folder_id.clone(),
        },
        &crate::service::hlc::stamp(),
    )
    .await?;
    let parsed: Value = serde_json::from_str(&document.document_json)?;
    crate::service::notebook::media::reconcile_note_references_tx(&mut tx, &note_id, &parsed)
        .await
        .context("Failed to attach the note's media")?;
    mutations::acknowledge(
        &mut tx,
        user_id,
        &input.workspace_id,
        &input.client_id,
        &input.mutation_id,
        &payload,
        &json!({ "noteId": note_id }),
    )
    .await?;
    tx.commit().await?;

    crate::graphql::notebook::sync::seed_new_note(pool, &note_id).await;
    read_document(pool, user_id, &note_id).await
}

fn stored_note_id(stored: &Value) -> Result<&str> {
    stored
        .get("noteId")
        .and_then(Value::as_str)
        .context("stored notebook mutation has no note id")
}

fn edit_texts(edit: &NoteEdit) -> Vec<&str> {
    match edit {
        NoteEdit::ReplaceText { edits } => edits.iter().map(|e| e.new.as_str()).collect(),
        NoteEdit::Append { markdown } | NoteEdit::Rewrite { markdown } => vec![markdown.as_str()],
        NoteEdit::SetTitle { title } => vec![title.as_str()],
    }
}

/// Applies `edit` to the note. With `expected_revision`, refuses with `CONFLICT`
/// when the note changed since that revision was read.
pub async fn edit_document(
    pool: &PgPool,
    user_id: &str,
    note_id: &str,
    edit: NoteEdit,
    expected_revision: Option<String>,
    client_id: &str,
    mutation_id: &str,
) -> Result<NotebookEditResult> {
    let note = owned_note(pool, user_id, note_id).await?;
    let workspace_id = note.workspace_id.clone();
    let payload = json!({
        "kind": "editNotebookNote",
        "note": note_id,
        "edit": edit,
        "revision": expected_revision,
    });
    let replayed = {
        let mut tx = pool.begin().await?;
        mutations::replay(&mut tx, user_id, &workspace_id, client_id, mutation_id, &payload).await?
    };
    if let Some(stored) = replayed {
        return replayed_result(pool, user_id, note_id, &stored).await;
    }

    ensure_crdt(pool, note_id).await?;
    let context = context_for(
        pool,
        user_id,
        &workspace_id,
        super::document::trade_ids(&note.document_json),
        &edit_texts(&edit),
    )
    .await?;

    for _ in 0..APPEND_ATTEMPTS {
        let (updates, read_seq) = load_chain(pool, user_id, note_id).await?;
        let edited =
            projector::edit_note(&updates, &edit, expected_revision.as_deref(), &context).await?;

        let mut tx = pool.begin().await?;
        if let Some(stored) =
            mutations::replay(&mut tx, user_id, &workspace_id, client_id, mutation_id, &payload).await?
        {
            drop(tx);
            return replayed_result(pool, user_id, note_id, &stored).await;
        }
        sqlx::query("SELECT 1 FROM notebook_note_crdt WHERE note_id = $1 FOR UPDATE")
            .bind(note_id)
            .execute(&mut *tx)
            .await?;
        let (current_seq,): (i64,) = sqlx::query_as(
            "SELECT COALESCE(MAX(seq), 0) FROM notebook_note_updates WHERE note_id = $1",
        )
        .bind(note_id)
        .fetch_one(&mut *tx)
        .await?;
        if current_seq != read_seq {
            continue;
        }

        if let Some(update) = &edited.update {
            let (seq,): (i64,) = sqlx::query_as(
                "INSERT INTO notebook_note_updates (note_id, update) VALUES ($1, $2) RETURNING seq",
            )
            .bind(note_id)
            .bind(update)
            .fetch_one(&mut *tx)
            .await
            .context("Failed to append the note edit")?;
            let document: Value = serde_json::from_str(&edited.document_json)?;
            crdt::write_projection_tx(&mut tx, note_id, &document, seq).await?;
            link_trades(&mut tx, user_id, &workspace_id, note_id, &edited.references.trades).await?;
        }
        let changes = NotebookEditChanges::from(edited.changes);
        mutations::acknowledge(
            &mut tx,
            user_id,
            &workspace_id,
            client_id,
            mutation_id,
            &payload,
            &json!({
                "noteId": note_id,
                "changes": changes,
                "formattingLost": edited.formatting_lost,
            }),
        )
        .await?;
        tx.commit().await?;

        let note = owned_note(pool, user_id, note_id).await?;
        return Ok(NotebookEditResult {
            note: document_view(
                pool,
                user_id,
                note,
                edited.markdown,
                edited.revision,
                edited.placeholders,
            )
            .await?,
            changes,
            formatting_lost: edited.formatting_lost,
            replayed: false,
        });
    }
    Err(reject("RETRY", "the note kept changing while saving; try again"))
}

async fn replayed_result(
    pool: &PgPool,
    user_id: &str,
    note_id: &str,
    stored: &Value,
) -> Result<NotebookEditResult> {
    Ok(NotebookEditResult {
        note: read_document(pool, user_id, note_id).await?,
        changes: serde_json::from_value(stored.get("changes").cloned().unwrap_or_default())
            .unwrap_or_default(),
        formatting_lost: serde_json::from_value(
            stored.get("formattingLost").cloned().unwrap_or_default(),
        )
        .unwrap_or_default(),
        replayed: true,
    })
}

/// Trades the body now shows are linked to the note, as inserting a chip on the
/// web does. Removing a chip never unlinks.
async fn link_trades(
    tx: &mut sqlx::PgConnection,
    user_id: &str,
    workspace_id: &str,
    note_id: &str,
    trade_ids: &[String],
) -> Result<()> {
    if trade_ids.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO notebook_note_trades (note_id, trade_id)
         SELECT $1, id FROM journal_entries
         WHERE id = ANY($2) AND user_id = $3 AND workspace_id = $4 AND deleted_at IS NULL
         ON CONFLICT (note_id, trade_id) DO NOTHING",
    )
    .bind(note_id)
    .bind(trade_ids)
    .bind(user_id)
    .bind(workspace_id)
    .execute(&mut *tx)
    .await
    .context("Failed to link the note's trades")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_references_written_in_markdown() {
        let hash = "ab".repeat(32);
        let (trades, media) = references_in(&[&format!(
            "See [AAPL](trade:01J-x_9) and ![c](media:{hash}) but not (trade:) or (media:abc)"
        )]);
        assert_eq!(trades.into_iter().collect::<Vec<_>>(), vec!["01J-x_9"]);
        assert_eq!(media.into_iter().collect::<Vec<_>>(), vec![hash]);
    }

    #[test]
    fn titles_lead_the_body_once() {
        assert_eq!(body_with_title("Plan", ""), "# Plan");
        assert_eq!(body_with_title("Plan", "body"), "# Plan\n\nbody");
        assert_eq!(body_with_title("Plan", "# Plan\n\nbody"), "# Plan\n\nbody");
        assert_eq!(body_with_title(" Two  words ", "x"), "# Two words\n\nx");
    }
}
