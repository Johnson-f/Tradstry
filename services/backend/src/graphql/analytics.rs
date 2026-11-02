use async_graphql::{Context, ID, Object, Result};
use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::{errors::to_graphql, trades::trade_error, user::current_user, workspaces::parse_id};
use crate::{
    analytics::{self, Stats},
    trades::service,
};

#[derive(Default)]
pub struct AnalyticsQuery;

#[Object]
impl AnalyticsQuery {
    /// Statistics over trades closed in the window: one workspace, or all of
    /// them when `workspaceId` is null.
    async fn trade_stats(
        &self,
        ctx: &Context<'_>,
        workspace_id: Option<ID>,
        from: Option<DateTime<Utc>>,
        to: Option<DateTime<Utc>>,
    ) -> Result<Stats> {
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        let workspace = match workspace_id {
            Some(id) => {
                let id = parse_id(&id)?;
                service::owns_workspace(pool, user.id, id)
                    .await
                    .map_err(trade_error)?;
                Some(id)
            }
            None => None,
        };
        analytics::stats(pool, user.id, workspace, from, to)
            .await
            .map_err(to_graphql)
    }
}
