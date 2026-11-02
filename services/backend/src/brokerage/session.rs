//! One way to call SnapTrade for a user, whichever credentials they linked
//! with. OAuth tokens are refreshed shortly before expiry and once after an
//! authentication failure; a refresh that cannot succeed clears the grant's
//! tokens so nothing keeps using them.

use std::{future::Future, sync::Arc};

use chrono::{Duration, Utc};
use tracing::warn;
use uuid::Uuid;

use super::{Brokerage, store};
use crate::snaptrade::{Credentials, SnapTradeClient, SnapTradeError};

const REFRESH_BEFORE_EXPIRY_MINUTES: i64 = 5;

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    /// The OAuth grant can no longer be used; the user must authorize again.
    #[error("SnapTrade access needs to be authorized again")]
    ReauthorizationRequired,
    /// SnapTrade no longer recognises the stored Commercial credentials.
    #[error("the stored SnapTrade credentials are no longer valid")]
    StaleCredentials,
    #[error(transparent)]
    SnapTrade(#[from] SnapTradeError),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

#[derive(Clone)]
pub enum Auth {
    Commercial {
        user_id: String,
        user_secret: String,
    },
    OAuth {
        grant_id: Uuid,
        access_token: String,
    },
}

impl std::fmt::Debug for Auth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Commercial { user_id, .. } => write!(f, "Commercial({user_id})"),
            Self::OAuth { grant_id, .. } => write!(f, "OAuth({grant_id})"),
        }
    }
}

impl Auth {
    pub fn credentials(&self) -> Credentials<'_> {
        match self {
            Self::Commercial {
                user_id,
                user_secret,
            } => Credentials::Commercial {
                user_id,
                user_secret,
            },
            Self::OAuth { access_token, .. } => Credentials::Bearer(access_token),
        }
    }
}

pub struct Session<'a> {
    brokerage: &'a Brokerage,
    auth: Auth,
}

impl Brokerage {
    /// The user's Commercial credentials, if Tradstry registered them with SnapTrade.
    pub async fn commercial_auth(&self, user_id: Uuid) -> Result<Option<Auth>, SessionError> {
        let Some(registration) = store::registration(&self.pool, user_id).await? else {
            return Ok(None);
        };
        Ok(Some(Auth::Commercial {
            user_secret: self.secrets.decrypt(&registration.user_secret_encrypted)?,
            user_id: registration.snaptrade_user_id,
        }))
    }

    /// Usable OAuth credentials for a grant, refreshed first if they expire soon.
    pub async fn oauth_auth(&self, grant_id: Uuid) -> Result<Auth, SessionError> {
        let grant = store::grant(&self.pool, grant_id)
            .await?
            .ok_or(SessionError::ReauthorizationRequired)?;
        let (Some(encrypted), Some(expires_at)) =
            (&grant.access_token_encrypted, grant.access_token_expires_at)
        else {
            return Err(SessionError::ReauthorizationRequired);
        };
        if !grant.is_active() {
            return Err(SessionError::ReauthorizationRequired);
        }
        if expires_at > Utc::now() + Duration::minutes(REFRESH_BEFORE_EXPIRY_MINUTES) {
            return Ok(Auth::OAuth {
                grant_id,
                access_token: self.secrets.decrypt(encrypted)?,
            });
        }
        self.refresh_grant(grant_id, None).await
    }

