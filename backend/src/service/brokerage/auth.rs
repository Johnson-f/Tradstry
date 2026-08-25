use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use sqlx::PgPool;
use std::future::Future;

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

pub struct BrokerageAuthSession<'a> {
    pool: &'a PgPool,
    client: &'a BrokerageClient,
    user_id: &'a str,
    auth: BrokerageAuth,
}

impl<'a> BrokerageAuthSession<'a> {
    pub fn new(
        pool: &'a PgPool,
        client: &'a BrokerageClient,
        user_id: &'a str,
        auth: BrokerageAuth,
    ) -> Self {
        Self {
            pool,
            client,
            user_id,
            auth,
        }
    }

    pub fn snaptrade_user_id(&self) -> &str {
        self.auth.snaptrade_user_id()
    }

    pub fn commercial_secret(&self) -> Option<&str> {
        match &self.auth {
            BrokerageAuth::Commercial { user_secret, .. } => Some(user_secret),
            BrokerageAuth::OAuth { .. } => None,
        }
    }

    pub fn fork(&self) -> Self {
        Self::new(self.pool, self.client, self.user_id, self.auth.clone())
    }

    pub async fn list_accounts(&mut self) -> Result<Vec<SnapTradeAccount>> {
        let pool = self.pool;
        let client = self.client;
        let user_id = self.user_id;
        run_with_oauth_retry(
            &mut self.auth,
            move |auth| async move { auth.list_accounts(client).await },
            move |auth| async move { force_refresh_oauth_auth(pool, client, user_id, &auth).await },
            move |auth| async move { mark_oauth_reauthorization_required(pool, &auth).await },
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn fetch_transactions(
        &mut self,
        account_id: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        transaction_type: Option<&str>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> Result<SnapTradeTransactionsResponse> {
        let pool = self.pool;
        let client = self.client;
        let user_id = self.user_id;
        run_with_oauth_retry(
            &mut self.auth,
            move |auth| async move {
                auth.fetch_transactions(
                    client,
                    account_id,
                    start_date,
                    end_date,
                    transaction_type,
                    offset,
                    limit,
                )
                .await
            },
            move |auth| async move { force_refresh_oauth_auth(pool, client, user_id, &auth).await },
            move |auth| async move { mark_oauth_reauthorization_required(pool, &auth).await },
        )
        .await
    }

    pub async fn fetch_holdings(&mut self, account_id: &str) -> Result<SnapTradeHoldingsResponse> {
        let pool = self.pool;
        let client = self.client;
        let user_id = self.user_id;
        run_with_oauth_retry(
            &mut self.auth,
            move |auth| async move { auth.fetch_holdings(client, account_id).await },
            move |auth| async move { force_refresh_oauth_auth(pool, client, user_id, &auth).await },
            move |auth| async move { mark_oauth_reauthorization_required(pool, &auth).await },
        )
        .await
    }

    pub async fn get_connection(&mut self, connection_id: &str) -> Result<ConnectionStatus> {
        let pool = self.pool;
        let client = self.client;
        let user_id = self.user_id;
        run_with_oauth_retry(
            &mut self.auth,
            move |auth| async move { auth.get_connection(client, connection_id).await },
            move |auth| async move { force_refresh_oauth_auth(pool, client, user_id, &auth).await },
            move |auth| async move { mark_oauth_reauthorization_required(pool, &auth).await },
        )
        .await
    }
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
        let grant = usable_grant(pool, client, &workspace.user_id, grant_id, None).await?;
        return Ok(BrokerageAuth::OAuth {
            grant_id: grant.id,
            snaptrade_user_id: grant.snaptrade_user_id,
            access_token: decrypt_secret(
                grant
                    .access_token_encrypted
                    .as_deref()
                    .context("SnapTrade authorization needs reconnecting")?,
            )?,
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

pub async fn resolve_workspace_session<'a>(
    pool: &'a PgPool,
    client: &'a BrokerageClient,
    workspace: &'a Workspace,
) -> Result<BrokerageAuthSession<'a>> {
    let auth = resolve_workspace_auth(pool, client, workspace).await?;
    Ok(BrokerageAuthSession::new(
        pool,
        client,
        &workspace.user_id,
        auth,
    ))
}

pub async fn resolve_oauth_grant_auth(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    grant_id: &str,
) -> Result<BrokerageAuth> {
    let grant = usable_grant(pool, client, user_id, grant_id, None).await?;
    Ok(BrokerageAuth::OAuth {
        grant_id: grant.id,
        snaptrade_user_id: grant.snaptrade_user_id,
        access_token: decrypt_secret(
            grant
                .access_token_encrypted
                .as_deref()
                .context("SnapTrade authorization needs reconnecting")?,
        )?,
    })
}

pub async fn resolve_oauth_grant_session<'a>(
    pool: &'a PgPool,
    client: &'a BrokerageClient,
    user_id: &'a str,
    grant_id: &str,
) -> Result<BrokerageAuthSession<'a>> {
    let auth = resolve_oauth_grant_auth(pool, client, user_id, grant_id).await?;
    Ok(BrokerageAuthSession::new(pool, client, user_id, auth))
}

pub async fn force_refresh_oauth_auth(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    auth: &BrokerageAuth,
) -> Result<BrokerageAuth> {
    let BrokerageAuth::OAuth {
        grant_id,
        access_token,
        ..
    } = auth
    else {
        return Ok(auth.clone());
    };
    let grant = usable_grant(pool, client, user_id, grant_id, Some(access_token)).await?;
    Ok(BrokerageAuth::OAuth {
        grant_id: grant.id,
        snaptrade_user_id: grant.snaptrade_user_id,
        access_token: decrypt_secret(
            grant
                .access_token_encrypted
                .as_deref()
                .context("SnapTrade authorization needs reconnecting")?,
        )?,
    })
}

async fn mark_oauth_reauthorization_required(pool: &PgPool, auth: &BrokerageAuth) -> Result<()> {
    if let BrokerageAuth::OAuth { grant_id, .. } = auth {
        snaptrade_oauth_table::clear_grant_credentials(pool, grant_id, "reauthorization_required")
            .await?;
    }
    Ok(())
}

async fn run_with_oauth_retry<
    T,
    Operation,
    OperationFuture,
    Refresh,
    RefreshFuture,
    Terminal,
    TerminalFuture,
>(
    auth: &mut BrokerageAuth,
    mut operation: Operation,
    mut refresh: Refresh,
    mut terminal: Terminal,
) -> Result<T>
where
    Operation: FnMut(BrokerageAuth) -> OperationFuture,
    OperationFuture: Future<Output = Result<T>>,
    Refresh: FnMut(BrokerageAuth) -> RefreshFuture,
    RefreshFuture: Future<Output = Result<BrokerageAuth>>,
    Terminal: FnMut(BrokerageAuth) -> TerminalFuture,
    TerminalFuture: Future<Output = Result<()>>,
{
    match operation(auth.clone()).await {
        Ok(value) => Ok(value),
        Err(first_error) if is_refreshable_oauth_error(auth, &first_error) => {
            *auth = refresh(auth.clone()).await?;
            match operation(auth.clone()).await {
                Ok(value) => Ok(value),
                Err(second_error) => {
                    if is_refreshable_oauth_error(auth, &second_error) {
                        terminal(auth.clone()).await?;
                    }
                    Err(second_error)
                }
            }
        }
        Err(error) => Err(error),
    }
}

fn is_refreshable_oauth_error(auth: &BrokerageAuth, error: &anyhow::Error) -> bool {
    matches!(auth, BrokerageAuth::OAuth { .. })
        && error
            .downcast_ref::<super::client::SnapTradeError>()
            .is_some_and(super::client::SnapTradeError::is_oauth_authentication_failure)
}

async fn usable_grant(
    pool: &PgPool,
    client: &BrokerageClient,
    user_id: &str,
    grant_id: &str,
    rejected_access_token: Option<&str>,
) -> Result<snaptrade_oauth_table::OAuthGrant> {
    let grant = snaptrade_oauth_table::find_grant(pool, user_id, grant_id)
        .await?
        .context("SnapTrade OAuth grant not found")?;
    anyhow::ensure!(
        grant.status == "active",
        "SnapTrade authorization needs reconnecting"
    );
    if rejected_access_token.is_none()
        && grant
            .access_token_expires_at
            .is_some_and(|expires_at| expires_at > Utc::now() + Duration::minutes(5))
    {
        return Ok(grant);
    }

    let mut transaction = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(grant_id)
        .execute(&mut *transaction)
        .await?;
    let current = snaptrade_oauth_table::find_grant_on(&mut transaction, user_id, grant_id)
        .await?
        .context("SnapTrade OAuth grant not found after refresh lock")?;
    anyhow::ensure!(
        current.status == "active",
        "SnapTrade authorization needs reconnecting"
    );
    let current_access_token = match current.access_token_encrypted.as_deref() {
        Some(encrypted) => match decrypt_secret(encrypted) {
            Ok(token) => token,
            Err(error) => {
                snaptrade_oauth_table::clear_grant_credentials_on(
                    &mut transaction,
                    grant_id,
                    "reauthorization_required",
                )
                .await?;
                transaction.commit().await?;
                return Err(error);
            }
        },
        None => {
            transaction.rollback().await?;
            anyhow::bail!("SnapTrade authorization needs reconnecting");
        }
    };
    let another_caller_refreshed =
        rejected_access_token.is_some_and(|rejected| rejected != current_access_token.as_str());
    let still_fresh = rejected_access_token.is_none()
        && current
            .access_token_expires_at
            .is_some_and(|expires_at| expires_at > Utc::now() + Duration::minutes(5));
    if another_caller_refreshed || still_fresh {
        transaction.commit().await?;
        return Ok(current);
    }
    let refresh_token = match current.refresh_token_encrypted.as_deref() {
        Some(encrypted) => match decrypt_secret(encrypted) {
            Ok(token) => token,
            Err(error) => {
                snaptrade_oauth_table::clear_grant_credentials_on(
                    &mut transaction,
                    grant_id,
                    "reauthorization_required",
                )
                .await?;
                transaction.commit().await?;
                return Err(error);
            }
        },
        None => {
            transaction.rollback().await?;
            anyhow::bail!("SnapTrade authorization needs reconnecting");
        }
    };
    let tokens = match client.refresh_oauth_token(&refresh_token).await {
        Ok(tokens) => tokens,
        Err(error) => {
            let terminal = error
                .downcast_ref::<super::client::SnapTradeError>()
                .is_some_and(super::client::SnapTradeError::is_terminal_oauth_refresh_failure);
            if terminal {
                snaptrade_oauth_table::clear_grant_credentials_on(
                    &mut transaction,
                    grant_id,
                    "reauthorization_required",
                )
                .await?;
                transaction.commit().await?;
            } else {
                transaction.rollback().await?;
            }
            return Err(error);
        }
    };
    let scopes = if tokens.scopes.is_empty() {
        current.scopes.clone()
    } else {
        tokens.scopes
    };
    let encrypted_access = encrypt_secret(&tokens.access_token);
    let encrypted_refresh = encrypt_secret(&tokens.refresh_token);
    let (encrypted_access, encrypted_refresh) = match (encrypted_access, encrypted_refresh) {
        (Ok(access), Ok(refresh)) => (access, refresh),
        (Err(error), _) | (_, Err(error)) => {
            snaptrade_oauth_table::clear_grant_credentials_on(
                &mut transaction,
                grant_id,
                "reauthorization_required",
            )
            .await?;
            transaction.commit().await?;
            return Err(error);
        }
    };
    snaptrade_oauth_table::replace_tokens_on(
        &mut transaction,
        grant_id,
        &encrypted_access,
        &encrypted_refresh,
        Utc::now() + Duration::seconds(tokens.expires_in),
        &scopes,
    )
    .await?;
    transaction.commit().await?;
    snaptrade_oauth_table::find_grant(pool, user_id, grant_id)
        .await?
        .context("SnapTrade OAuth grant disappeared after refresh")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn oauth_auth(token: &str) -> BrokerageAuth {
        BrokerageAuth::OAuth {
            grant_id: "grant".into(),
            snaptrade_user_id: "personal-user".into(),
            access_token: token.into(),
        }
    }

    fn upstream(status: u16) -> anyhow::Error {
        super::super::client::SnapTradeError::Upstream {
            code: "SNAPTRADE_REJECTED".into(),
            message: "rejected".into(),
            retryable: false,
            status,
            upstream_code: None,
        }
        .into()
    }

    #[tokio::test]
    async fn refreshes_once_and_retries_with_the_new_access_token() {
        let refreshes = Arc::new(AtomicUsize::new(0));
        let terminal = Arc::new(AtomicUsize::new(0));
        let mut auth = oauth_auth("old");

        let result = run_with_oauth_retry(
            &mut auth,
            |auth| async move {
                match auth {
                    BrokerageAuth::OAuth { access_token, .. } if access_token == "new" => Ok(42),
                    _ => Err(upstream(401)),
                }
            },
            {
                let refreshes = Arc::clone(&refreshes);
                move |_| {
                    let refreshes = Arc::clone(&refreshes);
                    async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Ok(oauth_auth("new"))
                    }
                }
            },
            {
                let terminal = Arc::clone(&terminal);
                move |_| {
                    let terminal = Arc::clone(&terminal);
                    async move {
                        terminal.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                }
            },
        )
        .await
        .unwrap();

        assert_eq!(result, 42);
        assert_eq!(refreshes.load(Ordering::SeqCst), 1);
        assert_eq!(terminal.load(Ordering::SeqCst), 0);
        assert!(matches!(auth, BrokerageAuth::OAuth { access_token, .. } if access_token == "new"));
    }

    #[tokio::test]
    async fn ordinary_bad_requests_do_not_refresh_or_disable_oauth() {
        let refreshes = Arc::new(AtomicUsize::new(0));
        let terminal = Arc::new(AtomicUsize::new(0));
        let mut auth = oauth_auth("old");

        let error = run_with_oauth_retry(
            &mut auth,
            |_| async { Err::<(), _>(upstream(400)) },
            {
                let refreshes = Arc::clone(&refreshes);
                move |auth| {
                    let refreshes = Arc::clone(&refreshes);
                    async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Ok(auth)
                    }
                }
            },
            {
                let terminal = Arc::clone(&terminal);
                move |_| {
                    let terminal = Arc::clone(&terminal);
                    async move {
                        terminal.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                }
            },
        )
        .await
        .unwrap_err();

        assert!(
            error
                .downcast_ref::<super::super::client::SnapTradeError>()
                .is_some()
        );
        assert_eq!(refreshes.load(Ordering::SeqCst), 0);
        assert_eq!(terminal.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_second_unauthorized_response_marks_the_refreshed_grant_terminal() {
        let terminal = Arc::new(AtomicUsize::new(0));
        let mut auth = oauth_auth("old");

        let _ = run_with_oauth_retry(
            &mut auth,
            |_| async { Err::<(), _>(upstream(401)) },
            |_| async { Ok(oauth_auth("new")) },
            {
                let terminal = Arc::clone(&terminal);
                move |_| {
                    let terminal = Arc::clone(&terminal);
                    async move {
                        terminal.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    }
                }
            },
        )
        .await;

        assert_eq!(terminal.load(Ordering::SeqCst), 1);
    }
}
