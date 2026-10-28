use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::db::new_id;

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum WorkspaceError {
    #[error("workspace names must be 1 to 100 characters")]
    InvalidName,
    #[error("workspace not found")]
    NotFound,
    #[error("you need at least one workspace")]
    LastWorkspace,
}

const COLUMNS: &str = "id, user_id, name, created_at";

fn clean_name(name: &str) -> Result<String, WorkspaceError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(WorkspaceError::InvalidName);
    }
    Ok(name.to_owned())
}

pub async fn list(pool: &PgPool, user_id: Uuid) -> Result<Vec<Workspace>> {
    Ok(sqlx::query_as::<_, Workspace>(sqlx::AssertSqlSafe(format!(
        "SELECT {COLUMNS} FROM workspaces WHERE user_id = $1 ORDER BY created_at, id"
    )))
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

pub async fn create(pool: &PgPool, user_id: Uuid, name: &str) -> Result<Workspace> {
    let name = clean_name(name)?;
    Ok(sqlx::query_as::<_, Workspace>(sqlx::AssertSqlSafe(format!(
        "INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3) RETURNING {COLUMNS}"
    )))
    .bind(new_id())
    .bind(user_id)
    .bind(name)
    .fetch_one(pool)
    .await?)
}

pub async fn rename(pool: &PgPool, user_id: Uuid, id: Uuid, name: &str) -> Result<Workspace> {
    let name = clean_name(name)?;
    sqlx::query_as::<_, Workspace>(sqlx::AssertSqlSafe(format!(
        "UPDATE workspaces SET name = $3, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING {COLUMNS}"
    )))
    .bind(id)
    .bind(user_id)
    .bind(name)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| WorkspaceError::NotFound.into())
}

/// Deletes a workspace the user owns. The last one is kept so the app always
/// has somewhere to work; the lock stops two concurrent deletes from removing
/// both of a user's final two workspaces.
pub async fn delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let owned: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE user_id = $1")
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    if !exists {
        return Err(WorkspaceError::NotFound.into());
    }
    if owned <= 1 {
        return Err(WorkspaceError::LastWorkspace.into());
    }
    sqlx::query("DELETE FROM workspaces WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::users::{Provisioning, load_user};

    async fn user(pool: &PgPool, stytch_id: &str) -> Uuid {
        load_user(pool, stytch_id, "", "", Provisioning::CreateIfMissing)
            .await
            .unwrap()
            .id
    }

    fn workspace_error(error: anyhow::Error) -> WorkspaceError {
        error.downcast::<WorkspaceError>().unwrap()
    }

    #[sqlx::test]
    async fn workspaces_are_created_renamed_and_listed_in_order(pool: PgPool) {
        let owner = user(&pool, "user-1").await;
        let created = create(&pool, owner, "  Swing  ").await.unwrap();
        assert_eq!(created.name, "Swing");
        rename(&pool, owner, created.id, "Swing trades")
            .await
            .unwrap();
        let names: Vec<String> = list(&pool, owner)
            .await
            .unwrap()
            .into_iter()
            .map(|workspace| workspace.name)
            .collect();
        assert_eq!(names, ["Main Workspace", "Swing trades"]);
    }

    #[sqlx::test]
    async fn names_are_validated(pool: PgPool) {
        let owner = user(&pool, "user-1").await;
        assert_eq!(
            workspace_error(create(&pool, owner, "   ").await.unwrap_err()),
            WorkspaceError::InvalidName
        );
        let long = "x".repeat(101);
        assert_eq!(
            workspace_error(create(&pool, owner, &long).await.unwrap_err()),
            WorkspaceError::InvalidName
        );
    }

    #[sqlx::test]
    async fn other_users_workspaces_are_invisible(pool: PgPool) {
        let owner = user(&pool, "user-1").await;
        let other = user(&pool, "user-2").await;
        let theirs = list(&pool, other).await.unwrap().remove(0);
        assert_eq!(
            workspace_error(rename(&pool, owner, theirs.id, "Mine").await.unwrap_err()),
            WorkspaceError::NotFound
        );
        assert_eq!(
            workspace_error(delete(&pool, owner, theirs.id).await.unwrap_err()),
            WorkspaceError::NotFound
        );
    }

    #[sqlx::test]
    async fn the_last_workspace_cannot_be_deleted(pool: PgPool) {
        let owner = user(&pool, "user-1").await;
        let main = list(&pool, owner).await.unwrap().remove(0);
        assert_eq!(
            workspace_error(delete(&pool, owner, main.id).await.unwrap_err()),
            WorkspaceError::LastWorkspace
        );
        let extra = create(&pool, owner, "Extra").await.unwrap();
        delete(&pool, owner, main.id).await.unwrap();
        assert_eq!(list(&pool, owner).await.unwrap()[0].id, extra.id);
    }
}