    pub async fn session_for_connection(
        &self,
        connection: &store::Connection,
    ) -> Result<Session<'_>, SessionError> {
        let auth = match connection.oauth_grant_id {
            Some(grant_id) => self.oauth_auth(grant_id).await?,
            None => self
                .commercial_auth(connection.user_id)
                .await?
                .ok_or(SessionError::StaleCredentials)?,
        };
        Ok(self.session(auth))
    }

    pub fn session(&self, auth: Auth) -> Session<'_> {
        Session {
            brokerage: self,
            auth,
        }
    }

    /// Refreshes a grant's tokens under its lock. `rejected` is the access token
    /// SnapTrade just refused; if another caller already replaced it, their
    /// token is used and no second refresh happens.
    async fn refresh_grant(
        &self,
        grant_id: Uuid,
        rejected: Option<&str>,
    ) -> Result<Auth, SessionError> {
        let mut tx = self.pool.begin().await.map_err(anyhow::Error::from)?;
        store::lock_grant(&mut tx, grant_id).await?;
        let grant = store::grant(&mut *tx, grant_id)
            .await?
            .filter(store::Grant::is_active)
            .ok_or(SessionError::ReauthorizationRequired)?;
        let (Some(access), Some(refresh), Some(expires_at)) = (
            &grant.access_token_encrypted,
            &grant.refresh_token_encrypted,
            grant.access_token_expires_at,
        ) else {
            return Err(SessionError::ReauthorizationRequired);
        };

        let current = match self.secrets.decrypt(access) {
            Ok(token) => token,
            Err(error) => return self.give_up(tx, grant_id, error).await,
        };
        let already_refreshed = match rejected {
            Some(rejected) => current != rejected,
            None => expires_at > Utc::now() + Duration::minutes(REFRESH_BEFORE_EXPIRY_MINUTES),
        };
        if already_refreshed {
            tx.commit().await.map_err(anyhow::Error::from)?;
            return Ok(Auth::OAuth {
                grant_id,
                access_token: current,
            });
        }

        let refresh_token = match self.secrets.decrypt(refresh) {
            Ok(token) => token,
            Err(error) => return self.give_up(tx, grant_id, error).await,
        };
        match self.client.refresh_token(&refresh_token).await {
            Ok(tokens)
                if tokens.personal_user_id.is_empty()
                    || tokens.personal_user_id == grant.personal_user_id =>
            {
                store::replace_tokens(
                    &mut tx,
                    grant_id,
                    &self.secrets.encrypt(&tokens.access_token)?,
                    &self.secrets.encrypt(&tokens.refresh_token)?,
                    Utc::now() + Duration::seconds(tokens.expires_in),
                )
                .await?;
                tx.commit().await.map_err(anyhow::Error::from)?;
                Ok(Auth::OAuth {
                    grant_id,
                    access_token: tokens.access_token,
                })
            }
            Ok(_) => {
                let error =
                    anyhow::anyhow!("the refreshed token belongs to a different SnapTrade user");
                self.give_up(tx, grant_id, error).await
            }
            Err(error) if error.is_terminal_refresh_failure() => {
                self.give_up(tx, grant_id, error.into()).await
            }
            Err(error) => Err(error.into()),
        }
    }

    async fn give_up(
        &self,
        mut tx: sqlx::Transaction<'_, sqlx::Postgres>,
        grant_id: Uuid,
        cause: anyhow::Error,
    ) -> Result<Auth, SessionError> {
        warn!(%grant_id, error = %cause, "SnapTrade OAuth grant needs reauthorization");
        store::clear_grant(&mut *tx, grant_id, "reauthorization_required").await?;
        tx.commit().await.map_err(anyhow::Error::from)?;
        Err(SessionError::ReauthorizationRequired)
    }
}

impl Session<'_> {
    pub fn auth(&self) -> &Auth {
        &self.auth
    }

    /// Runs one SnapTrade call. An OAuth authentication failure refreshes the
    /// grant and retries the same call once; a second failure is terminal.
    pub async fn run<T, F, Fut>(&mut self, mut operation: F) -> Result<T, SessionError>
    where
        F: FnMut(Arc<SnapTradeClient>, Auth) -> Fut,
        Fut: Future<Output = Result<T, SnapTradeError>>,
    {
        let client = self.brokerage.client.clone();
        let error = match operation(client.clone(), self.auth.clone()).await {
            Ok(value) => return Ok(value),
            Err(error) => error,
        };
        let Auth::OAuth {
            grant_id,
            access_token,
        } = &self.auth
        else {
            return Err(if error.is_stale_credentials() {
                SessionError::StaleCredentials
            } else {
                error.into()
            });
        };
        if !error.is_oauth_authentication_failure() {
            return Err(error.into());
        }
        let grant_id = *grant_id;
        self.auth = self
            .brokerage
            .refresh_grant(grant_id, Some(access_token))
            .await?;
        match operation(client, self.auth.clone()).await {
            Ok(value) => Ok(value),
            Err(error) if error.is_oauth_authentication_failure() => {
                warn!(%grant_id, "SnapTrade rejected a freshly refreshed token");
                store::clear_grant(&self.brokerage.pool, grant_id, "reauthorization_required")
                    .await?;
                Err(SessionError::ReauthorizationRequired)
            }
            Err(error) => Err(error.into()),
        }
    }
}
