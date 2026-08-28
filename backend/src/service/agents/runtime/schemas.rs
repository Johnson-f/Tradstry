use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tinyagents::harness::model::ResponseFormat;

use crate::service::agents::actions::{
    CreateNotebookNoteAction, PlaybookActionPatch, TradeTagAction, UpdatePlaybookAction,
};
use crate::service::agents::{
    AgentActionPayload, AgentClaim, AgentError, AgentResult, AnswerBlock, AnswerDraft,
};

pub enum AgentSchema {
    SpecialistFinding,
    Answer,
    ActionProposal,
    MemoryCandidates,
}

pub const ANSWER_SCHEMA_NAME: &str = "tradstry_answer_v2";
pub const ANSWER_SCHEMA_VERSION: &str = "2";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SchemaIdentity {
    pub name: &'static str,
    pub version: &'static str,
    pub hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerValidationIssue {
    pub code: &'static str,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AnswerValidationError {
    pub issues: Vec<AnswerValidationIssue>,
}

impl AgentSchema {
    pub fn response_format(&self) -> ResponseFormat {
        let (name, schema) = match self {
            Self::SpecialistFinding => ("specialist_finding", specialist_finding_schema()),
            Self::Answer => (ANSWER_SCHEMA_NAME, answer_schema()),
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

    pub fn identity(&self) -> AgentResult<SchemaIdentity> {
        let (name, version) = match self {
            Self::SpecialistFinding => ("specialist_finding", "1"),
            Self::Answer => (ANSWER_SCHEMA_NAME, ANSWER_SCHEMA_VERSION),
            Self::ActionProposal => ("agent_action", "1"),
            Self::MemoryCandidates => ("memory_candidates", "1"),
        };
        let schema =
            crate::service::agents::runtime::provider_contract::compile_schema(&self.schema())
                .map_err(|_| AgentError::Internal)?;
        let bytes = serde_json::to_vec(&schema).map_err(|_| AgentError::Internal)?;
        Ok(SchemaIdentity {
            name,
            version,
            hash: hex::encode(Sha256::digest(bytes)),
        })
    }
}

pub fn decode_answer(value: Value) -> Result<AnswerDraft, AnswerValidationError> {
    let wire: WireAnswer =
        serde_json::from_value(value).map_err(|_| validation_issue("answer_json_invalid", "/"))?;
    if wire.schema_version != ANSWER_SCHEMA_VERSION {
        return Err(validation_issue(
            "answer_version_invalid",
            "/schema_version",
        ));
    }
    if wire.paragraphs.len() > 40
        || wire.metrics.len() > 40
        || wire.lists.len() > 40
        || wire.warnings.len() > 40
        || wire.action_proposals.len() > 20
        || wire.claims.len() > 100
    {
        return Err(validation_issue("answer_collection_too_large", "/"));
    }
    let mut ordered = Vec::new();
    for item in wire.paragraphs {
        ordered.push((
            item.order,
            AnswerBlock::Paragraph {
                text: non_blank(item.text, "/paragraphs/text")?,
            },
        ));
    }
    for item in wire.metrics {
        ordered.push((
            item.order,
            AnswerBlock::Metric {
                label: non_blank(item.label, "/metrics/label")?,
                value: non_blank(item.value, "/metrics/value")?,
            },
        ));
    }
    for item in wire.lists {
        if item.items.is_empty() || item.items.len() > 30 {
            return Err(validation_issue("answer_list_size_invalid", "/lists/items"));
        }
        let items = item
            .items
            .into_iter()
            .map(|value| non_blank(value, "/lists/items"))
            .collect::<Result<Vec<_>, _>>()?;
        let title = item.title.trim().to_owned();
        ordered.push((
            item.order,
            AnswerBlock::List {
                title: (!title.is_empty()).then_some(title),
                items,
            },
        ));
    }
    for item in wire.warnings {
        ordered.push((
            item.order,
            AnswerBlock::Warning {
                text: non_blank(item.text, "/warnings/text")?,
            },
        ));
    }
    for item in wire.action_proposals {
        ordered.push((
            item.order,
            AnswerBlock::ActionProposal {
                proposal_id: non_blank(item.proposal_id, "/action_proposals/proposal_id")?,
            },
        ));
    }
    if ordered.is_empty() || ordered.len() > 100 {
        return Err(validation_issue("answer_block_count_invalid", "/"));
    }
    let mut seen = HashSet::with_capacity(ordered.len());
    if ordered.iter().any(|(order, _)| !seen.insert(*order)) {
        return Err(validation_issue("answer_order_duplicate", "/"));
    }
    ordered.sort_by_key(|(order, _)| *order);
    Ok(AnswerDraft {
        blocks: ordered.into_iter().map(|(_, block)| block).collect(),
        claims: wire.claims,
    })
}

fn validation_issue(code: &'static str, path: &str) -> AnswerValidationError {
    AnswerValidationError {
        issues: vec![AnswerValidationIssue {
            code,
            path: path.into(),
        }],
    }
}

fn non_blank(value: String, path: &str) -> Result<String, AnswerValidationError> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        Err(validation_issue("answer_text_blank", path))
    } else {
        Ok(value)
    }
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
    schema_version: String,
    paragraphs: Vec<WireOrderedText>,
    metrics: Vec<WireMetric>,
    lists: Vec<WireList>,
    warnings: Vec<WireOrderedText>,
    action_proposals: Vec<WireActionProposal>,
    claims: Vec<AgentClaim>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireOrderedText {
    order: u32,
    text: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireMetric {
    order: u32,
    label: String,
    value: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireList {
    order: u32,
    title: String,
    items: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireActionProposal {
    order: u32,
    proposal_id: String,
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
            "schema_version":{"type":"string","enum":["2"]},
            "paragraphs":{"type":"array","maxItems":40,"items":ordered_text_schema()},
            "metrics":{"type":"array","maxItems":40,"items":{
                "type":"object","properties":{
                    "order":order_schema(),"label":{"type":"string","minLength":1,"maxLength":200},
                    "value":{"type":"string","minLength":1,"maxLength":500}
                },"required":["order","label","value"]
            }},
            "lists":{"type":"array","maxItems":40,"items":{
                "type":"object","properties":{
                    "order":order_schema(),"title":{"type":"string","maxLength":200},
                    "items":{"type":"array","minItems":1,"maxItems":30,"items":{"type":"string","minLength":1,"maxLength":2000}}
                },"required":["order","title","items"]
            }},
            "warnings":{"type":"array","maxItems":40,"items":ordered_text_schema()},
            "action_proposals":{"type":"array","maxItems":20,"items":{
                "type":"object","properties":{
                    "order":order_schema(),"proposal_id":{"type":"string","minLength":1,"maxLength":200}
                },"required":["order","proposal_id"]
            }},
            "claims":{"type":"array","maxItems":100,"items":claim_schema()}
        },"required":["schema_version","paragraphs","metrics","lists","warnings","action_proposals","claims"]
    })
}

fn order_schema() -> Value {
    json!({"type":"integer","minimum":0,"maximum":999})
}

fn ordered_text_schema() -> Value {
    json!({
        "type":"object","properties":{
            "order":order_schema(),"text":{"type":"string","minLength":1,"maxLength":8000}
        },"required":["order","text"]
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
        ("answer_v2", AgentSchema::Answer.schema()),
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
    fn answer_contract_identity_is_stable_and_versioned() {
        let first = AgentSchema::Answer.identity().unwrap();
        let second = AgentSchema::Answer.identity().unwrap();
        assert_eq!(first.name, ANSWER_SCHEMA_NAME);
        assert_eq!(first.version, ANSWER_SCHEMA_VERSION);
        assert_eq!(first.hash, second.hash);
        assert_eq!(first.hash.len(), 64);
    }

    #[test]
    fn answer_v2_rejects_the_flattened_v1_shape() {
        let error = decode_answer(json!({
            "blocks":[{"kind":"metric","label":"Win rate","items":["20%"]}],"claims":[]
        }))
        .unwrap_err();
        assert_eq!(error.issues[0].code, "answer_json_invalid");
    }

    #[test]
    fn answer_v2_merges_typed_sections_by_order() {
        let answer = decode_answer(json!({
            "schema_version":"2",
            "paragraphs":[{"order":2,"text":"Summary"}],
            "metrics":[{"order":0,"label":"Win rate","value":"20%"}],
            "lists":[{"order":1,"title":"Problems","items":["Loss concentration"]}],
            "warnings":[],
            "action_proposals":[],
            "claims":[]
        }))
        .unwrap();
        assert!(matches!(answer.blocks[0], AnswerBlock::Metric { .. }));
        assert!(matches!(answer.blocks[1], AnswerBlock::List { .. }));
        assert!(matches!(answer.blocks[2], AnswerBlock::Paragraph { .. }));
    }

    #[test]
    fn answer_v2_rejects_duplicate_order_and_blank_content() {
        for value in [
            json!({
                "schema_version":"2","paragraphs":[{"order":0,"text":"A"}],
                "metrics":[{"order":0,"label":"Win rate","value":"20%"}],
                "lists":[],"warnings":[],"action_proposals":[],"claims":[]
            }),
            json!({
                "schema_version":"2","paragraphs":[{"order":0,"text":"  "}],
                "metrics":[],"lists":[],"warnings":[],"action_proposals":[],"claims":[]
            }),
        ] {
            assert!(decode_answer(value).is_err());
        }
    }

    #[test]
    fn answer_v2_rejects_unknown_fields_and_oversized_collections() {
        let unknown = json!({
            "schema_version":"2","paragraphs":[{"order":0,"text":"ok","kind":"paragraph"}],
            "metrics":[],"lists":[],"warnings":[],"action_proposals":[],"claims":[]
        });
        assert!(decode_answer(unknown).is_err());

        let paragraphs = (0..41)
            .map(|order| json!({"order":order,"text":format!("item {order}")}))
            .collect::<Vec<_>>();
        let oversized = json!({
            "schema_version":"2","paragraphs":paragraphs,"metrics":[],"lists":[],
            "warnings":[],"action_proposals":[],"claims":[]
        });
        assert_eq!(
            decode_answer(oversized).unwrap_err().issues[0].code,
            "answer_collection_too_large"
        );
    }

    #[test]
    fn semantic_decoders_preserve_domain_shapes() {
        let answer = decode_answer(json!({
            "schema_version":"2","paragraphs":[{"order":0,"text":"ok"}],
            "metrics":[],"lists":[],"warnings":[],"action_proposals":[],"claims":[]
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
