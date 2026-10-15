use std::sync::Arc;

use anyhow::{Context, Result};
use base64::Engine as _;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde_json::{Map, Value};

use super::claims::{AuthClaims, STYTCH_SESSION_CLAIM, TokenKind};
use super::jwks::{HttpJwksProvider, JwksError, JwksProvider};
use crate::service::stytch;

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("{0}")]
    Unauthorized(String),
    #[error("{0}")]
    Unavailable(String),
}

fn invalid() -> AuthError {
    AuthError::Unauthorized("Error: Invalid JWT!".to_string())
}

/// The `iss` strings Stytch signs with, the audiences a token may name, and
/// where the signing keys live.
pub struct IssuerConfig {
    issuers: Vec<String>,
    audiences: Vec<String>,
    jwks: Arc<dyn JwksProvider>,
}

impl IssuerConfig {
    /// Stytch signs with `stytch.com/{project_id}` when called through its API
    /// and with the custom domain when called through that domain, so both are
    /// accepted. `aud` must name the project.
    pub fn stytch(
        project_id: &str,
        custom_issuer: Option<&str>,
        jwks: Arc<dyn JwksProvider>,
    ) -> Self {
        let mut issuers = vec![format!("stytch.com/{project_id}")];
        if let Some(issuer) = custom_issuer.filter(|issuer| !issuer.is_empty()) {
            issuers.push(issuer.trim_end_matches('/').to_owned());
        }
        Self {
            issuers,
            audiences: vec![project_id.to_owned()],
            jwks,
        }
    }

    fn validation(&self) -> Validation {
        let mut validation = Validation::new(Algorithm::RS256);
        validation.validate_nbf = true;
        validation.set_issuer(&self.issuers);
        validation.set_audience(&self.audiences);
        validation.set_required_spec_claims(&["exp", "iss", "sub", "aud"]);
        validation
    }

    fn classify(&self, other: &Map<String, Value>) -> Option<TokenKind> {
        if other.contains_key(STYTCH_SESSION_CLAIM) {
            return Some(TokenKind::Session);
        }
        other
            .get("client_id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(|_| TokenKind::ConnectedApp)
    }
}

#[derive(Clone)]
pub struct TokenVerifier {
    issuers: Arc<Vec<IssuerConfig>>,
}

impl TokenVerifier {
    pub fn new(issuers: Vec<IssuerConfig>) -> Self {
        Self {
            issuers: Arc::new(issuers),
        }
    }

    pub fn from_env() -> Result<Self> {
        let project_id = env_var("STYTCH_PROJECT_ID")
            .context("STYTCH_PROJECT_ID must be set to verify Stytch tokens")?;
        let api = stytch::api_base(&project_id, env_var("STYTCH_API_URL").as_deref());
        let jwks = HttpJwksProvider::new(format!("{api}/v1/sessions/jwks/{project_id}"));
        Ok(Self::new(vec![IssuerConfig::stytch(
            &project_id,
            env_var("STYTCH_ISSUER").as_deref(),
            Arc::new(jwks),
        )]))
    }

    pub async fn verify(&self, token: &str) -> Result<AuthClaims, AuthError> {
        let header = decode_header(token).map_err(|_| invalid())?;
        let kid = header.kid.clone().ok_or_else(invalid)?;
        if header.alg != Algorithm::RS256 {
            return Err(invalid());
        }
        let issuer = unverified_issuer(token).ok_or_else(invalid)?;
        let config = self
            .issuers
            .iter()
            .find(|config| config.issuers.contains(&issuer))
            .ok_or_else(invalid)?;

        let key = config.jwks.key(&kid).await.map_err(|error| match error {
            JwksError::UnknownKey => invalid(),
            JwksError::Fetch(_) => {
                AuthError::Unavailable("Error: Signing keys are unavailable".to_string())
            }
        })?;
        if key.alg.as_deref().is_some_and(|alg| alg != "RS256") || key.kty != "RSA" {
            return Err(invalid());
        }
        let decoding_key =
            DecodingKey::from_rsa_components(&key.n, &key.e).map_err(|_| invalid())?;

        let mut claims = decode::<Map<String, Value>>(token, &decoding_key, &config.validation())
            .map_err(|error| {
                AuthError::Unauthorized(format!("Error: Invalid JWT! cause: {error}"))
            })?
            .claims;
        let sub = take_string(&mut claims, "sub").ok_or_else(invalid)?;
        let iss = take_string(&mut claims, "iss").ok_or_else(invalid)?;
        let kind = config.classify(&claims).ok_or_else(invalid)?;

        Ok(AuthClaims {
            sub,
            iss,
            kind,
            other: claims,
        })
    }
}

fn take_string(claims: &mut Map<String, Value>, name: &str) -> Option<String> {
    match claims.remove(name)? {
        Value::String(value) if !value.is_empty() => Some(value),
        _ => None,
    }
}

/// Only used to pick which issuer's keys to verify against; the claim is trusted
/// once the signature and the issuer check pass.
fn unverified_issuer(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.trim_end_matches('='))
        .ok()?;
    let claims: Value = serde_json::from_slice(&bytes).ok()?;
    claims.get("iss")?.as_str().map(str::to_owned)
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::auth::jwks::Jwk;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde_json::json;

