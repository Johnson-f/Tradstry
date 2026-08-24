use std::sync::Arc;

use aes_gcm::aead::OsRng;
use aes_gcm::aead::rand_core::RngCore;
use anyhow::{Context, Result, anyhow};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use super::client::BrokerageClient;
use super::db::{decrypt_secret, encrypt_secret};
use crate::service::db::schema::tables::snaptrade_oauth_table as oauth_table;

const ATTEMPT_TTL_MINUTES: i64 = 10;
const OAUTH_SCOPES: &[&str] = &["read", "webhook"];

#[derive(Debug, Clone)]
pub struct SnapTradeOAuthConfig {
    pub redirect_uri: Arc<str>,
    pub frontend_return_url: Arc<str>,
    pub enabled: bool,
}

impl SnapTradeOAuthConfig {
    pub fn from_env() -> Result<Self> {
        let redirect_uri = std::env::var("SNAPTRADE_OAUTH_REDIRECT_URI").unwrap_or_default();
        let frontend_return_url =
            std::env::var("SNAPTRADE_OAUTH_FRONTEND_RETURN_URL").unwrap_or_default();
        let enabled = !redirect_uri.is_empty() || !frontend_return_url.is_empty();
        if enabled {
            anyhow::ensure!(
                !redirect_uri.is_empty() && !frontend_return_url.is_empty(),
                "SNAPTRADE_OAUTH_REDIRECT_URI and SNAPTRADE_OAUTH_FRONTEND_RETURN_URL must both be set"
            );
            anyhow::ensure!(
                redirect_uri.starts_with("https://")
                    || redirect_uri.starts_with("http://localhost:")
                    || redirect_uri.starts_with("http://127.0.0.1:"),
                "SnapTrade OAuth redirect URI must use HTTPS or a loopback development origin"
            );
        }
        Ok(Self {
            redirect_uri: Arc::from(redirect_uri),
            frontend_return_url: Arc::from(frontend_return_url),
            enabled,
        })
    }

    pub fn require_enabled(&self) -> Result<()> {
        anyhow::ensure!(self.enabled, "SnapTrade OAuth is not configured");
        Ok(())
    }

