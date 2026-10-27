use anyhow::{Context, Result, bail};
use axum::http::HeaderValue;

const DEFAULT_PORT: u16 = 7900;
const DEFAULT_CORS_ORIGIN: &str = "http://localhost:5173";

#[derive(Clone, Debug)]
pub struct StytchConfig {
    pub project_id: String,
    pub secret: String,
    /// The custom auth domain, when tokens are minted through one.
    pub issuer: Option<String>,
    /// Overrides the Stytch API host, for a local fake.
    pub api_url: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub stytch: StytchConfig,
    pub cors_allowed_origins: Vec<HeaderValue>,
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

        Ok(Self {
            port,
            stytch: StytchConfig {
                project_id: required("STYTCH_PROJECT_ID")?,
                secret: required("STYTCH_SECRET")?,
                issuer: var("STYTCH_ISSUER"),
                api_url: var("STYTCH_API_URL"),
            },
            cors_allowed_origins,
        })
    }
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

    const REQUIRED: [(&str, &str); 2] = [
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
    fn missing_stytch_credentials_fail_with_the_variable_name() {
        let error = config(&[("STYTCH_SECRET", "s")]).unwrap_err();
        assert!(error.to_string().contains("STYTCH_PROJECT_ID"));
        let error = config(&[("STYTCH_PROJECT_ID", "p"), ("STYTCH_SECRET", "  ")]).unwrap_err();
        assert!(error.to_string().contains("STYTCH_SECRET"));
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
}
