//! An in-memory SnapTrade served over HTTP, for tests. It enforces the rules
//! Tradstry depends on: signed Commercial requests, Commercial credentials
//! (`1083` when unknown), expiring bearer tokens, rotating refresh tokens, and
//! PKCE. Never point a running server at it.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::{Body, Bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;

use super::client::{OAuthClientConfig, SnapTradeClient, SnapTradeConfig};
use super::signing;

pub const CLIENT_ID: &str = "client-test";
pub const CONSUMER_KEY: &str = "consumer-key-test";
pub const OAUTH_CLIENT_ID: &str = "oauth-client-test";
pub const OAUTH_CLIENT_SECRET: &str = "oauth-secret-test";
pub const OAUTH_REDIRECT_URI: &str = "http://localhost:7900/oauth/snaptrade/callback";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Owner {
    Commercial(String),
    Personal(String),
}

#[derive(Clone, Debug)]
pub struct FakeAccount {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub raw_type: String,
    pub cash_or_margin: String,
    pub activities: Vec<Value>,
    pub orders: Vec<Value>,
    pub positions: Value,
    pub balances: Value,
}

impl FakeAccount {
    pub fn investment(id: &str, name: &str) -> Self {
        Self {
            id: id.to_owned(),
            kind: "investment".to_owned(),
            name: name.to_owned(),
            raw_type: "Margin".to_owned(),
            cash_or_margin: "margin".to_owned(),
            activities: Vec::new(),
            orders: Vec::new(),
            positions: json!({ "results": [], "data_freshness": {} }),
            balances: json!([{ "currency": { "code": "USD" }, "cash": 1000.0, "buying_power": 1000.0 }]),
        }
    }

    /// An investment account the brokerage labels `raw_type`.
    pub fn typed(id: &str, name: &str, raw_type: &str, cash_or_margin: &str) -> Self {
        Self {
            raw_type: raw_type.to_owned(),
            cash_or_margin: cash_or_margin.to_owned(),
            ..Self::investment(id, name)
        }
    }

    pub fn of_kind(id: &str, kind: &str) -> Self {
        Self {
            kind: kind.to_owned(),
            ..Self::investment(id, kind)
        }
    }
}

#[derive(Clone, Debug)]
pub struct FakeConnection {
    pub id: String,
    pub owner: Owner,
    pub institution: String,
    pub disabled: bool,
    pub accounts: Vec<FakeAccount>,
}

#[derive(Clone, Debug)]
pub struct Recorded {
    pub method: Method,
    pub path: String,
    pub query: HashMap<String, String>,
    pub body: Option<Value>,
    pub authorization: Option<String>,
}

struct PendingCode {
    personal_user_id: String,
    challenge: String,
    redirect_uri: String,
}

#[derive(Default)]
struct State {
    brokerages: Vec<Value>,
    users: HashMap<String, String>,
    connections: Vec<FakeConnection>,
    codes: HashMap<String, PendingCode>,
    access_tokens: HashMap<String, (String, DateTime<Utc>)>,
    refresh_tokens: HashMap<String, String>,
    revoked: Vec<String>,
    requests: Vec<Recorded>,
    failures: VecDeque<(String, u16, Value)>,
    access_token_ttl_seconds: i64,
    issued: u64,
}

#[derive(Clone)]
pub struct FakeSnapTrade {
    pub url: String,
    state: Arc<Mutex<State>>,
}

