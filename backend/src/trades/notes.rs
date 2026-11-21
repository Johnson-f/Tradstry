//! The only stored note format is Lexical JSON. Text is derived, never stored separately.

use serde_json::{Value, json};

use super::service::TradeError;

pub const MAX_TEXT: usize = 20_000;
pub const MAX_BYTES: usize = 256_000;

#[derive(Clone, Debug)]
pub struct NoteDocument(pub Value);

impl Default for NoteDocument {
    fn default() -> Self {
        Self::from("")
    }
}

impl From<&str> for NoteDocument {
    fn from(text: &str) -> Self {
        let mut children = Vec::new();
        for (index, line) in text.split('\n').enumerate() {
            if index > 0 {
                children.push(json!({"type": "linebreak", "version": 1}));
            }
            if !line.is_empty() {
                children.push(json!({"type": "text", "version": 1, "text": line,
                    "format": 0, "detail": 0, "mode": "normal", "style": ""}));
            }
        }
        Self(
            json!({"root": {"type": "root", "version": 1, "direction": null,
            "format": "", "indent": 0, "children": [{"type": "paragraph", "version": 1,
                "direction": null, "format": "", "indent": 0, "textFormat": 0,
                "textStyle": "", "children": children}]}}),
        )
    }
}

impl From<String> for NoteDocument {
    fn from(text: String) -> Self {
        Self::from(text.as_str())
    }
}

/// The note's words, one line per paragraph, heading or list item.
pub fn plain_text(document: &Value) -> String {
    fn walk(node: &Value, out: &mut String) {
        match node.get("type").and_then(Value::as_str) {
            Some("text") => out.push_str(node.get("text").and_then(Value::as_str).unwrap_or("")),
            Some("note-image") => out.push_str("[Image]"),
            Some("linebreak") => out.push('\n'),
            Some("tab") => out.push('\t'),
            Some("tablerow") => {
                if let Some(cells) = node["children"].as_array() {
                    for (index, cell) in cells.iter().enumerate() {
                        if index > 0 {
                            out.push('\t');
                        }
                        let start = out.len();
                        walk(cell, out);
                        if out.len() > start && out.ends_with('\n') {
                            out.pop();
                        }
                    }
                }
                out.push('\n');
                return;
            }
            _ => {}
        }
        let block = matches!(
            node.get("type").and_then(Value::as_str),
            Some("paragraph" | "heading" | "listitem" | "quote" | "code")
        );
        for child in node
            .get("children")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            walk(child, out);
        }
        if block && !out.ends_with('\n') {
            out.push('\n');
        }
    }
    let mut out = String::new();
    if let Some(root) = document.get("root") {
        if let Some(title) = root
            .pointer("/$/title")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            out.push_str(title);
            out.push_str("\n\n");
        }
        walk(root, &mut out);
    }
    out.trim().to_owned()
}

/// The document with `text` added as new paragraphs at the end; nothing
/// already written changes.
pub fn append_text(document: &Value, text: &str) -> Value {
    let mut document = document.clone();
    let added = NoteDocument::from(text).0["root"]["children"].clone();
    let paragraphs: Vec<Value> = text
        .split("\n\n")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| NoteDocument::from(part).0["root"]["children"][0].clone())
        .collect();
    let new_children = if paragraphs.is_empty() {
        added.as_array().cloned().unwrap_or_default()
    } else {
        paragraphs
    };
    if let Some(children) = document
        .pointer_mut("/root/children")
        .and_then(Value::as_array_mut)
    {
        let only_empty = children.len() == 1
            && children[0]
                .get("children")
                .and_then(Value::as_array)
                .is_some_and(Vec::is_empty);
        if only_empty {
            children.clear();
        }
        children.extend(new_children);
        document
    } else {
        NoteDocument::from(text).0
    }
}

fn invalid(message: &str) -> TradeError {
    TradeError::Invalid("INVALID_NOTE", message.to_owned())
}

