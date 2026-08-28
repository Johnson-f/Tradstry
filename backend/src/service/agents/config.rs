use std::collections::HashMap;

use super::{AgentError, AgentResult};

const DEFAULT_WORKER_CONCURRENCY: usize = 2;
const DEFAULT_INDEX_WORKER_CONCURRENCY: usize = 2;
const DEFAULT_RUN_LEASE_SECONDS: u64 = 120;
const DEFAULT_HEARTBEAT_SECONDS: u64 = 15;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModelProvider {
    Gemini,
    Perplexity,
}

impl ModelProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Gemini => "gemini",
            Self::Perplexity => "perplexity",
        }
    }

    fn parse(value: &str) -> AgentResult<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "gemini" => Ok(Self::Gemini),
            "perplexity" => Ok(Self::Perplexity),
            _ => Err(AgentError::Validation(
                "AGENT_MODEL_PROVIDER must be gemini or perplexity".into(),
            )),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentConfig {
    pub enabled: bool,
    pub model_provider: Option<ModelProvider>,
    pub fast_model: Option<String>,
    pub reasoning_model: Option<String>,
    pub vision_model: Option<String>,
    pub fast_fallback_model: Option<String>,
    pub reasoning_fallback_model: Option<String>,
    pub vision_fallback_model: Option<String>,
    pub worker_concurrency: usize,
    pub index_worker_concurrency: usize,
    pub run_lease_seconds: u64,
    pub heartbeat_seconds: u64,
}

impl AgentConfig {
    pub fn from_env() -> AgentResult<Self> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    pub fn from_lookup<F>(lookup: F) -> AgentResult<Self>
    where
        F: Fn(&str) -> Option<String>,
    {
        let values = [
            "AGENTS_V2_ENABLED",
            "AGENT_MODEL_PROVIDER",
            "AGENT_FAST_MODEL",
            "AGENT_REASONING_MODEL",
            "AGENT_VISION_MODEL",
            "AGENT_FAST_FALLBACK_MODEL",
            "AGENT_REASONING_FALLBACK_MODEL",
            "AGENT_VISION_FALLBACK_MODEL",
            "AGENT_WORKER_CONCURRENCY",
            "AGENT_INDEX_WORKER_CONCURRENCY",
            "AGENT_RUN_LEASE_SECONDS",
            "AGENT_HEARTBEAT_SECONDS",
        ]
        .into_iter()
        .filter_map(|name| lookup(name).map(|value| (name, value)))
        .collect::<HashMap<_, _>>();

        Self::from_values(&values)
    }

    fn from_values(values: &HashMap<&str, String>) -> AgentResult<Self> {
        let enabled = parse_bool(values.get("AGENTS_V2_ENABLED"), false)?;
        let model_provider = values
            .get("AGENT_MODEL_PROVIDER")
            .map(|value| ModelProvider::parse(value))
            .transpose()?;
        let fast_model = optional_non_blank(values.get("AGENT_FAST_MODEL"));
        let reasoning_model = optional_non_blank(values.get("AGENT_REASONING_MODEL"));
        let vision_model = optional_non_blank(values.get("AGENT_VISION_MODEL"));

        if enabled {
            if model_provider.is_none() {
                return Err(AgentError::Validation(
                    "AGENT_MODEL_PROVIDER is required when AGENTS_V2_ENABLED=true".into(),
                ));
            }
            for (name, value) in [
                ("AGENT_FAST_MODEL", &fast_model),
                ("AGENT_REASONING_MODEL", &reasoning_model),
                ("AGENT_VISION_MODEL", &vision_model),
            ] {
                if value.is_none() {
                    return Err(AgentError::Validation(format!(
                        "{name} is required when AGENTS_V2_ENABLED=true"
                    )));
                }
            }
        }

        let worker_concurrency = parse_usize(
            "AGENT_WORKER_CONCURRENCY",
            values.get("AGENT_WORKER_CONCURRENCY"),
            DEFAULT_WORKER_CONCURRENCY,
        )?
        .clamp(1, 8);
        let run_lease_seconds = parse_u64(
            "AGENT_RUN_LEASE_SECONDS",
            values.get("AGENT_RUN_LEASE_SECONDS"),
            DEFAULT_RUN_LEASE_SECONDS,
        )?;
        let index_worker_concurrency = parse_usize(
            "AGENT_INDEX_WORKER_CONCURRENCY",
            values.get("AGENT_INDEX_WORKER_CONCURRENCY"),
            DEFAULT_INDEX_WORKER_CONCURRENCY,
        )?
        .clamp(1, 8);
        let heartbeat_seconds = parse_u64(
            "AGENT_HEARTBEAT_SECONDS",
            values.get("AGENT_HEARTBEAT_SECONDS"),
            DEFAULT_HEARTBEAT_SECONDS,
        )?;
        if run_lease_seconds == 0 {
            return Err(AgentError::Validation(
                "AGENT_RUN_LEASE_SECONDS must be greater than zero".into(),
            ));
        }
        if heartbeat_seconds == 0 || heartbeat_seconds >= run_lease_seconds {
            return Err(AgentError::Validation(
                "AGENT_HEARTBEAT_SECONDS must be greater than zero and smaller than AGENT_RUN_LEASE_SECONDS"
                    .into(),
            ));
        }

        Ok(Self {
            enabled,
            model_provider,
            fast_model,
            reasoning_model,
            vision_model,
            fast_fallback_model: optional_non_blank(values.get("AGENT_FAST_FALLBACK_MODEL")),
            reasoning_fallback_model: optional_non_blank(
                values.get("AGENT_REASONING_FALLBACK_MODEL"),
            ),
            vision_fallback_model: optional_non_blank(values.get("AGENT_VISION_FALLBACK_MODEL")),
            worker_concurrency,
            index_worker_concurrency,
            run_lease_seconds,
            heartbeat_seconds,
        })
    }
}

