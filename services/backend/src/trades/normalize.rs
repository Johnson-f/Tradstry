use std::str::FromStr;

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde_json::Value;
use uuid::Uuid;

use super::{
    instrument::{self, Alias, decimal},
    model::{Event, EventKind, Instrument, Intent, Issue, Severity, Side},
};

#[derive(Clone, Debug)]
pub struct ActivityRow {
    pub activity_id: String,
    pub workspace_id: Uuid,
    pub raw: Value,
}

#[derive(Clone, Debug)]
pub struct ManualFill {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub instrument: Instrument,
    pub side: Side,
    pub quantity: Decimal,
    pub price: Decimal,
    pub fee: Decimal,
    pub intent: Option<Intent>,
    pub executed_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct OpeningPosition {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub instrument: Instrument,
    /// Negative for a short.
    pub quantity: Decimal,
    pub cost_per_unit: Decimal,
    pub acquired_at: DateTime<Utc>,
    /// Fills on this instrument before this moment are already in the position.
    pub as_of: DateTime<Utc>,
}

pub fn activity_key(id: &str) -> String {
    format!("snaptrade:{id}")
}

pub fn manual_key(id: Uuid) -> String {
    format!("manual:{id}")
}

pub fn opening_key(id: Uuid) -> String {
    format!("opening:{id}")
}

/// Activity types that move cash only; they never touch a position.
const CASH_ONLY: &[&str] = &[
    "CONTRIBUTION",
    "WITHDRAWAL",
    "FEE",
    "INTEREST",
    "TAX",
    "DEPOSIT",
];

fn timestamp(raw: &Value, key: &str) -> Option<DateTime<Utc>> {
    let text = raw.get(key)?.as_str()?;
    DateTime::parse_from_rfc3339(text)
        .map(|at| at.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            NaiveDate::parse_from_str(&text[..text.len().min(10)], "%Y-%m-%d")
                .ok()
                .and_then(|day| day.and_hms_opt(0, 0, 0))
                .map(|at| at.and_utc())
        })
}

/// "2 for 1", "2-for-1", "1:10" → new shares per old share.
pub fn split_ratio(description: &str) -> Option<Decimal> {
    let cleaned = description
        .to_ascii_lowercase()
        .replace('-', " ")
        .replace(':', " for ");
    let words: Vec<&str> = cleaned.split_whitespace().collect();
    words.windows(3).find_map(|window| {
        let new = Decimal::from_str(window[0]).ok()?;
        let old = Decimal::from_str(window[2]).ok()?;
        (window[1] == "for" && new > Decimal::ZERO && old > Decimal::ZERO).then(|| new / old)
    })
}

fn intent(raw: &Value) -> Option<Intent> {
    match raw.get("option_type").and_then(Value::as_str)? {
        "BUY_TO_OPEN" | "SELL_TO_OPEN" => Some(Intent::Open),
        "BUY_TO_CLOSE" | "SELL_TO_CLOSE" => Some(Intent::Close),
        _ => None,
    }
}

fn tolerance(expected: Decimal) -> Decimal {
    (expected * Decimal::new(1, 3)).max(Decimal::new(2, 2))
}

