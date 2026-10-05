use anyhow::{Context, Result, ensure};
use async_graphql::SimpleObject;
use chrono::Utc;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

use super::super::workspaces_table;
use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::notebook::notebook_folders;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[serde(rename_all = "camelCase")]
#[graphql(rename_fields = "camelCase")]
pub struct NotebookFolder {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub parent_folder_id: Option<String>,
    pub name: String,
    pub sort_order: i64,
    /// System-owned: managed folders for agent and trade notes. Cannot be renamed or
    /// deleted. Its *contents* are ordinary notes and remain fully deletable.
    pub is_system: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub struct CreateNotebookFolderInput {
    pub id: Option<String>,
    pub user_id: String,
    pub workspace_id: String,
    pub parent_folder_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotebookNodeType {
    Folder,
    Note,
}

pub struct MoveNotebookNodeInput {
    pub workspace_id: String,
    pub node_id: String,
    pub node_type: NotebookNodeType,
    pub new_parent_folder_id: Option<String>,
    pub new_sort_order: i64,
}

impl From<notebook_folders::Model> for NotebookFolder {
    fn from(model: notebook_folders::Model) -> Self {
        Self {
            id: model.id,
            user_id: model.user_id,
            workspace_id: model.workspace_id,
            parent_folder_id: model.parent_folder_id.filter(|value| !value.is_empty()),
            name: model.name,
            sort_order: model.sort_order,
            is_system: model.is_system,
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

pub async fn list_notebook_folders(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<NotebookFolder>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_folders::Entity::find()
        .filter(notebook_folders::Column::UserId.eq(user_id))
        .filter(notebook_folders::Column::WorkspaceId.eq(workspace_id))
        .filter(notebook_folders::Column::DeletedAt.is_null())
        .order_by_asc(notebook_folders::Column::SortOrder)
        .order_by_asc(notebook_folders::Column::Name)
        .all(&db)
        .await
        .context("Failed to list notebook folders")?
        .into_iter()
        .map(Into::into)
        .collect())
}

pub async fn find_notebook_folder(
    pool: &PgPool,
    user_id: &str,
    id: &str,
) -> Result<Option<NotebookFolder>> {
    let db = sea_orm_connection(pool);
    Ok(notebook_folders::Entity::find_by_id(id)
        .filter(notebook_folders::Column::UserId.eq(user_id))
        .filter(notebook_folders::Column::DeletedAt.is_null())
        .one(&db)
        .await
        .context("Failed to find notebook folder")?
        .map(Into::into))
}

/// `notebook_folders` has no composite `(workspace_id, user_id)` foreign key, so
/// workspace ownership is enforced here rather than by Postgres.
async fn ensure_workspace_owned(
    conn: &mut PgConnection,
    user_id: &str,
    workspace_id: &str,
) -> Result<()> {
    let workspace = workspaces_table::find_workspace(&mut *conn, workspace_id, user_id).await?;
    ensure!(
        workspace.is_some(),
        "Workspace '{workspace_id}' was not found"
    );
    Ok(())
}

/// A folder referenced as a parent or a note's home must be one the caller owns
/// in that same workspace. The foreign keys check only that the id exists, which
/// would let a caller file things under someone else's folder. Tombstoned folders
/// still pass, so an offline client's move into a folder another device just
/// deleted is not dropped.
pub async fn ensure_folder_in_workspace(
    conn: &mut PgConnection,
    user_id: &str,
    workspace_id: &str,
    folder_id: &str,
) -> Result<()> {
    let found: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM notebook_folders \
         WHERE id = $1 AND user_id = $2 AND workspace_id = $3)",
    )
    .bind(folder_id)
    .bind(user_id)
    .bind(workspace_id)
    .fetch_one(&mut *conn)
    .await
    .context("Failed to verify notebook folder")?;
    ensure!(
        found,
        "Folder '{folder_id}' was not found in workspace '{workspace_id}'"
    );
    Ok(())
}

async fn next_folder_sort_order(
    conn: &mut PgConnection,
    workspace_id: &str,
    parent_folder_id: Option<&str>,
) -> Result<i64> {
    // NULL-binding choice: branch on `is_none()` to use `IS NULL` vs `= $2`,
    // rather than binding `Option::None` against an `IS $` placeholder.
    let row = if let Some(parent_id) = parent_folder_id {
        sqlx::query(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM notebook_folders WHERE workspace_id = $1 AND parent_folder_id = $2 AND deleted_at IS NULL",
        )
        .bind(workspace_id)
        .bind(parent_id)
        .fetch_optional(&mut *conn)
        .await
    } else {
        sqlx::query(
            "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM notebook_folders WHERE workspace_id = $1 AND parent_folder_id IS NULL AND deleted_at IS NULL",
        )
        .bind(workspace_id)
        .fetch_optional(&mut *conn)
        .await
    }
    .context("Failed to compute next folder sort_order")?;

    match row {
        Some(row) => Ok(row.try_get::<i64, _>(0)?),
        None => Ok(0),
    }
}

/// Transactional core: inserts the folder on the caller's connection with an
/// explicit `sort_order` and HLC stamp ("" for server-authored rows).
pub async fn create_notebook_folder_tx(
    conn: &mut PgConnection,
    input: CreateNotebookFolderInput,
    sort_order: i64,
    hlc: &str,
) -> Result<String> {
    let id = match input.id.as_deref() {
        Some(id) => {
            Uuid::parse_str(id).context("Client-supplied folder id must be a UUID")?;
            id.to_string()
        }
        None => crate::ids::new_uuid_v7().to_string(),
    };

    ensure_workspace_owned(conn, &input.user_id, &input.workspace_id).await?;
    if let Some(parent_id) = input.parent_folder_id.as_deref() {
        ensure_folder_in_workspace(conn, &input.user_id, &input.workspace_id, parent_id).await?;
    }

    sqlx::query(
        r#"
        INSERT INTO notebook_folders (id, user_id, workspace_id, parent_folder_id, name, sort_order, hlc)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id.as_str())
    .bind(input.user_id.as_str())
    .bind(input.workspace_id.as_str())
    .bind(input.parent_folder_id.as_deref())
    .bind(input.name.as_str())
    .bind(sort_order)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("Failed to insert notebook folder")?;

    Ok(id)
}

pub async fn create_notebook_folder(
    pool: &PgPool,
    input: CreateNotebookFolderInput,
) -> Result<NotebookFolder> {
    let user_id = input.user_id.clone();
    let mut tx = pool.begin().await?;
    let sort_order = next_folder_sort_order(
        &mut tx,
        &input.workspace_id,
        input.parent_folder_id.as_deref(),
    )
    .await?;
    let id = create_notebook_folder_tx(&mut tx, input, sort_order, &crate::service::hlc::stamp())
        .await?;
    tx.commit().await?;

    find_notebook_folder(pool, &user_id, &id)
        .await?
        .context("Notebook folder not found after insert")
}

/// The name every account's system folder carries.
pub const SYSTEM_FOLDER_NAME: &str = "System";
pub const RECENT_TRADES_FOLDER_NAME: &str = "Recent Trades";

/// Errors when the folder is missing or not the caller's, so a foreign id is
/// indistinguishable from one that never existed.
async fn owned_folder_is_system(conn: &mut PgConnection, user_id: &str, id: &str) -> Result<bool> {
    let is_system: Option<bool> =
        sqlx::query_scalar("SELECT is_system FROM notebook_folders WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .fetch_optional(&mut *conn)
            .await
            .context("Failed to read folder")?;
    is_system.context("Notebook folder not found")
}

/// Idempotent: creates the account's System folder if it does not have one. Safe to call
/// on every account creation and on backfill; the partial unique index is the real guard.
pub async fn ensure_system_folder(pool: &PgPool, user_id: &str, workspace_id: &str) -> Result<()> {
    let mut tx = pool.begin().await?;
    ensure_recent_trades_folder_tx(&mut tx, user_id, workspace_id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn ensure_recent_trades_folder_tx(
    conn: &mut PgConnection,
    user_id: &str,
    workspace_id: &str,
) -> Result<String> {
    ensure_workspace_owned(conn, user_id, workspace_id).await?;
    sqlx::query(
        "INSERT INTO notebook_folders (id, user_id, workspace_id, name, sort_order, is_system) \
         VALUES ($1, $2, $3, $4, -1, true) ON CONFLICT DO NOTHING",
    )
    .bind(crate::ids::new_uuid_v7().to_string())
    .bind(user_id)
    .bind(workspace_id)
    .bind(SYSTEM_FOLDER_NAME)
    .execute(&mut *conn)
    .await
    .context("Failed to ensure system notebook folder")?;
    sqlx::query("INSERT INTO notebook_folders(id,user_id,workspace_id,parent_folder_id,name,sort_order,is_system)
        SELECT $1,$2,$3,id,$4,-1,true FROM notebook_folders
        WHERE user_id=$2 AND workspace_id=$3 AND is_system AND parent_folder_id IS NULL
        ON CONFLICT DO NOTHING")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(user_id).bind(workspace_id).bind(RECENT_TRADES_FOLDER_NAME)
        .execute(&mut *conn).await?;
    Ok(sqlx::query_scalar("SELECT id FROM notebook_folders WHERE user_id=$1 AND workspace_id=$2 AND is_system AND parent_folder_id IS NOT NULL AND name=$3 AND deleted_at IS NULL")
        .bind(user_id).bind(workspace_id).bind(RECENT_TRADES_FOLDER_NAME).fetch_one(&mut *conn).await?)
}

pub async fn rename_notebook_folder_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    name: &str,
    hlc: &str,
) -> Result<()> {
    if owned_folder_is_system(conn, user_id, id).await? {
        anyhow::bail!("The System folder cannot be renamed");
    }
    sqlx::query("UPDATE notebook_folders SET name = $2, hlc = $3 WHERE id = $1 AND user_id = $4")
        .bind(id)
        .bind(name)
        .bind(hlc)
        .bind(user_id)
        .execute(&mut *conn)
        .await
        .context("Failed to rename notebook folder")?;

    Ok(())
}

pub async fn rename_notebook_folder(
    pool: &PgPool,
    user_id: &str,
    id: &str,
    name: &str,
) -> Result<()> {
    let mut conn = pool.acquire().await?;
    rename_notebook_folder_tx(&mut conn, user_id, id, name, &crate::service::hlc::stamp()).await
}

pub async fn folder_subtree_ids<'e, E>(executor: E, folder_id: &str) -> Result<Vec<String>>
where
    E: sqlx::PgExecutor<'e>,
{
    // No `deleted_at` guard: deleting a folder whose child was already tombstoned
    // must still stamp that child, or the subtree delete would leave orphans.
    let rows = sqlx::query(
        r#"
            WITH RECURSIVE subtree(id) AS (
                SELECT id FROM notebook_folders WHERE id = $1
                UNION ALL
                SELECT f.id FROM notebook_folders f JOIN subtree s ON f.parent_folder_id = s.id
            ) SELECT id FROM subtree
            "#,
    )
    .bind(folder_id)
    .fetch_all(executor)
    .await
    .context("Failed to gather folder subtree ids")?;

    let mut ids = Vec::new();
    for row in &rows {
        ids.push(row.try_get::<String, _>(0)?);
    }

    Ok(ids)
}

async fn owned_node_workspace(
    conn: &mut PgConnection,
    user_id: &str,
    node_type: NotebookNodeType,
    node_id: &str,
) -> Result<String> {
    let sql = match node_type {
        NotebookNodeType::Folder => {
            "SELECT workspace_id FROM notebook_folders WHERE id = $1 AND user_id = $2"
        }
        NotebookNodeType::Note => {
            "SELECT workspace_id FROM notebook_notes WHERE id = $1 AND user_id = $2"
        }
    };
    let workspace_id: Option<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(node_id)
        .bind(user_id)
        .fetch_optional(&mut *conn)
        .await
        .context("Failed to read notebook node")?;
    workspace_id.context("Notebook node not found")
}

pub async fn move_notebook_node_tx(
    conn: &mut PgConnection,
    user_id: &str,
    input: MoveNotebookNodeInput,
    hlc: &str,
) -> Result<()> {
    // The renumber below rewrites every sibling in `input.workspace_id`, so that
    // workspace, the node, and the destination must all be the caller's.
    ensure_workspace_owned(conn, user_id, &input.workspace_id).await?;
    let node_workspace_id =
        owned_node_workspace(conn, user_id, input.node_type, &input.node_id).await?;
    ensure!(
        node_workspace_id == input.workspace_id,
        "Notebook node not found in workspace '{}'",
        input.workspace_id
    );
    if let Some(parent_id) = input.new_parent_folder_id.as_deref() {
        ensure_folder_in_workspace(conn, user_id, &input.workspace_id, parent_id).await?;
    }

    if input.node_type == NotebookNodeType::Folder
        && owned_folder_is_system(conn, user_id, &input.node_id).await?
    {
        anyhow::bail!("System folders cannot be moved");
    }

    // Cycle guard: a folder cannot be moved into itself or any of its descendants.
    if input.node_type == NotebookNodeType::Folder
        && let Some(target) = input.new_parent_folder_id.as_deref()
    {
        let subtree = folder_subtree_ids(&mut *conn, &input.node_id).await?;
        if subtree.iter().any(|id| id == target) {
            anyhow::bail!("cannot move a folder into itself or a descendant");
        }
    }

    let sql = match input.node_type {
        NotebookNodeType::Folder => {
            "UPDATE notebook_folders SET parent_folder_id = $2, sort_order = $3, hlc = $4 WHERE id = $1 AND user_id = $5"
        }
        NotebookNodeType::Note => {
            "UPDATE notebook_notes SET folder_id = $2, sort_order = $3, hlc = $4 WHERE id = $1 AND user_id = $5"
        }
    };

    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(input.node_id.as_str())
        .bind(input.new_parent_folder_id.as_deref())
        .bind(input.new_sort_order)
        .bind(hlc)
        .bind(user_id)
        .execute(&mut *conn)
        .await
        .context("Failed to reparent notebook node")?;

    renumber_sibling_group(conn, &input.workspace_id, &input.new_parent_folder_id).await?;

    Ok(())
}

pub async fn move_notebook_node(
    pool: &PgPool,
    user_id: &str,
    input: MoveNotebookNodeInput,
) -> Result<()> {
    // Reparent the node and renumber the destination sibling group together so
    // the two writes either both land or both roll back.
    let mut tx = pool.begin().await?;
    move_notebook_node_tx(&mut tx, user_id, input, &crate::service::hlc::stamp()).await?;
    tx.commit().await?;

    Ok(())
}

/// Renumber a combined sibling group (folders + notes sharing the same parent)
/// to contiguous `sort_order` values 0..N.
///
/// NULL-binding choice: branch on `is_none()` to use `IS NULL` vs `= $2`.
async fn renumber_sibling_group(
    conn: &mut PgConnection,
    workspace_id: &str,
    parent_folder_id: &Option<String>,
) -> Result<()> {
    let rows = if let Some(parent_id) = parent_folder_id.as_deref() {
        sqlx::query(
            r#"
            SELECT 'folder' AS kind, id, sort_order, created_at FROM notebook_folders
                WHERE workspace_id = $1 AND parent_folder_id = $2 AND deleted_at IS NULL
            UNION ALL
            SELECT 'note' AS kind, id, sort_order, created_at FROM notebook_notes
                WHERE workspace_id = $1 AND folder_id = $2 AND deleted_at IS NULL
            ORDER BY sort_order ASC, created_at ASC
            "#,
        )
        .bind(workspace_id)
        .bind(parent_id)
        .fetch_all(&mut *conn)
        .await
    } else {
        sqlx::query(
            r#"
            SELECT 'folder' AS kind, id, sort_order, created_at FROM notebook_folders
                WHERE workspace_id = $1 AND parent_folder_id IS NULL AND deleted_at IS NULL
            UNION ALL
            SELECT 'note' AS kind, id, sort_order, created_at FROM notebook_notes
                WHERE workspace_id = $1 AND folder_id IS NULL AND deleted_at IS NULL
            ORDER BY sort_order ASC, created_at ASC
            "#,
        )
        .bind(workspace_id)
        .fetch_all(&mut *conn)
        .await
    }
    .context("Failed to load sibling group for renumbering")?;

    let mut siblings: Vec<(String, String)> = Vec::new();
    for row in &rows {
        let kind = row.try_get::<String, _>(0)?;
        let id = row.try_get::<String, _>(1)?;
        siblings.push((kind, id));
    }

    if !siblings.is_empty() {
        let mut kinds = Vec::with_capacity(siblings.len());
        let mut ids = Vec::with_capacity(siblings.len());
        let mut sort_orders = Vec::with_capacity(siblings.len());
        for (index, (kind, id)) in siblings.into_iter().enumerate() {
            kinds.push(kind);
            ids.push(id);
            sort_orders.push(index as i64);
        }

        sqlx::query(
            "WITH desired(kind, id, sort_order) AS (
                 SELECT * FROM unnest($1::text[], $2::text[], $3::bigint[])
             ), updated_folders AS (
                 UPDATE notebook_folders AS folder
                 SET sort_order = desired.sort_order
                 FROM desired
                 WHERE desired.kind = 'folder' AND folder.id = desired.id
             )
             UPDATE notebook_notes AS note
             SET sort_order = desired.sort_order
             FROM desired
             WHERE desired.kind = 'note' AND note.id = desired.id",
        )
        .bind(kinds)
        .bind(ids)
        .bind(sort_orders)
        .execute(&mut *conn)
        .await
        .context("Failed to renumber sibling sort_order")?;
    }

    Ok(())
}

pub async fn delete_notebook_folder_subtree_tx(
    conn: &mut PgConnection,
    folder_id: &str,
    user_id: &str,
    hlc: &str,
) -> Result<Vec<String>> {
    let owned: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM notebook_folders
         WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL)",
    )
    .bind(folder_id)
    .bind(user_id)
    .fetch_one(&mut *conn)
    .await?;
    ensure!(owned, "Notebook folder not found");
    // Only the folder row is protected. Notes inside it are ordinary notes and are
    // deleted through the note paths, which this guard does not touch.
    if owned_folder_is_system(conn, user_id, folder_id).await? {
        anyhow::bail!("The System folder cannot be deleted");
    }

    // Soft delete does not fire ON DELETE CASCADE, so stamp both the whole folder
    // subtree and every note inside it explicitly.
    let rows = sqlx::query(
        "WITH RECURSIVE subtree(id) AS (
             SELECT id FROM notebook_folders WHERE id=$1 AND user_id=$2
             UNION ALL
             SELECT folder.id FROM notebook_folders folder
             JOIN subtree parent ON folder.parent_folder_id=parent.id
             WHERE folder.user_id=$2
         ) SELECT id FROM subtree ORDER BY id",
    )
    .bind(folder_id)
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    let ids = rows
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let note_ids = sqlx::query_scalar(
        "SELECT id FROM notebook_notes
         WHERE user_id=$1 AND folder_id=ANY($2) AND deleted_at IS NULL ORDER BY id",
    )
    .bind(user_id)
    .bind(&ids)
    .fetch_all(&mut *conn)
    .await?;

    sqlx::query(
        "UPDATE notebook_folders SET deleted_at = now(), hlc = $3
         WHERE id = ANY($1) AND user_id=$2 AND deleted_at IS NULL",
    )
    .bind(&ids)
    .bind(user_id)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("Failed to soft-delete folder subtree")?;

    sqlx::query(
        "UPDATE notebook_notes SET deleted_at=now(),hlc=$3
         WHERE folder_id=ANY($1) AND user_id=$2 AND deleted_at IS NULL",
    )
    .bind(&ids)
    .bind(user_id)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("Failed to soft-delete notes in folder subtree")?;

    Ok(note_ids)
}

pub async fn delete_notebook_folder_subtree(
    pool: &PgPool,
    folder_id: &str,
    user_id: &str,
) -> Result<Vec<String>> {
    let mut tx = pool.begin().await?;
    let note_ids = delete_notebook_folder_subtree_tx(
        &mut tx,
        folder_id,
        user_id,
        &crate::service::hlc::stamp(),
    )
    .await?;
    tx.commit().await?;
    Ok(note_ids)
}
