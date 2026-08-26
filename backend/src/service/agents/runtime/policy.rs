use tinyagents::harness::limits::RunLimits;
use tinyagents::harness::retry::RetryPolicy;
use tinyagents::harness::runtime::{
    InvalidArgsPolicy, PayloadCapture, RunPolicy, UnknownToolPolicy,
};

pub fn build_run_policy() -> RunPolicy {
    RunPolicy {
        limits: RunLimits::default()
            .with_max_model_calls(12)
            .with_max_tool_calls(20)
            .with_max_wall_clock_ms(Some(120_000))
            .with_max_depth(1),
        unknown_tool: UnknownToolPolicy::ReturnToolError,
        invalid_args: InvalidArgsPolicy::ReturnToolError,
        retry: RetryPolicy::default()
            .with_default_retry_on()
            .with_max_attempts(3)
            .with_backoff_sleep(true),
        fallback: None,
        default_response_format: None,
        capture: PayloadCapture::default(),
        cache: tinyagents::harness::cache::CachePolicy {
            response_cache_enabled: false,
            ..Default::default()
        },
        error_on_empty_response: true,
        truncated_empty_retries: 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_is_bounded_and_payload_free() {
        let policy = build_run_policy();
        assert_eq!(policy.limits.max_model_calls, 12);
        assert_eq!(policy.limits.max_tool_calls, 20);
        assert_eq!(policy.limits.max_depth, 1);
        assert!(policy.capture.is_disabled());
        assert!(!policy.cache.response_cache_enabled);
        assert!(policy.error_on_empty_response);
    }
}