pub fn validate(document: &Value) -> Result<(), TradeError> {
    if document.to_string().len() > MAX_BYTES {
        return Err(invalid(
            "The note has too much formatting. Simplify it before saving.",
        ));
    }
    let root = document
        .get("root")
        .ok_or_else(|| invalid("Notes must be a rich text document."))?;
    if root.get("type").and_then(Value::as_str) != Some("root") {
        return Err(invalid("Notes must have a document root."));
    }
    let mut nodes = 0;
    let body_length = validate_node(root, None, 0, &mut nodes)?;
    let title = match root.pointer("/$/title") {
        Some(value) => value
            .as_str()
            .ok_or_else(|| invalid("The note title must be text."))?,
        None => "",
    };
    let separator = if !title.is_empty() && body_length > 0 {
        2
    } else {
        0
    };
    let length = title.chars().count() + separator + body_length;
    if length > MAX_TEXT {
        return Err(TradeError::Invalid(
            "TOO_LONG",
            "Notes are at most 20,000 characters".into(),
        ));
    }
    Ok(())
}

fn validate_node(
    node: &Value,
    parent: Option<&str>,
    depth: usize,
    nodes: &mut usize,
) -> Result<usize, TradeError> {
    *nodes += 1;
    if depth > 32 || *nodes > 5_000 {
        return Err(invalid(
            "The note has too much formatting. Simplify it before saving.",
        ));
    }
    let kind = node
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("Invalid note content."))?;
    if node.get("version").and_then(Value::as_u64) != Some(1) {
        return Err(invalid("Unsupported note version."));
    }
    let allowed = match parent {
        None => kind == "root",
        Some("root") => matches!(kind, "paragraph" | "heading" | "quote" | "list" | "table"),
        Some("table") => kind == "tablerow",
        Some("tablerow") => kind == "tablecell",
        Some("tablecell") => matches!(kind, "paragraph" | "heading" | "quote" | "list"),
        Some("list") => kind == "listitem",
        Some("listitem") => matches!(
            kind,
            "text" | "tab" | "linebreak" | "link" | "list" | "note-image"
        ),
        Some("paragraph" | "heading" | "quote" | "link") => {
            matches!(kind, "text" | "tab" | "linebreak" | "link" | "note-image")
        }
        _ => matches!(kind, "text" | "tab" | "linebreak" | "link"),
    };
    if !allowed || (parent == Some("link") && kind == "link") {
        return Err(invalid("Unsupported note content."));
    }
    if node
        .get("indent")
        .is_some_and(|value| !value.as_u64().is_some_and(|indent| indent <= 32))
        || node
            .get("direction")
            .is_some_and(|value| !value.is_null() && !matches!(value.as_str(), Some("ltr" | "rtl")))
    {
        return Err(invalid("Invalid note formatting."));
    }
    if kind == "note-image" {
        if node
            .get("imageId")
            .and_then(Value::as_str)
            .and_then(|id| uuid::Uuid::parse_str(id).ok())
            .is_none()
        {
            return Err(invalid("The image must finish uploading before saving."));
        }
        return Ok("[Image]".len());
    }
    if kind == "text" || kind == "tab" {
        if node
            .get("format")
            .is_some_and(|value| !value.as_u64().is_some_and(|format| format <= 65_535))
        {
            return Err(invalid("Invalid text formatting."));
        }
        if node
            .get("style")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty())
        {
            return Err(invalid("Unsupported text styling."));
        }
        return node
            .get("text")
            .and_then(Value::as_str)
            .map(|text| text.chars().count())
            .ok_or_else(|| invalid("Invalid note text."));
    }
    if kind == "linebreak" {
        return Ok(1);
    }
    if node.get("format").is_some_and(|value| {
        !matches!(
            value.as_str(),
            Some("" | "left" | "center" | "right" | "justify" | "start" | "end")
        )
    }) {
        return Err(invalid("Invalid paragraph formatting."));
    }
    if kind == "heading"
        && !matches!(
            node.get("tag").and_then(Value::as_str),
            Some("h1" | "h2" | "h3" | "h4" | "h5" | "h6")
        )
    {
        return Err(invalid("Invalid note heading."));
    }
    if kind == "list"
        && !matches!(
            node.get("listType").and_then(Value::as_str),
            Some("bullet" | "number")
        )
    {
        return Err(invalid("Invalid note list."));
    }
    if kind == "link" {
        let address = node.get("url").and_then(Value::as_str).unwrap_or_default();
        let valid = !address.chars().any(char::is_control)
            && url::Url::parse(address)
                .is_ok_and(|url| matches!(url.scheme(), "https" | "http" | "mailto"));
        if !valid {
            return Err(invalid("Links must use https, http, or mailto."));
        }
    }
    let children = node
        .get("children")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("Invalid note content."))?;
    if kind == "root" && children.is_empty() {
        return Err(invalid("A note must contain a paragraph."));
    }
    if matches!(kind, "table" | "tablerow" | "tablecell") && children.is_empty() {
        return Err(invalid(
            "A note table must contain rows, cells and editable blocks.",
        ));
    }
    if kind == "tablecell"
        && ["colSpan", "rowSpan"].iter().any(|field| {
            node.get(*field)
                .is_some_and(|value| value.as_u64() != Some(1))
        })
    {
        return Err(invalid("Merged note table cells are not supported."));
    }
    let separator = match kind {
        "root" => 2,
        "list" | "table" | "tablerow" | "tablecell" => 1,
        _ => 0,
    };
    let mut length = separator * children.len().saturating_sub(1);
    for child in children {
        if kind == "listitem" && child.get("type").and_then(Value::as_str) == Some("list") {
            length += 1;
        }
        length += validate_node(child, Some(kind), depth + 1, nodes)?;
    }
    Ok(length)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_reads_paragraphs_and_appending_keeps_what_was_written() {
        let note = NoteDocument::from("Entered on the breakout\nStop under the low").0;
        assert_eq!(
            plain_text(&note),
            "Entered on the breakout\nStop under the low"
        );
        let more = append_text(&note, "Reviewed by Claude.\n\nHeld too long.");
        assert_eq!(
            plain_text(&more),
            "Entered on the breakout\nStop under the low\nReviewed by Claude.\nHeld too long."
        );
        assert!(validate(&more).is_ok());
        let empty = NoteDocument::default().0;
        assert_eq!(
            plain_text(&append_text(&empty, "First words")),
            "First words"
        );
    }

    #[test]
    fn accepts_empty_and_multiline_documents_but_not_plain_text() {
        validate(&NoteDocument::default().0).unwrap();
        validate(&NoteDocument::from("first\n\nlast").0).unwrap();
        assert!(validate(&json!("old format")).is_err());
        assert!(
            validate(&json!({"root": {"type": "root", "version": 1, "children": []}})).is_err()
        );
    }

    #[test]
    fn table_previews_separate_cells_and_invalid_rows_are_rejected() {
        let mut note: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/rich_trade_note.json"))
                .unwrap();
        assert!(plain_text(&note).ends_with("Setup\tResult"));
        let table = note["root"]["children"]
            .as_array_mut()
            .unwrap()
            .last_mut()
            .unwrap();
        table["children"][0]["type"] = json!("paragraph");
        assert!(validate(&note).is_err());
    }

    #[test]
    fn rejects_oversized_and_unsupported_content() {
        assert!(validate(&NoteDocument::from("x".repeat(MAX_TEXT + 1)).0).is_err());
        let mut document = NoteDocument::from("hello").0;
        document["root"]["children"][0]["type"] = json!("image");
        assert!(validate(&document).is_err());
    }

    #[test]
    fn titled_notes_keep_the_title_on_append_and_count_it_toward_the_limit() {
        let mut document = NoteDocument::default().0;
        document["root"]["$"] = json!({"title": "Breakout review"});
        assert_eq!(plain_text(&document), "Breakout review");
        let more = append_text(&document, "Held through the pullback.");
        assert_eq!(
            plain_text(&more),
            "Breakout review\n\nHeld through the pullback."
        );
        validate(&more).unwrap();
        document["root"]["$"]["title"] = json!("x".repeat(MAX_TEXT));
        validate(&document).unwrap();
        assert!(validate(&append_text(&document, "more")).is_err());
    }

    #[test]
    fn rejects_executable_links_and_accepts_https_links() {
        let mut document = NoteDocument::from("hello").0;
        let text = document["root"]["children"][0]["children"].clone();
        document["root"]["children"][0]["children"] = json!([{
            "type": "link", "version": 1, "url": "javascript:alert(1)", "children": text
        }]);
        assert!(validate(&document).is_err());
        document["root"]["children"][0]["children"][0]["url"] = json!("https://example.com");
        validate(&document).unwrap();
    }
}
