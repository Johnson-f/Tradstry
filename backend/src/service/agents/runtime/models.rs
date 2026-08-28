use std::sync::Arc;

use tinyagents::harness::middleware::library::RateLimitMiddleware;
use tinyagents::harness::model::ChatModel;
use tinyagents::harness::retry::RateLimiter;

use super::{AgentRuntimeState, GeminiModel, PerplexityProvider};
use crate::service::agents::{AgentConfig, AgentError, AgentResult, ModelProvider};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModelRole {
    Fast,
    Reasoning,
    Vision,
}

impl ModelRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fast => "fast",
            Self::Reasoning => "reasoning",
            Self::Vision => "vision",
        }
    }
}

#[derive(Clone)]
struct RoleModels {
    primary: Arc<dyn ChatModel<AgentRuntimeState>>,
    fallback: Option<Arc<dyn ChatModel<AgentRuntimeState>>>,
}

#[derive(Clone)]
pub struct AgentModelRegistry {
    fast: RoleModels,
    reasoning: RoleModels,
    vision: RoleModels,
    rate_limiter: Arc<RateLimiter>,
}

impl AgentModelRegistry {
    pub fn from_models(
        fast: Arc<dyn ChatModel<AgentRuntimeState>>,
        reasoning: Arc<dyn ChatModel<AgentRuntimeState>>,
        vision: Arc<dyn ChatModel<AgentRuntimeState>>,
    ) -> Self {
        Self {
            fast: RoleModels {
                primary: fast,
                fallback: None,
            },
            reasoning: RoleModels {
                primary: reasoning,
                fallback: None,
            },
            vision: RoleModels {
                primary: vision,
                fallback: None,
            },
            rate_limiter: Arc::new(RateLimiter::new(8, 2.0)),
        }
    }

    pub async fn from_config(config: &AgentConfig) -> AgentResult<Self> {
        Self::from_config_with(config, |name| std::env::var(name).ok(), None).await
    }

    async fn from_config_with<F>(
        config: &AgentConfig,
        lookup: F,
        perplexity_base_url: Option<&str>,
    ) -> AgentResult<Self>
    where
        F: Fn(&str) -> Option<String>,
    {
        if !config.enabled {
            return Err(AgentError::Disabled);
        }
        match config
            .model_provider
            .ok_or_else(|| AgentError::Validation("missing agent model provider".into()))?
        {
            ModelProvider::Gemini => {
                let api_key = required_key(&lookup, "GEMINI_API_KEY")?;
                Self::build_roles(config, |model| {
                    Ok(Arc::new(GeminiModel::from_api_key(api_key.clone(), model)?)
                        as Arc<dyn ChatModel<AgentRuntimeState>>)
                })
            }
            ModelProvider::Perplexity => {
                let api_key = required_key(&lookup, "PERPLEXITY_API_KEY")?;
                let provider = match perplexity_base_url {
                    Some(base_url) => PerplexityProvider::at(api_key, base_url)?,
                    None => PerplexityProvider::new(api_key)?,
                };
                provider.validate_models(configured_models(config)).await?;
                Self::build_roles(config, |model| {
                    Ok(Arc::new(provider.model(model)?) as Arc<dyn ChatModel<AgentRuntimeState>>)
                })
            }
        }
    }

    pub fn primary(&self, role: ModelRole) -> Arc<dyn ChatModel<AgentRuntimeState>> {
        Arc::clone(&self.role(role).primary)
    }

    pub fn fallback(&self, role: ModelRole) -> Option<Arc<dyn ChatModel<AgentRuntimeState>>> {
        self.role(role).fallback.clone()
    }

    pub fn rate_limit_middleware(&self) -> Arc<RateLimitMiddleware> {
        Arc::new(
            RateLimitMiddleware::new(Arc::clone(&self.rate_limiter))
                .waiting(std::time::Duration::from_millis(50)),
        )
    }

    fn role(&self, role: ModelRole) -> &RoleModels {
        match role {
            ModelRole::Fast => &self.fast,
            ModelRole::Reasoning => &self.reasoning,
            ModelRole::Vision => &self.vision,
        }
    }

    fn build_roles(
        config: &AgentConfig,
        build: impl Fn(&str) -> AgentResult<Arc<dyn ChatModel<AgentRuntimeState>>>,
    ) -> AgentResult<Self> {
        let calls_per_second = config.provider_calls_per_minute as f64 / 60.0;
        let registry = Self {
            fast: build_role(
                config.fast_model.as_deref(),
                config.fast_fallback_model.as_deref(),
                &build,
            )?,
            reasoning: build_role(
                config.reasoning_model.as_deref(),
                config.reasoning_fallback_model.as_deref(),
                &build,
            )?,
            vision: build_role(
                config.vision_model.as_deref(),
                config.vision_fallback_model.as_deref(),
                &build,
            )?,
            rate_limiter: Arc::new(RateLimiter::new(config.provider_burst, calls_per_second)),
        };
        registry.validate_profiles()?;
        Ok(registry)
    }

