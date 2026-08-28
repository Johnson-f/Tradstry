use base64::Engine;
use serde_json::{Value, json};
use tinyagents::harness::message::{ContentBlock, Message};
use tinyagents::harness::model::{ModelRequest, ResponseFormat, ToolChoice};
use tinyagents::harness::tool::{SchemaPreparation, prepare_tool_schemas};
use tinyagents::{Result as TinyResult, TinyAgentsError};

use super::portable_schema;

const DEFAULT_MAX_OUTPUT_TOKENS: u32 = 8_192;

pub(super) fn compile_request(request: &ModelRequest) -> TinyResult<Value> {
    let mut system_text = Vec::new();
    let mut contents = Vec::new();
    for (index, message) in request.messages.iter().enumerate() {
        match message {
            Message::System(system) => {
                let text = system
                    .content
                    .iter()
                    .filter_map(ContentBlock::as_text)
                    .collect::<Vec<_>>()
                    .join("");
                if !text.is_empty() {
                    system_text.push(text);
                }
            }
            Message::User(user) => contents.push(json!({
                "role": "user",
                "parts": content_parts(&user.content)?
            })),
            Message::Assistant(assistant) => {
                let mut parts = content_parts(&assistant.content)?;
                let signatures = assistant
                    .content
                    .iter()
                    .filter_map(|block| match block {
                        ContentBlock::Thinking {
                            signature: Some(signature),
                            ..
                        } => Some(signature.clone()),
                        _ => None,
                    })
                    .collect::<Vec<_>>();
                for (tool_index, call) in assistant.tool_calls.iter().enumerate() {
                    let mut part = json!({
                        "functionCall": {"id": call.id, "name": call.name, "args": call.arguments}
                    });
                    if let Some(signature) = signatures.get(tool_index) {
                        part["thoughtSignature"] = json!(signature);
                    }
                    parts.push(part);
                }
                if !parts.is_empty() {
                    contents.push(json!({"role": "model", "parts": parts}));
                }
            }
            Message::Tool(tool) => {
                let name = tool_name_for_call(&request.messages[..index], &tool.tool_call_id)
                    .ok_or_else(|| {
                        TinyAgentsError::Validation(format!(
                            "tool result references unknown call id {}",
                            tool.tool_call_id
                        ))
                    })?;
                let response = tool
                    .artifact
                    .as_ref()
                    .filter(|value| value.is_object())
                    .cloned()
                    .unwrap_or_else(|| json!({"result": Message::Tool(tool.clone()).text()}));
                contents.push(json!({
                    "role": "user",
                    "parts": [{"functionResponse": {
                        "id": tool.tool_call_id, "name": name, "response": response
                    }}]
                }));
            }
        }
    }

    let mut body = json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": request.max_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS),
            "thinkingConfig": {"includeThoughts": true}
        }
    });
    if !system_text.is_empty() {
        body["systemInstruction"] = json!({"parts": [{"text": system_text.join("\n\n")} ]});
    }
    if let Some(temperature) = request.temperature {
        body["generationConfig"]["temperature"] = json!(temperature);
    }
    if let Some(top_p) = request.top_p {
        body["generationConfig"]["topP"] = json!(top_p);
    }
    if !request.stop_sequences.is_empty() {
        body["generationConfig"]["stopSequences"] = json!(request.stop_sequences);
    }
    match &request.response_format {
        Some(ResponseFormat::JsonObject) => {
            body["generationConfig"]["responseMimeType"] = json!("application/json");
        }
        Some(ResponseFormat::JsonSchema { schema, .. } | ResponseFormat::Auto { schema, .. }) => {
            body["generationConfig"]["responseMimeType"] = json!("application/json");
            body["generationConfig"]["responseJsonSchema"] = portable_schema(schema)?;
        }
        Some(ResponseFormat::Text) | None => {}
    }

    let tools = prepare_tool_schemas(&request.tools, &SchemaPreparation::gemini());
    if !tools.is_empty() {
        body["tools"] = json!([{"functionDeclarations": tools
            .into_iter()
            .map(|tool| {
                Ok(json!({
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": portable_schema(&tool.parameters)?
                }))
            })
            .collect::<TinyResult<Vec<_>>>()?}]);
    }
    let mode = match &request.tool_choice {
        ToolChoice::Auto => "VALIDATED",
        ToolChoice::None => "NONE",
        ToolChoice::Required | ToolChoice::Tool(_) => "ANY",
    };
    body["toolConfig"] = json!({"functionCallingConfig": {"mode": mode}});
    if let ToolChoice::Tool(name) = &request.tool_choice {
        body["toolConfig"]["functionCallingConfig"]["allowedFunctionNames"] = json!([name]);
    }
    Ok(body)
}

