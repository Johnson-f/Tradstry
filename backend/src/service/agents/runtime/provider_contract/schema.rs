use serde_json::{Map, Value};
use thiserror::Error;

#[derive(Clone, Debug, Error, PartialEq, Eq)]
#[error("provider schema is not portable at {pointer}: {reason}")]
pub struct ProviderContractError {
    pub pointer: String,
    pub reason: String,
}

pub fn compile_schema(schema: &Value) -> Result<Value, ProviderContractError> {
    let mut compiled = schema.clone();
    compile_node(&mut compiled, "")?;
    Ok(compiled)
}

fn compile_node(value: &mut Value, pointer: &str) -> Result<(), ProviderContractError> {
    let Some(object) = value.as_object_mut() else {
        return Ok(());
    };
    for keyword in ["oneOf", "anyOf", "allOf", "$ref", "$defs", "definitions"] {
        if object.contains_key(keyword) {
            return Err(error(
                &join(pointer, keyword),
                "schema unions and references are outside the portable subset",
            ));
        }
    }
    if matches!(object.get("enum"), Some(Value::Array(values)) if values.is_empty()) {
        return Err(error(
            &join(pointer, "enum"),
            "enum must contain at least one value",
        ));
    }
    if matches!(object.get("type"), Some(Value::Array(_))) {
        return Err(error(
            &join(pointer, "type"),
            "union types are outside the portable subset",
        ));
    }
    if object.get("type").and_then(Value::as_str) == Some("object") {
        match object.get("properties") {
            Some(Value::Object(_)) => {}
            _ => {
                return Err(error(
                    &join(pointer, "properties"),
                    "object schemas must declare properties",
                ));
            }
        }
        if object.get("additionalProperties") == Some(&Value::Bool(true)) {
            return Err(error(
                &join(pointer, "additionalProperties"),
                "open objects are outside the portable subset",
            ));
        }
        object.insert("additionalProperties".into(), Value::Bool(false));
    }
    if let Some(Value::Object(properties)) = object.get_mut("properties") {
        compile_properties(properties, pointer)?;
    }
    if let Some(items) = object.get_mut("items") {
        compile_node(items, &join(pointer, "items"))?;
    } else if object.get("type").and_then(Value::as_str) == Some("array") {
        return Err(error(
            &join(pointer, "items"),
            "array schemas must declare typed items",
        ));
    }
    Ok(())
}

fn compile_properties(
    properties: &mut Map<String, Value>,
    pointer: &str,
) -> Result<(), ProviderContractError> {
    for (name, schema) in properties {
        compile_node(schema, &join(&join(pointer, "properties"), name))?;
    }
    Ok(())
}

fn join(pointer: &str, segment: &str) -> String {
    format!(
        "{pointer}/{}",
        segment.replace('~', "~0").replace('/', "~1")
    )
}

fn error(pointer: &str, reason: &str) -> ProviderContractError {
    ProviderContractError {
        pointer: if pointer.is_empty() {
            "/".into()
        } else {
            pointer.into()
        },
        reason: reason.into(),
    }
}
