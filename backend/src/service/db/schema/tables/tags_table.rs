use anyhow::{Context, Result, bail, ensure};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, DbErr, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::Serialize;
use sqlx::{PgConnection, PgPool, Row};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::trading::tags;
use crate::service::db::error::is_unique_violation as is_sea_unique_violation;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub enum TagRole {
    Mistake,
    Tactic,
    Edge,
}

impl TagRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Mistake => "mistake",
            Self::Tactic => "tactic",
            Self::Edge => "edge",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "mistake" => Some(Self::Mistake),
            "tactic" => Some(Self::Tactic),
            "edge" => Some(Self::Edge),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct TagCategory {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub name: String,
    pub role: Option<TagRole>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub availability: String,
    pub workspace_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Tag {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub category_id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Hydrated tag with its owning category context (for analytics / readers).
#[derive(Clone, Debug, Serialize)]
pub struct TradeTag {
    pub tag: Tag,
    pub category_id: String,
    pub category_name: String,
    pub role: Option<TagRole>,
}

// SELECT column lists. created_at/updated_at are TIMESTAMPTZ in Postgres; the
// struct fields are `String`, so render them to the original RFC3339-ish form.
const CATEGORY_COLS: &str = "id, user_id, workspace_id, name, role, color, sort_order, \
     availability, ARRAY(SELECT workspace_id FROM tag_category_workspace_applicability a WHERE a.category_id = tag_categories.id ORDER BY workspace_id) AS workspace_ids, \
     to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, \
     to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at";
const TAG_COLS: &str = "tags.id, tags.user_id, tags.workspace_id, tags.category_id, tags.name, tags.color, \
     to_char(tags.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, \
     to_char(tags.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

fn row_to_category(row: &sqlx::postgres::PgRow) -> Result<TagCategory> {
    let role = row
        .try_get::<Option<String>, _>(4)?
        .and_then(|r| TagRole::parse(&r));
    Ok(TagCategory {
        id: row.try_get::<String, _>(0)?,
        user_id: row.try_get::<String, _>(1)?,
        workspace_id: row.try_get::<String, _>(2)?,
        name: row.try_get::<String, _>(3)?,
        role,
        color: row.try_get::<Option<String>, _>(5)?,
        sort_order: row.try_get::<i64, _>(6)?,
        availability: row.try_get::<String, _>(7)?,
        workspace_ids: row.try_get::<Vec<String>, _>(8)?,
        created_at: row.try_get::<String, _>(9)?,
        updated_at: row.try_get::<String, _>(10)?,
    })
}

fn row_to_tag(row: &sqlx::postgres::PgRow) -> Result<Tag> {
    Ok(Tag {
        id: row.try_get::<String, _>(0)?,
        user_id: row.try_get::<String, _>(1)?,
        workspace_id: row.try_get::<String, _>(2)?,
        category_id: row.try_get::<String, _>(3)?,
        name: row.try_get::<String, _>(4)?,
        color: row.try_get::<Option<String>, _>(5)?,
        created_at: row.try_get::<String, _>(6)?,
        updated_at: row.try_get::<String, _>(7)?,
    })
}

impl From<tags::Model> for Tag {
    fn from(model: tags::Model) -> Self {
        Self {
            id: model.id,
            user_id: model.user_id,
            workspace_id: model.workspace_id,
            category_id: model.category_id,
            name: model.name,
            color: model.color,
            created_at: model
                .created_at
                .with_timezone(&Utc)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
            updated_at: model
                .updated_at
                .with_timezone(&Utc)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
        }
    }
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn is_unique_violation(err: &anyhow::Error) -> bool {
    if let Some(error) = err.downcast_ref::<DbErr>()
        && is_sea_unique_violation(error)
    {
        return true;
    }
    // Prefer the SQLSTATE code (23505 = unique_violation) when this is a sqlx
    // database error; fall back to a substring match on the message.
    if let Some(sqlx::Error::Database(db_err)) = err.downcast_ref::<sqlx::Error>()
        && db_err.code().as_deref() == Some("23505")
    {
        return true;
    }
    err.to_string().to_lowercase().contains("unique")
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/// Idempotently seed the three roled default categories for a user.
/// Relies on the partial unique index `idx_tagcat_user_role` so repeated calls
/// are no-ops.
pub async fn ensure_default_categories(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<()> {
    let defaults = [
        (TagRole::Mistake, "Mistakes", 0i64),
        (TagRole::Tactic, "Tactics", 1),
        (TagRole::Edge, "Edges", 2),
    ];

    let mut tx = pool.begin().await?;
    for (role, name, sort_order) in defaults {
        let now = Utc::now();
        // `ON CONFLICT DO NOTHING` (no target) covers the partial unique index
        // on (user_id, role); INSERT OR IGNORE relied on that index.
        sqlx::query(
            "INSERT INTO tag_categories (id, user_id, workspace_id, name, role, color, sort_order, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $7) ON CONFLICT DO NOTHING",
        )
        .bind(new_id())
        .bind(user_id)
        .bind(workspace_id)
        .bind(name)
        .bind(role.as_str())
        .bind(sort_order)
        .bind(now)
        .execute(&mut *tx)
        .await
        .context("Failed to seed default tag category")?;
    }
    tx.commit().await?;

    Ok(())
}

pub async fn list_categories(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<TagCategory>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {CATEGORY_COLS} FROM tag_categories WHERE user_id = $1 AND deleted_at IS NULL \
         AND (availability='all' OR EXISTS (SELECT 1 FROM tag_category_workspace_applicability a \
              WHERE a.category_id=tag_categories.id AND a.workspace_id=$2)) \
         ORDER BY sort_order, name"
    )))
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await
    .context("Failed to list tag categories")?;

    let mut categories = Vec::new();
    for row in &rows {
        categories.push(row_to_category(row)?);
    }
    Ok(categories)
}

pub async fn list_strategy_library_categories(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<TagCategory>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {CATEGORY_COLS} FROM tag_categories WHERE user_id=$1 AND deleted_at IS NULL ORDER BY sort_order,name"
    )))
    .bind(user_id)
    .fetch_all(pool)
    .await
    .context("Failed to list strategy library tag categories")?;
    rows.iter().map(row_to_category).collect()
}