    const KID: &str = "test-key";
    const PROJECT: &str = "project-test-123";
    const STYTCH_ISS: &str = "stytch.com/project-test-123";
    const STYTCH_DOMAIN: &str = "https://quiet-river-1234.customers.stytch.com";

    // A throwaway 2048-bit key used only by these tests.
    const PRIVATE_KEY: &str = include_str!("testdata/test_only_rsa_private_key.txt");
    const MODULUS: &str = include_str!("testdata/test_only_rsa_modulus.txt");

    struct StaticJwks;

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

    fn now() -> i64 {
        chrono::Utc::now().timestamp()
    }

    fn claims_for(iss: &str, extra: Value) -> Value {
        let mut claims = json!({
            "iss": iss,
            "sub": "user-test-123",
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

    fn verifier() -> TokenVerifier {
        TokenVerifier::new(vec![IssuerConfig::stytch(
            PROJECT,
            Some(STYTCH_DOMAIN),
            Arc::new(StaticJwks),
        )])
    }

    fn stytch_session_claims(iss: &str) -> Value {
        claims_for(
            iss,
            json!({
                "aud": [PROJECT],
                "https://stytch.com/session": {"id": "session-1", "authentication_factors": []},
                "full_name": "Ada Trader",
                "emails": ["ada@example.com"],
            }),
        )
    }

    fn stytch_claims(extra: Value) -> Value {
        let mut claims = stytch_session_claims(STYTCH_DOMAIN);
        claims
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        claims
    }

    #[tokio::test]
    async fn rejects_expired_and_not_yet_valid_tokens() {
        let expired = sign(&stytch_claims(json!({ "exp": now() - 600 })));
        assert!(verifier().verify(&expired).await.is_err());
        let early = sign(&stytch_claims(json!({ "nbf": now() + 600 })));
        assert!(verifier().verify(&early).await.is_err());
    }

    #[tokio::test]
    async fn rejects_time_claims_of_the_wrong_type() {
        let token = sign(&stytch_claims(json!({ "nbf": (now() + 600).to_string() })));
        assert!(verifier().verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_keys_and_garbage() {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("other".to_string());
        let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).unwrap();
        let token = encode(&header, &stytch_claims(json!({})), &key).unwrap();
        assert!(verifier().verify(&token).await.is_err());
        assert!(verifier().verify("not-a-jwt").await.is_err());
    }

    #[tokio::test]
    async fn rejects_tokens_without_a_key_id() {
        let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).unwrap();
        let token = encode(
            &Header::new(Algorithm::RS256),
            &stytch_claims(json!({})),
            &key,
        )
        .unwrap();
        assert!(verifier().verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_issuers() {
        let token = sign(&claims_for("https://evil.example", json!({})));
        assert!(verifier().verify(&token).await.is_err());
        let missing = sign(&json!({"sub": "u", "exp": now() + 600}));
        assert!(verifier().verify(&missing).await.is_err());
    }

    #[tokio::test]
    async fn accepts_stytch_sessions_under_both_issuer_strings() {
        for iss in [STYTCH_ISS, STYTCH_DOMAIN] {
            let token = sign(&stytch_session_claims(iss));
            let jwt = verifier().verify(&token).await.unwrap();
            assert_eq!(jwt.kind, TokenKind::Session);
            assert_eq!(jwt.iss, iss);
            assert_eq!(jwt.full_name(), "Ada Trader");
            assert_eq!(jwt.email(), "ada@example.com");
            assert_eq!(jwt.stytch_session().unwrap().id, "session-1");
        }
    }

    #[tokio::test]
    async fn stytch_tokens_without_a_session_claim_are_connected_apps() {
        let token = sign(&claims_for(
            STYTCH_DOMAIN,
            json!({"aud": [PROJECT, "extra"], "client_id": "client-1", "scope": "openid"}),
        ));
        let jwt = verifier().verify(&token).await.unwrap();
        assert_eq!(jwt.kind, TokenKind::ConnectedApp);
        assert!(jwt.stytch_session().is_none());
    }

    #[tokio::test]
    async fn stytch_tokens_that_are_neither_session_nor_connected_app_are_rejected() {
        let token = sign(&claims_for(STYTCH_DOMAIN, json!({"aud": [PROJECT]})));
        assert!(verifier().verify(&token).await.is_err());
    }

    #[tokio::test]
    async fn stytch_requires_the_project_audience() {
        let session = json!({"https://stytch.com/session": {"id": "s"}});
        let mut missing = claims_for(STYTCH_DOMAIN, session.clone());
        assert!(verifier().verify(&sign(&missing)).await.is_err());
        missing["aud"] = json!(["another-project"]);
        assert!(verifier().verify(&sign(&missing)).await.is_err());
        missing["aud"] = json!(PROJECT);
        assert!(verifier().verify(&sign(&missing)).await.is_ok());
    }
}
