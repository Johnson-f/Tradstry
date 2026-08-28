mod gemini;
mod perplexity;
mod schema;

pub use schema::{ProviderContractError, compile_schema};

use serde_json::Value;
use tinyagents::TinyAgentsError;
use tinyagents::harness::model::ModelRequest;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderDialect {
    Gemini,
    Perplexity,
}

pub(super) fn compile_request(
    dialect: ProviderDialect,
    model: &str,
    request: &ModelRequest,
    stream: bool,
) -> Result<Value, TinyAgentsError> {
    match dialect {
        ProviderDialect::Gemini => gemini::compile_request(request),
        ProviderDialect::Perplexity => perplexity::compile_request(model, request, stream),
    }
}

pub fn portable_schema(schema: &Value) -> Result<Value, TinyAgentsError> {
    compile_schema(schema).map_err(|error| {
        TinyAgentsError::Validation(format!(
            "provider contract rejected schema at {}: {}",
            error.pointer, error.reason
        ))
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tinyagents::harness::message::Message;
    use tinyagents::harness::model::{ModelRequest, ResponseFormat};

    use super::*;
    use crate::service::agents::runtime::schemas::contract_fixtures;

    #[test]
    fn portable_schema_closes_nested_objects_and_rejects_unions() {
        let closed = compile_schema(&json!({
            "type":"object",
            "properties":{
                "item":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}
            },
            "required":["item"]
        }))
        .unwrap();
        assert_eq!(closed["properties"]["item"]["additionalProperties"], false);

        let error = compile_schema(&json!({
            "type":"array",
            "items":{"oneOf":[{"type":"string"},{"type":"number"}]}
        }))
        .unwrap_err();
        assert_eq!(error.pointer, "/items/oneOf");
    }

    #[test]
    fn every_runtime_schema_compiles_to_both_provider_requests() {
        for (name, schema) in contract_fixtures() {
            let request = ModelRequest {
                messages: vec![Message::user("test")],
                response_format: Some(ResponseFormat::json_schema(name, schema)),
                ..Default::default()
            };
            for dialect in [ProviderDialect::Gemini, ProviderDialect::Perplexity] {
                compile_request(dialect, "test-model", &request, false)
                    .unwrap_or_else(|error| panic!("{dialect:?}/{name}: {error}"));
            }
        }
    }
}
