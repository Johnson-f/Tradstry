use std::time::Duration;

use tokio::time::Instant;

use reqwest::{Method, Url};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::sync::{Mutex, OnceCell};
use tracing::debug;

use super::{
    error::SnapTradeError,
    models::{
        Activity, ActivityPage, ActivityPageBody, ActivityQuery, BrokerageProvider, Connection,
        ConnectionAccount, ConnectionAccounts, OAuthMetadata, OAuthTokenBody, OAuthTokens, Order,
        PartnerInfo, PortalLink, Registration,
    },
    signing,
};

const LIVE_API: &str = "https://api.snaptrade.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// SnapTrade allows 250 requests a minute per client; stay a little under.
const REQUESTS_PER_MINUTE: f64 = 240.0;
const MAX_RATE_LIMIT_RETRIES: u32 = 2;
const MAX_RATE_LIMIT_WAIT: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct OAuthClientConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

#[derive(Clone)]
pub struct SnapTradeConfig {
    pub client_id: String,
    pub consumer_key: String,
    /// Overrides the API host, for a local fake.
    pub api_url: Option<String>,
    pub oauth: Option<OAuthClientConfig>,
}

impl std::fmt::Debug for OAuthClientConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuthClientConfig")
            .field("client_id", &self.client_id)
            .field("redirect_uri", &self.redirect_uri)
            .finish_non_exhaustive()
    }
}

impl std::fmt::Debug for SnapTradeConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SnapTradeConfig")
            .field("client_id", &self.client_id)
            .field("api_url", &self.api_url)
            .field("oauth", &self.oauth)
            .finish_non_exhaustive()
    }
}

/// Who a data request acts for.
#[derive(Clone, Copy)]
pub enum Credentials<'a> {
    /// A SnapTrade user Tradstry registered, signed with the consumer key.
    Commercial {
        user_id: &'a str,
        user_secret: &'a str,
    },
    /// A SnapTrade Personal user's OAuth access token.
    Bearer(&'a str),
}

impl std::fmt::Debug for Credentials<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Commercial { user_id, .. } => write!(f, "Commercial({user_id})"),
            Self::Bearer(_) => f.write_str("Bearer"),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct PortalOptions<'a> {
    pub broker: Option<&'a str>,
    /// The SnapTrade connection ID to repair instead of creating a new one.
    pub reconnect: Option<&'a str>,
    pub custom_redirect: Option<&'a str>,
}

pub struct SnapTradeClient {
    http: reqwest::Client,
    base: Url,
    client_id: String,
    consumer_key: String,
    oauth: Option<OAuthClientConfig>,
    oauth_metadata: OnceCell<OAuthMetadata>,
    brokerages: Mutex<Option<(Instant, Vec<BrokerageProvider>)>>,
    limiter: Limiter,
}

impl std::fmt::Debug for SnapTradeClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SnapTradeClient")
            .field("base", &self.base.as_str())
            .finish_non_exhaustive()
    }
}

enum Auth<'a> {
    Signed { user: Option<(&'a str, &'a str)> },
    Bearer(&'a str),
}

impl<'a> From<Credentials<'a>> for Auth<'a> {
    fn from(credentials: Credentials<'a>) -> Self {
        match credentials {
            Credentials::Commercial {
                user_id,
                user_secret,
            } => Self::Signed {
                user: Some((user_id, user_secret)),
            },
            Credentials::Bearer(token) => Self::Bearer(token),
        }
    }
}

