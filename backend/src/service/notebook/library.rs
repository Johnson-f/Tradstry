//! Finding and organising notes: light listings, folder counts, trade links, and
//! deletion that can be undone for `RESTORE_WINDOW_DAYS`.

use anyhow::{Context, Result, anyhow, ensure};
use async_graphql::{InputObject, SimpleObject};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

use super::blocks::{BlockKind, extract_notebook_blocks};

pub const RESTORE_WINDOW_DAYS: i64 = 30;
const PREVIEW_CHARS: usize = 140;
const MAX_PAGE: i64 = 50;

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookNoteSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    /// The start of the body after its title, as plain text.
    pub preview: String,
    pub is_starred: bool,
    pub is_pinned: bool,
    pub trade_ids: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookNoteSummaryPage {
    pub notes: Vec<NotebookNoteSummary>,
    /// Pass as `after` for the next page; absent on the last page.
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Default, InputObject)]
pub struct NotebookNoteFilter {
    pub folder_id: Option<String>,
    /// Only notes in no folder.
    #[graphql(default)]
    pub unfiled: bool,
    pub starred: Option<bool>,
    pub pinned: Option<bool>,
    /// Only notes linked to this trade.
    pub trade_id: Option<String>,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookFolderNoteCount {
    /// Absent for notes in no folder.
    pub folder_id: Option<String>,
    pub note_count: i64,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DeletedNotebookNote {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub deleted_at: String,
    pub restorable_until: String,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DeletedNotebookNotePage {
    pub notes: Vec<DeletedNotebookNote>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookSearchHit {
    pub note_id: String,
    pub title: String,
    pub folder_id: Option<String>,
    /// The passage that matched.
    pub excerpt: String,
    pub trade_ids: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct Cursor {
    p: bool,
    t: String,
    i: String,
}

fn encode_cursor(cursor: &Cursor) -> Result<String> {
    Ok(URL_SAFE_NO_PAD.encode(serde_json::to_vec(cursor)?))
}

fn decode_cursor(raw: &str) -> Result<Cursor> {
    let bytes = URL_SAFE_NO_PAD
        .decode(raw)
        .map_err(|_| anyhow!("INVALID_CURSOR: start again without a cursor"))?;
    serde_json::from_slice(&bytes)
        .map_err(|_| anyhow!("INVALID_CURSOR: start again without a cursor"))
}

fn page_size(first: Option<i32>) -> i64 {
    i64::from(first.unwrap_or(25)).clamp(1, MAX_PAGE)
}

/// The body's opening text, skipping the leading heading that is the title.
pub fn preview(document_json: &str) -> String {
    let blocks = extract_notebook_blocks(document_json);
    let skip = usize::from(matches!(
        blocks.first().map(|b| &b.kind),
        Some(BlockKind::Heading { level: 1 })
    ));
    let mut text = String::new();
    for block in blocks.iter().skip(skip) {
        if block.text.is_empty() {
            continue;
        }
        if !text.is_empty() {
            text.push(' ');
        }
        text.push_str(&block.text);
        if text.chars().count() > PREVIEW_CHARS {
            break;
        }
    }
    if text.chars().count() > PREVIEW_CHARS {
        let cut: String = text.chars().take(PREVIEW_CHARS).collect();
        format!("{}…", cut.trim_end())
    } else {
        text
    }
}

const TIMESTAMP: &str = "'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'";

pub async fn note_summaries(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    filter: NotebookNoteFilter,
    first: Option<i32>,
    after: Option<&str>,
) -> Result<NotebookNoteSummaryPage> {
    let limit = page_size(first);
    let cursor = after.map(decode_cursor).transpose()?;
    let sql = format!(
        "SELECT n.id, n.title, n.folder_id, n.document_json, n.is_starred, n.is_pinned,
                to_char(n.updated_at AT TIME ZONE 'UTC', {TIMESTAMP}) AS updated_at,
                COALESCE((SELECT array_agg(t.trade_id ORDER BY t.trade_id)
                          FROM notebook_note_trades t WHERE t.note_id = n.id), '{{}}') AS trade_ids
         FROM notebook_notes n
         WHERE n.user_id = $1 AND n.workspace_id = $2 AND n.deleted_at IS NULL
           AND ($3::text IS NULL OR n.folder_id = $3)
           AND (NOT $4 OR n.folder_id IS NULL)
           AND ($5::bool IS NULL OR n.is_starred = $5)
           AND ($6::bool IS NULL OR n.is_pinned = $6)
           AND ($7::text IS NULL OR EXISTS (
                SELECT 1 FROM notebook_note_trades t WHERE t.note_id = n.id AND t.trade_id = $7))
           AND ($8::bool IS NULL OR (n.is_pinned, n.updated_at, n.id) < ($8, $9::timestamptz, $10))
         ORDER BY n.is_pinned DESC, n.updated_at DESC, n.id DESC
         LIMIT $11"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(filter.folder_id)
        .bind(filter.unfiled)
        .bind(filter.starred)
        .bind(filter.pinned)
        .bind(filter.trade_id)
        .bind(cursor.as_ref().map(|c| c.p))
        .bind(cursor.as_ref().map(|c| c.t.clone()))
        .bind(cursor.as_ref().map(|c| c.i.clone()))
        .bind(limit + 1)
        .fetch_all(pool)
        .await
        .context("Failed to list notebook notes")?;

    let more = rows.len() as i64 > limit;
    let mut notes = Vec::with_capacity(rows.len());
    for row in rows.iter().take(limit as usize) {
        let document_json: String = row.try_get("document_json")?;
        notes.push(NotebookNoteSummary {
            id: row.try_get("id")?,
            title: row.try_get("title")?,
            folder_id: row.try_get("folder_id")?,
            preview: preview(&document_json),
            is_starred: row.try_get("is_starred")?,
            is_pinned: row.try_get("is_pinned")?,
            trade_ids: row.try_get("trade_ids")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    let next_cursor = match (more, notes.last()) {
        (true, Some(last)) => Some(encode_cursor(&Cursor {
            p: last.is_pinned,
            t: last.updated_at.clone(),
            i: last.id.clone(),
        })?),
        _ => None,
    };
    Ok(NotebookNoteSummaryPage { notes, next_cursor })
}

/// Notes whose content matches `query`, best first. Uses the same index as the
/// assistant's knowledge search, so a note edited moments ago may not match yet.
pub async fn search_notes(
    pool: &PgPool,
    knowledge: &crate::service::agents::knowledge::KnowledgeService,
    actor: &crate::service::agents::AgentActor,
    workspace_id: &str,
    query: &str,
    limit: Option<i32>,
) -> Result<Vec<NotebookSearchHit>> {
    use crate::service::agents::knowledge::{KnowledgeSearchRequest, KnowledgeSourceType};

    let hits = knowledge
        .search(
            actor,
            KnowledgeSearchRequest {
                workspace_id: workspace_id.to_string(),
                query: query.to_string(),
                source_types: vec![KnowledgeSourceType::NotebookNote],
                limit: usize::try_from(limit.unwrap_or(10).clamp(1, 20)).unwrap_or(10),
                ..Default::default()
            },
        )
        .await
        .map_err(|error| anyhow!("SEARCH_FAILED: {error}"))?;

    let ids: Vec<&str> = hits.iter().map(|hit| hit.source_id.as_str()).collect();
    let live: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT id, folder_id FROM notebook_notes
         WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(&ids)
    .bind(&actor.user_id)
    .fetch_all(pool)
    .await?;
    let mut seen = std::collections::HashSet::new();
    Ok(hits
        .into_iter()
        .filter_map(|hit| {
            let folder_id = live.iter().find(|(id, _)| *id == hit.source_id)?.1.clone();
            seen.insert(hit.source_id.clone())
                .then_some(NotebookSearchHit {
                    note_id: hit.source_id,
                    title: hit.title,
                    folder_id,
                    excerpt: hit.excerpt,
                    trade_ids: hit.relationships.trade_ids,
                })
        })
        .collect())
}

/// Live notes directly in each folder, and in no folder.
pub async fn folder_note_counts(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<NotebookFolderNoteCount>> {
    let rows = sqlx::query(
        "SELECT folder_id, count(*) AS note_count FROM notebook_notes
         WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
         GROUP BY folder_id ORDER BY folder_id NULLS FIRST",
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await
    .context("Failed to count notebook notes")?;
    rows.iter()
        .map(|row| {
            Ok(NotebookFolderNoteCount {
                folder_id: row.try_get("folder_id")?,
                note_count: row.try_get("note_count")?,
            })
        })
        .collect()
}

/// Adds and removes trade links in one step. A trade note's own trade is never
/// unlinked, as with `updateNotebookNote`.
pub async fn link_trades(
    pool: &PgPool,
    user_id: &str,
    note_id: &str,
    add: &[String],
    remove: &[String],
) -> Result<Vec<String>> {
    let mut tx = pool.begin().await?;
    let workspace_id: String = sqlx::query_scalar(
        "SELECT workspace_id FROM notebook_notes
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(note_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| anyhow!("NOT_FOUND: note not found"))?;

    if !add.is_empty() {
        let live: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM journal_entries
             WHERE id = ANY($1) AND user_id = $2 AND workspace_id = $3 AND deleted_at IS NULL",
        )
        .bind(add)
        .bind(user_id)
        .bind(&workspace_id)
        .fetch_all(&mut *tx)
        .await?;
        if let Some(missing) = add.iter().find(|id| !live.contains(id)) {
            return Err(anyhow!("INVALID_REFERENCE: trade {missing}"));
        }
        sqlx::query(
            "INSERT INTO notebook_note_trades (note_id, trade_id)
             SELECT $1, unnest($2::text[]) ON CONFLICT (note_id, trade_id) DO NOTHING",
        )
        .bind(note_id)
        .bind(add)
        .execute(&mut *tx)
        .await?;
    }
    if !remove.is_empty() {
        sqlx::query(
            "DELETE FROM notebook_note_trades WHERE note_id = $1 AND trade_id = ANY($2)
               AND trade_id NOT IN (SELECT entry_id FROM journal_trade_context WHERE companion_note_id = $1)",
        )
        .bind(note_id)
        .bind(remove)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query("UPDATE notebook_notes SET updated_at = now() WHERE id = $1")
        .bind(note_id)
        .execute(&mut *tx)
        .await?;
    let linked = sqlx::query_scalar(
        "SELECT trade_id FROM notebook_note_trades WHERE note_id = $1 ORDER BY trade_id",
    )
    .bind(note_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(linked)
}

/// Brings back a note deleted within the restore window. A note whose folder is
/// gone comes back unfiled.
pub async fn restore_note(pool: &PgPool, user_id: &str, note_id: &str) -> Result<()> {
    let mut tx = pool.begin().await?;
    let restored = sqlx::query(
        "UPDATE notebook_notes n SET deleted_at = NULL, updated_at = now(), hlc = $3,
                folder_id = CASE WHEN EXISTS (
                    SELECT 1 FROM notebook_folders f WHERE f.id = n.folder_id AND f.deleted_at IS NULL
                ) THEN n.folder_id END
         WHERE n.id = $1 AND n.user_id = $2 AND n.deleted_at IS NOT NULL
           AND n.deleted_at > now() - make_interval(days => $4)",
    )
    .bind(note_id)
    .bind(user_id)
    .bind(crate::service::hlc::stamp())
    .bind(RESTORE_WINDOW_DAYS as i32)
    .execute(&mut *tx)
    .await
    .context("Failed to restore notebook note")?
    .rows_affected();
    ensure!(
        restored == 1,
        "NOT_FOUND: no deleted note with that id can be restored"
    );

    let document_json: String =
        sqlx::query_scalar("SELECT document_json FROM notebook_notes WHERE id = $1")
            .bind(note_id)
            .fetch_one(&mut *tx)
            .await?;
    let document: serde_json::Value = serde_json::from_str(&document_json)?;
    super::media::reconcile_note_references_tx(&mut tx, note_id, &document)
        .await
        .context("Failed to reattach the restored note's media")?;
    tx.commit().await?;
    Ok(())
}

pub async fn deleted_notes(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    first: Option<i32>,
    after: Option<&str>,
) -> Result<DeletedNotebookNotePage> {
    let limit = page_size(first);
    let cursor = after.map(decode_cursor).transpose()?;
    let sql = format!(
        "SELECT id, title, folder_id,
                to_char(deleted_at AT TIME ZONE 'UTC', {TIMESTAMP}) AS deleted_at,
                to_char((deleted_at + make_interval(days => $3)) AT TIME ZONE 'UTC', {TIMESTAMP}) AS restorable_until
         FROM notebook_notes
         WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NOT NULL
           AND deleted_at > now() - make_interval(days => $3)
           AND ($4::timestamptz IS NULL OR (deleted_at, id) < ($4::timestamptz, $5::text))
         ORDER BY deleted_at DESC, id DESC
         LIMIT $6"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(RESTORE_WINDOW_DAYS as i32)
        .bind(cursor.as_ref().map(|c| c.t.clone()))
        .bind(cursor.as_ref().map(|c| c.i.clone()))
        .bind(limit + 1)
        .fetch_all(pool)
        .await
        .context("Failed to list deleted notebook notes")?;
    let more = rows.len() as i64 > limit;
    let notes = rows
        .iter()
        .take(limit as usize)
        .map(|row| {
            Ok(DeletedNotebookNote {
                id: row.try_get("id")?,
                title: row.try_get("title")?,
                folder_id: row.try_get("folder_id")?,
                deleted_at: row.try_get("deleted_at")?,
                restorable_until: row.try_get("restorable_until")?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let next_cursor = match (more, notes.last()) {
        (true, Some(last)) => Some(encode_cursor(&Cursor {
            p: false,
            t: last.deleted_at.clone(),
            i: last.id.clone(),
        })?),
        _ => None,
    };
    Ok(DeletedNotebookNotePage { notes, next_cursor })
}

/// Permanently removes notes deleted longer ago than the restore window, releasing
/// their media to the usual collection grace. Returns how many were purged.
pub async fn purge_deleted_notes(pool: &PgPool, batch: i64) -> Result<usize> {
    let due: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, user_id FROM notebook_notes
         WHERE deleted_at IS NOT NULL AND deleted_at <= now() - make_interval(days => $1)
         ORDER BY deleted_at LIMIT $2",
    )
    .bind(RESTORE_WINDOW_DAYS as i32)
    .bind(batch)
    .fetch_all(pool)
    .await
    .context("Failed to find notes due for purge")?;

    let mut purged = 0;
    for (note_id, user_id) in due {
        let mut tx = pool.begin().await?;
        super::media::remove_note_references_tx(&mut tx, &user_id, std::slice::from_ref(&note_id))
            .await
            .with_context(|| format!("note {note_id}: failed to release media"))?;
        let deleted = sqlx::query(
            "DELETE FROM notebook_notes WHERE id = $1 AND deleted_at IS NOT NULL
               AND deleted_at <= now() - make_interval(days => $2)",
        )
        .bind(&note_id)
        .bind(RESTORE_WINDOW_DAYS as i32)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("note {note_id}: failed to purge"))?
        .rows_affected();
        tx.commit().await?;
        purged += deleted as usize;
    }
    Ok(purged)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_skip_the_title_and_stop_at_a_word_budget() {
        let doc = serde_json::json!({"root": {"children": [
            {"type": "heading", "tag": "h1", "children": [{"type": "text", "text": "Title"}]},
            {"type": "paragraph", "children": [{"type": "text", "text": "word ".repeat(60)}]},
        ]}})
        .to_string();
        let text = preview(&doc);
        assert!(text.starts_with("word word"));
        assert!(text.ends_with('…'));
        assert!(text.chars().count() <= PREVIEW_CHARS + 1);
    }

    #[test]
    fn cursors_round_trip() {
        let raw = encode_cursor(&Cursor {
            p: true,
            t: "2026-10-10T00:00:00.000001Z".into(),
            i: "n".into(),
        })
        .unwrap();
        let back = decode_cursor(&raw).unwrap();
        assert!(back.p);
        assert_eq!(back.i, "n");
        assert!(decode_cursor("not a cursor").is_err());
    }
}