/// One SnapTrade activity as an engine event. Cash-only rows give `None`
/// quietly; anything else that cannot be used gives an issue instead.
pub fn activity(row: &ActivityRow, aliases: &[Alias]) -> (Option<Event>, Vec<Issue>) {
    let raw = &row.raw;
    let key = activity_key(&row.activity_id);
    let kind = raw
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    let issue = |code: &str, severity: Severity, message: String| {
        Issue::new(code, severity, message)
            .workspace(row.workspace_id)
            .fill(&key)
    };
    if CASH_ONLY.contains(&kind.as_str()) {
        return (None, Vec::new());
    }
    let Some(instrument) = instrument::from_activity(raw) else {
        return (None, Vec::new());
    };
    let Some(at) = timestamp(raw, "trade_date").or_else(|| timestamp(raw, "settlement_date"))
    else {
        return (
            None,
            vec![issue(
                "missing_date",
                Severity::Error,
                format!("{kind} on {} has no date", instrument.symbol),
            )],
        );
    };
    let units = raw.get("units").and_then(decimal);
    let price = raw.get("price").and_then(decimal);
    let amount = raw.get("amount").and_then(decimal);
    let fee = raw.get("fee").and_then(decimal).unwrap_or_default().abs();
    let quantity = units.map(|units| units.abs()).filter(|q| !q.is_zero());
    let mut issues = Vec::new();

    let event_kind = match kind.as_str() {
        "BUY" | "SELL" | "REI" => {
            let side = if kind == "SELL" {
                Side::Sell
            } else {
                Side::Buy
            };
            let Some(quantity) = quantity else {
                return (
                    None,
                    vec![issue(
                        "zero_quantity",
                        Severity::Warning,
                        format!("{kind} {} has no quantity", instrument.symbol),
                    )],
                );
            };
            let Some(price) = price else {
                return (
                    None,
                    vec![issue(
                        "missing_price",
                        Severity::Error,
                        format!("{kind} {} has no price", instrument.symbol),
                    )],
                );
            };
            if price.is_zero() {
                issues.push(issue(
                    "zero_price_fill",
                    Severity::Info,
                    format!("{kind} {} at a price of 0", instrument.symbol),
                ));
            }
            if let Some(amount) = amount {
                let expected = quantity * price * instrument.multiplier;
                let close = |target: Decimal| (amount.abs() - target).abs() <= tolerance(expected);
                if !(close(expected) || close(expected + fee) || close(expected - fee)) {
                    issues.push(issue(
                        "amount_mismatch",
                        Severity::Info,
                        format!(
                            "{kind} {} reports {amount} but quantity × price is {expected}",
                            instrument.symbol
                        ),
                    ));
                }
            }
            EventKind::Fill {
                side,
                quantity,
                price,
                fee,
                intent: intent(raw),
            }
        }
        "SPLIT" => EventKind::Split {
            ratio: raw
                .get("description")
                .and_then(Value::as_str)
                .and_then(split_ratio),
            delta: units.filter(|u| !u.is_zero()),
        },
        "STOCK_DIVIDEND" => match quantity {
            Some(quantity) => EventKind::StockDividend { quantity },
            None => return (None, Vec::new()),
        },
        "DIVIDEND" | "SUBSTITUTE_DIVIDEND" => match amount.filter(|a| !a.is_zero()) {
            Some(amount) => EventKind::Dividend { amount },
            None => return (None, Vec::new()),
        },
        "OPTIONEXPIRATION" => EventKind::Expire { quantity },
        "OPTIONASSIGNMENT" => EventKind::Assign { quantity },
        "OPTIONEXERCISE" => EventKind::Exercise { quantity },
        "TRANSFER" | "EXTERNAL_ASSET_TRANSFER_IN" | "EXTERNAL_ASSET_TRANSFER_OUT" => {
            let Some(quantity) = quantity else {
                return (None, Vec::new());
            };
            let incoming = match kind.as_str() {
                "EXTERNAL_ASSET_TRANSFER_IN" => true,
                "EXTERNAL_ASSET_TRANSFER_OUT" => false,
                _ => units.is_some_and(|u| u > Decimal::ZERO),
            };
            let per_unit = price.filter(|p| !p.is_zero());
            if incoming {
                EventKind::TransferIn {
                    quantity,
                    cost_per_unit: per_unit,
                }
            } else {
                EventKind::TransferOut {
                    quantity,
                    value_per_unit: per_unit,
                }
            }
        }
        other => {
            return (
                None,
                vec![issue(
                    "unknown_activity_type",
                    Severity::Warning,
                    format!(
                        "Tradstry does not know how to apply a {other} activity on {}",
                        instrument.symbol
                    ),
                )],
            );
        }
    };
    let instrument_key = instrument::resolve(&instrument.key(), at, aliases);
    (
        Some(Event {
            key,
            workspace_id: row.workspace_id,
            instrument,
            instrument_key,
            at,
            kind: event_kind,
            derived: false,
        }),
        issues,
    )
}