pub async fn set_category_applicability(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    availability: &str,
    workspace_ids: &[String],
) -> Result<TagCategory> {
    ensure!(
        matches!(availability, "all" | "selected"),
        "availability must be all or selected"
    );
    ensure!(
        availability == "all" || !workspace_ids.is_empty(),
        "selected availability requires at least one workspace"
    );
    let owned_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM workspaces WHERE user_id=$1 AND id = ANY($2::text[])",
    )
    .bind(user_id)
    .bind(workspace_ids)
    .fetch_one(pool)
    .await?;
    ensure!(
        owned_count as usize == workspace_ids.len(),
        "one or more selected workspaces do not belong to the user"
    );
    let mut tx = pool.begin().await?;
    let updated = sqlx::query(
        "UPDATE tag_categories SET availability=$1,updated_at=now(),hlc=$2 \
         WHERE id=$3 AND user_id=$4 AND deleted_at IS NULL",
    )
    .bind(availability)
    .bind(crate::service::hlc::stamp())
    .bind(id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    ensure!(updated.rows_affected() == 1, "tag category not found");
    sqlx::query("DELETE FROM tag_category_workspace_applicability WHERE category_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if availability == "selected" {
        for workspace_id in workspace_ids {
            sqlx::query(
                "INSERT INTO tag_category_workspace_applicability (category_id,workspace_id) VALUES ($1,$2)",
            )
            .bind(id)
            .bind(workspace_id)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    find_category(pool, user_id, id)
        .await?
        .context("Tag category not found after applicability update")
}

pub async fn find_category(pool: &PgPool, user_id: &str, id: &str) -> Result<Option<TagCategory>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {CATEGORY_COLS} FROM tag_categories WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL"
    )))
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("Failed to find tag category")?;

    match row {
        Some(row) => Ok(Some(row_to_category(&row)?)),
        None => Ok(None),
    }
}

pub async fn create_category(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    name: &str,
    color: Option<&str>,
) -> Result<TagCategory> {
    let name = name.trim();
    ensure!(!name.is_empty(), "category name cannot be empty");

    let id = new_id();
    let now = Utc::now();

    let next_sort: i64 = {
        let row = sqlx::query(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM tag_categories WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
        )
        .bind(user_id)
        .bind(workspace_id)
        .fetch_optional(pool)
        .await?;
        match row {
            Some(row) => row.try_get::<i64, _>(0)?,
            None => 0,
        }
    };

    let result = sqlx::query(
        "INSERT INTO tag_categories (id, user_id, workspace_id, name, role, color, sort_order, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $7)",
    )
    .bind(id.as_str())
    .bind(user_id)
    .bind(workspace_id)
    .bind(name)
    .bind(color)
    .bind(next_sort)
    .bind(now)
    .execute(pool)
    .await
    .map_err(anyhow::Error::from);

    if let Err(err) = result {
        if is_unique_violation(&err) {
            bail!("a category named \"{name}\" already exists");
        }
        return Err(err).context("Failed to insert tag category");
    }

    find_category(pool, user_id, &id)
        .await?
        .context("Category not found after insert")
}

