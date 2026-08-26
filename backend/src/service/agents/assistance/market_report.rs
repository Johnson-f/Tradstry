use crate::service::agents::runtime::ModelRole;
use crate::service::agents::{AgentActor, AgentError, AgentResult, AgentService};

const SYSTEM: &str = "You are a rigorous equity research analyst. State uncertainty, distinguish facts from inference, and return text only.";

pub async fn synthesize_market_report(
    service: &AgentService,
    actor: &AgentActor,
    prompt: &str,
) -> AgentResult<String> {
    validate_prompt(prompt)?;
    let output = super::invoke_text(
        service,
        actor,
        super::TextInvocation {
            workload: "market_report",
            role: ModelRole::Reasoning,
            system: SYSTEM,
            prompt: prompt.to_owned(),
            max_output_tokens: 12_000,
            timeout_ms: 60_000,
        },
    )
    .await?;
    let output = output.trim();
    if output.is_empty() {
        return Err(AgentError::ProviderUnavailable);
    }
    Ok(output.to_owned())
}

fn validate_prompt(prompt: &str) -> AgentResult<()> {
    if prompt.trim().is_empty() || prompt.chars().count() > 40_000 {
        return Err(AgentError::Validation(
            "market report prompt is empty or too large".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_oversized_prompts() {
        assert!(validate_prompt("").is_err());
        assert!(validate_prompt(&"x".repeat(40_001)).is_err());
        assert!(validate_prompt("Review AAPL").is_ok());
    }
}
