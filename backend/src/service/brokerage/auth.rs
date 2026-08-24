use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use sqlx::PgPool;

use super::client::{
    BrokerageClient, ConnectionStatus, SnapTradeAccount, SnapTradeHoldingsResponse,
    SnapTradeTransactionsResponse,
};
use super::db::{decrypt_secret, encrypt_secret};
use crate::service::db::schema::tables::{snaptrade_oauth_table, workspaces_table::Workspace};

#[derive(Debug, Clone)]
pub enum BrokerageAuth {
    Commercial {
        snaptrade_user_id: String,
        user_secret: String,
    },
    OAuth {
        grant_id: String,
        snaptrade_user_id: String,
        access_token: String,
    },
}

impl BrokerageAuth {
    pub fn snaptrade_user_id(&self) -> &str {
        match self {
            Self::Commercial {
                snaptrade_user_id, ..
            }
            | Self::OAuth {
                snaptrade_user_id, ..
            } => snaptrade_user_id,
        }
    }

    pub async fn list_accounts(&self, client: &BrokerageClient) -> Result<Vec<SnapTradeAccount>> {
        match self {
            Self::Commercial {
                snaptrade_user_id,
                user_secret,
            } => {
                client
                    .list_snaptrade_accounts(snaptrade_user_id, user_secret)
                    .await
            }
            Self::OAuth { access_token, .. } => client.list_oauth_accounts(access_token).await,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn fetch_transactions(
        &self,
        client: &BrokerageClient,
        account_id: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        transaction_type: Option<&str>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> Result<SnapTradeTransactionsResponse> {
        match self {
            Self::Commercial {
                snaptrade_user_id,
                user_secret,
            } => {
                client
                    .fetch_transactions(
                        snaptrade_user_id,
                        user_secret,
                        account_id,
                        start_date,
                        end_date,
                        transaction_type,
                        offset,
                        limit,
                    )
                    .await
            }
            Self::OAuth { access_token, .. } => {
                client
                    .fetch_oauth_transactions(
                        access_token,
                        account_id,
                        start_date,
                        end_date,
                        transaction_type,
                        offset,
                        limit,
                    )
                    .await
            }
        }
    }

    pub async fn fetch_holdings(
        &self,
        client: &BrokerageClient,
        account_id: &str,
    ) -> Result<SnapTradeHoldingsResponse> {
        match self {
            Self::Commercial {
                snaptrade_user_id,
                user_secret,
            } => {
                client
                    .fetch_holdings(snaptrade_user_id, user_secret, account_id)
                    .await
            }
            Self::OAuth { access_token, .. } => {
                client.fetch_oauth_holdings(access_token, account_id).await
            }
        }
    }

    pub async fn get_connection(
        &self,
        client: &BrokerageClient,
        connection_id: &str,
    ) -> Result<ConnectionStatus> {
        match self {
            Self::Commercial {
                snaptrade_user_id,
                user_secret,
            } => {
                client
                    .get_connection_status(snaptrade_user_id, user_secret, connection_id)
                    .await
            }
            Self::OAuth { access_token, .. } => {
                client
                    .get_oauth_connection_status(access_token, connection_id)
                    .await
            }
        }
    }
}

pub async fn resolve_workspace_auth(
    pool: &PgPool,
    client: &BrokerageClient,
    workspace: &Workspace,
) -> Result<BrokerageAuth> {
    if workspace.snaptrade_auth_mode == "oauth" {
        let grant_id = workspace
            .snaptrade_oauth_grant_id
            .as_deref()
            .context("OAuth brokerage connection has no grant")?;
        let grant = usable_grant(pool, client, &workspace.user_id, grant_id, false).await?;
        return Ok(BrokerageAuth::OAuth {
            grant_id: grant.id,
            snaptrade_user_id: grant.snaptrade_user_id,
            access_token: decrypt_secret(&grant.access_token_encrypted)?,
        });
    }
    Ok(BrokerageAuth::Commercial {
        snaptrade_user_id: workspace
            .snaptrade_user_id
            .clone()
            .context("Workspace is not registered with SnapTrade")?,
        user_secret: decrypt_secret(
            workspace
                .snaptrade_user_secret_encrypted
                .as_deref()
                .context("Workspace has no SnapTrade secret")?,
        )?,
    })
}

pub async fn resolve_oauth_grant_auth(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    grant_id: &str,
) -> Result<BrokerageAuth> {
    let grant = usable_grant(pool, client, user_id, grant_id, false).await?;
    Ok(BrokerageAuth::OAuth {
        grant_id: grant.id,
        snaptrade_user_id: grant.snaptrade_user_id,
        access_token: decrypt_secret(&grant.access_token_encrypted)?,
    })
}

pub async fn force_refresh_oauth_auth(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    auth: &BrokerageAuth,
) -> Result<BrokerageAuth> {
    let BrokerageAuth::OAuth { grant_id, .. } = auth else {
        return Ok(auth.clone());
    };
    let grant = usable_grant(pool, client, user_id, grant_id, true).await?;
    Ok(BrokerageAuth::OAuth {
        grant_id: grant.id,
        snaptrade_user_id: grant.snaptrade_user_id,
        access_token: decrypt_secret(&grant.access_token_encrypted)?,
    })
}

pub async fn mark_reauthorization_if_needed(
    pool: &PgPool,
    auth: &BrokerageAuth,
    error: &anyhow::Error,
) -> Result<bool> {
    let BrokerageAuth::OAuth { grant_id, .. } = auth else {
        return Ok(false);
    };
    let required = error
        .downcast_ref::<super::client::SnapTradeError>()
        .is_some_and(super::client::SnapTradeError::requires_reauthorization);
    if required {
        snaptrade_oauth_table::set_grant_status(pool, grant_id, "reauthorization_required").await?;
    }
    Ok(required)
}

pub async fn list_accounts_with_oauth_retry(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    auth: &BrokerageAuth,
) -> Result<Vec<SnapTradeAccount>> {
    match auth.list_accounts(client).await {
        Ok(accounts) => Ok(accounts),
        Err(first_error)
            if matches!(auth, BrokerageAuth::OAuth { .. })
                && first_error
                    .downcast_ref::<super::client::SnapTradeError>()
                    .is_some_and(super::client::SnapTradeError::requires_reauthorization) =>
        {
            let refreshed = force_refresh_oauth_auth(pool, client, user_id, auth).await?;
            match refreshed.list_accounts(client).await {
                Ok(accounts) => Ok(accounts),
                Err(second_error) => {
                    mark_reauthorization_if_needed(pool, &refreshed, &second_error).await?;
                    Err(second_error)
                }
            }
        }
        Err(error) => Err(error),
    }
}

async fn usable_grant(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    grant_id: &str,
    force_refresh: bool,
) -> Result<snaptrade_oauth_table::OAuthGrant> {
    let grant = snaptrade_oauth_table::find_grant(pool, user_id, grant_id)
        .await?
        .context("SnapTrade OAuth grant not found")?;
    anyhow::ensure!(
        grant.status == "active",
        "SnapTrade authorization needs reconnecting"
    );
    if !force_refresh && grant.access_token_expires_at > Utc::now() + Duration::minutes(5) {
        return Ok(grant);
    }

    let mut lock_connection = pool.acquire().await?;
    sqlx::query("SELECT pg_advisory_lock(hashtextextended($1,0))")
        .bind(grant_id)
        .execute(&mut *lock_connection)
        .await?;
    let refreshed = async {
        let current = snaptrade_oauth_table::find_grant(pool, user_id, grant_id)
            .await?
            .context("SnapTrade OAuth grant not found after refresh lock")?;
        if !force_refresh && current.access_token_expires_at > Utc::now() + Duration::minutes(5) {
            return Ok(current);
        }
        let refresh_token = decrypt_secret(&current.refresh_token_encrypted)?;
        let tokens = match client.refresh_oauth_token(&refresh_token).await {
            Ok(tokens) => tokens,
            Err(error) => {
                if error
                    .downcast_ref::<super::client::SnapTradeError>()
                    .is_some_and(super::client::SnapTradeError::requires_reauthorization)
                {
                    snaptrade_oauth_table::set_grant_status(
                        pool,
                        grant_id,
                        "reauthorization_required",
                    )
                    .await?;
                }
                return Err(error);
            }
        };
        let scopes = if tokens.scopes.is_empty() {
            current.scopes.clone()
        } else {
            tokens.scopes
        };
        snaptrade_oauth_table::replace_tokens(
            pool,
            grant_id,
            &encrypt_secret(&tokens.access_token)?,
            &encrypt_secret(&tokens.refresh_token)?,
            Utc::now() + Duration::seconds(tokens.expires_in),
            &scopes,
        )
        .await?;
        snaptrade_oauth_table::find_grant(pool, user_id, grant_id)
            .await?
            .context("SnapTrade OAuth grant disappeared after refresh")
    }
    .await;
    let unlock_result = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1,0))")
        .bind(grant_id)
        .execute(&mut *lock_connection)
        .await;
    if let Err(error) = unlock_result {
        log::warn!("failed to release SnapTrade OAuth refresh lock for grant {grant_id}: {error}");
    }
    refreshed
}
