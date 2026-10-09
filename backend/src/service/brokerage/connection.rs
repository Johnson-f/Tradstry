use anyhow::Result;
use sqlx::PgPool;

use crate::service::brokerage::client::{BrokerageClient, SnapTradeError};
use crate::service::brokerage::db::decrypt_secret;
use crate::service::db::schema::tables::workspaces_table::Workspace;

/// A commercial SnapTrade connection to remove upstream.
#[derive(Debug, PartialEq, Eq)]
pub struct UpstreamConnection<'a> {
    pub snaptrade_user_id: &'a str,
    pub user_secret_encrypted: &'a str,
    pub connection_id: &'a str,
}

/// The SnapTrade connection to remove upstream when `workspace` stops using it.
/// None when it has no commercial connection, or another of the user's
/// workspaces still uses that connection. OAuth workspaces share the user's
/// grant, which only an explicit revocation ends, so they never have one.
pub async fn connection_to_release<'a>(
    pool: &PgPool,
    user_id: &str,
    workspace: &'a Workspace,
) -> Result<Option<UpstreamConnection<'a>>> {
    let (Some(snaptrade_user_id), Some(user_secret_encrypted), Some(connection_id)) = (
        workspace.snaptrade_user_id.as_deref(),
        workspace.snaptrade_user_secret_encrypted.as_deref(),
        workspace.snaptrade_connection_id.as_deref(),
    ) else {
        return Ok(None);
    };

    let other_references: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM brokerage_connections \
         WHERE user_id = $1 AND snaptrade_connection_id = $2 AND workspace_id <> $3",
    )
    .bind(user_id)
    .bind(connection_id)
    .bind(&workspace.id)
    .fetch_one(pool)
    .await?;
    Ok((other_references == 0).then_some(UpstreamConnection {
        snaptrade_user_id,
        user_secret_encrypted,
        connection_id,
    }))
}

/// Remove a workspace's SnapTrade connection upstream when no other workspace
/// uses it. See [`connection_to_release`].
pub async fn release_snaptrade_connection(
    pool: &PgPool,
    brokerage: &BrokerageClient,
    user_id: &str,
    workspace: &Workspace,
) -> Result<()> {
    let Some(connection) = connection_to_release(pool, user_id, workspace).await? else {
        return Ok(());
    };
    match brokerage
        .delete_connection(
            connection.snaptrade_user_id,
            &decrypt_secret(connection.user_secret_encrypted)?,
            connection.connection_id,
        )
        .await
    {
        Ok(()) => Ok(()),
        Err(error) if is_not_found(&error) => Ok(()),
        Err(error) => Err(error
            .context("Failed to disconnect the brokerage at SnapTrade, so nothing was changed")),
    }
}

/// SnapTrade answers 404 for a connection that is already gone, which is the
/// outcome a release wants.
fn is_not_found(error: &anyhow::Error) -> bool {
    matches!(
        error.downcast_ref::<SnapTradeError>(),
        Some(SnapTradeError::Upstream { status: 404, .. })
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn upstream(status: u16) -> anyhow::Error {
        anyhow::anyhow!(SnapTradeError::Upstream {
            code: "SNAPTRADE_REJECTED".into(),
            message: "rejected".into(),
            retryable: false,
            status,
            upstream_code: None,
        })
    }

    #[test]
    fn only_a_missing_connection_counts_as_released() {
        assert!(is_not_found(&upstream(404)));
        assert!(!is_not_found(&upstream(500)));
        assert!(!is_not_found(&upstream(401)));
        assert!(!is_not_found(&anyhow::anyhow!(
            SnapTradeError::StaleCredentials
        )));
        assert!(!is_not_found(&anyhow::anyhow!("network down")));
    }
}
