use std::sync::Arc;

use base64::Engine as _;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, errors::ErrorKind};
use serde_json::{Map, Value};

use super::{
    claims::{AuthClaims, STYTCH_SESSION_CLAIM, TokenKind},
    jwks::{HttpJwksProvider, JwksError, JwksProvider},
    stytch,
};

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("{0}")]
    Unauthorized(String),
    /// Signed by a trusted key but past `exp`. Kept apart from `Unauthorized`
    /// so clients know refreshing the session JWT and retrying can succeed.
    #[error("Error: JWT has expired")]
    Expired,
    #[error("{0}")]
    Unavailable(String),
}

fn invalid(reason: impl std::fmt::Display) -> AuthError {
    AuthError::Unauthorized(format!("Error: Invalid JWT! {reason}"))
}

/// Stytch's Authenticate Session API, for session JWTs that fail local
/// verification only because they expired or were signed with a key this
/// server has not fetched yet. Stytch's own backend SDKs fall back the same way.
#[async_trait::async_trait]
pub trait SessionAuthenticator: Send + Sync {
    /// A fresh session JWT when Stytch still considers the session active.
    async fn authenticate_session_jwt(&self, jwt: &str) -> Result<String, AuthError>;
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

    fn claims(&self, mut claims: Map<String, Value>) -> Result<AuthClaims, AuthError> {
        let sub =
            take_string(&mut claims, "sub").ok_or_else(|| invalid("the token has no subject"))?;
        let iss =
            take_string(&mut claims, "iss").ok_or_else(|| invalid("the token has no issuer"))?;
        let kind = self
            .classify(&claims)
            .ok_or_else(|| invalid("the token is neither a session nor a connected app token"))?;
        Ok(AuthClaims {
            sub,
            iss,
            kind,
            other: claims,
        })
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
    remote: Option<Arc<dyn SessionAuthenticator>>,
}

/// Why local verification failed, and whether Stytch could still vouch for the token.
struct LocalFailure {
    error: AuthError,
    recoverable: bool,
}

impl From<AuthError> for LocalFailure {
    fn from(error: AuthError) -> Self {
        Self {
            error,
            recoverable: false,
        }
    }
}

impl TokenVerifier {
    pub fn new(issuers: Vec<IssuerConfig>) -> Self {
        Self {
            issuers: Arc::new(issuers),
            remote: None,
        }
    }

    /// Verifies tokens for one Stytch project, fetching its signing keys from
    /// the project's JWKS endpoint.
    pub fn stytch(project_id: &str, api_url: Option<&str>, custom_issuer: Option<&str>) -> Self {
        let api = stytch::api_base(project_id, api_url);
        let jwks = HttpJwksProvider::new(format!("{api}/v1/sessions/jwks/{project_id}"));
        Self::new(vec![IssuerConfig::stytch(
            project_id,
            custom_issuer,
            Arc::new(jwks),
        )])
    }

    /// Falls back to Stytch's API for session JWTs that are expired or signed
    /// with a key this server does not hold.
    pub fn with_remote(mut self, remote: Arc<dyn SessionAuthenticator>) -> Self {
        self.remote = Some(remote);
        self
    }

    pub async fn verify(&self, token: &str) -> Result<AuthClaims, AuthError> {
        let failure = match self.verify_locally(token).await {
            Ok(claims) => return Ok(claims),
            Err(failure) => failure,
        };
        let Some(remote) = self.remote.as_ref().filter(|_| failure.recoverable) else {
            return Err(failure.error);
        };
        let fresh = remote.authenticate_session_jwt(token).await?;
        let claims = self.trusted_claims(&fresh)?;
        tracing::info!(local = %failure.error, "Stytch vouched for a session JWT that failed local verification");
        Ok(claims)
    }

    async fn verify_locally(&self, token: &str) -> Result<AuthClaims, LocalFailure> {
        let header = decode_header(token).map_err(|_| invalid("the token is not a JWT"))?;
        let kid = header
            .kid
            .clone()
            .ok_or_else(|| invalid("the token names no signing key"))?;
        if header.alg != Algorithm::RS256 {
            return Err(invalid(format!("unexpected algorithm {:?}", header.alg)).into());
        }
        let issuer = unverified_issuer(token).ok_or_else(|| invalid("the token has no issuer"))?;
        let config = self
            .issuers
            .iter()
            .find(|config| config.issuers.contains(&issuer))
            .ok_or_else(|| {
                AuthError::Unauthorized(format!("Error: Invalid JWT! untrusted issuer {issuer}"))
            })?;

        let key = config.jwks.key(&kid).await.map_err(|error| match error {
            JwksError::UnknownKey => LocalFailure {
                error: invalid(format!("unknown signing key {kid} from {issuer}")),
                recoverable: true,
            },
            JwksError::Fetch(_) => {
                AuthError::Unavailable("Error: Signing keys are unavailable".to_string()).into()
            }
        })?;
        if key.alg.as_deref().is_some_and(|alg| alg != "RS256") || key.kty != "RSA" {
            return Err(invalid(format!("signing key {kid} is not an RS256 key")).into());
        }
        let decoding_key = DecodingKey::from_rsa_components(&key.n, &key.e)
            .map_err(|_| invalid(format!("signing key {kid} is malformed")))?;

        let claims = decode::<Map<String, Value>>(token, &decoding_key, &config.validation())
            .map_err(|error| match error.kind() {
                ErrorKind::ExpiredSignature => LocalFailure {
                    error: AuthError::Expired,
                    recoverable: true,
                },
                _ => invalid(format!("cause: {error}")).into(),
            })?
            .claims;
        Ok(config.claims(claims)?)
    }

