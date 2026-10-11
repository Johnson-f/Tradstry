use std::sync::Arc;

use clerk_rs::validators::{
    authorizer::{ClerkError, ClerkJwt},
    jwks::{JwksProvider, MemoryCacheJwksProvider},
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};

/// Checks Clerk-issued JWTs: web session tokens and the OAuth access tokens
/// Clerk mints for MCP clients.
///
/// clerk-rs's own check rejects every token that carries an `aud` claim, and
/// Clerk adds one to OAuth access tokens naming the resource they were issued
/// for. This accepts `aud` when it names one of `audiences`, and otherwise
/// behaves like clerk-rs.
pub struct TokenVerifier<J = MemoryCacheJwksProvider> {
    jwks: Arc<J>,
    audiences: Vec<String>,
}

impl<J> Clone for TokenVerifier<J> {
    fn clone(&self) -> Self {
        Self {
            jwks: self.jwks.clone(),
            audiences: self.audiences.clone(),
        }
    }
}

impl<J: JwksProvider> TokenVerifier<J> {
    pub fn new(jwks: J, audiences: Vec<String>) -> Self {
        Self {
            jwks: Arc::new(jwks),
            audiences,
        }
    }

    pub async fn verify(&self, token: &str) -> Result<ClerkJwt, ClerkError> {
        let invalid = || ClerkError::Unauthorized("Error: Invalid JWT!".to_string());
        let kid = decode_header(token)
            .ok()
            .and_then(|header| header.kid)
            .ok_or_else(invalid)?;
        let key = self.jwks.get_key(&kid).await.map_err(|_| invalid())?;
        if key.alg != "RS256" {
            return Err(ClerkError::InternalServerError(
                "Error: Unsupported key algorithm".to_string(),
            ));
        }
        let decoding_key = DecodingKey::from_rsa_components(&key.n, &key.e).map_err(|_| {
            ClerkError::InternalServerError("Error: Invalid decoding key".to_string())
        })?;
        decode::<ClerkJwt>(token, &decoding_key, &self.validation())
            .map(|data| data.claims)
            .map_err(|error| {
                ClerkError::Unauthorized(format!("Error: Invalid JWT! cause: {error}"))
            })
    }

    fn validation(&self) -> Validation {
        let mut validation = Validation::new(Algorithm::RS256);
        validation.validate_nbf = true;
        // With no audience configured, any token carrying `aud` is rejected.
        if !self.audiences.is_empty() {
            validation.set_audience(&self.audiences);
        }
        validation
    }
}

/// Audiences accepted on OAuth access tokens, from the comma-separated
/// `CLERK_ALLOWED_AUDIENCES`.
pub fn allowed_audiences_from_env() -> Vec<String> {
    parse_audiences(&std::env::var("CLERK_ALLOWED_AUDIENCES").unwrap_or_default())
}

fn parse_audiences(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|audience| !audience.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use clerk_rs::validators::jwks::JwksKey;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde_json::{Value, json};

    const KID: &str = "test-key";
    const MCP: &str = "https://mcp.tradstry.com/mcp";

    // A throwaway 2048-bit key used only by these tests.
    const PRIVATE_KEY: &str = include_str!("testdata/test_only_rsa_private_key.txt");
    const MODULUS: &str = include_str!("testdata/test_only_rsa_modulus.txt");

    struct StaticJwks;

    #[async_trait::async_trait]
    impl JwksProvider for StaticJwks {
        type Error = ClerkError;

        async fn get_key(&self, kid: &str) -> Result<JwksKey, ClerkError> {
            if kid != KID {
                return Err(ClerkError::Unauthorized("unknown key".to_string()));
            }
            Ok(JwksKey {
                use_key: "sig".to_string(),
                kty: "RSA".to_string(),
                kid: KID.to_string(),
                alg: "RS256".to_string(),
                n: MODULUS.trim().to_string(),
                e: "AQAB".to_string(),
            })
        }
    }

    fn now() -> i64 {
        chrono::Utc::now().timestamp()
    }

    fn claims(extra: Value) -> Value {
        let mut claims = json!({
            "iss": "https://clerk.tradstry.com",
            "sub": "user_123",
            "iat": now(),
            "nbf": now() - 10,
            "exp": now() + 600,
        });
        claims
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        claims
    }

    fn sign(claims: &Value) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(KID.to_string());
        let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).unwrap();
        encode(&header, claims, &key).unwrap()
    }

    fn verifier(audiences: &[&str]) -> TokenVerifier<StaticJwks> {
        TokenVerifier::new(
            StaticJwks,
            audiences.iter().map(|a| a.to_string()).collect(),
        )
    }

    #[tokio::test]
    async fn accepts_session_tokens_without_an_audience() {
        let jwt = verifier(&[MCP])
            .verify(&sign(&claims(json!({}))))
            .await
            .unwrap();
        assert_eq!(jwt.sub, "user_123");
    }

    #[tokio::test]
    async fn accepts_an_allowed_audience() {
        let token = sign(&claims(json!({ "aud": MCP })));
        assert!(verifier(&[MCP]).verify(&token).await.is_ok());
        let token = sign(&claims(json!({ "aud": [MCP] })));
        assert!(verifier(&[MCP]).verify(&token).await.is_ok());
    }

    #[tokio::test]
    async fn rejects_an_audience_that_is_not_allowed() {
        let token = sign(&claims(json!({ "aud": "https://evil.example/mcp" })));
        assert!(verifier(&[MCP]).verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_any_audience_when_none_is_configured() {
        let token = sign(&claims(json!({ "aud": MCP })));
        assert!(verifier(&[]).verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_expired_and_not_yet_valid_tokens() {
        let expired = sign(&claims(json!({ "exp": now() - 600 })));
        assert!(verifier(&[]).verify(&expired).await.is_err());
        let early = sign(&claims(json!({ "nbf": now() + 600 })));
        assert!(verifier(&[]).verify(&early).await.is_err());
    }

    #[tokio::test]
    async fn rejects_time_claims_of_the_wrong_type() {
        let token = sign(&claims(json!({ "nbf": (now() + 600).to_string() })));
        assert!(verifier(&[]).verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_keys_and_garbage() {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("other".to_string());
        let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).unwrap();
        let token = encode(&header, &claims(json!({})), &key).unwrap();
        assert!(verifier(&[]).verify(&token).await.is_err());
        assert!(verifier(&[]).verify("not-a-jwt").await.is_err());
    }

    #[test]
    fn parses_comma_separated_audiences() {
        assert_eq!(
            parse_audiences(" https://a/mcp, ,https://a "),
            vec!["https://a/mcp", "https://a"]
        );
        assert!(parse_audiences("").is_empty());
    }
}
