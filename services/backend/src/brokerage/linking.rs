//! Linking brokerages: Commercial (Connection Portal) and SnapTrade Personal
//! OAuth, choosing accounts, and managing connections afterwards.

use std::collections::{BTreeMap, HashMap};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{Duration, NaiveDate, Utc};
use sha2::{Digest, Sha256};
use tracing::{info, warn};
use uuid::Uuid;

use super::Brokerage;
use super::history::{self, ImportMode};
use super::session::{Auth, Session, SessionError};
use super::store::{self, AuthorizedTokens, ConnectionUpsert, GrantError, NewAccount, NewAttempt};
use crate::snaptrade::{ConnectionAccount, PortalOptions, SnapTradeError};

pub const OAUTH_SCOPES: [&str; 2] = ["read", "webhook"];
const ATTEMPT_MINUTES: i64 = 10;
/// Connection health is re-read from SnapTrade at most this often per connection.
const HEALTH_CHECK_SECONDS: i64 = 60;

#[derive(Debug, thiserror::Error)]
pub enum LinkError {
    #[error("Not found")]
    NotFound,
    #[error("Continue with SnapTrade is not available")]
    OAuthUnavailable,
    #[error("Link a brokerage first")]
    NotRegistered,
    #[error("{0}")]
    InvalidSelection(String),
    #[error("{0}")]
    InvalidImportRange(String),
    #[error("The SnapTrade authorization is not finished")]
    AuthorizationIncomplete,
    #[error("Connections shared from SnapTrade are repaired in SnapTrade")]
    RepairInSnapTrade,
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<SnapTradeError> for LinkError {
    fn from(error: SnapTradeError) -> Self {
        Self::Session(SessionError::SnapTrade(error))
    }
}

impl From<sqlx::Error> for LinkError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.into())
    }
}

/// An account the user can choose to import.
#[derive(Clone, Debug)]
pub struct AccountChoice {
    pub connection_id: Uuid,
    pub institution_name: String,
    pub snaptrade_account_id: String,
    pub name: String,
    pub masked_number: Option<String>,
    pub raw_type: Option<String>,
    pub is_paper: bool,
    /// The workspace already importing this account, if any.
    pub linked_workspace_id: Option<Uuid>,
    /// Imported before and since unlinked; choosing it again keeps its history.
    pub previously_linked: bool,
}

#[derive(Clone, Debug)]
pub struct Selection {
    pub connection_id: Uuid,
    pub snaptrade_account_id: String,
    pub mode: ImportMode,
    pub custom_start_date: Option<NaiveDate>,
}

#[derive(Clone, Debug)]
pub struct OAuthStart {
    pub attempt_id: Uuid,
    pub authorization_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CallbackOutcome {
    pub attempt_id: Option<Uuid>,
    pub status: String,
}

#[derive(Clone, Debug)]
pub struct Revocation {
    pub revoked: bool,
    pub upstream_confirmed: bool,
    pub unlinked_connections: u64,
}

#[derive(Clone, Debug)]
pub struct ConnectionView {
    pub connection: store::Connection,
    pub accounts: Vec<store::Account>,
    /// For OAuth connections: `active`, `reauthorization_required`, or `revoked`.
    pub grant_status: Option<String>,
}

fn random_token(bytes: usize) -> anyhow::Result<String> {
    let mut buffer = vec![0u8; bytes];
    getrandom::fill(&mut buffer).map_err(|error| anyhow::anyhow!("no randomness: {error}"))?;
    Ok(URL_SAFE_NO_PAD.encode(buffer))
}

pub fn state_hash(state: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(state.as_bytes()))
}

impl Brokerage {
    // ── Commercial ──────────────────────────────────────────────────────────

    /// The user's SnapTrade registration, created on first use. A per-user lock
    /// keeps two concurrent requests from registering twice; if the secret
    /// cannot be stored, the new SnapTrade user is deleted so no orphan stays.
    async fn ensure_registration(&self, user_id: Uuid) -> Result<Auth, LinkError> {
        if let Some(auth) = self.commercial_auth(user_id).await? {
            return Ok(auth);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('snaptrade-registration:' || $1::text, 0))")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        let existing: Option<(String, String)> = sqlx::query_as(
            "SELECT snaptrade_user_id, user_secret_encrypted FROM snaptrade_registrations WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((snaptrade_user_id, encrypted)) = existing {
            tx.commit().await?;
            return Ok(Auth::Commercial {
                user_id: snaptrade_user_id,
                user_secret: self.secrets.decrypt(&encrypted)?,
            });
        }

