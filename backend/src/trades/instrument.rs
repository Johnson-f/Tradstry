use std::str::FromStr;

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::model::{AssetClass, Instrument, OptionContract, OptionRight};

pub const STANDARD_MULTIPLIER: u32 = 100;
pub const MINI_MULTIPLIER: u32 = 10;

impl Instrument {
    pub fn stock(symbol: &str) -> Self {
        Self {
            asset_class: AssetClass::Stock,
            symbol: symbol.trim().to_ascii_uppercase(),
            option: None,
            multiplier: Decimal::ONE,
            description: None,
        }
    }

    pub fn crypto(symbol: &str) -> Self {
        Self {
            asset_class: AssetClass::Crypto,
            ..Self::stock(symbol)
        }
    }

    pub fn option(contract: OptionContract, multiplier: Decimal) -> Self {
        Self {
            asset_class: AssetClass::Option,
            symbol: occ_symbol(&contract),
            option: Some(contract),
            multiplier,
            description: None,
        }
    }

    /// Tickers, not provider IDs: manual fills have no IDs, and wash sales
    /// need one identity across accounts. Ticker changes go through aliases.
    pub fn key(&self) -> String {
        match (&self.asset_class, &self.option) {
            (AssetClass::Option, Some(option)) => format!(
                "option:{}:{}:{}:{}:{}",
                option.underlying,
                option.expiry,
                match option.right {
                    OptionRight::Call => "C",
                    OptionRight::Put => "P",
                },
                option.strike.normalize(),
                self.multiplier.normalize(),
            ),
            (AssetClass::Crypto, _) => format!("crypto:{}", self.symbol),
            _ => format!("stock:{}", self.symbol),
        }
    }
}

/// e.g. `IONQ  260508P00037000`: root padded to six, YYMMDD, C/P, strike x1000.
pub fn occ_symbol(contract: &OptionContract) -> String {
    let strike = (contract.strike * Decimal::from(1000)).round();
    format!(
        "{:<6}{}{}{:0>8}",
        contract.underlying,
        contract.expiry.format("%y%m%d"),
        match contract.right {
            OptionRight::Call => 'C',
            OptionRight::Put => 'P',
        },
        strike,
    )
}

/// Parses an OCC option symbol, tolerating missing padding.
pub fn parse_occ(symbol: &str) -> Option<OptionContract> {
    let compact: String = symbol.split_whitespace().collect();
    if compact.len() < 16 {
        return None;
    }
    let (root, tail) = compact.split_at(compact.len() - 15);
    if root.is_empty() || !root.chars().all(|c| c.is_ascii_alphanumeric() || c == '.') {
        return None;
    }
    let expiry = NaiveDate::parse_from_str(&tail[..6], "%y%m%d").ok()?;
    let right = match &tail[6..7] {
        "C" => OptionRight::Call,
        "P" => OptionRight::Put,
        _ => return None,
    };
    let strike = Decimal::from_str(&tail[7..]).ok()? / Decimal::from(1000);
    Some(OptionContract {
        underlying: root.to_ascii_uppercase(),
        expiry,
        right,
        strike: strike.normalize(),
    })
}

/// A JSON number or numeric string as an exact decimal.
pub fn decimal(value: &Value) -> Option<Decimal> {
    match value {
        Value::Number(number) => {
            let text = number.to_string();
            Decimal::from_str(&text)
                .or_else(|_| Decimal::from_scientific(&text))
                .ok()
        }
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() {
                return None;
            }
            Decimal::from_str(text)
                .or_else(|_| Decimal::from_scientific(text))
                .ok()
        }
        _ => None,
    }
}

fn text<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().filter(|text| !text.trim().is_empty())
}

