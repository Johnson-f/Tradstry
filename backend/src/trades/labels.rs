//! The user's catalog of edges, entry tactics, tags and mistakes. Labels are
//! not engine input, so nothing here rebuilds trades.

use async_graphql::{Enum, ID, SimpleObject};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use super::service::TradeError;
use crate::db::new_id;

type Result<T> = std::result::Result<T, TradeError>;

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[graphql(name = "JournalLabelKind")]
pub enum LabelKind {
    Edge,
    EntryTactic,
    Tag,
    Mistake,
}

impl LabelKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Edge => "edge",
            Self::EntryTactic => "entry_tactic",
            Self::Tag => "tag",
            Self::Mistake => "mistake",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        [Self::Edge, Self::EntryTactic, Self::Tag, Self::Mistake]
            .into_iter()
            .find(|kind| kind.as_str() == text)
    }
}

/// A label as it appears on a trade or in a statistics bucket.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, SimpleObject)]
pub struct LabelRef {
    pub id: ID,
    pub kind: LabelKind,
    pub name: String,
    pub color: Option<String>,
    pub archived: bool,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Label {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub description: String,
    pub color: Option<String>,
    pub position: i32,
    pub archived_at: Option<DateTime<Utc>>,
    pub trade_count: i64,
}

#[derive(Clone, Debug, Default)]
pub struct LabelInput {
    pub name: String,
    pub description: String,
    pub color: Option<String>,
    pub position: Option<i32>,
}

const LABEL_SELECT: &str =
    "SELECT l.id, l.kind, l.name, l.description, l.color, l.position, l.archived_at,
    (SELECT count(*) FROM trade_annotation_labels x WHERE x.label_id = l.id) AS trade_count
    FROM journal_labels l";

fn invalid<T>(code: &'static str, message: impl Into<String>) -> Result<T> {
    Err(TradeError::Invalid(code, message.into()))
}

fn clean(input: &LabelInput) -> Result<(String, String, Option<String>)> {
    let name = input.name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.chars().count() > 60 {
        return invalid("INVALID_NAME", "Names are 1 to 60 characters");
    }
    if input.description.chars().count() > 2000 {
        return invalid("INVALID_NAME", "Descriptions are at most 2,000 characters");
    }
    let color = match input
        .color
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty())
    {
        Some(color) => {
            let color = color.to_ascii_lowercase();
            if color.len() != 7
                || !color.starts_with('#')
                || !color[1..].chars().all(|c| c.is_ascii_hexdigit())
            {
                return invalid("INVALID_COLOR", "Colours are written #rrggbb");
            }
            Some(color)
        }
        None => None,
    };
    Ok((name, input.description.trim().to_owned(), color))
}

/// The active label of `kind` with this name, ignoring case.
async fn active_named(
    conn: &mut PgConnection,
    user_id: Uuid,
    kind: LabelKind,
    name: &str,
    except: Option<Uuid>,
) -> Result<Option<Uuid>> {
    Ok(sqlx::query_scalar(
        "SELECT id FROM journal_labels WHERE user_id = $1 AND kind = $2 AND lower(btrim(name)) = lower(btrim($3))
           AND archived_at IS NULL AND ($4::uuid IS NULL OR id <> $4)",
    )
    .bind(user_id)
    .bind(kind.as_str())
    .bind(name)
    .bind(except)
    .fetch_optional(&mut *conn)
    .await?)
}

pub async fn list(
    pool: &PgPool,
    user_id: Uuid,
    kind: Option<LabelKind>,
    include_archived: bool,
) -> Result<Vec<Label>> {
    Ok(sqlx::query_as::<_, Label>(sqlx::AssertSqlSafe(format!(
        "{LABEL_SELECT} WHERE l.user_id = $1 AND ($2::text IS NULL OR l.kind = $2)
           AND ($3 OR l.archived_at IS NULL)
         ORDER BY l.kind, l.archived_at NULLS FIRST, l.position, lower(l.name)"
    )))
    .bind(user_id)
    .bind(kind.map(LabelKind::as_str))
    .bind(include_archived)
    .fetch_all(pool)
    .await?)
}

pub async fn get(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<Label> {
    sqlx::query_as::<_, Label>(sqlx::AssertSqlSafe(format!(
        "{LABEL_SELECT} WHERE l.user_id = $1 AND l.id = $2"
    )))
    .bind(user_id)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(TradeError::NotFound)
}

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    kind: LabelKind,
    input: &LabelInput,
) -> Result<Label> {
    let (name, description, color) = clean(input)?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('labels:' || $1::text, 0))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    if let Some(existing) = active_named(&mut tx, user_id, kind, &name, None).await? {
        return Err(TradeError::LabelExists(existing));
    }
    let position: i32 = match input.position {
        Some(position) => position,
        None => sqlx::query_scalar(
            "SELECT COALESCE(max(position) + 1, 0) FROM journal_labels WHERE user_id = $1 AND kind = $2",
        )
        .bind(user_id)
        .bind(kind.as_str())
        .fetch_one(&mut *tx)
        .await?,
    };
    let id = new_id();
    sqlx::query(
        "INSERT INTO journal_labels (id, user_id, kind, name, description, color, position) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(id)
    .bind(user_id)
    .bind(kind.as_str())
    .bind(&name)
    .bind(&description)
    .bind(&color)
    .bind(position)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get(pool, user_id, id).await
}

