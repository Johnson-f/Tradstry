//! Pure Lexical-document logic: title derivation and document_json normalization.
//! No SQL — operates on `serde_json::Value`.
use anyhow::{Context, Result, ensure};
use std::collections::BTreeSet;

use serde_json::Value;

pub const UNTITLED_NOTE_TITLE: &str = "Title";
fn collect_text(node: &Value, output: &mut String) {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        output.push_str(text);
    }

    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_text(child, output);
        }
    }
}
fn extract_node_text(node: &Value) -> Option<String> {
    let mut text = String::new();
    collect_text(node, &mut text);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
pub fn derive_note_title(document: &Value) -> String {
    let children = document
        .get("root")
        .and_then(|root| root.get("children"))
        .and_then(Value::as_array);

    if let Some(children) = children {
        for child in children {
            let is_h1 = child.get("type").and_then(Value::as_str) == Some("heading")
                && child.get("tag").and_then(Value::as_str) == Some("h1");
            if is_h1 && let Some(title) = extract_node_text(child) {
                return title;
            }
        }

        for child in children {
            if let Some(title) = extract_node_text(child) {
                return title;
            }
        }
    }

    UNTITLED_NOTE_TITLE.to_string()
}
pub fn normalize_document_json(document_json: &str) -> Result<(String, String)> {
    let trimmed = document_json.trim();
    ensure!(!trimmed.is_empty(), "document_json cannot be empty");

    let parsed: Value =
        serde_json::from_str(trimmed).context("document_json must be valid JSON")?;
    ensure!(
        parsed.get("root").is_some(),
        "document_json must contain a root node"
    );

    let normalized = serde_json::to_string(&parsed).context("Failed to serialize document_json")?;
    let title = derive_note_title(&parsed);

    Ok((normalized, title))
}

pub fn media_hashes(document: &Value) -> BTreeSet<String> {
    fn collect(node: &Value, hashes: &mut BTreeSet<String>) {
        let media_node = matches!(
            node.get("type").and_then(Value::as_str),
            Some("notebook-image" | "notebook-video")
        );
        if media_node
            && let Some(hash) = node.get("hash").and_then(Value::as_str)
            && hash.len() == 64
            && hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            hashes.insert(hash.to_string());
        }
        if let Some(children) = node.get("children").and_then(Value::as_array) {
            for child in children {
                collect(child, hashes);
            }
        }
    }

    let mut hashes = BTreeSet::new();
    collect(document.get("root").unwrap_or(document), &mut hashes);
    hashes
}

#[cfg(test)]
mod tests {
    use super::{UNTITLED_NOTE_TITLE, derive_note_title, media_hashes, normalize_document_json};
    use serde_json::json;

    #[test]
    fn derives_title_from_first_h1_heading() {
        let document = json!({
            "root": {
                "type": "root",
                "children": [
                    {
                        "type": "heading",
                        "tag": "h1",
                        "children": [
                            {
                                "type": "text",
                                "text": "My note header"
                            }
                        ]
                    },
                    {
                        "type": "paragraph",
                        "children": []
                    }
                ]
            }
        });

        assert_eq!(derive_note_title(&document), "My note header");
    }

    #[test]
    fn falls_back_to_untitled_note_when_header_is_empty() {
        let document = json!({
            "root": {
                "type": "root",
                "children": [
                    {
                        "type": "heading",
                        "tag": "h1",
                        "children": []
                    }
                ]
            }
        });

        assert_eq!(derive_note_title(&document), UNTITLED_NOTE_TITLE);
    }

    #[test]
    fn normalizes_valid_document_json() {
        let (document_json, title) = normalize_document_json(
            r#"{"root":{"type":"root","children":[{"type":"heading","tag":"h1","children":[{"type":"text","text":"Title"}]}]}}"#,
        )
        .expect("document should normalize");

        assert!(document_json.contains("\"root\""));
        assert_eq!(title, "Title");
    }

    #[test]
    fn extracts_unique_valid_media_hashes_from_nested_nodes() {
        let hash = "a".repeat(64);
        let document = json!({
            "root": {"children": [
                {"type": "notebook-image", "hash": hash},
                {"type": "layout", "children": [
                    {"type": "notebook-video", "hash": hash},
                    {"type": "notebook-image", "hash": "INVALID"}
                ]}
            ]}
        });
        assert_eq!(media_hashes(&document), [hash].into_iter().collect());
    }
}
