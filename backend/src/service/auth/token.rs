use base64::Engine as _;

/// The JWT `typ` header values Clerk sets on OAuth access tokens (RFC 9068).
/// Web session tokens carry `typ: JWT`.
const OAUTH_ACCESS_TOKEN_TYPES: [&str; 2] = ["at+jwt", "application/at+jwt"];

/// Whether `token` is a Clerk OAuth access token, as minted for MCP clients and
/// other connected apps. Call only after signature validation: the JOSE header
/// is covered by the signature, so it is trustworthy once the token validates.
pub fn is_oauth_access_token(token: &str) -> bool {
    // Media types compare case-insensitively (RFC 7515 §4.1.9).
    token_type(token).is_some_and(|typ| {
        OAUTH_ACCESS_TOKEN_TYPES
            .iter()
            .any(|expected| typ.eq_ignore_ascii_case(expected))
    })
}

fn token_type(token: &str) -> Option<String> {
    let header = token.split('.').next()?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(header.trim_end_matches('='))
        .ok()?;
    let header: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    header.get("typ")?.as_str().map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token_with_header(header: &serde_json::Value) -> String {
        let encode = |bytes: &[u8]| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
        format!(
            "{}.{}.sig",
            encode(header.to_string().as_bytes()),
            encode(b"{}")
        )
    }

    #[test]
    fn accepts_oauth_access_token_types() {
        for typ in ["at+jwt", "application/at+jwt", "AT+JWT"] {
            let token = token_with_header(&serde_json::json!({"alg": "RS256", "typ": typ}));
            assert!(is_oauth_access_token(&token), "{typ} should be accepted");
        }
    }

    #[test]
    fn rejects_session_tokens_and_untyped_tokens() {
        let session = token_with_header(&serde_json::json!({"alg": "RS256", "typ": "JWT"}));
        assert!(!is_oauth_access_token(&session));
        let untyped = token_with_header(&serde_json::json!({"alg": "RS256"}));
        assert!(!is_oauth_access_token(&untyped));
        assert!(!is_oauth_access_token("not-a-jwt"));
    }
}
