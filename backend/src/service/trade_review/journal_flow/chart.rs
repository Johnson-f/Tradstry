use crate::service::{market::research, trade_review::types::ExecutionInstrument};
use anyhow::{Result, anyhow, ensure};
use async_graphql::SimpleObject;
use chrono::{DateTime, Utc};
use finance_query::Interval;
use rust_decimal::{Decimal, prelude::ToPrimitive};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalChartBarV2", rename_fields = "camelCase")]
pub struct Bar {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalChartMarkerV2", rename_fields = "camelCase")]
pub struct Marker {
    pub transaction_id: String,
    pub timestamp: Option<i64>,
    pub precision: String,
    pub side: String,
    pub price: String,
    pub quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalTradeChartV2", rename_fields = "camelCase")]
pub struct TradeChart {
    pub availability: String,
    pub message: Option<String>,
    pub series_kind: String,
    pub symbol: String,
    pub provider: Option<String>,
    pub interval: String,
    pub price_basis: String,
    pub currency: Option<String>,
    pub timezone: String,
    pub start: i64,
    pub end: i64,
    pub bars: Vec<Bar>,
    pub markers: Vec<Marker>,
}

#[derive(Clone)]
struct Series {
    provider: Option<String>,
    currency: Option<String>,
    bars: Vec<Bar>,
}
type Cache = HashMap<String, (Instant, Series)>;
fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn series(
    symbol: &str,
    interval: Interval,
    start: i64,
    end: i64,
    verify_contract: bool,
) -> Result<Series> {
    let key = format!("{symbol}:{interval:?}:{start}:{end}:basis-unverified:{verify_contract}");
    if let Some(value) = cache()
        .lock()
        .map_err(|_| anyhow!("Chart cache unavailable"))?
        .get(&key)
        .filter(|(at, _)| at.elapsed() < Duration::from_secs(300))
        .map(|(_, value)| value.clone())
    {
        return Ok(value);
    }
    let ticker = research::configured_ticker(symbol).await?;
    let data = ticker.chart_range(interval, start, end).await?;
    if verify_contract {
        ensure!(
            data.meta
                .symbol
                .trim_start_matches("O:")
                .eq_ignore_ascii_case(symbol.trim_start_matches("O:")),
            "Option contract series could not be verified"
        );
    }
    ensure!(data.candles.len() <= 5000, "range_too_wide");
    let provider = data
        .provider_id
        .and_then(|id| serde_json::to_value(id).ok())
        .and_then(|value| value.as_str().map(str::to_owned));
    let mut bars: Vec<Bar> = data
        .candles
        .into_iter()
        .filter(|bar| {
            [bar.open, bar.high, bar.low, bar.close]
                .iter()
                .all(|value| value.is_finite() && *value > 0.0)
        })
        .map(|bar| Bar {
            timestamp: research::normalize_market_timestamp(bar.timestamp),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
        })
        .filter(|bar| bar.timestamp >= start && bar.timestamp <= end)
        .collect();
    bars.sort_by_key(|bar| bar.timestamp);
    bars.dedup_by_key(|bar| bar.timestamp);
    let value = Series {
        provider,
        currency: data.meta.currency,
        bars,
    };
    let mut entries = cache()
        .lock()
        .map_err(|_| anyhow!("Chart cache unavailable"))?;
    entries.retain(|_, (at, _)| at.elapsed() < Duration::from_secs(300));
    if entries.len() >= 128
        && let Some(oldest) = entries
            .iter()
            .min_by_key(|(_, (at, _))| *at)
            .map(|(key, _)| key.clone())
    {
        entries.remove(&oldest);
    }
    entries.insert(key, (Instant::now(), value.clone()));
    Ok(value)
}

pub async fn for_trade(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
    from: Option<i64>,
    to: Option<i64>,
) -> Result<TradeChart> {
    let row=sqlx::query("SELECT j.symbol,j.currency,j.open_date,j.close_date,e.instrument_json,w.journal_timezone FROM journal_entries j JOIN workspaces w ON w.id=j.workspace_id AND w.user_id=j.user_id LEFT JOIN trade_episodes e ON e.id=j.episode_id AND e.user_id=j.user_id WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3 AND j.deleted_at IS NULL")
        .bind(entry).bind(user).bind(workspace).fetch_optional(pool).await?.ok_or_else(||anyhow!("Journal trade not found"))?;
    let fills=sqlx::query("SELECT b.id,b.trade_date,b.raw_json,b.transaction_type,b.price::text,coalesce(f.quantity,abs(b.units::text::numeric))::text AS quantity FROM journal_entries j JOIN brokerage_transactions b ON b.user_id=j.user_id AND b.workspace_id=j.workspace_id LEFT JOIN trade_episode_fills f ON f.episode_id=j.episode_id AND f.brokerage_transaction_id=b.id WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3 AND (f.id IS NOT NULL OR (j.issue_json->'source_ids') ? b.id) ORDER BY b.trade_date,b.id")
        .bind(entry).bind(user).bind(workspace).fetch_all(pool).await?;
    let markers = fills
        .into_iter()
        .map(|fill| {
            let raw: serde_json::Value =
                serde_json::from_str(&fill.try_get::<String, _>("raw_json")?).unwrap_or_default();
            Ok(Marker {
                transaction_id: fill.try_get("id")?,
                timestamp: fill
                    .try_get::<Option<DateTime<Utc>>, _>("trade_date")?
                    .map(|date| date.timestamp()),
                precision: if raw["trade_date"]
                    .as_str()
                    .is_some_and(|date| DateTime::parse_from_rfc3339(date).is_ok())
                {
                    "timestamp"
                } else {
                    "date"
                }
                .into(),
                side: fill.try_get("transaction_type")?,
                price: fill.try_get("price")?,
                quantity: fill.try_get("quantity")?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let opened = row
        .try_get::<Option<DateTime<Utc>>, _>("open_date")?
        .map(|date| date.timestamp())
        .or_else(|| markers.iter().filter_map(|marker| marker.timestamp).min());
    let closed = row
        .try_get::<Option<DateTime<Utc>>, _>("close_date")?
        .map(|date| date.timestamp())
        .unwrap_or_else(|| Utc::now().timestamp());
    let start = from
        .or(opened.map(|date| date.saturating_sub(3 * 86400)))
        .unwrap_or(0);
    let end = to
        .unwrap_or_else(|| closed.saturating_add(86400))
        .min(Utc::now().timestamp());
    let span = end.saturating_sub(start);
    let (interval, label) = if span <= 7 * 86400 {
        (Interval::FiveMinutes, "5m")
    } else if span <= 60 * 86400 {
        (Interval::ThirtyMinutes, "30m")
    } else if span <= 3650 * 86400 {
        (Interval::OneDay, "1d")
    } else {
        (Interval::OneWeek, "1w")
    };
    let mut result = TradeChart {
        availability: "unavailable".into(),
        message: None,
        series_kind: "instrument".into(),
        symbol: row.try_get("symbol")?,
        provider: None,
        interval: label.into(),
        price_basis: "unverified".into(),
        currency: row.try_get("currency")?,
        timezone: row.try_get("journal_timezone")?,
        start,
        end,
        bars: vec![],
        markers,
    };
    if start <= 0 || start >= end || span > 20 * 366 * 86400 {
        result.message = Some(
            "Choose a valid range of up to 20 years. The execution timeline remains available."
                .into(),
        );
        return Ok(result);
    }
    let instrument: Option<ExecutionInstrument> = row
        .try_get::<Option<serde_json::Value>, _>("instrument_json")?
        .map(serde_json::from_value)
        .transpose()?;
    let (requested, fallback) = match instrument {
        Some(ExecutionInstrument::Option {
            underlying,
            expiration,
            strike,
            option_kind,
            ..
        }) => {
            ensure!(
                (strike * Decimal::from(1000)).fract().is_zero(),
                "Unsupported option strike precision"
            );
            let encoded = (strike * Decimal::from(1000))
                .to_i64()
                .ok_or_else(|| anyhow!("Unsupported option strike"))?;
            let kind = if option_kind.to_ascii_lowercase().starts_with('c') {
                "C"
            } else {
                "P"
            };
            let prefix = if std::env::var("POLYGON_API_KEY").is_ok_and(|key| !key.trim().is_empty())
            {
                "O:"
            } else {
                ""
            };
            (
                format!(
                    "{prefix}{underlying}{}{kind}{encoded:08}",
                    expiration.format("%y%m%d")
                ),
                Some(underlying),
            )
        }
        _ => (result.symbol.clone(), None),
    };
    let outcome = tokio::time::timeout(Duration::from_secs(8), async {
        match series(&requested, interval, start, end, fallback.is_some()).await {
            Ok(value) if !value.bars.is_empty() => Ok((value, None)),
            original => {
                if let Some(underlying) = fallback {
                    series(&underlying, interval, start, end, false)
                        .await
                        .map(|value| (value, Some(underlying)))
                } else {
                    original.map(|value| (value, None))
                }
            }
        }
    })
    .await;
    match outcome {
        Ok(Ok((series, underlying))) => {
            if let Some(symbol) = underlying {
                result.series_kind = "underlying".into();
                result.symbol = symbol;
            }
            result.availability = if series.bars.is_empty() {
                "no_data"
            } else {
                "available"
            }
            .into();
            result.provider = series.provider;
            result.currency = series.currency.or(result.currency);
            result.bars = series.bars;
            result.message=Some(if result.series_kind=="underlying"{"Option-contract prices were unavailable. This is the underlying stock, with execution times only."}else if result.bars.is_empty(){"No price history is available for this period. Your executions and review are still available."}else{"Price adjustments are not verified. Execution markers show time only; actual fill prices are in the timeline."}.into());
        }
        Ok(Err(error)) => {
            let message = error.to_string().to_ascii_lowercase();
            result.availability = if message.contains("429") || message.contains("rate") {
                "rate_limited"
            } else {
                "provider_error"
            }
            .into();
            result.message=Some("Price history is unavailable from the provider right now. You can still review the execution timeline.".into());
        }
        Err(_) => {
            result.availability = "provider_error".into();
            result.message = Some(
                "Price history timed out. Your review and execution timeline remain available."
                    .into(),
            );
        }
    }
    Ok(result)
}
