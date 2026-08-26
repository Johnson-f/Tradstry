use std::sync::Arc;

use tinyagents::harness::model::ChatModel;

use super::{AgentRuntimeState, GeminiModel};
use crate::service::agents::{AgentConfig, AgentError, AgentResult};

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
        }
    }

    pub fn from_config(config: &AgentConfig) -> AgentResult<Self> {
        if !config.enabled {
            return Err(AgentError::Disabled);
        }
        Ok(Self {
            fast: build_role(
                config.fast_model.as_deref(),
                config.fast_fallback_model.as_deref(),
            )?,
            reasoning: build_role(
                config.reasoning_model.as_deref(),
                config.reasoning_fallback_model.as_deref(),
            )?,
            vision: build_role(
                config.vision_model.as_deref(),
                config.vision_fallback_model.as_deref(),
            )?,
        })
    }

    pub fn primary(&self, role: ModelRole) -> Arc<dyn ChatModel<AgentRuntimeState>> {
        Arc::clone(&self.role(role).primary)
    }

    pub fn fallback(&self, role: ModelRole) -> Option<Arc<dyn ChatModel<AgentRuntimeState>>> {
        self.role(role).fallback.clone()
    }

    fn role(&self, role: ModelRole) -> &RoleModels {
        match role {
            ModelRole::Fast => &self.fast,
            ModelRole::Reasoning => &self.reasoning,
            ModelRole::Vision => &self.vision,
        }
    }
}

fn build_role(primary: Option<&str>, fallback: Option<&str>) -> AgentResult<RoleModels> {
    let primary = primary.ok_or_else(|| AgentError::Validation("missing model role".into()))?;
    Ok(RoleModels {
        primary: Arc::new(GeminiModel::from_env(primary)?),
        fallback: fallback
            .map(GeminiModel::from_env)
            .transpose()?
            .map(|model| Arc::new(model) as Arc<dyn ChatModel<AgentRuntimeState>>),
    })
}
