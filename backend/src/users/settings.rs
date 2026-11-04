//! A user's preferences: how results are measured (default risk, breakeven
//! band) and shown (time zone, week start, default period).

use async_graphql::Enum;
use rust_decimal::Decimal;
use sqlx::PgPool;
use uuid::Uuid;

/// Where trade times are shown. Statistics always use New York trading days.
#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[graphql(name = "DisplayTimeZone")]
pub enum TimeZone {
    /// New York, where US markets trade.
    Market,
    /// The browser's own time zone.
    #[default]
    Local,
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum WeekStart {
    #[default]
    Sunday,
    Monday,
}

pub const PERIODS: [&str; 8] = ["today", "1w", "1m", "3m", "6m", "ytd", "1y", "all"];

#[derive(Clone, Debug, PartialEq)]
pub struct Settings {
    pub default_risk: Option<Decimal>,
    pub breakeven_band: Decimal,
    pub time_zone: TimeZone,
    pub week_start: WeekStart,
    pub default_period: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_risk: None,
            breakeven_band: Decimal::ZERO,
            time_zone: TimeZone::default(),
            week_start: WeekStart::default(),
            default_period: "1m".into(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("{1}")]
    Invalid(&'static str, &'static str),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<sqlx::Error> for SettingsError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.into())
    }
}

type Row = (Option<Decimal>, Decimal, String, String, String);

pub async fn get(pool: &PgPool, user_id: Uuid) -> anyhow::Result<Settings> {
    let row: Option<Row> = sqlx::query_as(
        "SELECT default_risk, breakeven_band, time_zone, week_start, default_period
         FROM user_settings WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map_or_else(
        Settings::default,
        |(default_risk, breakeven_band, zone, week, period)| Settings {
            default_risk,
            breakeven_band,
            time_zone: if zone == "market" {
                TimeZone::Market
            } else {
                TimeZone::Local
            },
            week_start: if week == "monday" {
                WeekStart::Monday
            } else {
                WeekStart::Sunday
            },
            default_period: period,
        },
    ))
}

fn validate(settings: &Settings) -> Result<(), SettingsError> {
    if settings
        .default_risk
        .is_some_and(|risk| risk <= Decimal::ZERO)
    {
        return Err(SettingsError::Invalid(
            "INVALID_RISK",
            "Default risk must be above zero, or left empty",
        ));
    }
    if settings.breakeven_band < Decimal::ZERO {
        return Err(SettingsError::Invalid(
            "INVALID_BREAKEVEN",
            "The breakeven band cannot be negative",
        ));
    }
    if !PERIODS.contains(&settings.default_period.as_str()) {
        return Err(SettingsError::Invalid(
            "INVALID_PERIOD",
            "That period is not one Tradstry offers",
        ));
    }
    Ok(())
}

pub async fn save(
    pool: &PgPool,
    user_id: Uuid,
    settings: &Settings,
) -> Result<Settings, SettingsError> {
    validate(settings)?;
    sqlx::query(
        "INSERT INTO user_settings (user_id, default_risk, breakeven_band, time_zone, week_start, default_period)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET default_risk = $2, breakeven_band = $3, time_zone = $4,
             week_start = $5, default_period = $6, updated_at = now()",
    )
    .bind(user_id)
    .bind(settings.default_risk)
    .bind(settings.breakeven_band)
    .bind(match settings.time_zone {
        TimeZone::Market => "market",
        TimeZone::Local => "local",
    })
    .bind(match settings.week_start {
        WeekStart::Sunday => "sunday",
        WeekStart::Monday => "monday",
    })
    .bind(&settings.default_period)
    .execute(pool)
    .await?;
    Ok(get(pool, user_id).await?)
}
