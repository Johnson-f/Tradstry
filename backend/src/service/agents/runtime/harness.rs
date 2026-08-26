use tinyagents::harness::limits::RunLimits;
use tinyagents::harness::model::ResponseFormat;
use tinyagents::harness::retry::FallbackPolicy;
use tinyagents::harness::runtime::AgentHarness;

use super::{AgentModelRegistry, AgentRuntimeState};
use crate::service::agents::AgentResult;
use crate::service::agents::specialists::SpecialistDefinition;
use crate::service::agents::tools::ToolCatalog;

pub fn build_specialist_harness(
    models: &AgentModelRegistry,
    definition: &SpecialistDefinition,
) -> AgentResult<AgentHarness<AgentRuntimeState>> {
    let mut harness = AgentHarness::new();
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
    policy.default_response_format = Some(ResponseFormat::json_schema(
        "specialist_finding",
        specialist_finding_schema(),
    ));
    policy.error_on_empty_response = true;
    harness.with_policy(policy);
    Ok(harness)
}

fn specialist_finding_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "specialist": {"type": "string", "enum": ["performance", "trade_review", "market_research", "knowledge"]},
            "summary": {"type": "string"},
            "claims": {"type": "array", "items": {
                "type": "object", "additionalProperties": false,
                "properties": {
                    "claim_id": {"type": "string"},
                    "text": {"type": "string"},
                    "evidence_ids": {"type": "array", "minItems": 1, "maxItems": 5, "uniqueItems": true, "items": {"type": "string"}}
                },
                "required": ["claim_id", "text", "evidence_ids"]
            }},
            "warnings": {"type": "array", "items": {"type": "string"}},
            "missing_information": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["specialist", "summary", "claims", "warnings", "missing_information"]
    })
}