impl FakeSnapTrade {
    pub async fn start() -> Self {
        let state = Arc::new(Mutex::new(State {
            brokerages: vec![json!({
                "slug": "ROBINHOOD", "name": "Robinhood", "display_name": "Robinhood",
                "aws_s3_logo_url": "https://example.test/robinhood.png",
                "aws_s3_square_logo_url": "https://example.test/robinhood-square.png",
                "enabled": true, "maintenance_mode": false,
            })],
            access_token_ttl_seconds: 36_000,
            ..State::default()
        }));
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind the fake SnapTrade");
        let url = format!("http://{}", listener.local_addr().expect("local address"));
        let shared = (state.clone(), url.clone());
        let router = Router::new().fallback(move |request: Request<Body>| {
            let (state, url) = shared.clone();
            async move { handle(state, url, request).await }
        });
        tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("serve the fake SnapTrade")
        });
        Self { url, state }
    }

    pub fn config(&self, oauth: bool) -> SnapTradeConfig {
        SnapTradeConfig {
            client_id: CLIENT_ID.to_owned(),
            consumer_key: CONSUMER_KEY.to_owned(),
            api_url: Some(self.url.clone()),
            oauth: oauth.then(|| OAuthClientConfig {
                client_id: OAUTH_CLIENT_ID.to_owned(),
                client_secret: OAUTH_CLIENT_SECRET.to_owned(),
                redirect_uri: OAUTH_REDIRECT_URI.to_owned(),
            }),
        }
    }

    pub fn client(&self) -> SnapTradeClient {
        SnapTradeClient::new(self.config(true)).expect("fake SnapTrade client")
    }

    fn with<T>(&self, f: impl FnOnce(&mut State) -> T) -> T {
        f(&mut self.state.lock().expect("fake SnapTrade state"))
    }

    pub fn add_connection(&self, connection: FakeConnection) {
        self.with(|state| state.connections.push(connection));
    }

    pub fn set_brokerages(&self, brokerages: Vec<Value>) {
        self.with(|state| state.brokerages = brokerages);
    }

    /// A Personal user's connection with one investment account per ID.
    pub fn personal_connection(
        &self,
        personal_user_id: &str,
        connection_id: &str,
        account_ids: &[&str],
    ) {
        self.add_connection(FakeConnection {
            id: connection_id.to_owned(),
            owner: Owner::Personal(personal_user_id.to_owned()),
            institution: "Sandbox".to_owned(),
            disabled: false,
            accounts: account_ids
                .iter()
                .map(|id| FakeAccount::investment(id, &format!("Account {id}")))
                .collect(),
        });
    }

    /// What finishing the Connection Portal does: a connection for a registered user.
    pub fn complete_portal(&self, user_id: &str, connection_id: &str, accounts: Vec<FakeAccount>) {
        self.add_connection(FakeConnection {
            id: connection_id.to_owned(),
            owner: Owner::Commercial(user_id.to_owned()),
            institution: "Sandbox".to_owned(),
            disabled: false,
            accounts,
        });
    }

    pub fn set_disabled(&self, connection_id: &str, disabled: bool) {
        self.with(|state| {
            for connection in &mut state.connections {
                if connection.id == connection_id {
                    connection.disabled = disabled;
                }
            }
        });
    }

    pub fn set_activities(&self, account_id: &str, activities: Vec<Value>) {
        self.with(|state| {
            for account in state
                .connections
                .iter_mut()
                .flat_map(|c| c.accounts.iter_mut())
            {
                if account.id == account_id {
                    account.activities = activities.clone();
                }
            }
        });
    }

    pub fn set_orders(&self, account_id: &str, orders: Vec<Value>) {
        self.with(|state| {
            for account in state
                .connections
                .iter_mut()
                .flat_map(|c| c.accounts.iter_mut())
            {
                if account.id == account_id {
                    account.orders = orders.clone();
                }
            }
        });
    }

    /// Simulates the user approving Tradstry at SnapTrade: returns the code
    /// SnapTrade would send to the redirect URI.
    pub fn approve(&self, personal_user_id: &str, authorization_url: &str) -> String {
        let url = reqwest::Url::parse(authorization_url).expect("authorization URL");
        let param = |name: &str| {
            url.query_pairs()
                .find(|(k, _)| k == name)
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default()
        };
        self.with(|state| {
            state.issued += 1;
            let code = format!("code-{}", state.issued);
            state.codes.insert(
                code.clone(),
                PendingCode {
                    personal_user_id: personal_user_id.to_owned(),
                    challenge: param("code_challenge"),
                    redirect_uri: param("redirect_uri"),
                },
            );
            code
        })
    }

    pub fn set_access_token_ttl(&self, seconds: i64) {
        self.with(|state| state.access_token_ttl_seconds = seconds);
    }

    /// Every issued access token stops working, as after SnapTrade-side expiry.
    pub fn expire_access_tokens(&self) {
        self.with(|state| {
            for (_, expires) in state.access_tokens.values_mut() {
                *expires = Utc::now() - chrono::Duration::seconds(1);
            }
        });
    }

    /// Every refresh token stops working, as after the user revokes the app.
    pub fn invalidate_refresh_tokens(&self) {
        self.with(|state| state.refresh_tokens.clear());
    }

    /// The next request whose path starts with `path_prefix` gets this answer.
    pub fn fail_next(&self, path_prefix: &str, status: u16, body: Value) {
        self.with(|state| {
            state
                .failures
                .push_back((path_prefix.to_owned(), status, body))
        });
    }

    pub fn forget_user(&self, user_id: &str) {
        self.with(|state| {
            state.users.remove(user_id);
        });
    }

    pub fn requests(&self) -> Vec<Recorded> {
        self.with(|state| state.requests.clone())
    }

    pub fn requests_to(&self, path_prefix: &str) -> usize {
        self.with(|state| {
            state
                .requests
                .iter()
                .filter(|r| r.path.starts_with(path_prefix))
                .count()
        })
    }

    pub fn registered_users(&self) -> Vec<String> {
        self.with(|state| {
            let mut users: Vec<String> = state.users.keys().cloned().collect();
            users.sort();
            users
        })
    }

    pub fn revoked_tokens(&self) -> Vec<String> {
        self.with(|state| state.revoked.clone())
    }

    pub fn connection_ids(&self) -> Vec<String> {
        self.with(|state| state.connections.iter().map(|c| c.id.clone()).collect())
    }
}

