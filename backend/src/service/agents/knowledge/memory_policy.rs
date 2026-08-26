use unicode_normalization::UnicodeNormalization;

use crate::service::agents::{AgentError, AgentMemoryKind, AgentMemoryStatus, AgentResult};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MemoryCandidate {
    pub kind: AgentMemoryKind,
    pub subject: String,
    pub statement: String,
    pub provenance_excerpt: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MemoryAdmission {
    pub subject_key: String,
    pub status: AgentMemoryStatus,
}

pub fn admit_user_candidate(
    source_role: &str,
    user_message: &str,
    candidate: &MemoryCandidate,
    confidence: f64,
) -> AgentResult<MemoryAdmission> {
    if source_role != "user" {
        return Err(AgentError::Validation(
            "durable memory may only come from a user message".into(),
        ));
    }
    if user_message.trim().is_empty()
        || candidate.subject.trim().is_empty()
        || candidate.statement.trim().is_empty()
        || candidate.provenance_excerpt.trim().is_empty()
        || candidate.statement.chars().count() > 2_000
        || !(0.0..=1.0).contains(&confidence)
    {
        return Err(AgentError::Validation("invalid memory candidate".into()));
    }
    let source = user_message.to_lowercase();
    let statement = candidate.statement.to_lowercase();
    if contains_secret_language(&source)
        || contains_changing_fact(&source)
        || contains_changing_fact(&statement)
    {
        return Err(AgentError::Validation(
            "changing facts and secrets cannot become durable memory".into(),
        ));
    }
    let stable_shape = match candidate.kind {
        AgentMemoryKind::Preference => contains_any(
            &source,
            &["i prefer", "i like", "i don't like", "i dislike"],
        ),
        AgentMemoryKind::Goal => contains_any(&source, &["my goal", "i want to", "i aim to"]),
        AgentMemoryKind::Routine => contains_any(
            &source,
            &[
                "i usually",
                "i always",
                "my routine",
                "every day",
                "every week",
            ],
        ),
        AgentMemoryKind::Instruction => {
            contains_any(&source, &["always ", "never ", "please always", "when you"])
        }
    };
    if !stable_shape {
        return Err(AgentError::Validation(
            "message does not clearly state a stable user-authored memory".into(),
        ));
    }
    Ok(MemoryAdmission {
        subject_key: subject_key(&candidate.subject)?,
        status: if confidence >= 0.85 {
            AgentMemoryStatus::Active
        } else {
            AgentMemoryStatus::PendingReview
        },
    })
}

pub fn subject_key(subject: &str) -> AgentResult<String> {
    let normalized = subject
        .nfkc()
        .flat_map(char::to_lowercase)
        .map(|ch| if ch.is_alphanumeric() { ch } else { '_' })
        .collect::<String>();
    let slug = normalized
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
        .chars()
        .take(120)
        .collect::<String>();
    if slug.is_empty() {
        Err(AgentError::Validation("memory subject is too broad".into()))
    } else {
        Ok(slug)
    }
}

fn contains_secret_language(value: &str) -> bool {
    contains_any(
        value,
        &[
            "password",
            "api key",
            "secret key",
            "access token",
            "private key",
            "seed phrase",
        ],
    )
}

fn contains_changing_fact(value: &str) -> bool {
    contains_any(
        value,
        &[
            "current price",
            "price is",
            "my balance",
            "balance is",
            "my p&l",
            "p&l is",
            "my pnl",
            "pnl is",
            "win rate is",
            "i hold ",
            "i own ",
            "my position",
            "open position",
            "my order",
            "shares of",
            "today i",
            "today my",
            "right now",
            "tomorrow i",
            "yesterday i",
        ],
    )
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(kind: AgentMemoryKind, statement: &str) -> MemoryCandidate {
        MemoryCandidate {
            kind,
            subject: "Review Style".into(),
            statement: statement.into(),
            provenance_excerpt: statement.into(),
        }
    }

    #[test]
    fn admits_stable_preferences_goals_and_instructions() {
        for (message, value) in [
            (
                "I prefer concise reviews",
                candidate(AgentMemoryKind::Preference, "Prefers concise reviews"),
            ),
            (
                "My goal is to stop revenge trading",
                candidate(AgentMemoryKind::Goal, "Wants to stop revenge trading"),
            ),
            (
                "Always compare my exits with my playbook",
                candidate(
                    AgentMemoryKind::Instruction,
                    "Compare exits with the playbook",
                ),
            ),
        ] {
            assert_eq!(
                admit_user_candidate("user", message, &value, 0.95)
                    .unwrap()
                    .status,
                AgentMemoryStatus::Active
            );
        }
    }

    #[test]
    fn rejects_non_user_changing_facts_and_secrets() {
        for message in [
            "Today I hold AAPL",
            "My balance is $500",
            "My P&L is -20",
            "My win rate is 40%",
            "I prefer using API key abc",
            "My position is 100 shares of NVDA",
        ] {
            assert!(
                admit_user_candidate(
                    "user",
                    message,
                    &candidate(AgentMemoryKind::Preference, message),
                    0.99
                )
                .is_err()
            );
        }
        assert!(
            admit_user_candidate(
                "assistant",
                "I prefer concise reviews",
                &candidate(AgentMemoryKind::Preference, "concise"),
                0.99
            )
            .is_err()
        );
    }

    #[test]
    fn subject_keys_use_unicode_normalization() {
        assert_eq!(subject_key(" Review  Style ").unwrap(), "review_style");
        assert_eq!(subject_key("Risk–Routine").unwrap(), "risk_routine");
    }
}
