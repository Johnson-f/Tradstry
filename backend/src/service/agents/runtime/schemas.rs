use serde::Deserialize;
use serde_json::{Value, json};
use tinyagents::harness::model::ResponseFormat;

use crate::service::agents::actions::{
    CreateNotebookNoteAction, PlaybookActionPatch, TradeTagAction, UpdatePlaybookAction,
};
use crate::service::agents::{
    AgentActionPayload, AgentClaim, AgentError, AgentResult, AnswerBlock, AnswerDraft,
};

pub enum AgentSchema {
    SpecialistFinding,
    Answer { name: &'static str },
    ActionProposal,
    MemoryCandidates,
}

impl AgentSchema {
    pub fn response_format(&self) -> ResponseFormat {
        let (name, schema) = match self {
            Self::SpecialistFinding => ("specialist_finding", specialist_finding_schema()),
            Self::Answer { name } => (*name, answer_schema()),
            Self::ActionProposal => ("agent_action", action_schema()),
            Self::MemoryCandidates => ("memory_candidates", memory_candidates_schema()),
        };
        ResponseFormat::json_schema(name, schema)
    }

    pub fn schema(&self) -> Value {
        match self.response_format() {
            ResponseFormat::JsonSchema { schema, .. } => schema,
            _ => unreachable!(),
        }
    }
}

pub fn decode_answer(value: Value) -> AgentResult<AnswerDraft> {
    let wire: WireAnswer = serde_json::from_value(value)
        .map_err(|_| AgentError::Validation("invalid structured answer".into()))?;
    let blocks = wire
        .blocks
        .into_iter()
        .map(WireAnswerBlock::decode)
        .collect::<AgentResult<Vec<_>>>()?;
    Ok(AnswerDraft {
        blocks,
        claims: wire.claims,
    })
}

pub fn decode_action(value: Value) -> AgentResult<AgentActionPayload> {
    let wire: WireAction = serde_json::from_value(value)
        .map_err(|_| AgentError::Validation("invalid closed action proposal".into()))?;
    let input = wire.input;
    match wire.kind.as_str() {
        "create_notebook_note"
            if input.playbook_id.is_none()
                && input.patch.is_none()
                && input.trade_id.is_none()
                && input.tag_id.is_none() =>
        {
            Ok(AgentActionPayload::CreateNotebookNote(
                CreateNotebookNoteAction {
                    title: required(input.title, "title")?,
                    markdown: required(input.markdown, "markdown")?,
                    trade_ids: input.trade_ids.unwrap_or_default(),
                    playbook_ids: input.playbook_ids.unwrap_or_default(),
                },
            ))
        }
        "update_playbook"
            if input.title.is_none()
                && input.markdown.is_none()
                && input.trade_ids.is_none()
                && input.playbook_ids.is_none()
                && input.trade_id.is_none()
                && input.tag_id.is_none() =>
        {
            Ok(AgentActionPayload::UpdatePlaybook(UpdatePlaybookAction {
                playbook_id: required(input.playbook_id, "playbook_id")?,
                expected_version: String::new(),
                patch: required(input.patch, "patch")?.into(),
            }))
        }
        "add_trade_tag" | "remove_trade_tag"
            if input.title.is_none()
                && input.markdown.is_none()
                && input.trade_ids.is_none()
                && input.playbook_ids.is_none()
                && input.playbook_id.is_none()
                && input.patch.is_none() =>
        {
            let action = TradeTagAction {
                trade_id: required(input.trade_id, "trade_id")?,
                tag_id: required(input.tag_id, "tag_id")?,
                expected_trade_version: String::new(),
            };
            if wire.kind == "add_trade_tag" {
                Ok(AgentActionPayload::AddTradeTag(action))
            } else {
                Ok(AgentActionPayload::RemoveTradeTag(action))
            }
        }
        _ => Err(AgentError::Validation(
            "action fields do not match the selected kind".into(),
        )),
    }
}

fn required<T>(value: Option<T>, name: &str) -> AgentResult<T> {
    value.ok_or_else(|| AgentError::Validation(format!("structured output is missing {name}")))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireAnswer {
    blocks: Vec<WireAnswerBlock>,
    claims: Vec<AgentClaim>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireAnswerBlock {
    kind: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    value: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    items: Vec<String>,
    #[serde(default)]
    proposal_id: String,
}

impl WireAnswerBlock {
    fn decode(self) -> AgentResult<AnswerBlock> {
        match self.kind.as_str() {
            "paragraph" => Ok(AnswerBlock::Paragraph {
                text: non_blank(self.text, "paragraph text")?,
            }),
            "warning" => Ok(AnswerBlock::Warning {
                text: non_blank(self.text, "warning text")?,
            }),
            "metric" => Ok(AnswerBlock::Metric {
                label: non_blank(self.label, "metric label")?,
                value: non_blank(self.value, "metric value")?,
            }),
            "list" => Ok(AnswerBlock::List {
                title: if !self.title.is_empty() {
                    Some(self.title)
                } else if !self.label.is_empty() {
                    Some(self.label)
                } else {
                    None
                },
                items: self.items,
            }),
            "action_proposal" => Ok(AnswerBlock::ActionProposal {
                proposal_id: non_blank(self.proposal_id, "proposal id")?,
            }),
            _ => Err(AgentError::Validation(
                "answer block fields do not match the selected kind".into(),
            )),
        }
    }
}

fn non_blank(value: String, name: &str) -> AgentResult<String> {
    if value.trim().is_empty() {
        Err(AgentError::Validation(format!(
            "structured output is missing {name}"
        )))
    } else {
        Ok(value)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireAction {
    kind: String,
    input: WireActionInput,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct WireActionInput {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default)]
    trade_ids: Option<Vec<String>>,
    #[serde(default)]
    playbook_ids: Option<Vec<String>>,
    #[serde(default)]
    playbook_id: Option<String>,
    #[serde(default)]
    patch: Option<WirePlaybookPatch>,
    #[serde(default)]
    trade_id: Option<String>,
    #[serde(default)]
    tag_id: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct WirePlaybookPatch {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    entry_rules: Option<String>,
    #[serde(default)]
    exit_rules: Option<String>,
    #[serde(default)]
    position_sizing_rules: Option<String>,
    #[serde(default)]
    additional_rules: Option<String>,
}

impl From<WirePlaybookPatch> for PlaybookActionPatch {
    fn from(value: WirePlaybookPatch) -> Self {
        Self {
            name: value.name,
            entry_rules: value.entry_rules,
            exit_rules: value.exit_rules,
            position_sizing_rules: value.position_sizing_rules,
            additional_rules: value.additional_rules,
        }
    }
}

fn specialist_finding_schema() -> Value {
    json!({
        "type":"object","properties":{
            "summary":{"type":"string"},
            "claims":{"type":"array","items":claim_schema()},
            "warnings":{"type":"array","items":{"type":"string"}},
            "missing_information":{"type":"array","items":{"type":"string"}}
        },"required":["summary","claims","warnings","missing_information"]
    })
}

fn answer_schema() -> Value {
    json!({
        "type":"object","properties":{
            "blocks":{"type":"array","items":{
                "type":"object","properties":{
                    "kind":{"type":"string","enum":["paragraph","metric","list","warning","action_proposal"]},
                    "text":{"type":"string"},
                    "label":{"type":"string"},
                    "value":{"type":"string"},
                    "title":{"type":"string"},
                    "items":{"type":"array","items":{"type":"string"}},
                    "proposal_id":{"type":"string"}
                },"required":["kind","text","label","value","title","items","proposal_id"]
            }},
            "claims":{"type":"array","items":claim_schema()}
        },"required":["blocks","claims"]
    })
}

fn claim_schema() -> Value {
    json!({
        "type":"object","properties":{
            "claim_id":{"type":"string"},
            "text":{"type":"string"},
            "evidence_ids":{"type":"array","minItems":1,"maxItems":5,"uniqueItems":true,"items":{"type":"string"}}
        },"required":["claim_id","text","evidence_ids"]
    })
}

fn action_schema() -> Value {
    json!({
        "type":"object","properties":{
            "kind":{"type":"string","enum":["create_notebook_note","update_playbook","add_trade_tag","remove_trade_tag"]},
            "input":{"type":"object","properties":{
                "title":{"type":"string","minLength":1,"maxLength":200},
                "markdown":{"type":"string","minLength":1,"maxLength":32000},
                "trade_ids":{"type":"array","maxItems":50,"items":{"type":"string"}},
                "playbook_ids":{"type":"array","maxItems":20,"items":{"type":"string"}},
                "playbook_id":{"type":"string"},
                "patch":{"type":"object","properties":{
                    "name":{"type":"string"},"entry_rules":{"type":"string"},"exit_rules":{"type":"string"},
                    "position_sizing_rules":{"type":"string"},"additional_rules":{"type":"string"}
                },"required":[]},
                "trade_id":{"type":"string"},"tag_id":{"type":"string"}
            },"required":[]}
        },"required":["kind","input"]
    })
}

fn memory_candidates_schema() -> Value {
    json!({
        "type":"object","properties":{"candidates":{"type":"array","maxItems":4,"items":{
            "type":"object","properties":{
                "kind":{"type":"string","enum":["preference","goal","routine","instruction"]},
                "subject":{"type":"string","minLength":1,"maxLength":120},
                "statement":{"type":"string","minLength":1,"maxLength":2000},
                "provenance_excerpt":{"type":"string","minLength":1,"maxLength":500},
                "confidence":{"type":"number","minimum":0,"maximum":1}
            },"required":["kind","subject","statement","provenance_excerpt","confidence"]
        }}},"required":["candidates"]
    })
}

#[cfg(test)]
pub fn contract_fixtures() -> Vec<(&'static str, Value)> {
    vec![
        ("specialist", AgentSchema::SpecialistFinding.schema()),
        (
            "answer_empty",
            AgentSchema::Answer { name: "answer" }.schema(),
        ),
        ("action", AgentSchema::ActionProposal.schema()),
        ("memory", AgentSchema::MemoryCandidates.schema()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agents::runtime::provider_contract::compile_schema;

    #[test]
    fn every_runtime_schema_is_portable() {
        for (name, schema) in contract_fixtures() {
            compile_schema(&schema).unwrap_or_else(|error| panic!("{name}: {error}"));
        }
    }

    #[test]
    fn semantic_answer_decoder_rejects_missing_variant_fields() {
        assert!(
            decode_answer(json!({
                "blocks":[{"kind":"metric","label":"Win rate"}],"claims":[]
            }))
            .is_err()
        );
    }

    #[test]
    fn semantic_decoders_preserve_domain_shapes() {
        let answer = decode_answer(json!({
            "blocks":[{"kind":"paragraph","text":"ok"}],"claims":[]
        }))
        .unwrap();
        assert!(matches!(answer.blocks[0], AnswerBlock::Paragraph { .. }));
        assert!(matches!(
            decode_action(json!({
                "kind":"add_trade_tag",
                "input":{"trade_id":"t","tag_id":"g"}
            }))
            .unwrap(),
            AgentActionPayload::AddTradeTag(_)
        ));
    }
}
