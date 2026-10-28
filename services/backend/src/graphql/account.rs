use std::sync::Arc;

use async_graphql::{Context, Error, Object, Result, SimpleObject};
use chrono::{DateTime, Duration, Utc};
use sqlx::PgPool;
use tracing::error;

use super::errors::{coded, to_graphql};
use super::user::current_user;
use crate::auth::stytch::{Session, StytchApi, StytchError};
use crate::auth::{AuthClaims, StytchSession, TokenKind};
use crate::brokerage::Brokerage;
use crate::users::account;

const REAUTH_WINDOW_MINUTES: i64 = 5;

#[derive(SimpleObject)]
pub struct AuthSession {
    id: String,
    started_at: Option<String>,
    last_accessed_at: Option<String>,
    expires_at: Option<String>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    /// The session making this request.
    current: bool,
}

impl AuthSession {
    fn new(session: Session, current_id: &str) -> Self {
        let rfc3339 = |at: Option<DateTime<Utc>>| at.map(|at| at.to_rfc3339());
        Self {
            current: session.session_id == current_id,
            id: session.session_id,
            started_at: rfc3339(session.started_at),
            last_accessed_at: rfc3339(session.last_accessed_at),
            expires_at: rfc3339(session.expires_at),
            ip_address: session.ip_address,
            user_agent: session.user_agent,
        }
    }
}

struct StytchCaller<'a> {
    claims: &'a AuthClaims,
    session: StytchSession,
    stytch: &'a dyn StytchApi,
}

/// Account management acts on the caller's Stytch user, so it needs a Stytch
/// web session. Connected-app tokens, which carry no session, are refused.
fn stytch_caller<'a>(ctx: &Context<'a>) -> Result<StytchCaller<'a>> {
    let claims = ctx.data::<AuthClaims>()?;
    let session = (claims.kind == TokenKind::Session)
        .then(|| claims.stytch_session())
        .flatten()
        .ok_or_else(|| {
            coded(
                "A Tradstry web session is required for this action",
                "SESSION_REQUIRED",
            )
        })?;
    let stytch = ctx.data::<Arc<dyn StytchApi>>()?.as_ref();
    Ok(StytchCaller {
        claims,
        session,
        stytch,
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
            .stytch
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
    /// Signs out one of the caller's sessions. Signing out another device
    /// needs a sign-in within the last five minutes; the current one does not.
    async fn revoke_auth_session(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let caller = stytch_caller(ctx)?;
        let is_current = id == caller.session.id;
        let window = Duration::minutes(REAUTH_WINDOW_MINUTES);
        if !is_current && !caller.session.authenticated_within(window, Utc::now()) {
            return Err(coded(
                "Sign in again to sign out other devices",
                "REAUTH_REQUIRED",
            ));
        }

        let sessions = caller
            .stytch
            .list_sessions(&caller.claims.sub)
            .await
            .map_err(provider_error)?;
        if !sessions.iter().any(|session| session.session_id == id) {
            return Err(coded("Session not found", "NOT_FOUND"));
        }
        caller
            .stytch
            .revoke_session(&id)
            .await
            .map_err(provider_error)?;
        Ok(true)
    }

    /// Permanently deletes the caller's account and data. Needs a sign-in
    /// within the last five minutes.
    async fn delete_account(&self, ctx: &Context<'_>) -> Result<bool> {
        let caller = stytch_caller(ctx)?;
        let window = Duration::minutes(REAUTH_WINDOW_MINUTES);
        if !caller.session.authenticated_within(window, Utc::now()) {
            return Err(coded(
                "Sign in again to delete your account",
                "REAUTH_REQUIRED",
            ));
        }
        let user = current_user(ctx).await?;
        caller
            .stytch
            .delete_user(&caller.claims.sub)
            .await
            .map_err(provider_error)?;
        account::purge(
            ctx.data::<PgPool>()?,
            ctx.data_opt::<Arc<Brokerage>>().map(|b| b.as_ref()),
            &user,
        )
        .await
        .map_err(to_graphql)?;
        Ok(true)
    }
}
