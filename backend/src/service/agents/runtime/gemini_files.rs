use std::time::{Duration, Instant};

use serde_json::Value;

use crate::service::agents::{AgentError, AgentResult};

pub async fn upload_video(
    bytes: Vec<u8>,
    mime_type: &str,
    display_name: &str,
) -> AgentResult<(String, String)> {
    if bytes.is_empty() || bytes.len() > 50 * 1024 * 1024 || !mime_type.starts_with("video/") {
        return Err(AgentError::Validation(
            "attached video type or size is unsupported".into(),
        ));
    }
    let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| {
        AgentError::Validation("GEMINI_API_KEY is required for video analysis".into())
    })?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| AgentError::Internal)?;
    let start = client
        .post(format!("https://generativelanguage.googleapis.com/upload/v1beta/files?key={api_key}"))
        .header("X-Goog-Upload-Protocol", "resumable")
        .header("X-Goog-Upload-Command", "start")
        .header("X-Goog-Upload-Header-Content-Length", bytes.len())
        .header("X-Goog-Upload-Header-Content-Type", mime_type)
        .json(&serde_json::json!({"file":{"display_name":display_name.chars().take(120).collect::<String>()}}))
        .send().await.map_err(provider_error)?;
    if !start.status().is_success() {
        return Err(provider_status("start", start.status()));
    }
    let upload_url = start
        .headers()
        .get("x-goog-upload-url")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or(AgentError::ProviderUnavailable)?;
    let uploaded = client
        .post(upload_url)
        .header("Content-Length", bytes.len())
        .header("X-Goog-Upload-Offset", "0")
        .header("X-Goog-Upload-Command", "upload, finalize")
        .body(bytes)
        .send()
        .await
        .map_err(provider_error)?;
    if !uploaded.status().is_success() {
        return Err(provider_status("finalize", uploaded.status()));
    }
    let file: Value = uploaded.json().await.map_err(provider_error)?;
    let name = file
        .pointer("/file/name")
        .and_then(Value::as_str)
        .ok_or(AgentError::ProviderUnavailable)?
        .to_string();
    let deadline = Instant::now() + Duration::from_secs(75);
    loop {
        let response = client
            .get(format!(
                "https://generativelanguage.googleapis.com/v1beta/{name}?key={api_key}"
            ))
            .send()
            .await
            .map_err(provider_error)?;
        if !response.status().is_success() {
            return Err(provider_status("poll", response.status()));
        }
        let file: Value = response.json().await.map_err(provider_error)?;
        let state = file
            .pointer("/state")
            .and_then(Value::as_str)
            .or_else(|| file.pointer("/file/state").and_then(Value::as_str))
            .unwrap_or("PROCESSING");
        if state == "ACTIVE" {
            let uri = file
                .pointer("/uri")
                .and_then(Value::as_str)
                .or_else(|| file.pointer("/file/uri").and_then(Value::as_str))
                .ok_or(AgentError::ProviderUnavailable)?;
            return Ok((mime_type.to_string(), uri.to_string()));
        }
        if matches!(state, "FAILED" | "ERROR") || Instant::now() >= deadline {
            return Err(AgentError::ProviderUnavailable);
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

fn provider_error(_error: reqwest::Error) -> AgentError {
    log::warn!("Gemini Files request failed");
    AgentError::ProviderUnavailable
}

fn provider_status(stage: &str, status: reqwest::StatusCode) -> AgentError {
    log::warn!("Gemini Files {stage} returned {status}");
    AgentError::ProviderUnavailable
}
