use anyhow::{Context, Result, bail};
use axum::http::HeaderValue;

use crate::snaptrade::{OAuthClientConfig, SnapTradeConfig};

const DEFAULT_PORT: u16 = 7900;
const DEFAULT_CORS_ORIGIN: &str = "http://localhost:5173";

#[derive(Clone)]
pub struct StytchConfig {
    pub project_id: String,
    pub secret: String,
    /// The custom auth domain, when tokens are minted through one.
    pub issuer: Option<String>,
    /// Overrides the Stytch API host, for a local fake.
    pub api_url: Option<String>,
}

#[derive(Clone)]
pub struct BrokerageConfig {
    pub snaptrade: SnapTradeConfig,
    /// base64 of 32 bytes; encrypts SnapTrade secrets and OAuth tokens at rest.
    pub encryption_key: String,
}

impl std::fmt::Debug for BrokerageConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BrokerageConfig")
            .field("client_id", &self.snaptrade.client_id)
            .field("oauth", &self.snaptrade.oauth.is_some())
            .finish_non_exhaustive()
    }
}

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub stytch: StytchConfig,
    /// Svix secret for Stytch's user-deletion webhook. Without it the webhook
    /// route refuses every request.
    pub stytch_webhook_secret: Option<String>,
    pub cors_allowed_origins: Vec<HeaderValue>,
    /// The website's origin; SnapTrade sends users back to pages under it.
    pub website_url: String,
    /// Brokerage linking is off when SnapTrade is not configured.
    pub brokerage: Option<BrokerageConfig>,
    /// The public origin of the MCP endpoint, e.g. `https://mcp.tradstry.com`.
    pub mcp_public_url: String,
}

impl std::fmt::Debug for StytchConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StytchConfig")
            .field("project_id", &self.project_id)
            .field("issuer", &self.issuer)
            .field("api_url", &self.api_url)
            .finish_non_exhaustive()
    }
}

impl std::fmt::Debug for Config {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Config")
            .field("port", &self.port)
            .field("stytch", &self.stytch)
            .field("cors_allowed_origins", &self.cors_allowed_origins)
            .field("website_url", &self.website_url)
            .field("brokerage", &self.brokerage)
            .finish_non_exhaustive()
    }
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let var = |name: &str| {
            lookup(name)
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
        };
        let required = |name: &str| var(name).with_context(|| format!("{name} must be set"));

        let port = match var("PORT") {
            Some(port) => port.parse().context("PORT must be a port number")?,
            None => DEFAULT_PORT,
        };
        let cors_allowed_origins = var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_else(|| DEFAULT_CORS_ORIGIN.to_owned())
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(|origin| {
                HeaderValue::from_str(origin.trim_end_matches('/')).with_context(|| {
                    format!("CORS_ALLOWED_ORIGINS has an invalid origin: {origin}")
                })
            })
            .collect::<Result<Vec<_>>>()?;
        if cors_allowed_origins.is_empty() {
            bail!("CORS_ALLOWED_ORIGINS must name at least one origin");
        }

        let website_url = var("WEBSITE_URL")
            .unwrap_or_else(|| DEFAULT_CORS_ORIGIN.to_owned())
            .trim_end_matches('/')
            .to_owned();
        if !cors_allowed_origins
            .iter()
            .any(|origin| origin == website_url.as_str())
        {
            bail!("WEBSITE_URL ({website_url}) must be one of CORS_ALLOWED_ORIGINS");
        }

        Ok(Self {
            port,
            database_url: required("DATABASE_URL")?,
            stytch: StytchConfig {
                project_id: required("STYTCH_PROJECT_ID")?,
                secret: required("STYTCH_SECRET")?,
                issuer: var("STYTCH_ISSUER"),
                api_url: var("STYTCH_API_URL"),
            },
            stytch_webhook_secret: var("STYTCH_WEBHOOK_SECRET"),
            cors_allowed_origins,
            website_url,
            brokerage: brokerage_config(&var)?,
            mcp_public_url: var("MCP_PUBLIC_URL")
                .unwrap_or_else(|| format!("http://localhost:{port}"))
                .trim_end_matches('/')
                .to_owned(),
        })
    }
}