pub async fn rename_category(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    name: &str,
) -> Result<TagCategory> {
    let name = name.trim();
    ensure!(!name.is_empty(), "category name cannot be empty");

    let result = sqlx::query(
        "UPDATE tag_categories SET name = $1, updated_at = $2 WHERE id = $3 AND user_id = $4",
    )
    .bind(name)
    .bind(Utc::now())
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await
    .map_err(anyhow::Error::from);

    if let Err(err) = result {
        if is_unique_violation(&err) {
            bail!("a category named \"{name}\" already exists");
        }
        return Err(err).context("Failed to rename tag category");
    }

    find_category(pool, user_id, id)
        .await?
        .context("Category not found after rename")
}

pub async fn set_category_color(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    color: Option<&str>,
) -> Result<TagCategory> {
    sqlx::query(
        "UPDATE tag_categories SET color = $1, updated_at = $2 WHERE id = $3 AND user_id = $4",
    )
    .bind(color)
    .bind(Utc::now())
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await
    .context("Failed to set tag category color")?;

    find_category(pool, user_id, id)
        .await?
        .context("Category not found after color update")
}

pub async fn reorder_categories(
    pool: &PgPool,
    user_id: &str,
    order: &[(String, i64)],
) -> Result<()> {
    if order.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = order.iter().map(|(id, _)| id.clone()).collect();
    let sort_orders: Vec<i64> = order.iter().map(|(_, sort_order)| *sort_order).collect();
    let now = Utc::now();
    let affected = sqlx::query(
        "UPDATE tag_categories AS category \
         SET sort_order = ordering.sort_order, updated_at = $3 \
         FROM unnest($1::text[], $2::bigint[]) AS ordering(id, sort_order) \
         WHERE category.id = ordering.id AND category.user_id = $4",
    )
    .bind(&ids)
    .bind(&sort_orders)
    .bind(now)
    .bind(user_id)
    .execute(pool)
    .await
    .context("Failed to reorder tag categories")?
    .rows_affected();
    ensure!(
        affected == ids.iter().collect::<HashSet<_>>().len() as u64,
        "one or more tag categories were not found"
    );
    Ok(())
}