fn error(status: StatusCode, body: Value) -> Response {
    (status, axum::Json(body)).into_response()
}

fn not_found() -> Response {
    error(
        StatusCode::NOT_FOUND,
        json!({ "detail": "Not found", "code": "1012" }),
    )
}

fn stale_credentials() -> Response {
    error(
        StatusCode::UNAUTHORIZED,
        json!({ "detail": "Invalid userID or userSecret provided", "status_code": 401, "code": "1083" }),
    )
}

async fn handle(state: Arc<Mutex<State>>, url: String, request: Request<Body>) -> Response {
    let (parts, body) = request.into_parts();
    let bytes: Bytes = axum::body::to_bytes(body, 1 << 20)
        .await
        .unwrap_or_default();
    let path = parts.uri.path().to_owned();
    let raw_query = parts.uri.query().unwrap_or("").to_owned();
    let query: HashMap<String, String> = url::form_urlencoded::parse(raw_query.as_bytes())
        .into_owned()
        .collect();
    let json_body: Option<Value> = (!bytes.is_empty())
        .then(|| serde_json::from_slice(&bytes).ok())
        .flatten();
    let authorization = parts
        .headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let mut state = state.lock().expect("fake SnapTrade state");
    state.requests.push(Recorded {
        method: parts.method.clone(),
        path: path.clone(),
        query: query.clone(),
        body: json_body.clone(),
        authorization: authorization.clone(),
    });
    if let Some(index) = state
        .failures
        .iter()
        .position(|(prefix, _, _)| path.starts_with(prefix.as_str()))
    {
        let (_, status, body) = state.failures.remove(index).expect("index is in range");
        return error(StatusCode::from_u16(status).expect("valid status"), body);
    }

    if path == "/.well-known/oauth-authorization-server" {
        return axum::Json(json!({
            "authorization_endpoint": format!("{url}/oauth/authorize"),
            "token_endpoint": format!("{url}/oauth/token"),
            "revocation_endpoint": format!("{url}/oauth/revoke"),
        }))
        .into_response();
    }
    if path == "/oauth/token" || path == "/oauth/revoke" {
        return oauth(&mut state, &parts.headers, &path, &bytes);
    }

    // Everything else is a data request, signed or bearer.
    let owner = match &authorization {
        Some(header) if header.starts_with("Bearer ") => {
            let token = &header["Bearer ".len()..];
            match state.access_tokens.get(token) {
                Some((personal, expires)) if *expires > Utc::now() => {
                    Some(Owner::Personal(personal.clone()))
                }
                _ => {
                    return error(
                        StatusCode::UNAUTHORIZED,
                        json!({ "detail": "Invalid or expired token" }),
                    );
                }
            }
        }
        _ => {
            let signature = parts
                .headers
                .get("signature")
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default();
            let expected = signing::signature(CONSUMER_KEY, &path, &raw_query, json_body.as_ref());
            if query.get("clientId").map(String::as_str) != Some(CLIENT_ID) || signature != expected
            {
                return error(
                    StatusCode::UNAUTHORIZED,
                    json!({ "detail": "Unable to verify signature sent", "code": "1076" }),
                );
            }
            match (query.get("userId"), query.get("userSecret")) {
                (Some(user), Some(secret)) => {
                    if state.users.get(user) != Some(secret) {
                        return stale_credentials();
                    }
                    Some(Owner::Commercial(user.clone()))
                }
                _ => None,
            }
        }
    };

    let method = parts.method.clone();
    let segments: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match (method, segments.as_slice(), owner) {
        (Method::GET, ["snapTrade", "partners"], None) => {
            axum::Json(json!({ "allowed_brokerages": state.brokerages })).into_response()
        }
        (Method::POST, ["snapTrade", "registerUser"], None) => {
            let user_id = json_body
                .as_ref()
                .and_then(|b| b.get("userId"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            state.issued += 1;
            let secret = format!("secret-{}", state.issued);
            state.users.insert(user_id.clone(), secret.clone());
            axum::Json(json!({ "userId": user_id, "userSecret": secret })).into_response()
        }
        (Method::DELETE, ["snapTrade", "deleteUser"], None) => {
            let user_id = query.get("userId").cloned().unwrap_or_default();
            if state.users.remove(&user_id).is_none() {
                return not_found();
            }
            state
                .connections
                .retain(|c| c.owner != Owner::Commercial(user_id.clone()));
            axum::Json(json!({ "status": "deleted", "userId": user_id })).into_response()
        }
        (Method::POST, ["snapTrade", "login"], Some(Owner::Commercial(user))) => {
            axum::Json(json!({
                "redirectURI": format!("https://connect.snaptrade.test/portal?user={user}"),
                "sessionId": "session-portal",
            }))
            .into_response()
        }
        (Method::GET, ["authorizations"], Some(owner)) => {
            let list: Vec<Value> = state
                .connections
                .iter()
                .filter(|c| c.owner == owner)
                .map(connection_json)
                .collect();
            axum::Json(list).into_response()
        }
        (Method::GET, ["authorizations", id], Some(owner)) => match state
            .connections
            .iter()
            .find(|c| c.id == *id && c.owner == owner)
        {
            Some(connection) => axum::Json(connection_json(connection)).into_response(),
            None => not_found(),
        },
        (Method::DELETE, ["connection", id], Some(owner @ Owner::Commercial(_))) => {
            let before = state.connections.len();
            state
                .connections
                .retain(|c| !(c.id == *id && c.owner == owner));
            if state.connections.len() == before {
                return not_found();
            }
            axum::Json(json!({ "detail": "deleted" })).into_response()
        }
        (Method::GET, ["connections", id, "accounts"], Some(owner)) => {
            match state
                .connections
                .iter()
                .find(|c| c.id == *id && c.owner == owner)
            {
                Some(connection) => {
                    let results: Vec<Value> = connection
                        .accounts
                        .iter()
                        .map(|a| {
                            json!({
                                "id": a.id, "kind": a.kind, "connection_id": connection.id,
                                "display_name": a.name, "masked_account_number": "****1234",
                                "raw_type": a.raw_type, "cash_or_margin": a.cash_or_margin,
                                "is_paper": false, "sync_status": {},
                            })
                        })
                        .collect();
                    axum::Json(json!({ "results": results })).into_response()
                }
                None => not_found(),
            }
        }
        (Method::GET, ["accounts", id, rest @ ..], Some(owner)) => {
            let Some(account) = state
                .connections
                .iter()
                .filter(|c| c.owner == owner)
                .flat_map(|c| c.accounts.iter())
                .find(|a| a.id == *id)
                .cloned()
            else {
                return not_found();
            };
            match rest {
                ["positions", "all"] => axum::Json(account.positions).into_response(),
                ["balances"] => axum::Json(account.balances).into_response(),
                ["orders"] => axum::Json(account.orders).into_response(),
                ["activities"] => activities(&account, &query),
                _ => not_found(),
            }
        }
        (_, _, Some(_)) | (_, _, None) => not_found(),
    }
}

fn connection_json(connection: &FakeConnection) -> Value {
    json!({
        "id": connection.id,
        "name": connection.institution,
        "brokerage": { "name": connection.institution, "display_name": connection.institution, "slug": connection.institution.to_uppercase() },
        "disabled": connection.disabled,
        "disabled_date": connection.disabled.then(|| Utc::now().to_rfc3339()),
        "data_freshness_mode": "realtime",
        "type": "read",
    })
}

fn activities(account: &FakeAccount, query: &HashMap<String, String>) -> Response {
    let date = |key: &str| {
        query
            .get(key)
            .and_then(|v| NaiveDate::parse_from_str(v, "%Y-%m-%d").ok())
    };
    let (start, end) = (date("startDate"), date("endDate"));
    let in_range: Vec<&Value> = account
        .activities
        .iter()
        .filter(|activity| {
            let day = activity
                .get("trade_date")
                .and_then(Value::as_str)
                .and_then(|d| DateTime::parse_from_rfc3339(d).ok())
                .map(|d| d.date_naive());
            match day {
                Some(day) => start.is_none_or(|s| day >= s) && end.is_none_or(|e| day <= e),
                None => true,
            }
        })
        .collect();
    let offset: usize = query
        .get("offset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let limit: usize = query
        .get("limit")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1000);
    let page: Vec<&Value> = in_range.iter().skip(offset).take(limit).copied().collect();
    axum::Json(json!({
        "data": page,
        "pagination": { "offset": offset, "limit": limit, "total": in_range.len() },
    }))
    .into_response()
}

fn oauth(state: &mut State, headers: &HeaderMap, path: &str, body: &[u8]) -> Response {
    let expected = format!(
        "Basic {}",
        STANDARD.encode(format!("{OAUTH_CLIENT_ID}:{OAUTH_CLIENT_SECRET}"))
    );
    if headers.get("authorization").and_then(|v| v.to_str().ok()) != Some(expected.as_str()) {
        return error(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "invalid_client" }),
        );
    }
    let form: HashMap<String, String> = url::form_urlencoded::parse(body).into_owned().collect();
    let field = |name: &str| form.get(name).cloned().unwrap_or_default();

    if path == "/oauth/revoke" {
        let token = field("token");
        if let Some(personal) = state.refresh_tokens.remove(&token) {
            state
                .access_tokens
                .retain(|_, (owner, _)| *owner != personal);
        }
        state.revoked.push(token);
        return StatusCode::OK.into_response();
    }

    let personal = match field("grant_type").as_str() {
        "authorization_code" => {
            let Some(pending) = state.codes.remove(&field("code")) else {
                return error(StatusCode::BAD_REQUEST, json!({ "error": "invalid_grant" }));
            };
            let challenge =
                URL_SAFE_NO_PAD.encode(Sha256::digest(field("code_verifier").as_bytes()));
            if challenge != pending.challenge || field("redirect_uri") != pending.redirect_uri {
                return error(StatusCode::BAD_REQUEST, json!({ "error": "invalid_grant" }));
            }
            pending.personal_user_id
        }
        "refresh_token" => match state.refresh_tokens.remove(&field("refresh_token")) {
            Some(personal) => personal,
            None => return error(StatusCode::BAD_REQUEST, json!({ "error": "invalid_grant" })),
        },
        _ => {
            return error(
                StatusCode::BAD_REQUEST,
                json!({ "error": "unsupported_grant_type" }),
            );
        }
    };
    state.issued += 1;
    let access = format!("access-{}", state.issued);
    let refresh = format!("refresh-{}", state.issued);
    let expires = Utc::now() + chrono::Duration::seconds(state.access_token_ttl_seconds);
    state
        .access_tokens
        .insert(access.clone(), (personal.clone(), expires));
    state
        .refresh_tokens
        .insert(refresh.clone(), personal.clone());
    axum::Json(json!({
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "Bearer",
        "expires_in": state.access_token_ttl_seconds,
        "scope": "read webhook",
        "sub": personal,
    }))
    .into_response()
}
