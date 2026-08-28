use chrono::{Datelike, Duration, Utc};
use serde_json::json;
use sqlx::{FromRow, PgPool};

use super::{AgentActor, AgentContextKind, AgentContextSearchResult, AgentError, AgentResult};

const GROUP_LIMIT: i64 = 5;
const MAX_QUERY_CHARS: usize = 200;

#[derive(FromRow)]
struct TradeRow {
    id: String,
    symbol: String,
    symbol_name: String,
    status: String,
    closed_at: String,
    dollar_pl: f64,
}

#[derive(FromRow)]
struct PlaybookRow {
    id: String,
    name: String,
    edge_name: String,
}

#[derive(FromRow)]
struct NoteRow {
    id: String,
    title: String,
    updated_at: String,
}

#[derive(FromRow)]
struct MediaRow {
    id: String,
    note_id: String,
    original_filename: String,
    media_type: String,
    content_type: String,
    note_title: String,
}

pub async fn search(
    pool: &PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    query: &str,
    limit: i64,
) -> AgentResult<Vec<AgentContextSearchResult>> {
    let query = query.trim();
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(AgentError::Validation(format!(
            "context search must be at most {MAX_QUERY_CHARS} characters"
        )));
    }
    let total_limit = limit.clamp(1, 30) as usize;
    let currency = sqlx::query_scalar::<_, String>(
        "SELECT currency FROM workspaces WHERE id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(&actor.user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AgentError::NotFound)?;

    let mut results = Vec::with_capacity(total_limit);
    results.extend(search_trades(pool, actor, workspace_id, query, &currency).await?);
    results.extend(search_playbooks(pool, actor, workspace_id, query).await?);
    results.extend(search_notes(pool, actor, workspace_id, query).await?);
    results.extend(search_media(pool, actor, workspace_id, query).await?);

    if query.chars().count() >= 2 {
        match crate::service::market::research::search(query).await {
            Ok(markets) => results.extend(
                markets
                    .into_iter()
                    .filter_map(|market| {
                        let symbol = market.symbol.trim().to_uppercase();
                        (!symbol.is_empty() && symbol.len() <= 20).then_some((market, symbol))
                    })
                    .take(GROUP_LIMIT as usize)
                    .map(|(market, symbol)| AgentContextSearchResult {
                        key: format!("market:{symbol}"),
                        kind: AgentContextKind::Market,
                        id: None,
                        title: symbol.clone(),
                        subtitle: market.name,
                        metadata: json!({
                            "symbol": symbol,
                            "exchange": market.exchange,
                            "securityType": market.security_type,
                        }),
                    }),
            ),
            Err(error) => {
                log::warn!("agent context market search unavailable: {error:#}");
            }
        }
    }

    results.extend(date_presets(query));
    results.truncate(total_limit);
    Ok(results)
}

async fn search_trades(
    pool: &PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    query: &str,
    currency: &str,
) -> AgentResult<Vec<AgentContextSearchResult>> {
    let rows = sqlx::query_as::<_, TradeRow>(
        "SELECT id, symbol, symbol_name, status,
                to_char(close_date AT TIME ZONE 'UTC', 'Mon DD, YYYY') AS closed_at,
                position_size * entry_price * total_pl / 100.0 * contract_multiplier AS dollar_pl
         FROM journal_entries
         WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
           AND ($3 = '' OR strpos(lower(symbol), lower($3)) > 0
                OR strpos(lower(symbol_name), lower($3)) > 0)
         ORDER BY close_date DESC, id
         LIMIT $4",
    )
    .bind(&actor.user_id)
    .bind(workspace_id)
    .bind(query)
    .bind(GROUP_LIMIT)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| AgentContextSearchResult {
            key: format!("trade:{}", row.id),
            kind: AgentContextKind::Trade,
            id: Some(row.id),
            title: row.symbol,
            subtitle: format!(
                "{} · {} {:+.2} · {}",
                row.symbol_name, currency, row.dollar_pl, row.closed_at
            ),
            metadata: json!({ "status": row.status, "dollarPl": row.dollar_pl }),
        })
        .collect())
}

async fn search_playbooks(
    pool: &PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    query: &str,
) -> AgentResult<Vec<AgentContextSearchResult>> {
    let rows = sqlx::query_as::<_, PlaybookRow>(
        "SELECT id, name, edge_name FROM playbooks
         WHERE user_id = $1 AND deleted_at IS NULL
           AND (availability = 'all' OR EXISTS (
               SELECT 1 FROM playbook_workspace_applicability a
               WHERE a.playbook_id = playbooks.id AND a.workspace_id = $2
           ))
           AND ($3 = '' OR strpos(lower(name), lower($3)) > 0
                OR strpos(lower(edge_name), lower($3)) > 0)
         ORDER BY updated_at DESC, id
         LIMIT $4",
    )
    .bind(&actor.user_id)
    .bind(workspace_id)
    .bind(query)
    .bind(GROUP_LIMIT)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| AgentContextSearchResult {
            key: format!("playbook:{}", row.id),
            kind: AgentContextKind::Playbook,
            id: Some(row.id),
            title: row.name,
            subtitle: row.edge_name,
            metadata: json!({}),
        })
        .collect())
}