/// SnapTrade settings come in groups that are all set or all unset, so a
/// half-configured deployment fails at startup rather than at first use.
fn brokerage_config(var: &impl Fn(&str) -> Option<String>) -> Result<Option<BrokerageConfig>> {
    let all_or_none = |names: &[&str]| -> Result<Option<Vec<String>>> {
        let values: Vec<Option<String>> = names.iter().map(|name| var(name)).collect();
        match values.iter().filter(|value| value.is_some()).count() {
            0 => Ok(None),
            n if n == names.len() => Ok(Some(values.into_iter().flatten().collect())),
            _ => bail!("set all of {} or none of them", names.join(", ")),
        }
    };
    let Some(keys) = all_or_none(&["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY"])? else {
        if all_or_none(&[
            "SNAPTRADE_OAUTH_CLIENT_ID",
            "SNAPTRADE_OAUTH_CLIENT_SECRET",
            "SNAPTRADE_OAUTH_REDIRECT_URI",
        ])?
        .is_some()
        {
            bail!("SnapTrade OAuth needs SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY too");
        }
        return Ok(None);
    };
    let oauth = all_or_none(&[
        "SNAPTRADE_OAUTH_CLIENT_ID",
        "SNAPTRADE_OAUTH_CLIENT_SECRET",
        "SNAPTRADE_OAUTH_REDIRECT_URI",
    ])?
    .map(|values| {
        let [client_id, client_secret, redirect_uri]: [String; 3] =
            values.try_into().expect("three values were requested");
        if !(redirect_uri.starts_with("https://")
            || redirect_uri.starts_with("http://localhost")
            || redirect_uri.starts_with("http://127.0.0.1"))
        {
            bail!("SNAPTRADE_OAUTH_REDIRECT_URI must use HTTPS or a loopback address");
        }
        Ok(OAuthClientConfig {
            client_id,
            client_secret,
            redirect_uri,
        })
    })
    .transpose()?;
    let [client_id, consumer_key]: [String; 2] =
        keys.try_into().expect("two values were requested");
    Ok(Some(BrokerageConfig {
        snaptrade: SnapTradeConfig {
            client_id,
            consumer_key,
            api_url: var("SNAPTRADE_API_URL"),
            oauth,
        },
        encryption_key: var("BROKERAGE_ENCRYPTION_KEY")
            .context("BROKERAGE_ENCRYPTION_KEY must be set when SnapTrade is configured")?,
    }))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn config(vars: &[(&str, &str)]) -> Result<Config> {
        let vars: HashMap<String, String> = vars
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect();
        Config::from_lookup(|name| vars.get(name).cloned())
    }

    const REQUIRED: [(&str, &str); 3] = [
        ("DATABASE_URL", "postgres://localhost/tradstry"),
        ("STYTCH_PROJECT_ID", "project-test-1"),
        ("STYTCH_SECRET", "secret-test-1"),
    ];

    #[test]
    fn defaults_apply_when_only_stytch_is_set() {
        let config = config(&REQUIRED).unwrap();
        assert_eq!(config.port, DEFAULT_PORT);
        assert_eq!(config.cors_allowed_origins, [DEFAULT_CORS_ORIGIN]);
        assert!(config.stytch.issuer.is_none());
    }

    #[test]
    fn missing_required_settings_fail_with_the_variable_name() {
        for missing in ["DATABASE_URL", "STYTCH_PROJECT_ID", "STYTCH_SECRET"] {
            let vars: Vec<_> = REQUIRED
                .iter()
                .copied()
                .filter(|(name, _)| *name != missing)
                .chain([(missing, "  ")])
                .collect();
            let error = config(&vars).unwrap_err();
            assert!(error.to_string().contains(missing), "{error}");
        }
    }

    #[test]
    fn origins_are_split_and_trimmed() {
        let mut vars = REQUIRED.to_vec();
        vars.push((
            "CORS_ALLOWED_ORIGINS",
            "https://tradstry.com/, http://localhost:5173 ,",
        ));
        let config = config(&vars).unwrap();
        assert_eq!(
            config.cors_allowed_origins,
            ["https://tradstry.com", "http://localhost:5173"]
        );
    }

    #[test]
    fn a_bad_port_is_rejected() {
        let mut vars = REQUIRED.to_vec();
        vars.push(("PORT", "http"));
        assert!(config(&vars).is_err());
    }

    fn with(extra: &[(&'static str, &'static str)]) -> Result<Config> {
        let mut vars = REQUIRED.to_vec();
        vars.extend_from_slice(extra);
        config(&vars)
    }

    const SNAPTRADE: [(&str, &str); 3] = [
        ("SNAPTRADE_CLIENT_ID", "client"),
        ("SNAPTRADE_CONSUMER_KEY", "consumer"),
        (
            "BROKERAGE_ENCRYPTION_KEY",
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        ),
    ];

    #[test]
    fn brokerage_is_off_without_snaptrade_keys() {
        let config = with(&[]).unwrap();
        assert!(config.brokerage.is_none());
        assert_eq!(config.website_url, DEFAULT_CORS_ORIGIN);
    }

    #[test]
    fn snaptrade_keys_need_their_partner_and_an_encryption_key() {
        assert!(with(&[("SNAPTRADE_CLIENT_ID", "client")]).is_err());
        let missing_key = with(&[
            ("SNAPTRADE_CLIENT_ID", "c"),
            ("SNAPTRADE_CONSUMER_KEY", "k"),
        ])
        .unwrap_err();
        assert!(missing_key.to_string().contains("BROKERAGE_ENCRYPTION_KEY"));
        let config = with(&SNAPTRADE).unwrap();
        assert!(config.brokerage.unwrap().snaptrade.oauth.is_none());
    }

    #[test]
    fn oauth_settings_are_all_or_nothing_and_need_a_safe_redirect() {
        let oauth = |redirect: &'static str| {
            let mut vars = SNAPTRADE.to_vec();
            vars.extend([
                ("SNAPTRADE_OAUTH_CLIENT_ID", "oauth"),
                ("SNAPTRADE_OAUTH_CLIENT_SECRET", "secret"),
                ("SNAPTRADE_OAUTH_REDIRECT_URI", redirect),
            ]);
            with(&vars)
        };
        assert!(
            oauth("http://localhost:7900/oauth/snaptrade/callback")
                .unwrap()
                .brokerage
                .unwrap()
                .snaptrade
                .oauth
                .is_some()
        );
        assert!(oauth("http://example.com/callback").is_err());
        let mut partial = SNAPTRADE.to_vec();
        partial.push(("SNAPTRADE_OAUTH_CLIENT_ID", "oauth"));
        assert!(with(&partial).is_err());
        assert!(
            with(&[
                ("SNAPTRADE_OAUTH_CLIENT_ID", "o"),
                ("SNAPTRADE_OAUTH_CLIENT_SECRET", "s"),
                ("SNAPTRADE_OAUTH_REDIRECT_URI", "https://x")
            ])
            .is_err()
        );
    }

    #[test]
    fn the_website_must_be_an_allowed_origin() {
        assert!(with(&[("WEBSITE_URL", "https://tradstry.com")]).is_err());
        let config = with(&[
            ("WEBSITE_URL", "https://tradstry.com/"),
            ("CORS_ALLOWED_ORIGINS", "https://tradstry.com"),
        ])
        .unwrap();
        assert_eq!(config.website_url, "https://tradstry.com");
    }
}
