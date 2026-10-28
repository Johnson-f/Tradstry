//! Removing a Tradstry account and everything tied to it.

use anyhow::Result;
use sqlx::PgPool;
use tracing::info;

use super::User;
use crate::brokerage::Brokerage;

/// Removes the user's SnapTrade access and registration, then deletes their
/// rows; foreign keys cascade to everything they own. SnapTrade cleanup is
/// best effort and never blocks the local deletion.
pub async fn purge(pool: &PgPool, brokerage: Option<&Brokerage>, user: &User) -> Result<()> {
    if let Some(brokerage) = brokerage {
        brokerage.cleanup_user(user.id).await;
    }
    super::delete(pool, user.id).await?;
    info!(user_id = %user.id, "purged a Tradstry account");
    Ok(())
}
