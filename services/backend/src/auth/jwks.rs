use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::sync::{Mutex, RwLock};

#[derive(Clone, Debug, Deserialize)]
pub struct Jwk {
    pub kid: String,
    #[serde(default)]
    pub kty: String,
    #[serde(default)]
    pub alg: Option<String>,
    #[serde(default)]
    pub n: String,
    #[serde(default)]
    pub e: String,
}

#[derive(Debug, thiserror::Error)]
pub enum JwksError {
    #[error("no signing key matches the token")]
    UnknownKey,
    #[error("could not fetch signing keys: {0}")]
    Fetch(String),
}

#[async_trait::async_trait]
pub trait JwksProvider: Send + Sync {
    async fn key(&self, kid: &str) -> Result<Jwk, JwksError>;
}

#[derive(Deserialize)]
struct JwkSet {
    keys: Vec<Jwk>,
}

/// Caches a remote JWKS and refetches when a token names a key it does not hold,
/// which is how provider key rotation reaches us. Refetches are rate limited so a
/// stream of forged `kid`s cannot turn into a stream of requests upstream.
pub struct HttpJwksProvider {
    url: String,
    client: reqwest::Client,
    min_refetch: Duration,
    keys: RwLock<HashMap<String, Jwk>>,
    last_fetch: Mutex<Option<Instant>>,
}

impl HttpJwksProvider {
    pub fn new(url: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("reqwest client with a timeout always builds");
        Self {
            url: url.into(),
            client,
            min_refetch: Duration::from_secs(60),
            keys: RwLock::new(HashMap::new()),
            last_fetch: Mutex::new(None),
        }
    }

    async fn cached(&self, kid: &str) -> Option<Jwk> {
        self.keys.read().await.get(kid).cloned()
    }

    async fn refetch(&self) -> Result<(), JwksError> {
        let set: JwkSet = self
            .client
            .get(&self.url)
            .send()
            .await
            .and_then(|response| response.error_for_status())
            .map_err(|error| JwksError::Fetch(error.to_string()))?
            .json()
            .await
            .map_err(|error| JwksError::Fetch(error.to_string()))?;
        let keys = set
            .keys
            .into_iter()
            .map(|key| (key.kid.clone(), key))
            .collect();
        *self.keys.write().await = keys;
        Ok(())
    }
}

#[async_trait::async_trait]
impl JwksProvider for HttpJwksProvider {
    async fn key(&self, kid: &str) -> Result<Jwk, JwksError> {
        if let Some(key) = self.cached(kid).await {
            return Ok(key);
        }

        let mut last_fetch = self.last_fetch.lock().await;
        // Another request may have refetched while this one waited for the lock.
        if let Some(key) = self.cached(kid).await {
            return Ok(key);
        }
        if last_fetch.is_some_and(|at| at.elapsed() < self.min_refetch) {
            return Err(JwksError::UnknownKey);
        }
        *last_fetch = Some(Instant::now());
        self.refetch().await?;
        self.cached(kid).await.ok_or(JwksError::UnknownKey)
    }
}