pub fn manual(fill: &ManualFill, aliases: &[Alias]) -> Event {
    Event {
        key: manual_key(fill.id),
        workspace_id: fill.workspace_id,
        instrument_key: instrument::resolve(&fill.instrument.key(), fill.executed_at, aliases),
        instrument: fill.instrument.clone(),
        at: fill.executed_at,
        kind: EventKind::Fill {
            side: fill.side,
            quantity: fill.quantity,
            price: fill.price,
            fee: fill.fee,
            intent: fill.intent,
        },
        derived: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use serde_json::json;

    fn row(raw: Value) -> ActivityRow {
        ActivityRow {
            activity_id: "a1".into(),
            workspace_id: Uuid::nil(),
            raw,
        }
    }

    fn buy() -> Value {
        json!({
            "id": "a1", "type": "BUY", "units": 11.91029, "price": 10.0, "amount": -119.1029, "fee": 0.0,
            "trade_date": "2026-04-17T16:09:06.652Z", "symbol": {"symbol": "AEHR"}, "option_symbol": null
        })
    }

    #[test]
    fn fills_keep_exact_quantities() {
        let (event, issues) = activity(&row(buy()), &[]);
        let event = event.unwrap();
        assert!(issues.is_empty(), "{issues:?}");
        assert_eq!(event.key, "snaptrade:a1");
        assert_eq!(event.instrument_key, "stock:AEHR");
        match event.kind {
            EventKind::Fill {
                side,
                quantity,
                price,
                ..
            } => {
                assert_eq!(
                    (side, quantity, price),
                    (Side::Buy, dec!(11.91029), dec!(10))
                );
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn option_fills_carry_intent_and_multiplier() {
        let (event, issues) = activity(
            &row(json!({
                "type": "SELL", "units": -1.0, "price": 0.89, "amount": 89.0, "fee": 0.0,
                "option_type": "SELL_TO_CLOSE", "trade_date": "2026-04-30T14:00:04.258Z", "symbol": null,
                "option_symbol": {"ticker": "IONQ  260508P00037000", "option_type": "PUT", "strike_price": 37.0,
                    "expiration_date": "2026-05-08", "is_mini_option": false, "underlying_symbol": {"symbol": "IONQ"}}
            })),
            &[],
        );
        assert!(issues.is_empty(), "{issues:?}");
        match event.unwrap().kind {
            EventKind::Fill { side, intent, .. } => {
                assert_eq!((side, intent), (Side::Sell, Some(Intent::Close)))
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn every_activity_type_is_mapped_or_reported() {
        let event = |kind: &str, extra: Value| {
            let mut raw = json!({"type": kind, "units": 10, "price": 5, "amount": -50,
                "trade_date": "2026-01-02", "symbol": {"symbol": "X"}, "description": ""});
            for (k, v) in extra.as_object().unwrap() {
                raw[k] = v.clone();
            }
            activity(&row(raw), &[])
        };
        assert!(matches!(
            event("REI", json!({})).0.unwrap().kind,
            EventKind::Fill {
                side: Side::Buy,
                ..
            }
        ));
        assert!(matches!(
            event("SPLIT", json!({"description": "2-for-1 split", "units": 10})).0.unwrap().kind,
            EventKind::Split { ratio: Some(r), .. } if r == dec!(2)
        ));
        assert!(matches!(
            event("STOCK_DIVIDEND", json!({})).0.unwrap().kind,
            EventKind::StockDividend { .. }
        ));
        assert!(matches!(
            event("DIVIDEND", json!({"amount": 3.2})).0.unwrap().kind,
            EventKind::Dividend { .. }
        ));
        assert!(matches!(
            event("OPTIONEXPIRATION", json!({})).0.unwrap().kind,
            EventKind::Expire { .. }
        ));
        assert!(matches!(
            event("OPTIONASSIGNMENT", json!({})).0.unwrap().kind,
            EventKind::Assign { .. }
        ));
        assert!(matches!(
            event("OPTIONEXERCISE", json!({})).0.unwrap().kind,
            EventKind::Exercise { .. }
        ));
        assert!(matches!(
            event("EXTERNAL_ASSET_TRANSFER_IN", json!({}))
                .0
                .unwrap()
                .kind,
            EventKind::TransferIn { .. }
        ));
        assert!(matches!(
            event("TRANSFER", json!({"units": -10})).0.unwrap().kind,
            EventKind::TransferOut { .. }
        ));
        assert!(
            event("INTEREST", json!({})).0.is_none() && event("INTEREST", json!({})).1.is_empty()
        );
        let (none, issues) = event("MYSTERY", json!({}));
        assert!(none.is_none());
        assert_eq!(issues[0].code, "unknown_activity_type");
    }

    #[test]
    fn unusable_rows_become_issues() {
        let mut raw = buy();
        raw["units"] = json!(0);
        assert_eq!(activity(&row(raw), &[]).1[0].code, "zero_quantity");
        let mut raw = buy();
        raw["trade_date"] = json!(null);
        assert_eq!(activity(&row(raw), &[]).1[0].code, "missing_date");
        let mut raw = buy();
        raw["amount"] = json!(-500);
        assert_eq!(activity(&row(raw), &[]).1[0].code, "amount_mismatch");
        let mut raw = buy();
        raw["fee"] = json!(1.0);
        raw["amount"] = json!(-120.1029);
        assert!(
            activity(&row(raw), &[]).1.is_empty(),
            "a fee inside the amount is fine"
        );
    }

    #[test]
    fn split_ratios_parse() {
        assert_eq!(split_ratio("2 for 1 stock split"), Some(dec!(2)));
        assert_eq!(split_ratio("1-for-10 reverse split"), Some(dec!(0.1)));
        assert_eq!(split_ratio("Split 3:2"), Some(dec!(1.5)));
        assert_eq!(split_ratio("Stock split"), None);
    }
}