        let registration = self.client.register_user(&user_id.to_string()).await?;
        let stored = async {
            let encrypted = self.secrets.encrypt(&registration.user_secret)?;
            sqlx::query(
                "INSERT INTO snaptrade_registrations (user_id, snaptrade_user_id, user_secret_encrypted) VALUES ($1, $2, $3)",
            )
            .bind(user_id)
            .bind(&registration.user_id)
            .bind(encrypted)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            anyhow::Ok(())
        }
        .await;
        if let Err(error) = stored {
            warn!(%user_id, error = %error, "could not store a SnapTrade registration; removing it upstream");
            if let Err(cleanup) = self.client.delete_user(&registration.user_id).await {
                warn!(%user_id, error = %cleanup, "could not remove the orphaned SnapTrade user");
            }
            return Err(error.into());
        }
        info!(%user_id, "registered the user with SnapTrade");
        Ok(Auth::Commercial {
            user_id: registration.user_id,
            user_secret: registration.user_secret,
        })
    }

    /// Drops a registration SnapTrade no longer recognises. Its connections
    /// went with it upstream, so they are unlinked here; imported data stays.
    async fn reset_stale_registration(&self, user_id: Uuid) -> Result<(), LinkError> {
        if let Some(registration) = store::registration(&self.pool, user_id).await? {
            match self
                .client
                .delete_user(&registration.snaptrade_user_id)
                .await
            {
                Ok(()) => {}
                Err(error) if error.is_stale_credentials() => {}
                Err(error) => return Err(error.into()),
            }
        }
        let mut tx = self.pool.begin().await?;
        let commercial: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM brokerage_connections WHERE user_id = $1 AND auth_mode = 'commercial' AND unlinked_at IS NULL",
        )
        .bind(user_id)
        .fetch_all(&mut *tx)
        .await?;
        for id in commercial {
            store::unlink_connection(&mut *tx, id).await?;
        }
        sqlx::query("DELETE FROM snaptrade_registrations WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        warn!(%user_id, "reset a SnapTrade registration SnapTrade no longer recognised");
        Ok(())
    }

    /// A Connection Portal link: to connect a new brokerage, or to repair one
    /// of the user's Commercial connections in place.
    pub async fn start_commercial(
        &self,
        user_id: Uuid,
        reconnect: Option<Uuid>,
    ) -> Result<String, LinkError> {
        let reconnect_id = match reconnect {
            Some(id) => {
                let connection = store::connection_for_user(&self.pool, user_id, id)
                    .await?
                    .ok_or(LinkError::NotFound)?;
                if connection.auth_mode != "commercial" {
                    return Err(LinkError::RepairInSnapTrade);
                }
                Some(connection.snaptrade_connection_id)
            }
            None => None,
        };
        let redirect = self.website_page("/brokerage/callback");
        let portal = |auth: Auth, reconnect: Option<String>| {
            let redirect = redirect.clone();
            async move {
                self.session(auth)
                    .run(|client, auth| {
                        let (redirect, reconnect) = (redirect.clone(), reconnect.clone());
                        async move {
                            let Auth::Commercial {
                                user_id,
                                user_secret,
                            } = &auth
                            else {
                                unreachable!("portal links are Commercial");
                            };
                            let options = PortalOptions {
                                broker: None,
                                reconnect: reconnect.as_deref(),
                                custom_redirect: Some(&redirect),
                            };
                            client
                                .connection_portal_url(user_id, user_secret, &options)
                                .await
                        }
                    })
                    .await
            }
        };
        let auth = self.ensure_registration(user_id).await?;
        match portal(auth, reconnect_id).await {
            Err(SessionError::StaleCredentials) => {
                self.reset_stale_registration(user_id).await?;
                let auth = self.ensure_registration(user_id).await?;
                // The repaired connection no longer exists upstream; link anew.
                Ok(portal(auth, None).await?)
            }
            other => Ok(other?),
        }
    }

    /// After the Connection Portal: confirms the connection is the user's,
    /// records it, and returns the accounts they can import.
    pub async fn complete_commercial(
        &self,
        user_id: Uuid,
        snaptrade_connection_id: &str,
    ) -> Result<Vec<AccountChoice>, LinkError> {
        let auth = self
            .commercial_auth(user_id)
            .await?
            .ok_or(LinkError::NotRegistered)?;
        let mut session = self.session(auth);
        let id = snaptrade_connection_id.to_owned();
        let connection = match session
            .run(|client, auth| {
                let id = id.clone();
                async move { client.get_connection(auth.credentials(), &id).await }
            })
            .await
        {
            Err(SessionError::SnapTrade(error)) if error.is_not_found() => {
                return Err(LinkError::NotFound);
            }
            other => other?,
        };
        let row = store::upsert_connection(
            &self.pool,
            ConnectionUpsert {
                user_id,
                oauth_grant_id: None,
                snaptrade_connection_id: &connection.id,
                institution_name: &connection.institution_name(),
                institution_slug: connection.institution_slug().as_deref(),
                disabled: connection.disabled,
                disabled_at: connection.disabled_date,
                data_freshness_mode: connection.freshness_mode().as_deref(),
            },
        )
        .await?;
        store::set_new_accounts_available(&self.pool, row.id, false).await?;
        self.account_choices(&mut session, &row).await
    }

    async fn account_choices(
        &self,
        session: &mut Session<'_>,
        connection: &store::Connection,
    ) -> Result<Vec<AccountChoice>, LinkError> {
        let id = connection.snaptrade_connection_id.clone();
        let upstream = session
            .run(|client, auth| {
                let id = id.clone();
                async move {
                    client
                        .list_connection_accounts(auth.credentials(), &id)
                        .await
                }
            })
            .await?;
        let existing: HashMap<String, store::Account> =
            store::accounts_for_user(&self.pool, connection.user_id)
                .await?
                .into_iter()
                .map(|account| (account.snaptrade_account_id.clone(), account))
                .collect();
        Ok(upstream
            .into_iter()
            .filter(ConnectionAccount::is_investment)
            .map(|account| {
                let known = existing.get(&account.id);
                AccountChoice {
                    connection_id: connection.id,
                    institution_name: connection.institution_name.clone(),
                    name: account.name(),
                    masked_number: account.masked_account_number.clone(),
                    raw_type: account.raw_type.clone(),
                    is_paper: account.is_paper.unwrap_or(false),
                    linked_workspace_id: known
                        .filter(|a| a.unlinked_at.is_none())
                        .and_then(|a| a.workspace_id),
                    previously_linked: known.is_some_and(|a| a.unlinked_at.is_some()),
                    snaptrade_account_id: account.id,
                }
            })
            .collect())
    }

    /// The accounts the user can import from one of their connections, for
    /// adding accounts after the first link.
    pub async fn connection_account_choices(
        &self,
        user_id: Uuid,
        connection_id: Uuid,
    ) -> Result<Vec<AccountChoice>, LinkError> {
        let connection = store::connection_for_user(&self.pool, user_id, connection_id)
            .await?
            .filter(|c| c.unlinked_at.is_none())
            .ok_or(LinkError::NotFound)?;
        let mut session = self.session_for_connection(&connection).await?;
        let choices = self.account_choices(&mut session, &connection).await?;
        store::set_new_accounts_available(&self.pool, connection.id, false).await?;
        Ok(choices)
    }

    /// Imports the chosen accounts: one workspace each. Repeating a choice is
    /// harmless, and choosing an unlinked account again restores it with its
    /// history and original import boundary.
    pub async fn finalize_accounts(
        &self,
        user_id: Uuid,
        selections: Vec<Selection>,
    ) -> Result<Vec<store::Account>, LinkError> {
        if selections.is_empty() {
            return Err(LinkError::InvalidSelection(
                "Choose at least one account".into(),
            ));
        }
        let mut by_connection: BTreeMap<Uuid, Vec<Selection>> = BTreeMap::new();
        for selection in selections {
            by_connection
                .entry(selection.connection_id)
                .or_default()
                .push(selection);
        }
        let today = history::eastern_today();
        let mut imported = Vec::new();
        for (connection_id, selections) in by_connection {
            let connection = store::connection_for_user(&self.pool, user_id, connection_id)
                .await?
                .filter(|c| c.unlinked_at.is_none())
                .ok_or(LinkError::NotFound)?;
            let mut session = self.session_for_connection(&connection).await?;
            let id = connection.snaptrade_connection_id.clone();
            let upstream: HashMap<String, ConnectionAccount> = session
                .run(|client, auth| {
                    let id = id.clone();
                    async move {
                        client
                            .list_connection_accounts(auth.credentials(), &id)
                            .await
                    }
                })
                .await?
                .into_iter()
                .map(|account| (account.id.clone(), account))
                .collect();

            let mut tx = self.pool.begin().await?;
            for selection in selections {
                let account = upstream
                    .get(&selection.snaptrade_account_id)
                    .filter(|a| a.is_investment())
                    .ok_or_else(|| {
                        LinkError::InvalidSelection(
                            "That account is not an investment account in this connection".into(),
                        )
                    })?;
                let policy = history::resolve(selection.mode, selection.custom_start_date, today)
                    .map_err(|error| LinkError::InvalidImportRange(error.to_string()))?;
                let account_row =
                    match store::account_by_snaptrade_id(&mut *tx, user_id, &account.id).await? {
                        Some(existing) if existing.unlinked_at.is_some() => {
                            store::relink_account(&mut tx, existing.id, connection.id).await?;
                            store::account_by_snaptrade_id(&mut *tx, user_id, &account.id)
                                .await?
                                .ok_or(LinkError::NotFound)?
                        }
                        Some(existing) => existing,
                        None => {
                            store::create_account_with_workspace(
                                &mut tx,
                                NewAccount {
                                    user_id,
                                    connection_id: connection.id,
                                    snaptrade_account_id: &account.id,
                                    name: &account.name(),
                                    masked_number: account.masked_account_number.as_deref(),
                                    kind: &account.kind,
                                    raw_type: account.raw_type.as_deref(),
                                    is_paper: account.is_paper.unwrap_or(false),
                                    import_mode: policy.mode.as_str(),
                                    import_start_date: policy.start_date,
                                },
                            )
                            .await?
                        }
                    };
                imported.push(store::ensure_account_workspace(&mut tx, account_row).await?);
            }
            tx.commit().await?;
        }
        self.accounts_linked(&imported).await?;
        Ok(imported)
    }

    // ── OAuth ───────────────────────────────────────────────────────────────

    fn require_oauth(&self) -> Result<&str, LinkError> {
        match &self.oauth_client_id {
            Some(id) if self.client.oauth_enabled() => Ok(id),
            _ => Err(LinkError::OAuthUnavailable),
        }
    }

    pub async fn start_oauth(&self, user_id: Uuid, intent: &str) -> Result<OAuthStart, LinkError> {
        let oauth_client_id = self.require_oauth()?;
        if intent == "reauthorize"
            && store::grant_for_user(&self.pool, user_id, oauth_client_id)
                .await?
                .is_none()
        {
            return Err(LinkError::NotFound);
        }
        store::delete_stale_attempts(&self.pool).await?;
        let state = random_token(32)?;
        let verifier = random_token(64)?;
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let authorization_url = self
            .client
            .authorization_url(&state, &challenge, &OAUTH_SCOPES)
            .await?;
        let scopes: Vec<String> = OAUTH_SCOPES.iter().map(|s| (*s).to_owned()).collect();
        let attempt_id = store::create_attempt(
            &self.pool,
            NewAttempt {
                user_id,
                state_hash: &state_hash(&state),
                code_verifier_encrypted: &self.secrets.encrypt(&verifier)?,
                scopes: &scopes,
                intent,
                expires_at: Utc::now() + Duration::minutes(ATTEMPT_MINUTES),
            },
        )
        .await?;
        Ok(OAuthStart {
            attempt_id,
            authorization_url,
        })
    }

    /// Finishes an authorization SnapTrade redirected back. Every claimed
    /// attempt ends in a recorded terminal status; tokens Tradstry will not
    /// keep are revoked upstream.
    pub async fn oauth_callback(
        &self,
        state: &str,
        code: Option<&str>,
        error: Option<&str>,
    ) -> Result<CallbackOutcome, LinkError> {
        let oauth_client_id = self.require_oauth()?.to_owned();
        let invalid = CallbackOutcome {
            attempt_id: None,
            status: "invalid".into(),
        };
        if state.is_empty() {
            return Ok(invalid);
        }
        let Some(attempt) = store::claim_attempt(&self.pool, &state_hash(state)).await? else {
            return Ok(invalid);
        };
        let (status, error_code, grant_id) = self
            .finish_authorization(&attempt, &oauth_client_id, code, error)
            .await;
        if let Err(finish_error) =
            store::finish_attempt(&self.pool, attempt.id, status, error_code, grant_id).await
        {
            warn!(attempt_id = %attempt.id, error = %finish_error, "could not record an OAuth attempt's outcome");
        }
        info!(attempt_id = %attempt.id, status, error_code, "SnapTrade OAuth callback finished");
        Ok(CallbackOutcome {
            attempt_id: Some(attempt.id),
            status: status.into(),
        })
    }

    async fn finish_authorization(
        &self,
        attempt: &store::Attempt,
        oauth_client_id: &str,
        code: Option<&str>,
        error: Option<&str>,
    ) -> (&'static str, Option<&'static str>, Option<Uuid>) {
        if error.is_some() {
            return ("denied", Some("access_denied"), None);
        }
        let Some(code) = code.filter(|code| !code.is_empty()) else {
            return ("failed", Some("missing_code"), None);
        };
        let Ok(verifier) = self.secrets.decrypt(&attempt.code_verifier_encrypted) else {
            return ("failed", Some("internal_error"), None);
        };
        let tokens = match self.client.exchange_code(code, &verifier).await {
            Ok(tokens) => tokens,
            Err(error) => {
                warn!(attempt_id = %attempt.id, error = %error, "SnapTrade OAuth code exchange failed");
                return ("failed", Some("token_exchange_failed"), None);
            }
        };
        if tokens.personal_user_id.is_empty() || !tokens.scopes.iter().any(|scope| scope == "read")
        {
            return self
                .discard_tokens(attempt.id, &tokens.refresh_token, "invalid_token_response")
                .await;
        }
        let stored = async {
            store::store_authorized_grant(
                &self.pool,
                attempt.user_id,
                oauth_client_id,
                AuthorizedTokens {
                    personal_user_id: &tokens.personal_user_id,
                    access_token_encrypted: &self.secrets.encrypt(&tokens.access_token)?,
                    refresh_token_encrypted: &self.secrets.encrypt(&tokens.refresh_token)?,
                    expires_at: Utc::now() + Duration::seconds(tokens.expires_in),
                    scopes: &tokens.scopes,
                },
            )
            .await
        }
        .await;
        match stored {
            Ok(grant) => ("authorized", None, Some(grant.id)),
            Err(error) => match error.downcast_ref::<GrantError>() {
                Some(GrantError::IdentityMismatch) => {
                    self.discard_tokens(attempt.id, &tokens.refresh_token, "identity_mismatch")
                        .await
                }
                Some(GrantError::IdentityInUse) => {
                    self.discard_tokens(attempt.id, &tokens.refresh_token, "identity_in_use")
                        .await
                }
                None => {
                    warn!(attempt_id = %attempt.id, error = %error, "could not store a SnapTrade OAuth grant");
                    self.discard_tokens(attempt.id, &tokens.refresh_token, "grant_rejected")
                        .await
                }
            },
        }
    }

    async fn discard_tokens(
        &self,
        attempt_id: Uuid,
        refresh_token: &str,
        code: &'static str,
    ) -> (&'static str, Option<&'static str>, Option<Uuid>) {
        if let Err(error) = self.client.revoke_token(refresh_token).await {
            warn!(%attempt_id, error = %error, "could not revoke tokens Tradstry is discarding");
        }
        ("failed", Some(code), None)
    }

    pub async fn oauth_status(
        &self,
        user_id: Uuid,
        attempt_id: Uuid,
    ) -> Result<Option<store::Attempt>, LinkError> {
        Ok(store::attempt_for_user(&self.pool, user_id, attempt_id).await?)
    }

    /// The accounts a finished `connect` authorization can import, across all
    /// of the Personal user's connections.
    pub async fn oauth_account_choices(
        &self,
        user_id: Uuid,
        attempt_id: Uuid,
    ) -> Result<Vec<AccountChoice>, LinkError> {
        let attempt = store::attempt_for_user(&self.pool, user_id, attempt_id)
            .await?
            .ok_or(LinkError::NotFound)?;
        let grant_id = attempt
            .grant_id
            .filter(|_| attempt.status == "authorized" && attempt.intent == "connect")
            .ok_or(LinkError::AuthorizationIncomplete)?;
        let auth = self.oauth_auth(grant_id).await?;
        let mut session = self.session(auth);
        let connections = session
            .run(|client, auth| async move { client.list_connections(auth.credentials()).await })
            .await?;
        let mut choices = Vec::new();
        for connection in connections {
            let row = store::upsert_connection(
                &self.pool,
                ConnectionUpsert {
                    user_id,
                    oauth_grant_id: Some(grant_id),
                    snaptrade_connection_id: &connection.id,
                    institution_name: &connection.institution_name(),
                    institution_slug: connection.institution_slug().as_deref(),
                    disabled: connection.disabled,
                    disabled_at: connection.disabled_date,
                    data_freshness_mode: connection.freshness_mode().as_deref(),
                },
            )
            .await?;
            choices.extend(self.account_choices(&mut session, &row).await?);
        }
        Ok(choices)
    }

    /// Ends Tradstry's OAuth access. Local tokens are always cleared and OAuth
    /// connections unlinked, even if SnapTrade cannot confirm the revocation.
    pub async fn revoke_oauth(&self, user_id: Uuid) -> Result<Revocation, LinkError> {
        let oauth_client_id = self.require_oauth()?;
        let Some(grant) = store::grant_for_user(&self.pool, user_id, oauth_client_id).await? else {
            return Ok(Revocation {
                revoked: false,
                upstream_confirmed: true,
                unlinked_connections: 0,
            });
        };
        let upstream_confirmed = match grant
            .refresh_token_encrypted
            .as_deref()
            .map(|e| self.secrets.decrypt(e))
        {
            None => true,
            Some(Ok(refresh_token)) => match self.client.revoke_token(&refresh_token).await {
                Ok(()) => true,
                Err(error) => {
                    warn!(grant_id = %grant.id, error = %error, "SnapTrade did not confirm the revocation");
                    false
                }
            },
            Some(Err(error)) => {
                warn!(grant_id = %grant.id, error = %error, "could not decrypt a refresh token to revoke it");
                false
            }
        };
        let mut tx = self.pool.begin().await?;
        store::lock_grant(&mut tx, grant.id).await?;
        store::clear_grant(&mut *tx, grant.id, "revoked").await?;
        let unlinked_connections = store::unlink_grant_connections(&mut tx, grant.id).await?;
        tx.commit().await?;
        Ok(Revocation {
            revoked: true,
            upstream_confirmed,
            unlinked_connections,
        })
    }

    // ── Connection management ───────────────────────────────────────────────

    /// The user's connections with their accounts. With `refresh`, health is
    /// re-read from SnapTrade for connections not checked in the last minute.
    pub async fn connections(
        &self,
        user_id: Uuid,
        refresh: bool,
    ) -> Result<Vec<ConnectionView>, LinkError> {
        if refresh {
            let stale_before = Utc::now() - Duration::seconds(HEALTH_CHECK_SECONDS);
            for connection in store::connections_for_user(&self.pool, user_id).await? {
                if connection.unlinked_at.is_none()
                    && connection.checked_at.is_none_or(|at| at < stale_before)
                {
                    self.refresh_connection_health(&connection).await;
                }
            }
        }
        let accounts = store::accounts_for_user(&self.pool, user_id).await?;
        let mut views = Vec::new();
        for connection in store::connections_for_user(&self.pool, user_id).await? {
            let grant_status = match connection.oauth_grant_id {
                Some(id) => store::grant(&self.pool, id)
                    .await?
                    .map(|grant| grant.status),
                None => None,
            };
            views.push(ConnectionView {
                accounts: accounts
                    .iter()
                    .filter(|a| a.connection_id == connection.id)
                    .cloned()
                    .collect(),
                connection,
                grant_status,
            });
        }
        Ok(views)
    }

    pub(crate) async fn refresh_connection_health(&self, connection: &store::Connection) {
        let checked = async {
            let mut session = self.session_for_connection(connection).await?;
            let id = connection.snaptrade_connection_id.clone();
            session
                .run(|client, auth| {
                    let id = id.clone();
                    async move { client.get_connection(auth.credentials(), &id).await }
                })
                .await
        }
        .await;
        let outcome = match checked {
            Ok(upstream) => {
                store::set_connection_health(
                    &self.pool,
                    connection.id,
                    upstream.disabled,
                    upstream.disabled_date,
                    upstream.freshness_mode().as_deref(),
                )
                .await
            }
            // Removed upstream: stop syncing it but keep its data.
            Err(SessionError::SnapTrade(error)) if error.is_not_found() => {
                store::unlink_connection(&self.pool, connection.id).await
            }
            // Shown through the grant's status or fixed when the user links again.
            Err(SessionError::ReauthorizationRequired | SessionError::StaleCredentials) => Ok(()),
            Err(error) => {
                warn!(connection_id = %connection.id, error = %error, "could not refresh a connection's health");
                Ok(())
            }
        };
        if let Err(error) = outcome {
            warn!(connection_id = %connection.id, error = %error, "could not record a connection's health");
        }
    }

    /// Stops syncing a connection. A Commercial connection is also removed at
    /// SnapTrade; an OAuth one belongs to the user's SnapTrade account and stays.
    pub async fn disconnect(&self, user_id: Uuid, connection_id: Uuid) -> Result<(), LinkError> {
        let connection = store::connection_for_user(&self.pool, user_id, connection_id)
            .await?
            .ok_or(LinkError::NotFound)?;
        if connection.auth_mode == "commercial"
            && connection.unlinked_at.is_none()
            && let Some(Auth::Commercial {
                user_id: snaptrade_user,
                user_secret,
            }) = self.commercial_auth(user_id).await?
        {
            match self
                .client
                .delete_connection(
                    &snaptrade_user,
                    &user_secret,
                    &connection.snaptrade_connection_id,
                )
                .await
            {
                Ok(()) => {}
                Err(error) if error.is_stale_credentials() => {}
                Err(error) => return Err(error.into()),
            }
        }
        store::unlink_connection(&self.pool, connection.id).await?;
        Ok(())
    }

    /// Removes the user's SnapTrade footprint before their account is purged.
    /// Failures are logged, never fatal: local deletion must not be blocked.
    pub async fn cleanup_user(&self, user_id: Uuid) {
        if self.require_oauth().is_ok()
            && let Err(error) = self.revoke_oauth(user_id).await
        {
            warn!(%user_id, error = %error, "could not revoke SnapTrade OAuth during account deletion");
        }
        match store::registration(&self.pool, user_id).await {
            Ok(Some(registration)) => {
                if let Err(error) = self
                    .client
                    .delete_user(&registration.snaptrade_user_id)
                    .await
                    && !error.is_stale_credentials()
                {
                    warn!(%user_id, error = %error, "could not delete the SnapTrade user during account deletion");
                }
            }
            Ok(None) => {}
            Err(error) => {
                warn!(%user_id, error = %error, "could not read the SnapTrade registration during account deletion")
            }
        }
    }

    /// Queues the chosen accounts' first import.
    async fn accounts_linked(&self, accounts: &[store::Account]) -> Result<(), LinkError> {
        Ok(self.queue_imports(accounts).await?)
    }
}