pub async fn delete_category(pool: &PgPool, user_id: &str, id: &str) -> Result<bool> {
    let category = find_category(pool, user_id, id)
        .await?
        .context("Category not found")?;

    if category.role.is_some() {
        bail!("default categories cannot be deleted");
    }

    let mut tx = pool.begin().await?;

    sqlx::query(
        "DELETE FROM trade_tags WHERE tag_id IN (SELECT id FROM tags WHERE category_id = $1)",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    .context("Failed to delete trade_tags for category's tags")?;

    sqlx::query("DELETE FROM tags WHERE category_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .context("Failed to delete tags for category")?;

    let rows_affected = sqlx::query("DELETE FROM tag_categories WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .context("Failed to delete tag category")?
        .rows_affected();

    tx.commit().await?;
    Ok(rows_affected > 0)
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

pub async fn list_tags(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    category_id: Option<&str>,
) -> Result<Vec<Tag>> {
    let rows =
        match category_id {
            Some(cat) => sqlx::query(sqlx::AssertSqlSafe(format!(
                "SELECT {TAG_COLS} FROM tags JOIN tag_categories c ON c.id=tags.category_id \
                 WHERE tags.user_id=$1 AND tags.category_id=$3 AND tags.deleted_at IS NULL \
                 AND (c.availability='all' OR EXISTS (SELECT 1 FROM tag_category_workspace_applicability a \
                      WHERE a.category_id=c.id AND a.workspace_id=$2)) ORDER BY tags.name"
            )))
            .bind(user_id)
            .bind(workspace_id)
            .bind(cat)
            .fetch_all(pool)
            .await,
            None => {
                sqlx::query(sqlx::AssertSqlSafe(format!(
                    "SELECT {TAG_COLS} FROM tags JOIN tag_categories c ON c.id=tags.category_id \
                     WHERE tags.user_id=$1 AND tags.deleted_at IS NULL \
                     AND (c.availability='all' OR EXISTS (SELECT 1 FROM tag_category_workspace_applicability a \
                          WHERE a.category_id=c.id AND a.workspace_id=$2)) ORDER BY tags.name"
                )))
                .bind(user_id)
                .bind(workspace_id)
                .fetch_all(pool)
                .await
            }
        }
        .context("Failed to list tags")?;

    let mut tags = Vec::new();
    for row in &rows {
        tags.push(row_to_tag(row)?);
    }
    Ok(tags)
}

pub async fn list_strategy_library_tags(
    pool: &PgPool,
    user_id: &str,
    category_id: Option<&str>,
) -> Result<Vec<Tag>> {
    let db = sea_orm_connection(pool);
    let mut query = tags::Entity::find()
        .filter(tags::Column::UserId.eq(user_id))
        .filter(tags::Column::DeletedAt.is_null());
    if let Some(category_id) = category_id {
        query = query.filter(tags::Column::CategoryId.eq(category_id));
    }
    Ok(query
        .order_by_asc(tags::Column::Name)
        .all(&db)
        .await
        .context("Failed to list strategy library tags")?
        .into_iter()
        .map(Into::into)
        .collect())
}

pub async fn find_tag(pool: &PgPool, user_id: &str, id: &str) -> Result<Option<Tag>> {
    let db = sea_orm_connection(pool);
    Ok(tags::Entity::find_by_id(id)
        .filter(tags::Column::UserId.eq(user_id))
        .filter(tags::Column::DeletedAt.is_null())
        .one(&db)
        .await
        .context("Failed to find tag")?
        .map(Into::into))
}

pub async fn create_tag(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    category_id: &str,
    name: &str,
    color: Option<&str>,
) -> Result<Tag> {
    let name = name.trim();
    ensure!(!name.is_empty(), "tag name cannot be empty");

    // Validate the category belongs to the user.
    let _category = find_category(pool, user_id, category_id)
        .await?
        .context("category not found")?;

    let db = sea_orm_connection(pool);
    let now = Utc::now().fixed_offset();
    let result = tags::ActiveModel {
        id: Set(new_id()),
        user_id: Set(user_id.to_owned()),
        workspace_id: Set(workspace_id.to_owned()),
        category_id: Set(category_id.to_owned()),
        name: Set(name.to_owned()),
        color: Set(color.map(str::to_owned)),
        created_at: Set(now),
        updated_at: Set(now),
        hlc: Set(crate::service::hlc::stamp()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .map_err(anyhow::Error::from);

    match result {
        Ok(model) => Ok(model.into()),
        Err(error) => {
            if is_unique_violation(&error) {
                bail!("a tag named \"{name}\" already exists in this category");
            }
            Err(error).context("Failed to insert tag")
        }
    }
}

pub async fn rename_tag(pool: &PgPool, user_id: &str, id: &str, name: &str) -> Result<Tag> {
    let name = name.trim();
    ensure!(!name.is_empty(), "tag name cannot be empty");

    find_tag(pool, user_id, id)
        .await?
        .context("Tag not found")?;
    let db = sea_orm_connection(pool);
    let result = tags::ActiveModel {
        id: Set(id.to_owned()),
        name: Set(name.to_owned()),
        updated_at: Set(Utc::now().fixed_offset()),
        ..Default::default()
    }
    .update(&db)
    .await
    .map_err(anyhow::Error::from);

    match result {
        Ok(model) => Ok(model.into()),
        Err(error) => {
            if is_unique_violation(&error) {
                bail!("a tag named \"{name}\" already exists in this category");
            }
            Err(error).context("Failed to rename tag")
        }
    }
}

pub async fn set_tag_color(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    color: Option<&str>,
) -> Result<Tag> {
    find_tag(pool, user_id, id)
        .await?
        .context("Tag not found")?;
    let db = sea_orm_connection(pool);
    Ok(tags::ActiveModel {
        id: Set(id.to_owned()),
        color: Set(color.map(str::to_owned)),
        updated_at: Set(Utc::now().fixed_offset()),
        ..Default::default()
    }
    .update(&db)
    .await
    .context("Failed to set tag color")?
    .into())
}

pub async fn delete_tag(pool: &PgPool, user_id: &str, id: &str) -> Result<bool> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM trade_tags WHERE tag_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .context("Failed to delete trade_tags for tag")?;

    let rows_affected = sqlx::query("DELETE FROM tags WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .context("Failed to delete tag")?
        .rows_affected();

    tx.commit().await?;
    Ok(rows_affected > 0)
}

/// Merge `from_id` into `into_id`. Both tags must belong to the user and be in
/// the same category. Repoints all `trade_tags` links to `into_id` (dedup via
/// ON CONFLICT DO NOTHING), removes the old links, then deletes the `from` tag.
pub async fn merge_tags(pool: &PgPool, user_id: &str, from_id: &str, into_id: &str) -> Result<()> {
    ensure!(from_id != into_id, "cannot merge a tag into itself");

    let from = find_tag(pool, user_id, from_id)
        .await?
        .context("source tag not found")?;
    let into = find_tag(pool, user_id, into_id)
        .await?
        .context("target tag not found")?;

    ensure!(
        from.category_id == into.category_id,
        "tags must be in the same category to merge"
    );

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO trade_tags (journal_entry_id, tag_id) \
         SELECT journal_entry_id, $1 FROM trade_tags WHERE tag_id = $2 \
         ON CONFLICT (journal_entry_id, tag_id) DO NOTHING",
    )
    .bind(into_id)
    .bind(from_id)
    .execute(&mut *tx)
    .await
    .context("Failed to repoint trade_tags during merge")?;

    sqlx::query("DELETE FROM trade_tags WHERE tag_id = $1")
        .bind(from_id)
        .execute(&mut *tx)
        .await
        .context("Failed to clear old trade_tags during merge")?;

    sqlx::query("DELETE FROM tags WHERE id = $1 AND user_id = $2")
        .bind(from_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .context("Failed to delete source tag during merge")?;

    tx.commit().await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Trade <-> tag links
// ---------------------------------------------------------------------------

/// Replace a trade's tag links with exactly the given set. Validates that each
/// tag belongs to both the user and the trade's workspace.
pub async fn set_trade_tags(
    pool: &PgPool,
    user_id: &str,
    journal_entry_id: &str,
    tag_ids: &[String],
) -> Result<()> {
    // `trade_tags` has no `user_id` — ownership is purely transitive — so BOTH sides must
    // be checked here. Validating only the tags would let a caller staple their own tags
    // onto somebody else's trade.
    let mut tx = pool.begin().await?;
    let trade_workspace_id: Option<String> = sqlx::query_scalar(
        "SELECT workspace_id FROM journal_entries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(journal_entry_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await
    .context("Failed to load trade for tag linking")?;
    ensure!(
        trade_workspace_id.is_some(),
        "journal entry {journal_entry_id} not found"
    );
    let trade_workspace_id = trade_workspace_id.expect("checked above");

    let requested: HashSet<&str> = tag_ids.iter().map(String::as_str).collect();
    let valid: HashSet<String> = if tag_ids.is_empty() {
        HashSet::new()
    } else {
        sqlx::query_scalar(
            "SELECT tags.id FROM tags JOIN tag_categories c ON c.id=tags.category_id \
             WHERE tags.id = ANY($1) AND tags.user_id=$2 AND tags.deleted_at IS NULL \
             AND (c.availability='all' OR EXISTS (SELECT 1 FROM tag_category_workspace_applicability a \
                  WHERE a.category_id=c.id AND a.workspace_id=$3))",
        )
        .bind(tag_ids)
        .bind(user_id)
        .bind(&trade_workspace_id)
        .fetch_all(&mut *tx)
        .await
        .context("Failed to validate trade tags")?
        .into_iter()
        .collect()
    };
    for tag_id in requested {
        if !valid.contains(tag_id) {
            anyhow::bail!("tag {tag_id} not found");
        }
    }

    sqlx::query("DELETE FROM trade_tags WHERE journal_entry_id = $1")
        .bind(journal_entry_id)
        .execute(&mut *tx)
        .await
        .context("Failed to clear existing trade_tags")?;

    if !tag_ids.is_empty() {
        sqlx::query(
            "INSERT INTO trade_tags (journal_entry_id, tag_id) \
             SELECT $1, tag_id FROM unnest($2::text[]) AS requested(tag_id) \
             ON CONFLICT (journal_entry_id, tag_id) DO NOTHING",
        )
        .bind(journal_entry_id)
        .bind(tag_ids)
        .execute(&mut *tx)
        .await
        .context("Failed to insert trade_tag")?;
    }

    // `trade_tags` carries no clock of its own: it reaches the desktop only inside the
    // journal delta, which is pulled on the entry's `updated_at` cursor. Without this bump
    // the link changes on the server and the desktop never hears about it.
    sqlx::query(
        "UPDATE journal_entries SET updated_at = now(), hlc = $1 WHERE id = $2 AND user_id = $3",
    )
    .bind(crate::service::hlc::stamp())
    .bind(journal_entry_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .context("Failed to bump the trade after changing its links")?;

    tx.commit().await?;
    Ok(())
}

/// Add or remove one trade tag under an expected journal version inside the
/// caller's transaction. Used by confirmed non-model agent execution.
pub async fn set_trade_tag_membership_if_version_tx(
    conn: &mut sqlx::PgConnection,
    user_id: &str,
    workspace_id: &str,
    journal_entry_id: &str,
    tag_id: &str,
    expected_version: &str,
    add: bool,
) -> Result<()> {
    let trade_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM journal_entries WHERE id=$1 AND user_id=$2
         AND workspace_id=$3 AND deleted_at IS NULL
         AND COALESCE(NULLIF(hlc,''),updated_at::text)=$4 FOR UPDATE)",
    )
    .bind(journal_entry_id)
    .bind(user_id)
    .bind(workspace_id)
    .bind(expected_version)
    .fetch_one(&mut *conn)
    .await?;
    ensure!(trade_exists, "record_changed");
    let tag_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM tags t JOIN tag_categories c ON c.id=t.category_id
         WHERE t.id=$1 AND t.user_id=$2 AND t.deleted_at IS NULL
           AND (c.availability='all' OR EXISTS(SELECT 1 FROM tag_category_workspace_applicability a
                WHERE a.category_id=c.id AND a.workspace_id=$3)))",
    )
    .bind(tag_id)
    .bind(user_id)
    .bind(workspace_id)
    .fetch_one(&mut *conn)
    .await?;
    ensure!(tag_exists, "tag_not_found");
    if add {
        sqlx::query(
            "INSERT INTO trade_tags(journal_entry_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(journal_entry_id)
        .bind(tag_id)
        .execute(&mut *conn)
        .await?;
    } else {
        sqlx::query("DELETE FROM trade_tags WHERE journal_entry_id=$1 AND tag_id=$2")
            .bind(journal_entry_id)
            .bind(tag_id)
            .execute(&mut *conn)
            .await?;
    }
    sqlx::query("UPDATE journal_entries SET updated_at=now(),hlc=$1 WHERE id=$2 AND user_id=$3")
        .bind(crate::service::hlc::stamp())
        .bind(journal_entry_id)
        .bind(user_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// All tags attached to a single trade. Scoped to `user_id` as belt-and-suspenders
/// (a trade's tags all belong to its user).
pub async fn tags_for_trade(
    pool: &PgPool,
    user_id: &str,
    journal_entry_id: &str,
) -> Result<Vec<Tag>> {
    let rows = sqlx::query(
        "SELECT t.id, t.user_id, t.workspace_id, t.category_id, t.name, t.color, \
                to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, \
                to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at \
         FROM tags t JOIN trade_tags tt ON tt.tag_id = t.id \
         WHERE tt.journal_entry_id = $1 AND t.user_id = $2 ORDER BY t.name",
    )
    .bind(journal_entry_id)
    .bind(user_id)
    .fetch_all(pool)
    .await
    .context("Failed to load tags for trade")?;

    let mut tags = Vec::new();
    for row in &rows {
        tags.push(row_to_tag(row)?);
    }
    Ok(tags)
}

/// Batch hydration: maps each journal_entry_id to its hydrated tags (with
/// category context). Trades with no tags are absent from the map.
pub async fn tags_for_trades(
    pool: &PgPool,
    journal_entry_ids: &[String],
) -> Result<HashMap<String, Vec<TradeTag>>> {
    let mut map: HashMap<String, Vec<TradeTag>> = HashMap::new();
    if journal_entry_ids.is_empty() {
        return Ok(map);
    }

    let placeholders = journal_entry_ids
        .iter()
        .enumerate()
        .map(|(i, _)| format!("${}", i + 1))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "SELECT tt.journal_entry_id, \
                t.id, t.user_id, t.workspace_id, t.category_id, t.name, t.color, \
                to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, \
                to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at, \
                c.name, c.role \
         FROM trade_tags tt \
         JOIN tags t ON t.id = tt.tag_id \
         JOIN tag_categories c ON c.id = t.category_id \
         WHERE tt.journal_entry_id IN ({placeholders}) \
         ORDER BY c.sort_order, c.name, t.name"
    );

    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
    for id in journal_entry_ids {
        query = query.bind(id);
    }

    let rows = query
        .fetch_all(pool)
        .await
        .context("Failed to batch-load tags for trades")?;

    for row in &rows {
        let journal_entry_id = row.try_get::<String, _>(0)?;
        let tag = Tag {
            id: row.try_get::<String, _>(1)?,
            user_id: row.try_get::<String, _>(2)?,
            workspace_id: row.try_get::<String, _>(3)?,
            category_id: row.try_get::<String, _>(4)?,
            name: row.try_get::<String, _>(5)?,
            color: row.try_get::<Option<String>, _>(6)?,
            created_at: row.try_get::<String, _>(7)?,
            updated_at: row.try_get::<String, _>(8)?,
        };
        let category_id = tag.category_id.clone();
        let category_name = row.try_get::<String, _>(9)?;
        let role = row
            .try_get::<Option<String>, _>(10)?
            .and_then(|r| TagRole::parse(&r));

        map.entry(journal_entry_id).or_default().push(TradeTag {
            tag,
            category_id,
            category_name,
            role,
        });
    }

    Ok(map)
}

// ---------------------------------------------------------------------------
// Offline-first sync (whole-row LWW + soft-delete)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct TagCategoryDelta {
    pub id: String,
    pub name: String,
    pub role: Option<String>,
    pub color: Option<String>,
    pub sort_order: i64,
    pub availability: String,
    pub workspace_ids: Vec<String>,
    pub hlc: String,
    pub deleted_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct TagDelta {
    pub id: String,
    pub category_id: String,
    pub name: String,
    pub color: Option<String>,
    pub hlc: String,
    pub deleted_at: Option<String>,
    pub updated_at: String,
}

const CATEGORY_DELTA_COLS: &str = "id, name, role, color, sort_order, hlc, \
    availability, ARRAY(SELECT workspace_id FROM tag_category_workspace_applicability a WHERE a.category_id = tag_categories.id ORDER BY workspace_id) AS workspace_ids, \
    to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS deleted_at, \
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at";

const TAG_DELTA_COLS: &str = "id, category_id, name, color, hlc, \
    to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS deleted_at, \
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at";

/// The client-provided fields for a tag category create mutation.
pub struct CreateCategoryTxArgs<'a> {
    pub workspace_id: &'a str,
    pub id: &'a str,
    pub name: &'a str,
    pub color: Option<&'a str>,
    pub sort_order: i64,
}

/// The client-provided fields for a tag create mutation.
pub struct CreateTagTxArgs<'a> {
    pub workspace_id: &'a str,
    pub id: &'a str,
    pub category_id: &'a str,
    pub name: &'a str,
    pub color: Option<&'a str>,
}

pub async fn create_category_tx(
    conn: &mut PgConnection,
    user_id: &str,
    args: &CreateCategoryTxArgs<'_>,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO tag_categories (id, user_id, workspace_id, name, role, color, sort_order, hlc, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, now(), now()) ON CONFLICT (id) DO NOTHING",
    )
    .bind(args.id)
    .bind(user_id)
    .bind(args.workspace_id)
    .bind(args.name)
    .bind(args.color)
    .bind(args.sort_order)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("create_category_tx")?;
    Ok(())
}

pub async fn rename_category_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    name: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE tag_categories SET name = $1, hlc = $2, updated_at = now() \
         WHERE id = $3 AND user_id = $4",
    )
    .bind(name)
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("rename_category_tx")?;
    Ok(())
}

pub async fn set_category_color_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    color: Option<&str>,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE tag_categories SET color = $1, hlc = $2, updated_at = now() \
         WHERE id = $3 AND user_id = $4",
    )
    .bind(color)
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("set_category_color_tx")?;
    Ok(())
}