    pub fn return_url(&self, attempt_id: &str, status: &str) -> Result<String> {
        let mut url = reqwest::Url::parse(&self.frontend_return_url)
            .context("invalid SnapTrade OAuth frontend return URL")?;
        url.query_pairs_mut()
            .append_pair("attempt", attempt_id)
            .append_pair("status", status);
        Ok(url.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct OAuthStart {
    pub attempt_id: String,
    pub authorization_url: String,
}

#[derive(Debug, Clone)]
pub struct OAuthCallbackResult {
    pub attempt_id: String,
    pub status: String,
}

pub async fn start(
    pool: &PgPool,
    brokerage: &BrokerageClient,
    config: &SnapTradeOAuthConfig,
    user_id: &str,
    workspace_id: &str,
    platform: &str,
) -> Result<OAuthStart> {
    config.require_enabled()?;
    oauth_table::cleanup_attempts(pool).await?;
    anyhow::ensure!(
        matches!(platform, "web" | "desktop"),
        "invalid OAuth platform"
    );
    let state = random_base64url(32);
    let verifier = random_base64url(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let scopes = OAUTH_SCOPES
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    let authorization_url = brokerage
        .begin_oauth(&state, &challenge, &config.redirect_uri, &scopes)
        .await?;
    let attempt_id = oauth_table::create_attempt(
        pool,
        oauth_table::CreateAttempt {
            user_id,
            workspace_id,
            state_hash: &state_hash(&state),
            code_verifier_encrypted: &encrypt_secret(&verifier)?,
            requested_scopes: &scopes,
            platform,
            expires_at: Utc::now() + Duration::minutes(ATTEMPT_TTL_MINUTES),
        },
    )
    .await?;
    Ok(OAuthStart {
        attempt_id,
        authorization_url,
    })
}

pub async fn callback(
    pool: &PgPool,
    brokerage: &BrokerageClient,
    config: &SnapTradeOAuthConfig,
    state: &str,
    code: Option<&str>,
    error: Option<&str>,
) -> Result<OAuthCallbackResult> {
    config.require_enabled()?;
    anyhow::ensure!(!state.is_empty(), "OAuth state is required");
    let attempt = oauth_table::claim_attempt(pool, &state_hash(state)).await?;
    if error.is_some() {
        oauth_table::finish_attempt(pool, &attempt.id, "denied", Some("access_denied"), None)
            .await?;
        return Ok(OAuthCallbackResult {
            attempt_id: attempt.id,
            status: "denied".to_string(),
        });
    }
    let code = code
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("OAuth code is required"));
    let tokens = match code {
        Ok(code) => {
            let verifier = decrypt_secret(&attempt.code_verifier_encrypted)?;
            brokerage
                .exchange_oauth_code(code, &verifier, &config.redirect_uri)
                .await
        }
        Err(error) => Err(error),
    };
    let tokens = match tokens {
        Ok(tokens) => tokens,
        Err(error) => {
            oauth_table::finish_attempt(
                pool,
                &attempt.id,
                "failed",
                Some("token_exchange_failed"),
                None,
            )
            .await?;
            log::warn!(
                "SnapTrade OAuth token exchange failed for attempt {}: {error}",
                attempt.id
            );
            return Ok(OAuthCallbackResult {
                attempt_id: attempt.id,
                status: "failed".to_string(),
            });
        }
    };
    anyhow::ensure!(
        !tokens.snaptrade_user_id.is_empty(),
        "SnapTrade OAuth token response omitted the Personal user ID"
    );
    let grant = oauth_table::store_grant(
        pool,
        oauth_table::StoreGrant {
            user_id: &attempt.user_id,
            oauth_client_id: &tokens.oauth_client_id,
            snaptrade_user_id: &tokens.snaptrade_user_id,
            access_token_encrypted: &encrypt_secret(&tokens.access_token)?,
            refresh_token_encrypted: &encrypt_secret(&tokens.refresh_token)?,
            access_token_expires_at: Utc::now() + Duration::seconds(tokens.expires_in),
            scopes: &tokens.scopes,
        },
    )
    .await?;
    oauth_table::finish_attempt(pool, &attempt.id, "authorized", None, Some(&grant.id)).await?;
    Ok(OAuthCallbackResult {
        attempt_id: attempt.id,
        status: "authorized".to_string(),
    })
}

fn random_base64url(bytes: usize) -> String {
    let mut value = vec![0u8; bytes];
    OsRng.fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

pub fn state_hash(state: &str) -> String {
    hex::encode(Sha256::digest(state.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_is_stored_as_a_stable_hash() {
        assert_eq!(state_hash("state"), state_hash("state"));
        assert_ne!(state_hash("state"), "state");
        assert_ne!(state_hash("state"), state_hash("other"));
    }

    #[test]
    fn generated_pkce_material_is_url_safe_and_high_entropy() {
        let value = random_base64url(64);
        assert!(value.len() >= 80);
        assert!(
            value.chars().all(
                |character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            )
        );
    }

    #[test]
    fn frontend_return_url_contains_only_attempt_and_status() {
        let config = SnapTradeOAuthConfig {
            redirect_uri: Arc::from("http://localhost:7899/oauth/snaptrade/callback"),
            frontend_return_url: Arc::from(
                "http://localhost:3038/dashboard/brokerage/oauth/callback",
            ),
            enabled: true,
        };
        let value = config.return_url("attempt-1", "authorized").unwrap();
        assert!(value.contains("attempt=attempt-1"));
        assert!(value.contains("status=authorized"));
        assert!(!value.contains("token"));
        assert!(!value.contains("code="));
    }
}