    /// Claims from a JWT Stytch's API just returned to us over TLS, so its
    /// signature needs no second check; issuer, audience and expiry still do.
    fn trusted_claims(&self, token: &str) -> Result<AuthClaims, AuthError> {
        let issuer = unverified_issuer(token)
            .ok_or_else(|| invalid("Stytch returned a token without an issuer"))?;
        let config = self
            .issuers
            .iter()
            .find(|config| config.issuers.contains(&issuer))
            .ok_or_else(|| {
                invalid(format!(
                    "Stytch returned a token from untrusted issuer {issuer}"
                ))
            })?;
        let claims = jsonwebtoken::dangerous::insecure_decode::<Map<String, Value>>(token)
            .map_err(|error| invalid(format!("Stytch returned an unusable token: {error}")))?
            .claims;
        let audience_ok = match claims.get("aud") {
            Some(Value::String(aud)) => config.audiences.contains(aud),
            Some(Value::Array(auds)) => auds
                .iter()
                .filter_map(Value::as_str)
                .any(|aud| config.audiences.iter().any(|ours| ours == aud)),
            _ => false,
        };
        let live = claims
            .get("exp")
            .and_then(Value::as_i64)
            .is_some_and(|exp| exp > chrono::Utc::now().timestamp());
        if !audience_ok || !live {
            return Err(invalid(
                "Stytch returned a token for another project or already expired",
            ));
        }
        config.claims(claims)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::jwks::Jwk;
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
        assert!(matches!(
            verifier().verify(&expired).await,
            Err(AuthError::Expired)
        ));
        let early = sign(&stytch_claims(json!({ "nbf": now() + 600 })));
        assert!(matches!(
            verifier().verify(&early).await,
            Err(AuthError::Unauthorized(_))
        ));
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

    /// Stands in for Stytch: vouches with a fresh token, refuses, and counts calls.
    struct FakeStytch {
        answer: Option<String>,
        calls: std::sync::atomic::AtomicUsize,
    }

    #[async_trait::async_trait]
    impl SessionAuthenticator for FakeStytch {
        async fn authenticate_session_jwt(&self, _jwt: &str) -> Result<String, AuthError> {
            self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            self.answer.clone().ok_or_else(|| {
                AuthError::Unauthorized(
                    "Error: Invalid JWT! Stytch did not accept the session".into(),
                )
            })
        }
    }

    fn with_stytch(answer: Option<String>) -> (TokenVerifier, Arc<FakeStytch>) {
        let stytch = Arc::new(FakeStytch {
            answer,
            calls: Default::default(),
        });
        (verifier().with_remote(stytch.clone()), stytch)
    }

    fn calls(stytch: &FakeStytch) -> usize {
        stytch.calls.load(std::sync::atomic::Ordering::SeqCst)
    }

    #[tokio::test]
    async fn stytch_vouches_for_expired_sessions_and_unknown_keys() {
        let fresh = sign(&stytch_claims(json!({})));
        let (verifier, stytch) = with_stytch(Some(fresh));

        let expired = sign(&stytch_claims(json!({ "exp": now() - 600 })));
        let claims = verifier.verify(&expired).await.unwrap();
        assert_eq!(claims.sub, "user-test-123");

        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("rotated-in".to_string());
        let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).unwrap();
        let new_key = encode(&header, &stytch_claims(json!({})), &key).unwrap();
        assert!(verifier.verify(&new_key).await.is_ok());
        assert_eq!(calls(&stytch), 2);
    }

    #[tokio::test]
    async fn stytch_is_not_asked_about_forged_or_malformed_tokens() {
        let (verifier, stytch) = with_stytch(Some(sign(&stytch_claims(json!({})))));
        let mut forged = sign(&stytch_claims(json!({})));
        forged.push('x');
        assert!(matches!(
            verifier.verify(&forged).await,
            Err(AuthError::Unauthorized(_))
        ));
        assert!(verifier.verify("not-a-jwt").await.is_err());
        let wrong_project = sign(&stytch_claims(json!({ "aud": ["project-test-other"] })));
        assert!(verifier.verify(&wrong_project).await.is_err());
        assert_eq!(calls(&stytch), 0);
    }

    #[tokio::test]
    async fn a_session_stytch_refuses_or_a_fresh_token_for_another_project_is_rejected() {
        let expired = sign(&stytch_claims(json!({ "exp": now() - 600 })));
        let (refusing, _) = with_stytch(None);
        assert!(matches!(
            refusing.verify(&expired).await,
            Err(AuthError::Unauthorized(_))
        ));

        let elsewhere = sign(&stytch_claims(json!({ "aud": ["project-test-other"] })));
        let (confused, _) = with_stytch(Some(elsewhere));
        assert!(matches!(
            confused.verify(&expired).await,
            Err(AuthError::Unauthorized(_))
        ));
    }

    #[tokio::test]
    async fn rejections_name_their_cause() {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("other".to_string());
        let key = EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).unwrap();
        let token = encode(&header, &stytch_claims(json!({})), &key).unwrap();
        let Err(AuthError::Unauthorized(message)) = verifier().verify(&token).await else {
            panic!("an unknown key is rejected");
        };
        assert!(message.contains("unknown signing key other"), "{message}");
    }
}