/// Absolute `sort_order` per id + a fresh `hlc`, one UPDATE per pair. The whole
/// list rides inside the caller's transaction, so a partial write is never
/// visible to a concurrent pull.
pub async fn reorder_categories_tx(
    conn: &mut PgConnection,
    user_id: &str,
    pairs: &[(String, i64)],
    hlc: &str,
) -> Result<()> {
    if pairs.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = pairs.iter().map(|(id, _)| id.clone()).collect();
    let sort_orders: Vec<i64> = pairs.iter().map(|(_, sort_order)| *sort_order).collect();
    let affected = sqlx::query(
        "UPDATE tag_categories AS category \
         SET sort_order = ordering.sort_order, hlc = $3, updated_at = now() \
         FROM unnest($1::text[], $2::bigint[]) AS ordering(id, sort_order) \
         WHERE category.id = ordering.id AND category.user_id = $4",
    )
    .bind(&ids)
    .bind(&sort_orders)
    .bind(hlc)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("reorder_categories_tx")?
    .rows_affected();
    ensure!(
        affected == ids.iter().collect::<HashSet<_>>().len() as u64,
        "one or more tag categories were not found"
    );
    Ok(())
}

pub async fn soft_delete_category_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE tag_categories SET deleted_at = now(), hlc = $1 \
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
    )
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("soft_delete_category_tx")?;
    Ok(())
}

