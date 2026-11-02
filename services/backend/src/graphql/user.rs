use async_graphql::{Context, Result};
use sqlx::PgPool;
use tokio::sync::OnceCell;

use super::errors::to_graphql;
use crate::{
    auth::AuthClaims,
    users::{self, Provisioning, User},
};

/// The caller's Tradstry user, loaded once per GraphQL request however many
/// resolvers ask for it.
#[derive(Default)]
pub struct RequestUser(OnceCell<User>);

pub async fn current_user(ctx: &Context<'_>) -> Result<User> {
    let load = || async {
        let claims = ctx.data::<AuthClaims>()?;
        let pool = ctx.data::<PgPool>()?;
        users::load_user(
            pool,
            &claims.sub,
            claims.full_name(),
            claims.email(),
            Provisioning::from(claims.kind),
        )
        .await
        .map_err(to_graphql)
    };
    match ctx.data_opt::<RequestUser>() {
        Some(cached) => cached.0.get_or_try_init(load).await.cloned(),
        None => load().await,
    }
}