impl SnapTradeClient {
    pub fn new(config: SnapTradeConfig) -> anyhow::Result<Self> {
        let base = config
            .api_url
            .as_deref()
            .filter(|url| !url.is_empty())
            .unwrap_or(LIVE_API)
            .trim_end_matches('/');
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self {
            http,
            base: Url::parse(base)?,
            client_id: config.client_id,
            consumer_key: config.consumer_key,
            oauth: config.oauth,
            oauth_metadata: OnceCell::new(),
            brokerages: Mutex::new(None),
            limiter: Limiter::per_minute(REQUESTS_PER_MINUTE),
        })
    }

    pub fn oauth_enabled(&self) -> bool {
        self.oauth.is_some()
    }

    /// Use supported client info rather than the deprecated global broker list.
    /// A short cache avoids a provider call for every dropdown opening.
    pub async fn brokerages(&self) -> Result<Vec<BrokerageProvider>, SnapTradeError> {
        let mut cached = self.brokerages.lock().await;
        if let Some((fetched_at, brokers)) = cached.as_ref()
            && fetched_at.elapsed() < Duration::from_secs(300)
        {
            return Ok(brokers.clone());
        }
        let partner: PartnerInfo = self
            .request(
                Method::GET,
                "/snapTrade/partners",
                &[],
                None,
                Auth::Signed { user: None },
            )
            .await?;
        let brokers = partner.allowed_brokerages;
        *cached = Some((Instant::now(), brokers.clone()));
        Ok(brokers)
    }

    pub fn oauth_redirect_uri(&self) -> Option<&str> {
        self.oauth.as_ref().map(|oauth| oauth.redirect_uri.as_str())
    }

    // ── Commercial users ────────────────────────────────────────────────────

    pub async fn register_user(&self, user_id: &str) -> Result<Registration, SnapTradeError> {
        self.request(
            Method::POST,
            "/snapTrade/registerUser",
            &[],
            Some(json!({ "userId": user_id })),
            Auth::Signed { user: None },
        )
        .await
    }

    /// Deletes a registered user and their connections. Already gone is fine.
    pub async fn delete_user(&self, user_id: &str) -> Result<(), SnapTradeError> {
        let deleted = self
            .request::<Value>(
                Method::DELETE,
                "/snapTrade/deleteUser",
                &[("userId", user_id.to_owned())],
                None,
                Auth::Signed { user: None },
            )
            .await;
        match deleted {
            Err(error) if error.is_not_found() => Ok(()),
            other => other.map(drop),
        }
    }

    /// A Connection Portal link, valid for five minutes. Tradstry only ever
    /// asks for read access.
    pub async fn connection_portal_url(
        &self,
        user_id: &str,
        user_secret: &str,
        options: &PortalOptions<'_>,
    ) -> Result<String, SnapTradeError> {
        let mut body = json!({ "connectionType": "read", "immediateRedirect": true });
        let fields = body.as_object_mut().expect("object literal");
        if let Some(broker) = options.broker {
            fields.insert("broker".into(), broker.into());
        }
        if let Some(reconnect) = options.reconnect {
            fields.insert("reconnect".into(), reconnect.into());
        }
        if let Some(redirect) = options.custom_redirect {
            fields.insert("customRedirect".into(), redirect.into());
        }
        let link: PortalLink = self
            .request(
                Method::POST,
                "/snapTrade/login",
                &[],
                Some(body),
                Auth::Signed {
                    user: Some((user_id, user_secret)),
                },
            )
            .await?;
        link.redirect_uri
            .ok_or_else(|| SnapTradeError::Decode("the portal response had no redirectURI".into()))
    }

    // ── Connections and accounts (either credential kind) ──────────────────

    pub async fn list_connections(
        &self,
        credentials: Credentials<'_>,
    ) -> Result<Vec<Connection>, SnapTradeError> {
        self.request(
            Method::GET,
            "/authorizations",
            &[],
            None,
            credentials.into(),
        )
        .await
    }

    pub async fn get_connection(
        &self,
        credentials: Credentials<'_>,
        connection_id: &str,
    ) -> Result<Connection, SnapTradeError> {
        self.request(
            Method::GET,
            &format!("/authorizations/{}", segment(connection_id)),
            &[],
            None,
            credentials.into(),
        )
        .await
    }

    /// Removes a Commercial connection upstream. Already gone is fine.
    pub async fn delete_connection(
        &self,
        user_id: &str,
        user_secret: &str,
        connection_id: &str,
    ) -> Result<(), SnapTradeError> {
        let deleted = self
            .request::<Value>(
                Method::DELETE,
                &format!("/connection/{}", segment(connection_id)),
                &[],
                None,
                Auth::Signed {
                    user: Some((user_id, user_secret)),
                },
            )
            .await;
        match deleted {
            Err(error) if error.is_not_found() => Ok(()),
            other => other.map(drop),
        }
    }

    pub async fn list_connection_accounts(
        &self,
        credentials: Credentials<'_>,
        connection_id: &str,
    ) -> Result<Vec<ConnectionAccount>, SnapTradeError> {
        let body: ConnectionAccounts = self
            .request(
                Method::GET,
                &format!("/connections/{}/accounts", segment(connection_id)),
                &[],
                None,
                credentials.into(),
            )
            .await?;
        Ok(body.results)
    }

    pub async fn positions(
        &self,
        credentials: Credentials<'_>,
        account_id: &str,
    ) -> Result<Value, SnapTradeError> {
        self.request(
            Method::GET,
            &format!("/accounts/{}/positions/all", segment(account_id)),
            &[],
            None,
            credentials.into(),
        )
        .await
    }

    pub async fn balances(
        &self,
        credentials: Credentials<'_>,
        account_id: &str,
    ) -> Result<Value, SnapTradeError> {
        self.request(
            Method::GET,
            &format!("/accounts/{}/balances", segment(account_id)),
            &[],
            None,
            credentials.into(),
        )
        .await
    }

    pub async fn activities(
        &self,
        credentials: Credentials<'_>,
        account_id: &str,
        query: ActivityQuery,
    ) -> Result<ActivityPage, SnapTradeError> {
        let mut params = Vec::with_capacity(4);
        if let Some(start) = query.start {
            params.push(("startDate", start.to_string()));
        }
        params.extend([
            ("endDate", query.end.to_string()),
            ("offset", query.offset.to_string()),
            ("limit", query.limit.to_string()),
        ]);
        let body: ActivityPageBody = self
            .request(
                Method::GET,
                &format!("/accounts/{}/activities", segment(account_id)),
                &params,
                None,
                credentials.into(),
            )
            .await?;
        Ok(ActivityPage {
            activities: body
                .data
                .into_iter()
                .filter_map(Activity::from_raw)
                .collect(),
            total: body.pagination.and_then(|pagination| pagination.total),
        })
    }

    /// Orders from the last `days` days (SnapTrade caps this at 90).
    pub async fn orders(
        &self,
        credentials: Credentials<'_>,
        account_id: &str,
        days: u32,
    ) -> Result<Vec<Order>, SnapTradeError> {
        let params = [
            ("state", "all".to_owned()),
            ("days", days.min(90).to_string()),
        ];
        let raw: Vec<Value> = self
            .request(
                Method::GET,
                &format!("/accounts/{}/orders", segment(account_id)),
                &params,
                None,
                credentials.into(),
            )
            .await?;
        Ok(raw.into_iter().filter_map(Order::from_raw).collect())
    }

    // ── OAuth ───────────────────────────────────────────────────────────────

    fn oauth_config(&self) -> Result<&OAuthClientConfig, SnapTradeError> {
        self.oauth
            .as_ref()
            .ok_or(SnapTradeError::NotConfigured("SnapTrade OAuth"))
    }

    async fn metadata(&self) -> Result<&OAuthMetadata, SnapTradeError> {
        self.oauth_metadata
            .get_or_try_init(|| async {
                let url = self.url("/.well-known/oauth-authorization-server")?;
                let response = self.http.get(url).send().await.map_err(transport)?;
                let response = check(response).await?;
                response
                    .json::<OAuthMetadata>()
                    .await
                    .map_err(|error| SnapTradeError::Decode(error.to_string()))
            })
            .await
    }

    pub async fn authorization_url(
        &self,
        state: &str,
        code_challenge: &str,
        scopes: &[&str],
    ) -> Result<String, SnapTradeError> {
        let oauth = self.oauth_config()?;
        let metadata = self.metadata().await?;
        let mut url = Url::parse(&metadata.authorization_endpoint)
            .map_err(|_| SnapTradeError::Decode("invalid authorization endpoint".into()))?;
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &oauth.client_id)
            .append_pair("redirect_uri", &oauth.redirect_uri)
            .append_pair("scope", &scopes.join(" "))
            .append_pair("state", state)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256");
        Ok(url.to_string())
    }

    pub async fn exchange_code(
        &self,
        code: &str,
        code_verifier: &str,
    ) -> Result<OAuthTokens, SnapTradeError> {
        let oauth = self.oauth_config()?;
        self.token_request(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("code_verifier", code_verifier),
            ("redirect_uri", &oauth.redirect_uri),
        ])
        .await
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<OAuthTokens, SnapTradeError> {
        self.token_request(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .await
    }

    pub async fn revoke_token(&self, refresh_token: &str) -> Result<(), SnapTradeError> {
        let oauth = self.oauth_config()?;
        let endpoint = self.metadata().await?.revocation_endpoint.clone();
        let response = self
            .http
            .post(endpoint)
            .basic_auth(&oauth.client_id, Some(&oauth.client_secret))
            .form(&[
                ("token", refresh_token),
                ("token_type_hint", "refresh_token"),
            ])
            .send()
            .await
            .map_err(transport)?;
        check(response).await.map(drop)
    }

    async fn token_request(&self, form: &[(&str, &str)]) -> Result<OAuthTokens, SnapTradeError> {
        let oauth = self.oauth_config()?;
        let endpoint = self.metadata().await?.token_endpoint.clone();
        let response = self
            .http
            .post(endpoint)
            .basic_auth(&oauth.client_id, Some(&oauth.client_secret))
            .header("Accept", "application/json")
            .form(form)
            .send()
            .await
            .map_err(transport)?;
        let body: OAuthTokenBody = check(response)
            .await?
            .json()
            .await
            .map_err(|error| SnapTradeError::Decode(error.to_string()))?;
        body.into_tokens().ok_or_else(|| {
            SnapTradeError::Decode("the token response omitted required fields".into())
        })
    }

    // ── Transport ───────────────────────────────────────────────────────────

    fn url(&self, path: &str) -> Result<Url, SnapTradeError> {
        let mut url = self.base.clone();
        let base_path = url.path().trim_end_matches('/').to_owned();
        url.set_path(&format!("{base_path}{path}"));
        Ok(url)
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        params: &[(&str, String)],
        body: Option<Value>,
        auth: Auth<'_>,
    ) -> Result<T, SnapTradeError> {
        let mut attempts = 0;
        loop {
            self.limiter.acquire().await;
            let response = self
                .send(method.clone(), path, params, body.as_ref(), &auth)
                .await?;
            match check(response).await {
                Ok(response) => {
                    let bytes = response.bytes().await.map_err(transport)?;
                    return serde_json::from_slice(&bytes)
                        .map_err(|error| SnapTradeError::Decode(format!("{path}: {error}")));
                }
                Err(SnapTradeError::RateLimited { retry_after })
                    if attempts < MAX_RATE_LIMIT_RETRIES && retry_after <= MAX_RATE_LIMIT_WAIT =>
                {
                    attempts += 1;
                    debug!(
                        path,
                        wait_secs = retry_after.as_secs(),
                        "SnapTrade rate limited; waiting"
                    );
                    tokio::time::sleep(retry_after).await;
                }
                Err(error) => return Err(error),
            }
        }
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        params: &[(&str, String)],
        body: Option<&Value>,
        auth: &Auth<'_>,
    ) -> Result<reqwest::Response, SnapTradeError> {
        let (url, request_headers) = self.prepare(path, params, body, auth)?;
        let mut request = self
            .http
            .request(method, url)
            .headers(request_headers)
            .header("Accept", "application/json");
        if let Some(body) = body {
            request = request.json(body);
        }
        request.send().await.map_err(transport)
    }

    /// Builds the URL and auth headers. Synchronous so the query serializer,
    /// which is not `Send`, never lives across an await.
    fn prepare(
        &self,
        path: &str,
        params: &[(&str, String)],
        body: Option<&Value>,
        auth: &Auth<'_>,
    ) -> Result<(Url, reqwest::header::HeaderMap), SnapTradeError> {
        let mut url = self.url(path)?;
        let mut query = url::form_urlencoded::Serializer::new(String::new());
        for (name, value) in params {
            query.append_pair(name, value);
        }
        let mut request_headers = reqwest::header::HeaderMap::new();
        match auth {
            Auth::Signed { user } => {
                if let Some((user_id, user_secret)) = user {
                    query
                        .append_pair("userId", user_id)
                        .append_pair("userSecret", user_secret);
                }
                query
                    .append_pair("clientId", &self.client_id)
                    .append_pair("timestamp", &chrono::Utc::now().timestamp().to_string());
                let query = query.finish();
                let signature = signing::signature(&self.consumer_key, url.path(), &query, body);
                url.set_query(Some(&query));
                request_headers.insert(
                    "Signature",
                    signature
                        .parse()
                        .map_err(|_| SnapTradeError::Decode("bad signature header".into()))?,
                );
            }
            Auth::Bearer(token) => {
                let query = query.finish();
                url.set_query((!query.is_empty()).then_some(query.as_str()));
                request_headers.insert(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {token}")
                        .parse()
                        .map_err(|_| SnapTradeError::Decode("bad bearer token".into()))?,
                );
            }
        }
        Ok((url, request_headers))
    }
}

