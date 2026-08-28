use serde::Serialize;
use serde_json::{Value, json};
use tinyagents::TinyAgentsError;

use crate::service::agents::AgentError;

#[derive(Clone, Copy, Debug)]
pub struct ModelCallContext<'a> {
    pub stage: &'a str,
    pub role: &'a str,
    pub schema_name: Option<&'a str>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFailure {
    pub provider: String,
    pub model: Option<String>,
    pub stage: String,
    pub role: String,
    pub status: Option<u16>,
    pub code: Option<String>,
    pub retryable: bool,
    pub retry_after_ms: Option<u64>,
    pub schema_name: Option<String>,
    pub error_code: String,
}

impl ProviderFailure {
    pub fn event_payload(&self) -> Value {
        json!({
            "errorCode": self.error_code,
            "provider": self.provider,
            "model": self.model,
            "stage": self.stage,
            "role": self.role,
            "status": self.status,
            "code": self.code,
            "retryable": self.retryable,
            "retryAfterMs": self.retry_after_ms,
            "schemaName": self.schema_name,
        })
    }
}

pub fn model_error(error: TinyAgentsError, context: ModelCallContext<'_>) -> AgentError {
    match error {
        TinyAgentsError::Cancelled => AgentError::Cancelled,
        TinyAgentsError::Provider(error) => {
            let error_code = classify(error.status, error.code.as_deref(), error.retryable);
            AgentError::Provider(Box::new(ProviderFailure {
                provider: error.provider,
                model: error.model,
                stage: context.stage.into(),
                role: context.role.into(),
                status: error.status,
                code: error.code,
                retryable: error.retryable,
                retry_after_ms: error.retry_after_ms,
                schema_name: context.schema_name.map(str::to_owned),
                error_code: error_code.into(),
            }))
        }
        TinyAgentsError::Model(_) => AgentError::Provider(Box::new(ProviderFailure {
            provider: "unknown".into(),
            model: None,
            stage: context.stage.into(),
            role: context.role.into(),
            status: None,
            code: None,
            retryable: false,
            retry_after_ms: None,
            schema_name: context.schema_name.map(str::to_owned),
            error_code: "provider_response_invalid".into(),
        })),
        TinyAgentsError::Validation(message)
            if message.starts_with("provider contract rejected schema") =>
        {
            AgentError::Provider(Box::new(ProviderFailure {
                provider: "local".into(),
                model: None,
                stage: context.stage.into(),
                role: context.role.into(),
                status: None,
                code: Some("schema_contract".into()),
                retryable: false,
                retry_after_ms: None,
                schema_name: context.schema_name.map(str::to_owned),
                error_code: "provider_contract_invalid".into(),
            }))
        }
        _ => AgentError::Internal,
    }
}

fn classify(status: Option<u16>, code: Option<&str>, retryable: bool) -> &'static str {
    match status {
        Some(401 | 403) => "provider_auth_failed",
        Some(429) => "provider_rate_limited",
        Some(400 | 422) => "provider_request_rejected",
        Some(408) => "provider_timeout",
        Some(500..=599) => "provider_unavailable",
        _ if code.is_some_and(|code| code.to_ascii_lowercase().contains("timeout")) => {
            "provider_timeout"
        }
        _ if retryable => "provider_unavailable",
        _ => "provider_response_invalid",
    }
}

#[cfg(test)]
mod tests {
    use tinyagents::harness::model::ProviderError;

    use super::*;

    #[test]
    fn preserves_safe_provider_detail_without_raw_body() {
        let error = model_error(
            TinyAgentsError::Provider(Box::new(ProviderError {
                provider: "perplexity".into(),
                model: Some("model".into()),
                status: Some(400),
                code: Some("invalid_request".into()),
                message: "secret provider body".into(),
                retryable: false,
                retry_after_ms: None,
                raw: Some(json!({"apiKey": "secret"})),
            })),
            ModelCallContext {
                stage: "turn",
                role: "reasoning",
                schema_name: Some("tradstry_answer"),
            },
        );
        let AgentError::Provider(failure) = error else {
            panic!("expected structured provider failure");
        };
        assert_eq!(failure.error_code, "provider_request_rejected");
        let payload = failure.event_payload().to_string();
        assert!(!payload.contains("secret"));
        assert!(!payload.contains("apiKey"));
    }

    #[test]
    fn classifies_provider_statuses_into_stable_codes() {
        for (status, retryable, expected) in [
            (401, false, "provider_auth_failed"),
            (429, true, "provider_rate_limited"),
            (422, false, "provider_request_rejected"),
            (408, true, "provider_timeout"),
            (503, true, "provider_unavailable"),
        ] {
            assert_eq!(classify(Some(status), None, retryable), expected);
        }
    }
}
