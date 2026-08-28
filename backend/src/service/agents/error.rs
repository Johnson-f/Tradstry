use thiserror::Error;

pub type AgentResult<T> = Result<T, AgentError>;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("agent runtime is disabled")]
    Disabled,
    #[error("agent resource not found")]
    NotFound,
    #[error("invalid agent request: {0}")]
    Validation(String),
    #[error("agent state changed; refresh and try again")]
    Conflict,
    #[error("AI action limit reached")]
    Capacity,
    #[error("agent provider is unavailable")]
    ProviderUnavailable,
    #[error("agent provider request failed")]
    Provider(Box<crate::service::agents::runtime::provider_failure::ProviderFailure>),
    #[error("agent answer could not be grounded")]
    GroundingInvalid,
    #[error("agent run cancelled")]
    Cancelled,
    #[error("internal agent failure")]
    Internal,
}

impl From<sqlx::Error> for AgentError {
    fn from(error: sqlx::Error) -> Self {
        log::error!("agent database failure: {error:#}");
        Self::Internal
    }
}