/// The instrument of a SnapTrade activity, if it concerns a security.
pub fn from_activity(raw: &Value) -> Option<Instrument> {
    if let Some(option) = raw.get("option_symbol").filter(|v| v.is_object()) {
        let ticker = text(option, &["ticker"]);
        let parsed = ticker.and_then(parse_occ);
        let underlying = text(option, &["underlying_symbol", "symbol"])
            .map(|s| s.trim().to_ascii_uppercase())
            .or_else(|| parsed.as_ref().map(|p| p.underlying.clone()))?;
        let expiry = text(option, &["expiration_date"])
            .and_then(|d| NaiveDate::parse_from_str(&d[..d.len().min(10)], "%Y-%m-%d").ok())
            .or_else(|| parsed.as_ref().map(|p| p.expiry))?;
        let right = match text(option, &["option_type"]).map(str::to_ascii_uppercase) {
            Some(kind) if kind == "CALL" => OptionRight::Call,
            Some(kind) if kind == "PUT" => OptionRight::Put,
            _ => parsed.as_ref()?.right,
        };
        let strike = option
            .get("strike_price")
            .and_then(decimal)
            .or_else(|| parsed.as_ref().map(|p| p.strike))?;
        let mini = option
            .get("is_mini_option")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let multiplier = Decimal::from(if mini {
            MINI_MULTIPLIER
        } else {
            STANDARD_MULTIPLIER
        });
        let mut instrument = Instrument::option(
            OptionContract {
                underlying,
                expiry,
                right,
                strike: strike.normalize(),
            },
            multiplier,
        );
        instrument.description =
            text(option, &["underlying_symbol", "description"]).map(str::to_owned);
        return Some(instrument);
    }
    let symbol = raw.get("symbol").filter(|v| v.is_object())?;
    let ticker = text(symbol, &["symbol"]).or_else(|| text(symbol, &["raw_symbol"]))?;
    let is_crypto =
        text(symbol, &["type", "code"]).is_some_and(|code| code.eq_ignore_ascii_case("crypto"));
    let mut instrument = if is_crypto {
        Instrument::crypto(ticker)
    } else {
        Instrument::stock(ticker)
    };
    instrument.description = text(symbol, &["description"]).map(str::to_owned);
    Some(instrument)
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Alias {
    pub from_key: String,
    pub to_key: String,
    pub effective_at: DateTime<Utc>,
}

/// Follows confirmed aliases in effect at `at`, guarding against cycles.
pub fn resolve(key: &str, at: DateTime<Utc>, aliases: &[Alias]) -> String {
    let mut current = key.to_owned();
    for _ in 0..8 {
        match aliases
            .iter()
            .find(|alias| alias.from_key == current && at >= alias.effective_at)
        {
            Some(alias) => current = alias.to_key.clone(),
            None => break,
        }
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use serde_json::json;

    #[test]
    fn occ_symbols_round_trip() {
        let contract = parse_occ("IONQ  260508P00037000").unwrap();
        assert_eq!(contract.underlying, "IONQ");
        assert_eq!(
            contract.expiry,
            NaiveDate::from_ymd_opt(2026, 5, 8).unwrap()
        );
        assert_eq!(contract.right, OptionRight::Put);
        assert_eq!(contract.strike, dec!(37));
        assert_eq!(occ_symbol(&contract), "IONQ  260508P00037000");
        assert_eq!(parse_occ("SPY260116C00512500").unwrap().strike, dec!(512.5));
        assert!(parse_occ("AAPL").is_none());
        assert!(parse_occ("IONQ  260508X00037000").is_none());
    }

    #[test]
    fn keys_identify_instruments_not_provider_ids() {
        assert_eq!(Instrument::stock(" aapl ").key(), "stock:AAPL");
        let put = Instrument::option(parse_occ("IONQ  260508P00037000").unwrap(), dec!(100));
        assert_eq!(put.key(), "option:IONQ:2026-05-08:P:37:100");
        let mini = Instrument::option(parse_occ("IONQ  260508P00037000").unwrap(), dec!(10));
        assert_ne!(mini.key(), put.key());
    }

    #[test]
    fn decimals_are_exact() {
        assert_eq!(decimal(&json!(11.91029)), Some(dec!(11.91029)));
        assert_eq!(decimal(&json!("6.31")), Some(dec!(6.31)));
        assert_eq!(decimal(&json!(1e-7)), Some(dec!(0.0000001)));
        assert_eq!(decimal(&json!("")), None);
        assert_eq!(decimal(&json!(null)), None);
    }

    #[test]
    fn reads_snaptrade_instruments() {
        let stock = from_activity(&json!({
            "symbol": {"symbol": "AAPL", "description": "Apple Inc.", "type": {"code": "cs"}}
        }))
        .unwrap();
        assert_eq!(stock.key(), "stock:AAPL");
        let option = from_activity(&json!({
            "symbol": null,
            "option_symbol": {
                "ticker": "IONQ  260508P00037000", "option_type": "PUT", "strike_price": 37.0,
                "expiration_date": "2026-05-08", "is_mini_option": false,
                "underlying_symbol": {"symbol": "IONQ", "description": "IonQ, Inc."}
            }
        }))
        .unwrap();
        assert_eq!(option.key(), "option:IONQ:2026-05-08:P:37:100");
        assert_eq!(option.multiplier, dec!(100));
        let mini = from_activity(&json!({
            "option_symbol": {"ticker": "SPY   260116C00512500", "is_mini_option": true}
        }))
        .unwrap();
        assert_eq!(mini.key(), "option:SPY:2026-01-16:C:512.5:10");
        assert!(from_activity(&json!({"symbol": null})).is_none());
    }

    #[test]
    fn aliases_apply_from_their_effective_time() {
        let at = |s: &str| DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc);
        let aliases = [Alias {
            from_key: "stock:IRBTQ".into(),
            to_key: "stock:IRBT".into(),
            effective_at: at("2025-12-22T00:00:00Z"),
        }];
        assert_eq!(
            resolve("stock:IRBTQ", at("2025-12-22T15:33:20Z"), &aliases),
            "stock:IRBT"
        );
        assert_eq!(
            resolve("stock:IRBTQ", at("2025-12-21T15:00:00Z"), &aliases),
            "stock:IRBTQ"
        );
        assert_eq!(
            resolve("stock:AAPL", at("2026-01-01T00:00:00Z"), &aliases),
            "stock:AAPL"
        );
        let cycle = [
            Alias {
                from_key: "stock:A".into(),
                to_key: "stock:B".into(),
                effective_at: at("2020-01-01T00:00:00Z"),
            },
            Alias {
                from_key: "stock:B".into(),
                to_key: "stock:A".into(),
                effective_at: at("2020-01-01T00:00:00Z"),
            },
        ];
        resolve("stock:A", at("2021-01-01T00:00:00Z"), &cycle);
    }
}
