//! SnapTrade request signatures: base64 HMAC-SHA256, keyed with the consumer
//! key, of `{"content":…,"path":…,"query":…}` as compact JSON with every
//! object's keys sorted. `path` and `query` are exactly what is sent.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use hmac::{Hmac, KeyInit, Mac};
use serde_json::Value;
use sha2::Sha256;

pub fn signature(consumer_key: &str, path: &str, query: &str, content: Option<&Value>) -> String {
    let payload = canonical_payload(path, query, content);
    let mut mac =
        Hmac::<Sha256>::new_from_slice(consumer_key.as_bytes()).expect("HMAC takes any key length");
    mac.update(payload.as_bytes());
    STANDARD.encode(mac.finalize().into_bytes())
}

pub fn canonical_payload(path: &str, query: &str, content: Option<&Value>) -> String {
    let content = content.unwrap_or(&Value::Null);
    let mut out = String::new();
    out.push_str("{\"content\":");
    write_canonical(content, false, &mut out);
    out.push_str(",\"path\":");
    write_canonical(&Value::String(path.to_owned()), false, &mut out);
    out.push_str(",\"query\":");
    write_canonical(&Value::String(query.to_owned()), false, &mut out);
    out.push('}');
    out
}

/// Compact JSON with every object's keys sorted. `ascii` also escapes
/// non-ASCII characters, as Python's `json.dumps` does by default.
pub fn canonical_json(value: &Value, ascii: bool) -> String {
    let mut out = String::new();
    write_canonical(value, ascii, &mut out);
    out
}

fn write_string(value: &str, ascii: bool, out: &mut String) {
    let encoded = serde_json::to_string(value).expect("strings serialize");
    if !ascii {
        out.push_str(&encoded);
        return;
    }
    for character in encoded.chars() {
        if character.is_ascii() {
            out.push(character);
        } else {
            let mut units = [0u16; 2];
            for unit in character.encode_utf16(&mut units) {
                out.push_str(&format!("\\u{unit:04x}"));
            }
        }
    }
}

/// Sorts keys itself rather than trusting `serde_json::Map` ordering, which
/// changes if any crate in the build enables `preserve_order`.
fn write_canonical(value: &Value, ascii: bool, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            out.push('{');
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_string(key, ascii, out);
                out.push(':');
                write_canonical(&map[key], ascii, out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_canonical(item, ascii, out);
            }
            out.push(']');
        }
        Value::String(text) => write_string(text, ascii, out),
        scalar => out.push_str(&serde_json::to_string(scalar).expect("scalars serialize")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Expected values come from SnapTrade's documented Python implementation
    // (json.dumps with sort_keys and compact separators), run independently.
    #[test]
    fn matches_snaptrades_reference_implementation_for_a_nested_body() {
        let body = json!({
            "userId": "user-1",
            "nested": {"z": 1, "a": [{"y": 2.5, "x": "<a&b>"}], "m": null},
            "flag": true,
        });
        let query = "clientId=CLIENT&timestamp=1715123456";
        assert_eq!(
            canonical_payload("/snapTrade/registerUser", query, Some(&body)),
            r#"{"content":{"flag":true,"nested":{"a":[{"x":"<a&b>","y":2.5}],"m":null,"z":1},"userId":"user-1"},"path":"/snapTrade/registerUser","query":"clientId=CLIENT&timestamp=1715123456"}"#
        );
        assert_eq!(
            signature(
                "test-consumer-key",
                "/snapTrade/registerUser",
                query,
                Some(&body)
            ),
            "EvthvYjWWljTbe5R2uv379hjyiwgD0ZnuWjlV446DKs="
        );
    }

    #[test]
    fn ascii_mode_matches_python_json_dumps() {
        // python3 -c 'json.dumps({"b":"café 📈","a":1}, separators=(",",":"), sort_keys=True)'
        let value = json!({ "b": "café 📈", "a": 1 });
        assert_eq!(
            canonical_json(&value, true),
            r#"{"a":1,"b":"caf\u00e9 \ud83d\udcc8"}"#
        );
        assert_eq!(canonical_json(&value, false), r#"{"a":1,"b":"café 📈"}"#);
    }

    #[test]
    fn matches_snaptrades_reference_implementation_without_a_body() {
        assert_eq!(
            signature(
                "test-consumer-key",
                "/accounts/all",
                "clientId=CLIENT&timestamp=1715123456&userId=u&userSecret=s",
                None,
            ),
            "r1PBDscOczlsPpxan1a8LxAH1D/Z77m5Jp+LdxXVFu4="
        );
    }
}
