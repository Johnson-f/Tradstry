use tinyagents::harness::limits::RunLimits;
use tinyagents::harness::retry::FallbackPolicy;
use tinyagents::harness::runtime::AgentHarness;

use super::schemas::AgentSchema;
use super::{AgentModelRegistry, AgentRuntimeState};
use crate::service::agents::AgentResult;
use crate::service::agents::specialists::SpecialistDefinition;
use crate::service::agents::tools::ToolCatalog;

pub fn build_specialist_harness(
    models: &AgentModelRegistry,
    definition: &SpecialistDefinition,
) -> AgentResult<AgentHarness<AgentRuntimeState>> {
    let mut harness = AgentHarness::new();
    harness.push_model_middleware(models.rate_limit_middleware());
    harness
        .register_model("specialist-primary", models.primary(definition.model_role))
        .set_default_model("specialist-primary");
    let mut fallback_names = vec!["specialist-primary".to_string()];
    if let Some(fallback) = models.fallback(definition.model_role) {
        harness.register_model("specialist-fallback", fallback);
        fallback_names.push("specialist-fallback".into());
    }
    for tool in ToolCatalog::build(&definition.tools)? {
        harness.register_tool(tool);
    }
    let mut policy = super::build_run_policy();
    policy.limits = RunLimits::default()
        .with_max_model_calls(definition.max_model_calls)
        .with_max_tool_calls(definition.max_tool_calls)
        .with_max_wall_clock_ms(Some(definition.timeout_ms))
        .with_max_depth(1);
    policy.fallback = (fallback_names.len() > 1).then(|| FallbackPolicy::new(fallback_names));
    policy.default_response_format = Some(AgentSchema::SpecialistFinding.response_format());
    policy.error_on_empty_response = true;
    harness.with_policy(policy);
    Ok(harness)
}
