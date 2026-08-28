use std::collections::HashSet;

use serde_json::{Value, json};
use tinyagents::harness::message::{ContentBlock, Message};
use tinyagents::harness::model::{ModelRequest, ResponseFormat, ToolChoice};
use tinyagents::harness::tool::{SchemaPreparation, prepare_tool_schemas};
use tinyagents::{Result as TinyResult, TinyAgentsError};

use super::portable_schema;

const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 8_192;

pub(super) fn compile_request(
    model: &str,
    request: &ModelRequest,
    stream: bool,
) -> TinyResult<Value> {
    let mut instructions = Vec::new();
    let mut input = Vec::new();
    let mut known_calls = HashSet::new();

    for message in &request.messages {
        match message {
            Message::System(system) => {
                let text = text_blocks(&system.content, false)?;
                if !text.is_empty() {
                    instructions.push(text);
                }
            }
            Message::User(user) => {
                let content = content_parts(&user.content, "input_text", true)?;
                if !content.is_empty() {
                    input.push(json!({"type": "message", "role": "user", "content": content}));
                }
            }
            Message::Assistant(assistant) => {
                let content = content_parts(&assistant.content, "output_text", false)?;
                if !content.is_empty() {
                    input.push(json!({"type": "message", "role": "assistant", "content": content}));
                }
                for call in &assistant.tool_calls {
                    if call.id.trim().is_empty() || call.name.trim().is_empty() {
                        return Err(TinyAgentsError::Validation(
                            "Perplexity tool calls require non-blank ids and names".into(),
                        ));
                    }
                    known_calls.insert(call.id.clone());
                    input.push(json!({
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.name,
                        "arguments": call.arguments.to_string(),
                    }));
                }
            }
            Message::Tool(tool) => {
                if !known_calls.contains(&tool.tool_call_id) {
                    return Err(TinyAgentsError::Validation(format!(
                        "Perplexity tool result references unknown call id {}",
                        tool.tool_call_id
                    )));
                }
                let output = tool
                    .artifact
                    .as_ref()
                    .map(Value::to_string)
                    .unwrap_or_else(|| Message::Tool(tool.clone()).text());
                input.push(json!({
                    "type": "function_call_output",
                    "call_id": tool.tool_call_id,
                    "output": output,
                }));
            }
        }
    }

    let mut body = json!({
        "model": model,
        "input": input,
        "max_output_tokens": request.max_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
        "stream": stream,
    });
    if !instructions.is_empty() {
        body["instructions"] = json!(instructions.join("\n\n"));
    }
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }
    if let Some(top_p) = request.top_p {
        body["top_p"] = json!(top_p);
    }

    let tools = prepare_tool_schemas(&request.tools, &SchemaPreparation::openai());
    if !tools.is_empty() {
        if let ToolChoice::Tool(name) = &request.tool_choice
            && !tools.iter().any(|tool| &tool.name == name)
        {
            return Err(TinyAgentsError::Validation(format!(
                "Perplexity named tool choice is not registered: {name}"
            )));
        }
        body["tools"] = Value::Array(
            tools
                .into_iter()
                .map(|tool| {
                    Ok(json!({
                        "type": "function",
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": portable_schema(&tool.parameters)?,
                        "strict": false,
                    }))
                })
                .collect::<TinyResult<Vec<_>>>()?,
        );
        body["tool_choice"] = match &request.tool_choice {
            ToolChoice::Auto => json!("auto"),
            ToolChoice::None => json!("none"),
            ToolChoice::Required => json!("required"),
            ToolChoice::Tool(name) => json!({"type": "function", "name": name}),
        };
    } else if matches!(
        request.tool_choice,
        ToolChoice::Required | ToolChoice::Tool(_)
    ) {
        return Err(TinyAgentsError::Validation(
            "Perplexity cannot require a tool when no tools are registered".into(),
        ));
    }

    if let Some(format) = &request.response_format {
        body["response_format"] = match format {
            ResponseFormat::Text => Value::Null,
            ResponseFormat::JsonObject => json!({"type": "json_object"}),
            ResponseFormat::JsonSchema { name, schema } | ResponseFormat::Auto { name, schema } => {
                json!({
                    "type": "json_schema",
                    "json_schema": {
                        "name": normalize_schema_name(name),
                        "schema": portable_schema(schema)?,
                    }
                })
            }
        };
        if body["response_format"].is_null() {
            body.as_object_mut().unwrap().remove("response_format");
        }
    }
    if let Some(reasoning) = &request.reasoning {
        let mut value = serde_json::Map::new();
        if let Some(effort) = reasoning.effort {
            value.insert("effort".into(), json!(effort.as_str()));
        }
        if let Some(summary) = reasoning.summary.as_ref() {
            value.insert("summary".into(), json!(summary));
        }
        if !value.is_empty() {
            body["reasoning"] = Value::Object(value);
        }
    }
    Ok(body)
}

