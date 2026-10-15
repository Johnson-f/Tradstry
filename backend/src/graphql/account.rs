use std::sync::Arc;

use async_graphql::{Context, Error, ErrorExtensions, Object, Result, SimpleObject};
use chrono::{Duration, Utc};
use tracing::error;

use crate::graphql::auth::current_user;
use crate::service::auth::{AuthClaims, StytchSession, TokenKind};
use crate::service::db::Db;
use crate::service::stytch::{Session, StytchClient, StytchError};
use crate::service::upload::r2::R2Client;
use crate::service::users::purge::purge_user;

const REAUTH_WINDOW_MINUTES: i64 = 5;

#[derive(SimpleObject)]
pub struct AuthSession {
    id: String,
    started_at: String,
    last_accessed_at: String,
    expires_at: Option<String>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    current: bool,
}

impl AuthSession {
    fn new(session: Session, current_id: &str) -> Self {
        let present = |value: String| Some(value).filter(|value| !value.is_empty());
        Self {
            current: session.session_id == current_id,
            id: session.session_id,
            started_at: session.started_at,
            last_accessed_at: session.last_accessed_at,
            expires_at: session.expires_at,
            ip_address: present(session.attributes.ip_address),
            user_agent: present(session.attributes.user_agent),
        }
    }
}

struct StytchCaller<'a> {
    claims: &'a AuthClaims,
    session: StytchSession,
    client: &'a StytchClient,
}

/// Account management acts on the caller's Stytch user, so it needs a Stytch web
/// session. Connected-app tokens, which carry no session, are refused.
fn stytch_caller<'a>(ctx: &Context<'a>) -> Result<StytchCaller<'a>> {
    let claims = ctx.data::<AuthClaims>()?;
    let session = (claims.kind == TokenKind::Session)
        .then(|| claims.stytch_session())
        .flatten()
        .ok_or_else(|| {
            Error::new("A Tradstry web session is required for this action")
                .extend_with(|_, ext| ext.set("code", "SESSION_REQUIRED"))
        })?;
    let client = ctx
        .data_opt::<Arc<StytchClient>>()
        .map(Arc::as_ref)
        .ok_or_else(|| Error::new("Stytch is not configured on this server"))?;
    Ok(StytchCaller {
        claims,
        session,
        client,
    })
}

fn provider_error(error: StytchError) -> Error {
    error!(%error, "stytch request failed");
    Error::new("The sign-in provider request failed. Try again.")
}

#[derive(Default)]
pub struct AccountQuery;

#[Object]
impl AccountQuery {
    /// Active sign-in sessions for the caller.
    async fn auth_sessions(&self, ctx: &Context<'_>) -> Result<Vec<AuthSession>> {
        let caller = stytch_caller(ctx)?;
        let sessions = caller
            .client
            .list_sessions(&caller.claims.sub)
            .await
            .map_err(provider_error)?;
        Ok(sessions
            .into_iter()
            .map(|session| AuthSession::new(session, &caller.session.id))
            .collect())
    }
}

#[derive(Default)]
pub struct AccountMutation;

#[Object]
impl AccountMutation {
    /// Signs out one of the caller's sessions.
    async fn revoke_auth_session(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let caller = stytch_caller(ctx)?;
        let sessions = caller
            .client
            .list_sessions(&caller.claims.sub)
            .await
            .map_err(provider_error)?;
        if !sessions.iter().any(|session| session.session_id == id) {
            return Err(
                Error::new("Session not found").extend_with(|_, ext| ext.set("code", "NOT_FOUND"))
            );
        }
        caller
            .client
            .revoke_session(&id)
            .await
            .map_err(provider_error)?;
        Ok(true)
    }

    /// Permanently deletes the caller's account and data. Needs a sign-in within
    /// the last five minutes.
    async fn delete_account(&self, ctx: &Context<'_>) -> Result<bool> {
        let caller = stytch_caller(ctx)?;
        let window = Duration::minutes(REAUTH_WINDOW_MINUTES);
        if !caller.session.authenticated_within(window, Utc::now()) {
            return Err(Error::new("Sign in again to delete your account")
                .extend_with(|_, ext| ext.set("code", "REAUTH_REQUIRED")));
        }

        let user = current_user(ctx).await?;
        match caller.client.delete_user(&caller.claims.sub).await {
            Ok(()) => {}
            Err(error) if error.is_not_found() => {}
            Err(error) => return Err(provider_error(error)),
        }

        let db = ctx.data::<Arc<Db>>()?;
        let r2 = ctx.data::<Arc<R2Client>>()?;
        purge_user(db.connection(), r2, &user.id)
            .await
            .map_err(|error| {
                error!(%error, user_id = %user.id, "failed to purge a deleted account");
                Error::new(
                    "Your sign-in was deleted but removing your data failed. Contact support.",
                )
            })?;
        Ok(true)
    }
}
