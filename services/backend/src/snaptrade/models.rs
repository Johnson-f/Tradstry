//! The parts of SnapTrade responses Tradstry reads. Every field is optional and
//! unknown fields are ignored, because SnapTrade adds fields and new types (for
//! example new account kinds) over time; records worth keeping retain their raw
//! JSON as well.

use chrono::{DateTime, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Deserialize)]
pub struct Registration {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "userSecret")]
    pub user_secret: String,
}

impl std::fmt::Debug for Registration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Registration")
            .field("user_id", &self.user_id)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct PortalLink {
    #[serde(rename = "redirectURI")]
    pub redirect_uri: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct Brokerage {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub display_name: Option<String>,
}

/// An institution available to this SnapTrade client, including current health.
#[derive(Clone, Debug, Deserialize)]
pub struct BrokerageProvider {
    pub slug: String,
    pub name: String,
    pub display_name: Option<String>,
    pub aws_s3_logo_url: Option<String>,
    pub aws_s3_square_logo_url: Option<String>,
    pub enabled: bool,
    pub maintenance_mode: bool,
}

#[derive(Deserialize)]
pub(crate) struct PartnerInfo {
    pub allowed_brokerages: Vec<BrokerageProvider>,
}

/// A brokerage authorization: one login at one institution.
#[derive(Clone, Debug, Deserialize)]
pub struct Connection {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub brokerage: Option<Brokerage>,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub disabled_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub data_freshness_mode: Option<Value>,
}

impl Connection {
    pub fn institution_name(&self) -> String {
        self.brokerage
            .as_ref()
            .and_then(|b| b.display_name.clone().or_else(|| b.name.clone()))
            .or_else(|| self.name.clone())
            .unwrap_or_else(|| "Brokerage".to_owned())
    }

    pub fn institution_slug(&self) -> Option<String> {
        self.brokerage.as_ref().and_then(|b| b.slug.clone())
    }

    pub fn freshness_mode(&self) -> Option<String> {
        match &self.data_freshness_mode {
            Some(Value::String(mode)) => Some(mode.clone()),
            Some(Value::Object(map)) => map
                .get("mode")
                .or_else(|| map.get("type"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ConnectionAccounts {
    pub results: Vec<ConnectionAccount>,
}

/// An account under a connection. `kind` is `investment`, `deposit`,
/// `line_of_credit`, `annuity`, or a kind added later.
#[derive(Clone, Debug, Deserialize)]
pub struct ConnectionAccount {
    pub id: String,
    pub kind: String,
    #[serde(default)]
    pub connection_id: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub masked_account_number: Option<String>,
    #[serde(default)]
    pub raw_type: Option<String>,
    #[serde(default)]
    pub is_paper: Option<bool>,
    #[serde(default)]
    pub cash_or_margin: Option<String>,
}

impl ConnectionAccount {
    pub fn is_investment(&self) -> bool {
        self.kind == "investment"
    }

    pub fn name(&self) -> String {
        self.display_name
            .clone()
            .filter(|name| !name.trim().is_empty())
            .or_else(|| self.masked_account_number.clone())
            .unwrap_or_else(|| "Account".to_owned())
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct Pagination {
    pub total: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct ActivityPageBody {
    #[serde(default)]
    pub data: Vec<Value>,
    #[serde(default)]
    pub pagination: Option<Pagination>,
}

#[derive(Clone, Debug)]
pub struct ActivityPage {
    pub activities: Vec<Activity>,
    pub total: Option<u64>,
}

#[derive(Clone, Copy, Debug)]
pub struct ActivityQuery {
    /// `None` asks for everything SnapTrade has.
    pub start: Option<NaiveDate>,
    pub end: NaiveDate,
    pub offset: u64,
    pub limit: u64,
}

/// One transaction, kept raw with the fields Tradstry indexes read out of it.
#[derive(Clone, Debug, PartialEq)]
pub struct Activity {
    pub id: String,
    pub kind: String,
    pub trade_date: Option<DateTime<Utc>>,
    pub settlement_date: Option<DateTime<Utc>>,
    pub units: Option<f64>,
    pub price: Option<f64>,
    pub amount: Option<f64>,
    pub currency: Option<String>,
    pub fee: Option<f64>,
    pub instrument_id: Option<String>,
    pub symbol: Option<String>,
    pub figi_code: Option<String>,
    pub option_symbol: Option<String>,
    pub description: Option<String>,
    pub raw: Value,
}

fn text(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(key)?;
    }
    current
        .as_str()
        .map(str::to_owned)
        .filter(|s| !s.is_empty())
}

fn number(value: &Value, key: &str) -> Option<f64> {
    match value.get(key)? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn timestamp(value: &Value, key: &str) -> Option<DateTime<Utc>> {
    let raw = value.get(key)?.as_str()?;
    DateTime::parse_from_rfc3339(raw)
        .map(|at| at.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            NaiveDate::parse_from_str(raw, "%Y-%m-%d")
                .ok()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
                .map(|at| at.and_utc())
        })
}

impl Activity {
    /// `None` when SnapTrade sent an activity without an ID, which Tradstry
    /// cannot store idempotently.
    pub fn from_raw(raw: Value) -> Option<Self> {
        let id = text(&raw, &["id"])?;
        Some(Self {
            kind: text(&raw, &["type"]).unwrap_or_else(|| "UNKNOWN".to_owned()),
            trade_date: timestamp(&raw, "trade_date"),
            settlement_date: timestamp(&raw, "settlement_date"),
            units: number(&raw, "units"),
            price: number(&raw, "price"),
            amount: number(&raw, "amount"),
            currency: text(&raw, &["currency", "code"]),
            fee: number(&raw, "fee"),
            instrument_id: text(&raw, &["symbol", "id"]),
            symbol: text(&raw, &["symbol", "symbol"]),
            figi_code: text(&raw, &["symbol", "figi_code"]),
            option_symbol: text(&raw, &["option_symbol", "ticker"]),
            description: text(&raw, &["description"]),
            id,
            raw,
        })
    }
}

/// One order, kept raw with the fields Tradstry indexes read out of it.
#[derive(Clone, Debug, PartialEq)]
pub struct Order {
    pub brokerage_order_id: String,
    pub status: Option<String>,
    pub action: Option<String>,
    pub symbol: Option<String>,
    pub total_units: Option<f64>,
    pub filled_units: Option<f64>,
    pub execution_price: Option<f64>,
    pub time_placed: Option<DateTime<Utc>>,
    pub time_executed: Option<DateTime<Utc>>,
    pub raw: Value,
}

impl Order {
    pub fn from_raw(raw: Value) -> Option<Self> {
        let brokerage_order_id = text(&raw, &["brokerage_order_id"])?;
        Some(Self {
            status: text(&raw, &["status"]),
            action: text(&raw, &["action"]),
            symbol: text(&raw, &["option_symbol", "ticker"])
                .or_else(|| text(&raw, &["universal_symbol", "symbol"]))
                .or_else(|| text(&raw, &["symbol"])),
            total_units: number(&raw, "total_quantity"),
            filled_units: number(&raw, "filled_quantity"),
            execution_price: number(&raw, "execution_price"),
            time_placed: timestamp(&raw, "time_placed"),
            time_executed: timestamp(&raw, "time_executed"),
            brokerage_order_id,
            raw,
        })
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub scopes: Vec<String>,
    /// The SnapTrade Personal user the tokens act for.
    pub personal_user_id: String,
}

impl std::fmt::Debug for OAuthTokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuthTokens")
            .field("expires_in", &self.expires_in)
            .field("scopes", &self.scopes)
            .field("personal_user_id", &self.personal_user_id)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Deserialize)]
pub(crate) struct OAuthTokenBody {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    #[serde(default)]
    pub scope: Value,
    #[serde(default)]
    pub sub: Value,
}

impl OAuthTokenBody {
    pub fn into_tokens(self) -> Option<OAuthTokens> {
        let scopes = match self.scope {
            Value::String(scope) => scope.split_whitespace().map(str::to_owned).collect(),
            Value::Array(items) => items
                .into_iter()
                .filter_map(|item| item.as_str().map(str::to_owned))
                .collect(),
            _ => Vec::new(),
        };
        // `sub` has been both a bare string and an object across versions.
        let personal_user_id = match &self.sub {
            Value::String(sub) => sub.clone(),
            Value::Object(map) => ["snaptrade_user_id", "snaptradeUserId", "user_id", "userId"]
                .iter()
                .find_map(|key| map.get(*key).and_then(Value::as_str))
                .unwrap_or_default()
                .to_owned(),
            _ => String::new(),
        };
        Some(OAuthTokens {
            access_token: self.access_token.filter(|t| !t.is_empty())?,
            refresh_token: self.refresh_token.filter(|t| !t.is_empty())?,
            expires_in: self.expires_in.filter(|e| *e > 0)?,
            scopes,
            personal_user_id,
        })
    }
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct OAuthMetadata {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub revocation_endpoint: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn activities_keep_raw_data_and_read_indexed_fields() {
        let raw = json!({
            "id": "act-1", "type": "SPINOFF", "units": "2.5", "price": 10, "amount": -25.0,
            "currency": {"code": "USD"}, "trade_date": "2026-01-02T00:00:00Z",
            "symbol": {"id": "sym-1", "symbol": "AAPL", "figi_code": "BBG000B9XRY4"},
            "option_symbol": null, "unknown_field": {"kept": true},
        });
        let activity = Activity::from_raw(raw.clone()).unwrap();
        assert_eq!(activity.kind, "SPINOFF");
        assert_eq!(activity.units, Some(2.5));
        assert_eq!(activity.symbol.as_deref(), Some("AAPL"));
        assert_eq!(activity.figi_code.as_deref(), Some("BBG000B9XRY4"));
        assert_eq!(activity.raw, raw);
        assert!(Activity::from_raw(json!({"type": "BUY"})).is_none());
    }

    #[test]
    fn token_bodies_accept_string_or_object_subjects_and_scopes() {
        let body: OAuthTokenBody = serde_json::from_value(json!({
            "access_token": "a", "refresh_token": "r", "expires_in": 36000,
            "scope": "read webhook", "sub": "personal-1",
        }))
        .unwrap();
        let tokens = body.into_tokens().unwrap();
        assert_eq!(tokens.scopes, ["read", "webhook"]);
        assert_eq!(tokens.personal_user_id, "personal-1");

        let body: OAuthTokenBody = serde_json::from_value(json!({
            "access_token": "a", "refresh_token": "r", "expires_in": 1,
            "scope": ["read"], "sub": {"snaptrade_user_id": "personal-2"},
        }))
        .unwrap();
        assert_eq!(body.into_tokens().unwrap().personal_user_id, "personal-2");

        let missing: OAuthTokenBody = serde_json::from_value(json!({"access_token": "a"})).unwrap();
        assert!(missing.into_tokens().is_none());
    }

    #[test]
    fn unknown_account_kinds_still_parse() {
        let account: ConnectionAccount =
            serde_json::from_value(json!({"id": "a", "kind": "crypto_wallet"})).unwrap();
        assert!(!account.is_investment());
        assert_eq!(account.name(), "Account");
    }
}