fn transport(error: reqwest::Error) -> SnapTradeError {
    // reqwest errors can include the URL, whose query holds user secrets.
    SnapTradeError::Transport(error.without_url().to_string())
}

fn segment(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

async fn check(response: reqwest::Response) -> Result<reqwest::Response, SnapTradeError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let headers = response.headers().clone();
    let request_id = headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let body = response.bytes().await.unwrap_or_default();
    if status.as_u16() == 429 {
        return Err(SnapTradeError::RateLimited {
            retry_after: retry_after(&headers, &body),
        });
    }
    Err(SnapTradeError::from_response(
        status.as_u16(),
        &body,
        request_id,
    ))
}

/// How long SnapTrade asks callers to wait: the reset header for whichever
/// limit ran out, else the wait named in the body, else five seconds.
fn retry_after(headers: &reqwest::header::HeaderMap, body: &[u8]) -> Duration {
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
    };
    let account_exhausted = header("x-ratelimit-account-remaining") == Some(0);
    let seconds = if account_exhausted {
        header("x-ratelimit-account-reset")
    } else {
        header("x-ratelimit-reset")
    }
    .or_else(|| {
        let text = String::from_utf8_lossy(body);
        let after = text.split("available in ").nth(1)?;
        after.split_whitespace().next()?.parse().ok()
    })
    .unwrap_or(5);
    Duration::from_secs(seconds.max(1))
}