async fn search_notes(
    pool: &PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    query: &str,
) -> AgentResult<Vec<AgentContextSearchResult>> {
    let rows = sqlx::query_as::<_, NoteRow>(
        "SELECT id, title,
                to_char(updated_at AT TIME ZONE 'UTC', 'Mon DD, YYYY') AS updated_at
         FROM notebook_notes
         WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
           AND ($3 = '' OR strpos(lower(title), lower($3)) > 0)
         ORDER BY updated_at DESC, id
         LIMIT $4",
    )
    .bind(&actor.user_id)
    .bind(workspace_id)
    .bind(query)
    .bind(GROUP_LIMIT)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| AgentContextSearchResult {
            key: format!("note:{}", row.id),
            kind: AgentContextKind::Note,
            id: Some(row.id),
            title: row.title,
            subtitle: format!("Updated {}", row.updated_at),
            metadata: json!({}),
        })
        .collect())
}

async fn search_media(
    pool: &PgPool,
    actor: &AgentActor,
    workspace_id: &str,
    query: &str,
) -> AgentResult<Vec<AgentContextSearchResult>> {
    let rows = sqlx::query_as::<_, MediaRow>(
        "SELECT i.id, i.note_id, i.original_filename, i.media_type, i.content_type,
                n.title AS note_title
         FROM notebook_images i
         JOIN notebook_notes n ON n.id = i.note_id
         WHERE i.user_id = $1 AND i.workspace_id = $2
           AND n.user_id = $1 AND n.workspace_id = $2 AND n.deleted_at IS NULL
           AND ($3 = '' OR strpos(lower(i.original_filename), lower($3)) > 0
                OR strpos(lower(i.media_type), lower($3)) > 0
                OR strpos(lower(n.title), lower($3)) > 0)
         ORDER BY i.created_at DESC, i.id
         LIMIT $4",
    )
    .bind(&actor.user_id)
    .bind(workspace_id)
    .bind(query)
    .bind(GROUP_LIMIT)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let title = if row.original_filename.trim().is_empty() {
                format!("{} attachment", row.media_type)
            } else {
                row.original_filename
            };
            AgentContextSearchResult {
                key: format!("media:{}", row.id),
                kind: AgentContextKind::Media,
                id: Some(row.id),
                title,
                subtitle: format!("{} · {}", row.media_type, row.note_title),
                metadata: json!({
                    "noteId": row.note_id,
                    "mediaType": row.media_type,
                    "contentType": row.content_type,
                }),
            }
        })
        .collect())
}

fn date_presets(query: &str) -> Vec<AgentContextSearchResult> {
    let today = Utc::now().date_naive();
    let presets = [
        (
            "last-7-days",
            "Last 7 days",
            today - Duration::days(6),
            today,
        ),
        (
            "last-30-days",
            "Last 30 days",
            today - Duration::days(29),
            today,
        ),
        (
            "last-90-days",
            "Last 90 days",
            today - Duration::days(89),
            today,
        ),
        (
            "year-to-date",
            "Year to date",
            today.with_ordinal(1).unwrap_or(today),
            today,
        ),
    ];
    let normalized = query.to_lowercase();
    let mut results: Vec<_> = presets
        .into_iter()
        .filter(|(_, title, _, _)| {
            normalized.is_empty() || title.to_lowercase().contains(&normalized)
        })
        .map(|(key, title, from, to)| AgentContextSearchResult {
            key: format!("date_range:{key}"),
            kind: AgentContextKind::DateRange,
            id: None,
            title: title.into(),
            subtitle: format!("{} – {}", from.format("%b %d"), to.format("%b %d")),
            metadata: json!({ "from": from.to_string(), "to": to.to_string() }),
        })
        .collect();
    if normalized.is_empty()
        || "custom range".contains(&normalized)
        || "date range".contains(&normalized)
    {
        results.push(AgentContextSearchResult {
            key: "date_range:custom".into(),
            kind: AgentContextKind::DateRange,
            id: None,
            title: "Custom range".into(),
            subtitle: "Choose start and end dates".into(),
            metadata: json!({ "custom": true }),
        });
    }
    results.truncate(GROUP_LIMIT as usize);
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_presets_are_bounded_and_searchable() {
        let all = date_presets("");
        assert_eq!(all.len(), GROUP_LIMIT as usize);
        assert!(all.iter().any(|result| result.key == "date_range:custom"));

        let filtered = date_presets("90");
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].title, "Last 90 days");
    }
}
