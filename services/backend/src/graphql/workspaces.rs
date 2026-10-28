use async_graphql::{Context, ID, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::errors::{coded, to_graphql};
use super::user::current_user;
use crate::workspace::{self, Workspace as WorkspaceRow};

#[derive(SimpleObject)]
pub struct Workspace {
    id: ID,
    name: String,
    created_at: DateTime<Utc>,
}

impl From<WorkspaceRow> for Workspace {
    fn from(row: WorkspaceRow) -> Self {
        Self {
            id: ID(row.id.to_string()),
            name: row.name,
            created_at: row.created_at,
        }
    }
}

pub fn parse_id(id: &ID) -> Result<Uuid> {
    Uuid::parse_str(id).map_err(|_| coded("Not found", "NOT_FOUND"))
}

#[derive(Default)]
pub struct WorkspaceQuery;

#[Object]
impl WorkspaceQuery {
    async fn workspaces(&self, ctx: &Context<'_>) -> Result<Vec<Workspace>> {
        let user = current_user(ctx).await?;
        let rows = workspace::list(ctx.data::<PgPool>()?, user.id)
            .await
            .map_err(to_graphql)?;
        Ok(rows.into_iter().map(Workspace::from).collect())
    }
}

#[derive(Default)]
pub struct WorkspaceMutation;

#[Object]
impl WorkspaceMutation {
    async fn create_workspace(&self, ctx: &Context<'_>, name: String) -> Result<Workspace> {
        let user = current_user(ctx).await?;
        workspace::create(ctx.data::<PgPool>()?, user.id, &name)
            .await
            .map(Workspace::from)
            .map_err(to_graphql)
    }

    async fn rename_workspace(&self, ctx: &Context<'_>, id: ID, name: String) -> Result<Workspace> {
        let user = current_user(ctx).await?;
        workspace::rename(ctx.data::<PgPool>()?, user.id, parse_id(&id)?, &name)
            .await
            .map(Workspace::from)
            .map_err(to_graphql)
    }

    async fn delete_workspace(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        let user = current_user(ctx).await?;
        workspace::delete(ctx.data::<PgPool>()?, user.id, parse_id(&id)?)
            .await
            .map_err(to_graphql)?;
        Ok(true)
    }
}
