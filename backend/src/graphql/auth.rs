use async_graphql::{Context, Error, ErrorExtensions, Result};
use std::sync::Arc;
use tokio::sync::OnceCell;

use crate::service::auth::{AuthClaims, Subject};
use crate::service::db::Db;
use crate::service::db::client::UserDb;
use crate::service::db::schema::tables::users_table::User;
use crate::service::read_service::users::{self, AccountRequired, Provisioning};

/// Request-local authenticated principal. A single GraphQL document can execute
/// many root resolvers, but resolving the token's subject must hit Postgres once.
#[derive(Default)]
pub(crate) struct RequestUser(OnceCell<AuthenticatedUser>);

struct AuthenticatedUser {
    user: User,
    db: UserDb,
}

async fn load_user(ctx: &Context<'_>) -> Result<AuthenticatedUser> {
    let claims = ctx.data::<AuthClaims>()?;
    let db = ctx.data::<Arc<Db>>()?;
    // A context that never states its rule is treated as a connected app: only
    // the web request path may sign users up.
    let provisioning = ctx
        .data_opt::<Provisioning>()
        .copied()
        .unwrap_or(Provisioning::ExistingOnly);
    let user = users::load_user(
        db,
        &Subject::from(claims),
        claims.full_name(),
        claims.email(),
        provisioning,
    )
    .await
    .map_err(|err| {
        if err.is::<AccountRequired>() {
            Error::new(err.to_string()).extend_with(|_, ext| ext.set("code", "ACCOUNT_REQUIRED"))
        } else {
            err.into()
        }
    })?;

    let user_db = db.get_user_db(&user.id);
    Ok(AuthenticatedUser { user, db: user_db })
}

async fn authenticated_user(ctx: &Context<'_>) -> Result<AuthenticatedUser> {
    if let Ok(request_user) = ctx.data::<RequestUser>() {
        let user = request_user.0.get_or_try_init(|| load_user(ctx)).await?;
        return Ok(AuthenticatedUser {
            user: user.user.clone(),
            db: user.db.clone(),
        });
    }

    load_user(ctx).await
}

pub(crate) async fn user_db(ctx: &Context<'_>) -> Result<UserDb> {
    Ok(authenticated_user(ctx).await?.db)
}

pub(crate) async fn current_user(ctx: &Context<'_>) -> Result<User> {
    Ok(authenticated_user(ctx).await?.user)
}

pub(crate) async fn resolve_user(ctx: &Context<'_>) -> Result<(Arc<Db>, String)> {
    let db = ctx.data::<Arc<Db>>()?.clone();
    let user = user_db(ctx).await?;
    Ok((db, user.user_id().to_string()))
}
