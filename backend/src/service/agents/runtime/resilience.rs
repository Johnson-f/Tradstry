use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::Notify;

#[derive(Clone)]
pub struct ProviderCircuit {
    inner: Arc<ProviderCircuitInner>,
}

struct ProviderCircuitInner {
    state: Mutex<CircuitState>,
    notify: Notify,
    failure_threshold: u32,
    cooldown: Duration,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CircuitMode {
    Closed,
    Open { until: Instant },
}

#[derive(Clone, Copy, Debug)]
struct CircuitState {
    mode: CircuitMode,
    consecutive_failures: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CircuitLease {
    pub probe: bool,
    probe_until: Option<Instant>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderOutcome {
    Success,
    RetryableFailure,
    Neutral,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CircuitTransition {
    Opened,
    Closed,
}

impl ProviderCircuit {
    pub fn new(failure_threshold: u32, cooldown: Duration) -> Self {
        Self {
            inner: Arc::new(ProviderCircuitInner {
                state: Mutex::new(CircuitState {
                    mode: CircuitMode::Closed,
                    consecutive_failures: 0,
                }),
                notify: Notify::new(),
                failure_threshold,
                cooldown,
            }),
        }
    }

    pub async fn acquire(&self) -> CircuitLease {
        loop {
            let wait = {
                let mut state = self.inner.state.lock().expect("provider circuit poisoned");
                match state.mode {
                    CircuitMode::Closed => {
                        return CircuitLease {
                            probe: false,
                            probe_until: None,
                        };
                    }
                    CircuitMode::Open { until } if Instant::now() >= until => {
                        let probe_until = Instant::now() + self.inner.cooldown;
                        state.mode = CircuitMode::Open { until: probe_until };
                        return CircuitLease {
                            probe: true,
                            probe_until: Some(probe_until),
                        };
                    }
                    CircuitMode::Open { until } => until
                        .saturating_duration_since(Instant::now())
                        .max(Duration::from_millis(10)),
                }
            };
            tokio::select! {
                _ = tokio::time::sleep(wait) => {}
                _ = self.inner.notify.notified() => {}
            }
        }
    }

    pub fn complete(
        &self,
        lease: CircuitLease,
        outcome: ProviderOutcome,
    ) -> Option<CircuitTransition> {
        let mut state = self.inner.state.lock().expect("provider circuit poisoned");
        if lease.probe
            && !matches!(state.mode, CircuitMode::Open { until } if Some(until) == lease.probe_until)
        {
            return None;
        }
        let transition = match outcome {
            ProviderOutcome::Success | ProviderOutcome::Neutral => {
                let was_open = !matches!(state.mode, CircuitMode::Closed);
                state.mode = CircuitMode::Closed;
                state.consecutive_failures = 0;
                was_open.then_some(CircuitTransition::Closed)
            }
            ProviderOutcome::RetryableFailure => {
                state.consecutive_failures = state.consecutive_failures.saturating_add(1);
                if lease.probe || state.consecutive_failures >= self.inner.failure_threshold {
                    let was_closed = matches!(state.mode, CircuitMode::Closed);
                    state.mode = CircuitMode::Open {
                        until: Instant::now() + self.inner.cooldown,
                    };
                    was_closed.then_some(CircuitTransition::Opened)
                } else {
                    None
                }
            }
        };
        self.inner.notify.notify_waiters();
        transition
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn circuit_opens_then_allows_one_probe_and_recovers() {
        let circuit = ProviderCircuit::new(2, Duration::from_millis(10));
        let first = circuit.acquire().await;
        assert_eq!(
            circuit.complete(first, ProviderOutcome::RetryableFailure),
            None
        );
        let second = circuit.acquire().await;
        assert_eq!(
            circuit.complete(second, ProviderOutcome::RetryableFailure),
            Some(CircuitTransition::Opened)
        );

        let waiting = tokio::spawn({
            let circuit = circuit.clone();
            async move { circuit.acquire().await }
        });
        tokio::task::yield_now().await;
        assert!(!waiting.is_finished());
        tokio::time::sleep(Duration::from_millis(15)).await;
        let probe = waiting.await.unwrap();
        assert!(probe.probe);
        assert_eq!(
            circuit.complete(probe, ProviderOutcome::Success),
            Some(CircuitTransition::Closed)
        );
        assert!(!circuit.acquire().await.probe);
    }

    #[tokio::test]
    async fn abandoned_probe_expires_and_cannot_close_a_new_probe() {
        let circuit = ProviderCircuit::new(1, Duration::from_millis(5));
        let initial = circuit.acquire().await;
        circuit.complete(initial, ProviderOutcome::RetryableFailure);
        tokio::time::sleep(Duration::from_millis(7)).await;
        let stale_probe = circuit.acquire().await;
        tokio::time::sleep(Duration::from_millis(7)).await;
        let current_probe = circuit.acquire().await;
        assert_eq!(
            circuit.complete(stale_probe, ProviderOutcome::Success),
            None
        );
        assert_eq!(
            circuit.complete(current_probe, ProviderOutcome::Success),
            Some(CircuitTransition::Closed)
        );
    }
}
