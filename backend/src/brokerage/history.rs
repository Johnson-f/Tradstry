//! How far back an account's transaction history is imported. The start date
//! is fixed when the account is chosen and only ever moves earlier.

use anyhow::{Context, Result, ensure};
use chrono::{Months, NaiveDate, Utc};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportMode {
    OneYear,
    TwoYears,
    All,
    Custom,
}

impl ImportMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneYear => "one_year",
            Self::TwoYears => "two_years",
            Self::All => "all",
            Self::Custom => "custom",
        }
    }

    pub fn parse(value: &str) -> Result<Self> {
        Ok(match value {
            "one_year" => Self::OneYear,
            "two_years" => Self::TwoYears,
            "all" => Self::All,
            "custom" => Self::Custom,
            _ => anyhow::bail!("unsupported import mode {value:?}"),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ImportPolicy {
    pub mode: ImportMode,
    /// `None` means all history SnapTrade has.
    pub start_date: Option<NaiveDate>,
}

/// Brokerage dates are US trading days, so "today" is New York's.
pub fn eastern_today() -> NaiveDate {
    Utc::now()
        .with_timezone(&chrono_tz::America::New_York)
        .date_naive()
}

pub fn resolve(
    mode: ImportMode,
    custom_start_date: Option<NaiveDate>,
    today: NaiveDate,
) -> Result<ImportPolicy> {
    let start_date = match mode {
        ImportMode::All => {
            ensure!(
                custom_start_date.is_none(),
                "All history does not take a start date"
            );
            None
        }
        ImportMode::OneYear | ImportMode::TwoYears => {
            ensure!(
                custom_start_date.is_none(),
                "Only a custom range takes a start date"
            );
            let months = if mode == ImportMode::OneYear { 12 } else { 24 };
            Some(
                today
                    .checked_sub_months(Months::new(months))
                    .context("resolve the import start date")?,
            )
        }
        ImportMode::Custom => {
            let date = custom_start_date.context("Choose a start date for a custom range")?;
            ensure!(date <= today, "The start date cannot be in the future");
            Some(date)
        }
    };
    Ok(ImportPolicy { mode, start_date })
}

/// Whether `requested` imports at least as much history as `current`: the
/// boundary may move earlier, never later.
pub fn widens(current: Option<NaiveDate>, requested: Option<NaiveDate>) -> bool {
    match (current, requested) {
        (None, _) => requested.is_none(),
        (Some(_), None) => true,
        (Some(current), Some(requested)) => requested <= current,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn modes_resolve_relative_to_today() {
        let today = day("2026-10-27");
        assert_eq!(
            resolve(ImportMode::OneYear, None, today)
                .unwrap()
                .start_date,
            Some(day("2025-10-27"))
        );
        assert_eq!(
            resolve(ImportMode::TwoYears, None, today)
                .unwrap()
                .start_date,
            Some(day("2024-10-27"))
        );
        assert_eq!(
            resolve(ImportMode::All, None, today).unwrap().start_date,
            None
        );
        assert_eq!(
            resolve(ImportMode::Custom, Some(day("2020-01-02")), today)
                .unwrap()
                .start_date,
            Some(day("2020-01-02"))
        );
    }

    #[test]
    fn leap_days_and_bad_inputs() {
        assert_eq!(
            resolve(ImportMode::OneYear, None, day("2028-02-29"))
                .unwrap()
                .start_date,
            Some(day("2027-02-28"))
        );
        let today = day("2026-10-27");
        assert!(resolve(ImportMode::Custom, None, today).is_err());
        assert!(resolve(ImportMode::Custom, Some(day("2026-10-28")), today).is_err());
        assert!(resolve(ImportMode::All, Some(day("2020-01-01")), today).is_err());
        assert!(resolve(ImportMode::OneYear, Some(day("2020-01-01")), today).is_err());
    }

    #[test]
    fn the_boundary_only_moves_earlier() {
        let (earlier, later) = (Some(day("2024-01-01")), Some(day("2025-01-01")));
        assert!(widens(later, earlier));
        assert!(widens(later, None));
        assert!(widens(later, later));
        assert!(!widens(earlier, later));
        assert!(!widens(None, earlier));
        assert!(widens(None, None));
    }

    #[test]
    fn modes_round_trip() {
        for mode in [
            ImportMode::OneYear,
            ImportMode::TwoYears,
            ImportMode::All,
            ImportMode::Custom,
        ] {
            assert_eq!(ImportMode::parse(mode.as_str()).unwrap(), mode);
        }
        assert!(ImportMode::parse("forever").is_err());
    }
}