fn content_parts(blocks: &[ContentBlock]) -> TinyResult<Vec<Value>> {
    let mut parts = Vec::new();
    for block in blocks {
        match block {
            ContentBlock::Text(text) if !text.is_empty() => parts.push(json!({"text": text})),
            ContentBlock::Json(value) => parts.push(json!({"text": value.to_string()})),
            ContentBlock::Image(image) => {
                let (mime_type, data) = decode_data_uri(&image.url, image.mime_type.as_deref())?;
                parts.push(json!({"inlineData": {"mimeType": mime_type, "data": data}}));
            }
            ContentBlock::Thinking { text, signature } if !text.is_empty() => {
                let mut part = json!({"text": text, "thought": true});
                if let Some(signature) = signature {
                    part["thoughtSignature"] = json!(signature);
                }
                parts.push(part);
            }
            ContentBlock::ProviderExtension(value) => {
                let file = value.get("gemini_file_data").ok_or_else(|| {
                    TinyAgentsError::Validation(
                        "Gemini provider extension must contain gemini_file_data".into(),
                    )
                })?;
                let mime_type = file
                    .get("mime_type")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        TinyAgentsError::Validation("Gemini file data is missing mime_type".into())
                    })?;
                let file_uri = file
                    .get("file_uri")
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        TinyAgentsError::Validation("Gemini file data is missing file_uri".into())
                    })?;
                parts.push(json!({"fileData": {"mimeType": mime_type, "fileUri": file_uri}}));
            }
            ContentBlock::Text(_)
            | ContentBlock::Thinking { .. }
            | ContentBlock::RedactedThinking { .. } => {}
        }
    }
    if parts.is_empty() {
        parts.push(json!({"text": ""}));
    }
    Ok(parts)
}

fn decode_data_uri(url: &str, mime_hint: Option<&str>) -> TinyResult<(String, String)> {
    let value = url.strip_prefix("data:").ok_or_else(|| {
        TinyAgentsError::Validation("Gemini image inputs must be inline data URIs".into())
    })?;
    let (header, data) = value
        .split_once(',')
        .ok_or_else(|| TinyAgentsError::Validation("Gemini image data URI is malformed".into()))?;
    if !header.ends_with(";base64") {
        return Err(TinyAgentsError::Validation(
            "Gemini image data URI must be base64 encoded".into(),
        ));
    }
    let mime_type = header.trim_end_matches(";base64");
    let mime_type = if mime_type.is_empty() {
        mime_hint.unwrap_or("application/octet-stream")
    } else {
        mime_type
    };
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| TinyAgentsError::Validation("Gemini image base64 is invalid".into()))?;
    Ok((mime_type.to_owned(), data.to_owned()))
}

fn tool_name_for_call(messages: &[Message], call_id: &str) -> Option<String> {
    messages.iter().rev().find_map(|message| match message {
        Message::Assistant(assistant) => assistant
            .tool_calls
            .iter()
            .find(|call| call.id == call_id)
            .map(|call| call.name.clone()),
        _ => None,
    })
}