pub async fn create_tag_tx(
    conn: &mut PgConnection,
    user_id: &str,
    args: &CreateTagTxArgs<'_>,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO tags (id, user_id, workspace_id, category_id, name, color, hlc, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) ON CONFLICT (id) DO NOTHING",
    )
    .bind(args.id)
    .bind(user_id)
    .bind(args.workspace_id)
    .bind(args.category_id)
    .bind(args.name)
    .bind(args.color)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("create_tag_tx")?;
    Ok(())
}

pub async fn rename_tag_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    name: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE tags SET name = $1, hlc = $2, updated_at = now() WHERE id = $3 AND user_id = $4",
    )
    .bind(name)
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("rename_tag_tx")?;
    Ok(())
}

pub async fn set_tag_color_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    color: Option<&str>,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE tags SET color = $1, hlc = $2, updated_at = now() WHERE id = $3 AND user_id = $4",
    )
    .bind(color)
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("set_tag_color_tx")?;
    Ok(())
}

pub async fn soft_delete_tag_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE tags SET deleted_at = now(), hlc = $1 \
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
    )
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("soft_delete_tag_tx")?;
    Ok(())
}

/// Offline counterpart of [`merge_tags`]: the online path hard-deletes `from_id`
/// after repointing `trade_tags`, but a hard delete leaves offline clients with
/// no way to learn the tag is gone. Tombstone it instead (delete-wins LWW) —
/// `into_id` is left untouched since the whole-row LWW clone doesn't need to
/// bump it, and callers must not enqueue a separate trade outbox row for the
/// repoint (see the mergeTags handling note in the tags offline plan).
pub async fn merge_tags_tx(
    conn: &mut PgConnection,
    user_id: &str,
    from_id: &str,
    into_id: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO trade_tags (journal_entry_id, tag_id) \
         SELECT journal_entry_id, $1 FROM trade_tags WHERE tag_id = $2 \
         ON CONFLICT (journal_entry_id, tag_id) DO NOTHING",
    )
    .bind(into_id)
    .bind(from_id)
    .execute(&mut *conn)
    .await
    .context("Failed to repoint trade_tags during merge_tags_tx")?;

    // A trade's synced `tag_ids` are aggregated from `trade_tags`, but repointing
    // them does NOT touch `journal_entries`, so the cursor pull would never
    // re-deliver these trades and another device's cached tags would stay stale.
    // Bump the affected trades' hlc + updated_at (with the merge's stamp, which is
    // newer than any prior trade write) so the journal delta re-delivers them and
    // LWW applies the repointed tag set. Do this BEFORE deleting the old links.
    sqlx::query(
        "UPDATE journal_entries SET updated_at = now(), hlc = $1 \
         WHERE user_id = $2 AND id IN (SELECT journal_entry_id FROM trade_tags WHERE tag_id = $3)",
    )
    .bind(hlc)
    .bind(user_id)
    .bind(from_id)
    .execute(&mut *conn)
    .await
    .context("Failed to bump merged trades during merge_tags_tx")?;

    sqlx::query("DELETE FROM trade_tags WHERE tag_id = $1")
        .bind(from_id)
        .execute(&mut *conn)
        .await
        .context("Failed to clear old trade_tags during merge_tags_tx")?;

    sqlx::query(
        "UPDATE tags SET deleted_at = now(), hlc = $1 \
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
    )
    .bind(hlc)
    .bind(from_id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("Failed to tombstone source tag during merge_tags_tx")?;

    Ok(())
}