fn optional_non_blank(value: Option<&String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse_bool(value: Option<&String>, default: bool) -> AgentResult<bool> {
    match value.map(|value| value.trim().to_ascii_lowercase()) {
        None => Ok(default),
        Some(value) if value == "true" || value == "1" => Ok(true),
        Some(value) if value == "false" || value == "0" => Ok(false),
        Some(_) => Err(AgentError::Validation(
            "AGENTS_V2_ENABLED must be true or false".into(),
        )),
    }
}

fn parse_usize(name: &str, value: Option<&String>, default: usize) -> AgentResult<usize> {
    value.map_or(Ok(default), |value| {
        value
            .trim()
            .parse::<usize>()
            .map_err(|_| AgentError::Validation(format!("{name} must be a positive integer")))
    })
}

fn parse_u64(name: &str, value: Option<&String>, default: u64) -> AgentResult<u64> {
    value.map_or(Ok(default), |value| {
        value
            .trim()
            .parse::<u64>()
            .map_err(|_| AgentError::Validation(format!("{name} must be a positive integer")))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enabled_values(extra: &[(&'static str, &str)]) -> HashMap<&'static str, String> {
        let mut values = HashMap::from([
            ("AGENTS_V2_ENABLED", "true".into()),
            ("AGENT_MODEL_PROVIDER", "gemini".into()),
            ("AGENT_FAST_MODEL", "gemini-fast".into()),
            ("AGENT_REASONING_MODEL", "gemini-reasoning".into()),
            ("AGENT_VISION_MODEL", "gemini-vision".into()),
        ]);
        values.extend(extra.iter().map(|(name, value)| (*name, (*value).into())));
        values
    }

    #[test]
    fn disabled_config_needs_no_models() {
        let config = AgentConfig::from_lookup(|_| None).unwrap();
        assert!(!config.enabled);
        assert_eq!(config.worker_concurrency, 2);
        assert_eq!(config.index_worker_concurrency, 2);
    }

    #[test]
    fn enabled_config_requires_all_model_roles() {
        let values = HashMap::from([
            ("AGENTS_V2_ENABLED", "true".into()),
            ("AGENT_MODEL_PROVIDER", "gemini".into()),
            ("AGENT_FAST_MODEL", "gemini-fast".into()),
        ]);
        let error = AgentConfig::from_values(&values).unwrap_err();
        assert!(error.to_string().contains("AGENT_REASONING_MODEL"));
    }

    #[test]
    fn enabled_config_requires_a_known_model_provider() {
        let missing = HashMap::from([
            ("AGENTS_V2_ENABLED", "true".into()),
            ("AGENT_FAST_MODEL", "fast".into()),
            ("AGENT_REASONING_MODEL", "reasoning".into()),
            ("AGENT_VISION_MODEL", "vision".into()),
        ]);
        assert!(
            AgentConfig::from_values(&missing)
                .unwrap_err()
                .to_string()
                .contains("AGENT_MODEL_PROVIDER")
        );

        let perplexity = enabled_values(&[("AGENT_MODEL_PROVIDER", "perplexity")]);
        assert_eq!(
            AgentConfig::from_values(&perplexity)
                .unwrap()
                .model_provider,
            Some(ModelProvider::Perplexity)
        );

        let invalid = enabled_values(&[("AGENT_MODEL_PROVIDER", "other")]);
        assert!(AgentConfig::from_values(&invalid).is_err());
    }

    #[test]
    fn concurrency_is_clamped() {
        let values = enabled_values(&[("AGENT_WORKER_CONCURRENCY", "99")]);
        let config = AgentConfig::from_values(&values).unwrap();
        assert_eq!(config.worker_concurrency, 8);
    }

    #[test]
    fn heartbeat_must_be_smaller_than_lease() {
        let values = enabled_values(&[
            ("AGENT_RUN_LEASE_SECONDS", "10"),
            ("AGENT_HEARTBEAT_SECONDS", "10"),
        ]);
        assert!(AgentConfig::from_values(&values).is_err());
    }

    #[test]
    fn blank_required_role_is_rejected() {
        let values = enabled_values(&[("AGENT_VISION_MODEL", "   ")]);
        let error = AgentConfig::from_values(&values).unwrap_err();
        assert!(error.to_string().contains("AGENT_VISION_MODEL"));
    }
}