fn text_blocks(blocks: &[ContentBlock], allow_images: bool) -> TinyResult<String> {
    let mut values = Vec::new();
    for block in blocks {
        match block {
            ContentBlock::Text(text) if !text.is_empty() => values.push(text.clone()),
            ContentBlock::Json(value) => values.push(value.to_string()),
            ContentBlock::Thinking { .. } => {}
            ContentBlock::Image(_) if allow_images => {}
            ContentBlock::Image(_) => {
                return Err(TinyAgentsError::Validation(
                    "Perplexity accepts images only in user messages".into(),
                ));
            }
            ContentBlock::RedactedThinking { .. } | ContentBlock::ProviderExtension(_) => {
                return Err(TinyAgentsError::Validation(
                    "Perplexity does not support this provider-specific content".into(),
                ));
            }
            ContentBlock::Text(_) => {}
        }
    }
    Ok(values.join("\n"))
}

fn content_parts(
    blocks: &[ContentBlock],
    text_kind: &str,
    allow_images: bool,
) -> TinyResult<Vec<Value>> {
    let mut parts = Vec::new();
    for block in blocks {
        match block {
            ContentBlock::Text(text) if !text.is_empty() => {
                parts.push(json!({"type": text_kind, "text": text}));
            }
            ContentBlock::Json(value) => {
                parts.push(json!({"type": text_kind, "text": value.to_string()}));
            }
            ContentBlock::Image(image) if allow_images => {
                if !image.url.starts_with("data:image/") && !image.url.starts_with("https://") {
                    return Err(TinyAgentsError::Validation(
                        "Perplexity images require an HTTPS URL or image data URI".into(),
                    ));
                }
                if let Some(mime_type) = image
                    .mime_type
                    .as_deref()
                    .or_else(|| image.url.strip_prefix("data:")?.split(';').next())
                    && !matches!(
                        mime_type,
                        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
                    )
                {
                    return Err(TinyAgentsError::Validation(format!(
                        "Perplexity does not support image type {mime_type}"
                    )));
                }
                parts.push(json!({"type": "input_image", "image_url": image.url}));
            }
            ContentBlock::Thinking { .. } => {}
            ContentBlock::Image(_) => {
                return Err(TinyAgentsError::Validation(
                    "Perplexity accepts images only in user messages".into(),
                ));
            }
            ContentBlock::RedactedThinking { .. } | ContentBlock::ProviderExtension(_) => {
                return Err(TinyAgentsError::Validation(
                    "Perplexity does not support this provider-specific content".into(),
                ));
            }
            ContentBlock::Text(_) => {}
        }
    }
    Ok(parts)
}

fn normalize_schema_name(name: &str) -> String {
    let normalized = name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .take(64)
        .collect::<String>();
    if normalized.is_empty() {
        "schema".into()
    } else {
        normalized
    }
}