    fn validate_profiles(&self) -> AgentResult<()> {
        for (role, models) in [
            (ModelRole::Fast, &self.fast),
            (ModelRole::Reasoning, &self.reasoning),
            (ModelRole::Vision, &self.vision),
        ] {
            for model in std::iter::once(&models.primary).chain(models.fallback.iter()) {
                let Some(profile) = model.profile() else {
                    return Err(AgentError::Validation(format!(
                        "{} model is missing a capability profile",
                        role.as_str()
                    )));
                };
                if !profile.tool_calling
                    || !profile.streaming
                    || !profile.native_structured_output
                    || !profile.json_schema
                    || (role == ModelRole::Vision && !profile.modalities.image_in)
                {
                    return Err(AgentError::Validation(format!(
                        "{} model does not support the required agent capabilities",
                        role.as_str()
                    )));
                }
            }
        }
        Ok(())
    }
}

fn build_role(
    primary: Option<&str>,
    fallback: Option<&str>,
    build: &impl Fn(&str) -> AgentResult<Arc<dyn ChatModel<AgentRuntimeState>>>,
) -> AgentResult<RoleModels> {
    let primary = primary.ok_or_else(|| AgentError::Validation("missing model role".into()))?;
    Ok(RoleModels {
        primary: build(primary)?,
        fallback: fallback.map(build).transpose()?,
    })
}

fn required_key(lookup: &impl Fn(&str) -> Option<String>, name: &str) -> AgentResult<String> {
    lookup(name)
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AgentError::Validation(format!("{name} is required for agent models")))
}

fn configured_models(config: &AgentConfig) -> impl Iterator<Item = &str> {
    [
        config.fast_model.as_deref(),
        config.reasoning_model.as_deref(),
        config.vision_model.as_deref(),
        config.fast_fallback_model.as_deref(),
        config.reasoning_fallback_model.as_deref(),
        config.vision_fallback_model.as_deref(),
    ]
    .into_iter()
    .flatten()
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn config(provider: &str) -> AgentConfig {
        AgentConfig::from_lookup(|name| match name {
            "AGENTS_V2_ENABLED" => Some("true".into()),
            "AGENT_MODEL_PROVIDER" => Some(provider.into()),
            "AGENT_FAST_MODEL" => Some("fast".into()),
            "AGENT_REASONING_MODEL" => Some("reasoning".into()),
            "AGENT_VISION_MODEL" => Some("vision".into()),
            _ => None,
        })
        .unwrap()
    }

    #[tokio::test]
    async fn gemini_factory_reads_only_the_selected_provider_key() {
        let reads = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&reads);
        let registry = AgentModelRegistry::from_config_with(
            &config("gemini"),
            move |name| {
                observed.lock().unwrap().push(name.to_owned());
                (name == "GEMINI_API_KEY").then(|| "gemini-key".into())
            },
            None,
        )
        .await
        .unwrap();
        assert_eq!(
            registry
                .primary(ModelRole::Fast)
                .profile()
                .unwrap()
                .provider,
            Some("gemini".into())
        );
        assert_eq!(*reads.lock().unwrap(), ["GEMINI_API_KEY"]);
    }

    #[tokio::test]
    async fn perplexity_factory_validates_all_roles_and_reads_only_its_key() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 4096];
            let read = socket.read(&mut request).await.unwrap();
            let request = String::from_utf8_lossy(&request[..read]).into_owned();
            let body = serde_json::json!({
                "object": "list",
                "data": [{"id":"fast"},{"id":"reasoning"},{"id":"vision"}]
            })
            .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            socket.write_all(response.as_bytes()).await.unwrap();
            request
        });
        let reads = Arc::new(Mutex::new(Vec::new()));
        let observed = Arc::clone(&reads);
        let registry = AgentModelRegistry::from_config_with(
            &config("perplexity"),
            move |name| {
                observed.lock().unwrap().push(name.to_owned());
                (name == "PERPLEXITY_API_KEY").then(|| "perplexity-key".into())
            },
            Some(&format!("http://{address}")),
        )
        .await
        .unwrap();
        assert_eq!(
            registry
                .primary(ModelRole::Reasoning)
                .profile()
                .unwrap()
                .provider,
            Some("perplexity".into())
        );
        assert_eq!(*reads.lock().unwrap(), ["PERPLEXITY_API_KEY"]);
        let request = server.await.unwrap();
        assert!(request.starts_with("GET /models HTTP/1.1"));
        assert!(request.contains("authorization: Bearer perplexity-key"));
    }
}