/// User-scoped pull deltas. Deliberately does NOT filter `deleted_at IS NULL`: a
/// client that never sees a tombstone can't distinguish "deleted" from "not yet
/// pushed." `>=` (not `>`) re-sends the cursor boundary row, which is harmless
/// because client apply is idempotent.
pub async fn categories_since(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    cookie: Option<&str>,
) -> Result<Vec<TagCategoryDelta>> {
    let cookie = cookie.filter(|c| !c.is_empty());
    let sql = format!(
        "SELECT {CATEGORY_DELTA_COLS} FROM tag_categories \
         WHERE user_id = $1 \
           AND ($3::text IS NULL OR updated_at >= $3::timestamptz) \
         ORDER BY updated_at ASC"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(cookie)
        .fetch_all(pool)
        .await
        .context("Failed to read tag category deltas")?;

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        out.push(TagCategoryDelta {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            role: row.try_get("role")?,
            color: row.try_get("color")?,
            sort_order: row.try_get("sort_order")?,
            availability: row.try_get("availability")?,
            workspace_ids: row.try_get("workspace_ids")?,
            hlc: row.try_get("hlc")?,
            deleted_at: row.try_get("deleted_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    Ok(out)
}

/// See [`categories_since`] for the empty-cookie / no-tombstone-filter rationale.
pub async fn tags_since(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    cookie: Option<&str>,
) -> Result<Vec<TagDelta>> {
    let cookie = cookie.filter(|c| !c.is_empty());
    let sql = format!(
        "SELECT {TAG_DELTA_COLS} FROM tags \
         WHERE user_id = $1 \
           AND ($3::text IS NULL OR updated_at >= $3::timestamptz) \
         ORDER BY updated_at ASC"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(cookie)
        .fetch_all(pool)
        .await
        .context("Failed to read tag deltas")?;

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        out.push(TagDelta {
            id: row.try_get("id")?,
            category_id: row.try_get("category_id")?,
            name: row.try_get("name")?,
            color: row.try_get("color")?,
            hlc: row.try_get("hlc")?,
            deleted_at: row.try_get("deleted_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    Ok(out)
}
