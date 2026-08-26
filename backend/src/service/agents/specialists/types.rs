use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::service::agents::{AgentClaim, AgentError, AgentResult};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SpecialistKind {
    Performance,
    TradeReview,
    MarketResearch,
    Knowledge,
}

impl SpecialistKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Performance => "performance",
            Self::TradeReview => "trade_review",
            Self::MarketResearch => "market_research",
            Self::Knowledge => "knowledge",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SpecialistRequest {
    pub specialist: SpecialistKind,
    pub query: String,
    #[serde(default)]
    pub focus: Vec<String>,
}

impl SpecialistRequest {
    pub fn new(specialist: SpecialistKind, query: impl Into<String>) -> AgentResult<Self> {
        let query = query.into();
        if query.trim().is_empty() || query.len() > 4_000 {
            return Err(AgentError::Validation(
                "specialist query must contain 1 to 4000 bytes".into(),
            ));
        }
        Ok(Self {
            specialist,
            query: query.trim().into(),
            focus: Vec::new(),
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DelegationPlan {
    pub rationale: String,
    pub requests: Vec<SpecialistRequest>,
}

impl DelegationPlan {
    pub fn try_new(
        rationale: impl Into<String>,
        requests: Vec<SpecialistRequest>,
    ) -> AgentResult<Self> {
        let rationale = rationale.into();
        if rationale.trim().is_empty() {
            return Err(AgentError::Validation(
                "delegation rationale cannot be blank".into(),
            ));
        }
        if requests.is_empty() || requests.len() > 3 {
            return Err(AgentError::Validation(
                "deep runs require 1 to 3 specialists".into(),
            ));
        }
        let unique = requests
            .iter()
            .map(|request| request.specialist)
            .collect::<HashSet<_>>();
        if unique.len() != requests.len() {
            return Err(AgentError::Validation(
                "delegation specialists must be unique".into(),
            ));
        }
        let mut normalized_requests = Vec::with_capacity(requests.len());
        for request in requests {
            let mut normalized = SpecialistRequest::new(request.specialist, request.query)?;
            if request.focus.len() > 10
                || request
                    .focus
                    .iter()
                    .any(|focus| focus.trim().is_empty() || focus.len() > 200)
            {
                return Err(AgentError::Validation(
                    "specialist focus must contain at most 10 bounded items".into(),
                ));
            }
            normalized.focus = request
                .focus
                .into_iter()
                .map(|focus| focus.trim().to_string())
                .collect();
            normalized_requests.push(normalized);
        }
        Ok(Self {
            rationale: rationale.trim().into(),
            requests: normalized_requests,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SpecialistFinding {
    pub specialist: SpecialistKind,
    pub summary: String,
    pub claims: Vec<AgentClaim>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub missing_information: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceSufficiency {
    Sufficient,
    StaleOnly,
    Missing,
    Conflicting,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CorrectiveEvidenceRequest {
    pub specialist: SpecialistKind,
    pub missing_evidence: String,
}

impl CorrectiveEvidenceRequest {
    pub fn new(
        specialist: SpecialistKind,
        missing_evidence: impl Into<String>,
    ) -> AgentResult<Self> {
        let missing_evidence = missing_evidence.into();
        if missing_evidence.trim().is_empty() || missing_evidence.len() > 1_000 {
            return Err(AgentError::Validation(
                "corrective evidence request must be specific".into(),
            ));
        }
        Ok(Self {
            specialist,
            missing_evidence: missing_evidence.trim().into(),
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum VerificationDecision {
    Approved,
    Correct {
        requests: Vec<CorrectiveEvidenceRequest>,
    },
    Rejected {
        reason: String,
    },
}

impl VerificationDecision {
    pub fn correct(requests: Vec<CorrectiveEvidenceRequest>) -> AgentResult<Self> {
        if requests.is_empty() || requests.len() > 3 {
            return Err(AgentError::Validation(
                "a corrective verdict requires 1 to 3 evidence requests".into(),
            ));
        }
        Ok(Self::Correct { requests })
    }

    pub fn rejected(reason: impl Into<String>) -> AgentResult<Self> {
        let reason = reason.into();
        if reason.trim().is_empty() {
            return Err(AgentError::Validation(
                "a rejected verdict requires a reason".into(),
            ));
        }
        Ok(Self::Rejected {
            reason: reason.trim().into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(kind: SpecialistKind) -> SpecialistRequest {
        SpecialistRequest::new(kind, "test").unwrap()
    }

    #[test]
    fn delegation_rejects_duplicates_and_more_than_three_specialists() {
        assert!(
            DelegationPlan::try_new(
                "duplicate",
                vec![
                    request(SpecialistKind::Performance),
                    request(SpecialistKind::Performance),
                ],
            )
            .is_err()
        );
        assert!(
            DelegationPlan::try_new(
                "overflow",
                vec![
                    request(SpecialistKind::Performance),
                    request(SpecialistKind::TradeReview),
                    request(SpecialistKind::MarketResearch),
                    request(SpecialistKind::Knowledge),
                ],
            )
            .is_err()
        );
    }

    #[test]
    fn corrective_verdict_requires_specific_missing_evidence() {
        assert!(VerificationDecision::correct(vec![]).is_err());
        assert!(CorrectiveEvidenceRequest::new(SpecialistKind::Performance, "").is_err());
    }
}
