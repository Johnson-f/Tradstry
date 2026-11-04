//! Signs Stytch-shaped session tokens with a throwaway RSA key so integration
//! tests can exercise the real auth middleware. Never configure the static
//! provider outside a test process.

use std::sync::Arc;

use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde_json::{Value, json};

use super::{
    jwks::{Jwk, JwksError, JwksProvider},
    verifier::{IssuerConfig, TokenVerifier},
};

pub const KID: &str = "test-key";
pub const PROJECT: &str = "project-test-123";

const PRIVATE_KEY: &str = include_str!("testdata/test_only_rsa_private_key.txt");
const MODULUS: &str = include_str!("testdata/test_only_rsa_modulus.txt");

pub struct StaticJwks;

#[async_trait::async_trait]
impl JwksProvider for StaticJwks {
    async fn key(&self, kid: &str) -> Result<Jwk, JwksError> {
        if kid != KID {
            return Err(JwksError::UnknownKey);
        }
        Ok(Jwk {
            kid: KID.to_string(),
            kty: "RSA".to_string(),
            alg: Some("RS256".to_string()),
            n: MODULUS.trim().to_string(),
            e: "AQAB".to_string(),
        })
    }
}

pub fn test_verifier() -> TokenVerifier {
    TokenVerifier::new(vec![IssuerConfig::stytch(
        PROJECT,
        None,
        Arc::new(StaticJwks),
    )])
}

/// The custom-domain issuer that Connected App tokens carry in tests.
pub const ISSUER: &str = "https://login.test.tradstry.local";

/// Accepts tokens from both `stytch.com/{PROJECT}` and [`ISSUER`].
pub fn connected_app_verifier() -> TokenVerifier {
    TokenVerifier::new(vec![IssuerConfig::stytch(
        PROJECT,
        Some(ISSUER),
        Arc::new(StaticJwks),
    )])
}

/// A Connected App access token, as Stytch issues one to an MCP client.
pub fn connected_app_token(sub: &str, scope: &str) -> String {
    let now = chrono::Utc::now().timestamp();
    sign(&json!({
        "iss": ISSUER,
        "sub": sub,
        "aud": [PROJECT],
        "iat": now,
        "nbf": now - 10,
        "exp": now + 600,
        "client_id": "https://claude.ai/oauth/claude-code-client-metadata",
        "scope": scope,
    }))
}

pub fn session_token(sub: &str, email: &str, full_name: &str) -> String {
    let now = chrono::Utc::now().timestamp();
    sign(&json!({
        "iss": format!("stytch.com/{PROJECT}"),
        "sub": sub,
        "aud": [PROJECT],
        "iat": now,
        "nbf": now - 10,
        "exp": now + 600,
        "https://stytch.com/session": {"id": format!("session-{sub}"), "authentication_factors": []},
        "full_name": full_name,
        "emails": [email],
    }))
}

pub fn sign(claims: &Value) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(KID.to_string());
    let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).expect("test RSA key");
    encode(&header, claims, &key).expect("sign test token")
}
