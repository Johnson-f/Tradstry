use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RewriteAction {
    Summarize,
    FixSpelling,
    Simplify,
    Expand,
}

impl RewriteAction {
    pub fn instruction(self) -> &'static str {
        match self {
            Self::Summarize => "Summarize the selection while preserving the author's meaning.",
            Self::FixSpelling => "Fix spelling and grammar without changing meaning or voice.",
            Self::Simplify => "Simplify the selection while preserving its important details.",
            Self::Expand => "Expand the selection with clearer detail, without inventing facts.",
        }
    }
}

impl TryFrom<&str> for RewriteAction {
    type Error = AgentError;
    fn try_from(value: &str) -> AgentResult<Self> {
        match value {
            "summarize" => Ok(Self::Summarize),
            "fix_spelling" => Ok(Self::FixSpelling),
            "simplify" => Ok(Self::Simplify),
            "expand" => Ok(Self::Expand),
            _ => Err(AgentError::Validation(
                "unknown notebook rewrite action".into(),
            )),
        }
    }
}
