use serde::{Deserialize, Serialize};

use crate::service::agents::{AgentError, AgentResult};

pub struct DeepStageTransition<'a> {
    pub expected: DeepStage,
    pub next: DeepStage,
    pub checkpoint: &'a serde_json::Value,
    pub event_kind: &'a str,
    pub event_payload: &'a serde_json::Value,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum DeepStage {
    Queued,
    Routed,
    SpecialistsSelected,
    SpecialistsCompleted,
    Synthesized,
    Verified,
    Completed,
}

impl DeepStage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Routed => "routed",
            Self::SpecialistsSelected => "specialists_selected",
            Self::SpecialistsCompleted => "specialists_completed",
            Self::Synthesized => "synthesized",
            Self::Verified => "verified",
            Self::Completed => "completed",
        }
    }

    pub fn parse(value: &str) -> AgentResult<Self> {
        match value {
            "queued" => Ok(Self::Queued),
            "routed" => Ok(Self::Routed),
            "specialists_selected" => Ok(Self::SpecialistsSelected),
            "specialists_completed" => Ok(Self::SpecialistsCompleted),
            "synthesized" => Ok(Self::Synthesized),
            "verified" => Ok(Self::Verified),
            "completed" => Ok(Self::Completed),
            _ => Err(AgentError::Validation("unknown deep-run stage".into())),
        }
    }

    pub fn can_advance_to(self, next: Self) -> bool {
        next as u8 == self as u8 + 1
    }
}

#[cfg(test)]
mod tests {
    use super::DeepStage;

    #[test]
    fn stages_only_advance_one_step() {
        assert!(DeepStage::Routed.can_advance_to(DeepStage::SpecialistsSelected));
        assert!(!DeepStage::Synthesized.can_advance_to(DeepStage::SpecialistsSelected));
        assert!(!DeepStage::Routed.can_advance_to(DeepStage::Synthesized));
    }
}