/// A token bucket shared by every request this process makes to SnapTrade.
struct Limiter {
    state: Mutex<(f64, Instant)>,
    per_second: f64,
    capacity: f64,
}

impl Limiter {
    fn per_minute(requests: f64) -> Self {
        Self {
            state: Mutex::new((requests, Instant::now())),
            per_second: requests / 60.0,
            capacity: requests,
        }
    }

    async fn acquire(&self) {
        loop {
            let wait = {
                let mut state = self.state.lock().await;
                let now = Instant::now();
                let refill = now.duration_since(state.1).as_secs_f64() * self.per_second;
                state.0 = (state.0 + refill).min(self.capacity);
                state.1 = now;
                if state.0 >= 1.0 {
                    state.0 -= 1.0;
                    return;
                }
                Duration::from_secs_f64((1.0 - state.0) / self.per_second)
            };
            tokio::time::sleep(wait).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue};

    #[test]
    fn debug_output_leaves_out_secrets() {
        let config = SnapTradeConfig {
            client_id: "client".into(),
            consumer_key: "consumer-secret".into(),
            api_url: None,
            oauth: Some(OAuthClientConfig {
                client_id: "oauth-client".into(),
                client_secret: "oauth-secret".into(),
                redirect_uri: "https://example.com/cb".into(),
            }),
        };
        let tokens = crate::snaptrade::OAuthTokens {
            access_token: "access-secret".into(),
            refresh_token: "refresh-secret".into(),
            expires_in: 3600,
            scopes: vec!["read".into()],
            personal_user_id: "personal".into(),
        };
        let registration = crate::snaptrade::Registration {
            user_id: "user".into(),
            user_secret: "user-secret".into(),
        };
        let printed = format!(
            "{config:?} {tokens:?} {registration:?} {:?} {:?}",
            Credentials::Commercial {
                user_id: "user",
                user_secret: "user-secret"
            },
            Credentials::Bearer("access-secret"),
        );
        assert!(printed.contains("client") && printed.contains("personal"));
        assert!(!printed.contains("-secret"), "{printed}");
    }

    #[test]
    fn retry_after_prefers_the_exhausted_limits_reset() {
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-reset", HeaderValue::from_static("30"));
        headers.insert(
            "x-ratelimit-account-remaining",
            HeaderValue::from_static("0"),
        );
        headers.insert("x-ratelimit-account-reset", HeaderValue::from_static("12"));
        assert_eq!(retry_after(&headers, b""), Duration::from_secs(12));

        headers.remove("x-ratelimit-account-remaining");
        assert_eq!(retry_after(&headers, b""), Duration::from_secs(30));

        let body = br#"{"detail":"Request was throttled. Expected available in 7 seconds.","status_code":429}"#;
        assert_eq!(retry_after(&HeaderMap::new(), body), Duration::from_secs(7));
        assert_eq!(retry_after(&HeaderMap::new(), b""), Duration::from_secs(5));
    }

    #[tokio::test(start_paused = true)]
    async fn the_limiter_spaces_requests_once_the_bucket_is_empty() {
        let limiter = Limiter::per_minute(60.0);
        let start = tokio::time::Instant::now();
        for _ in 0..60 {
            limiter.acquire().await;
        }
        assert!(start.elapsed() < Duration::from_millis(10));
        limiter.acquire().await;
        assert!(start.elapsed() >= Duration::from_millis(900));
    }
}