pub async fn update(pool: &PgPool, user_id: Uuid, id: Uuid, input: &LabelInput) -> Result<Label> {
    let label = get(pool, user_id, id).await?;
    let kind = LabelKind::parse(&label.kind).ok_or(TradeError::NotFound)?;
    let (name, description, color) = clean(input)?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('labels:' || $1::text, 0))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    if label.archived_at.is_none()
        && let Some(existing) = active_named(&mut tx, user_id, kind, &name, Some(id)).await?
    {
        return Err(TradeError::LabelExists(existing));
    }
    sqlx::query(
        "UPDATE journal_labels SET name = $3, description = $4, color = $5, position = COALESCE($6, position), updated_at = now()
         WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .bind(&name)
    .bind(&description)
    .bind(&color)
    .bind(input.position)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get(pool, user_id, id).await
}

pub async fn set_archived(pool: &PgPool, user_id: Uuid, id: Uuid, archived: bool) -> Result<Label> {
    let label = get(pool, user_id, id).await?;
    let kind = LabelKind::parse(&label.kind).ok_or(TradeError::NotFound)?;
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('labels:' || $1::text, 0))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    if !archived
        && label.archived_at.is_some()
        && let Some(existing) = active_named(&mut tx, user_id, kind, &label.name, Some(id)).await?
    {
        return Err(TradeError::LabelExists(existing));
    }
    sqlx::query(
        "UPDATE journal_labels SET archived_at = CASE WHEN $3 THEN COALESCE(archived_at, now()) END, updated_at = now()
         WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .bind(archived)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get(pool, user_id, id).await
}

/// Moves every use of `from` onto `into`, then deletes `from`.
pub async fn merge(pool: &PgPool, user_id: Uuid, from: Uuid, into: Uuid) -> Result<Label> {
    if from == into {
        return invalid("INVALID_LABEL", "Choose two different labels to merge");
    }
    let (source, target) = (
        get(pool, user_id, from).await?,
        get(pool, user_id, into).await?,
    );
    if source.kind != target.kind {
        return invalid(
            "INVALID_LABEL",
            "Only labels of the same kind can be merged",
        );
    }
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO trade_annotation_labels (annotation_id, label_id, kind)
         SELECT annotation_id, $2, kind FROM trade_annotation_labels WHERE label_id = $1
         ON CONFLICT (annotation_id, label_id) DO NOTHING",
    )
    .bind(from)
    .bind(into)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM trade_annotation_labels WHERE label_id = $1")
        .bind(from)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM journal_labels WHERE id = $1 AND user_id = $2")
        .bind(from)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    get(pool, user_id, into).await
}

pub async fn delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let label = get(pool, user_id, id).await?;
    if label.trade_count > 0 {
        return invalid(
            "LABEL_IN_USE",
            "This label is on trades; archive it or merge it into another",
        );
    }
    sqlx::query("DELETE FROM journal_labels WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|error| match error {
            sqlx::Error::Database(db) if db.is_foreign_key_violation() => TradeError::Invalid(
                "LABEL_IN_USE",
                "This label is on trades; archive it or merge it into another".into(),
            ),
            other => other.into(),
        })?;
    Ok(())
}

/// Checks the labels a journal entry is being saved with. Every ID must be
/// the user's and of the right kind. An archived label may stay on the entry
/// it is already on, but cannot be newly picked.
pub async fn check_choices(
    conn: &mut PgConnection,
    user_id: Uuid,
    annotation_id: Option<Uuid>,
    choices: &[(Uuid, LabelKind)],
) -> Result<()> {
    let ids: Vec<Uuid> = choices.iter().map(|(id, _)| *id).collect();
    let rows: Vec<(Uuid, String, bool, bool)> = sqlx::query_as(
        "SELECT l.id, l.kind, l.archived_at IS NOT NULL,
            EXISTS (SELECT 1 FROM trade_annotation_labels x WHERE x.annotation_id = $3 AND x.label_id = l.id)
         FROM journal_labels l WHERE l.user_id = $1 AND l.id = ANY($2)",
    )
    .bind(user_id)
    .bind(&ids)
    .bind(annotation_id)
    .fetch_all(&mut *conn)
    .await?;
    for (id, kind) in choices {
        let Some((_, found, archived, already_on)) = rows.iter().find(|row| row.0 == *id) else {
            return invalid("INVALID_LABEL", "A chosen label no longer exists");
        };
        if found != kind.as_str() {
            return invalid(
                "INVALID_LABEL",
                format!("That label is not a {}", kind.as_str().replace('_', " ")),
            );
        }
        if *archived && !already_on {
            return invalid(
                "INVALID_LABEL",
                "That label is archived; unarchive it to use it again",
            );
        }
    }
    Ok(())
}
