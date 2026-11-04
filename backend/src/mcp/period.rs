//! The dashboard's periods, so a tool's numbers match the app's for the same
//! choice: whole New York trading days ending today.

use chrono::{DateTime, Datelike, Months, NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use schemars::JsonSchema;
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, JsonSchema)]
pub enum Period {
    #[serde(rename = "today")]
    Today,
    #[serde(rename = "1w")]
    Week,
    #[default]
    #[serde(rename = "1m")]
    Month,
    #[serde(rename = "3m")]
    ThreeMonths,
    #[serde(rename = "6m")]
    SixMonths,
    #[serde(rename = "ytd")]
    YearToDate,
    #[serde(rename = "1y")]
    Year,
    #[serde(rename = "all")]
    All,
}

impl Period {
    /// How the dashboard names it, e.g. "past month".
    pub fn phrase(self) -> &'static str {
        match self {
            Self::Today => "today",
            Self::Week => "past week",
            Self::Month => "past month",
            Self::ThreeMonths => "past 3 months",
            Self::SixMonths => "past 6 months",
            Self::YearToDate => "year to date",
            Self::Year => "past year",
            Self::All => "all time",
        }
    }

    /// The first New York day in the window, or None for all history.
    pub fn first_day(self, today: NaiveDate) -> Option<NaiveDate> {
        // A month ago is clamped to a shorter month's end, then the window starts the day after.
        let months_back = |months: u32| {
            today
                .checked_sub_months(Months::new(months))
                .map(|day| day.succ_opt().unwrap_or(day))
        };
        match self {
            Self::Today => Some(today),
            Self::Week => today.checked_sub_days(chrono::Days::new(6)),
            Self::Month => months_back(1),
            Self::ThreeMonths => months_back(3),
            Self::SixMonths => months_back(6),
            Self::YearToDate => NaiveDate::from_ymd_opt(today.year(), 1, 1),
            Self::Year => months_back(12),
            Self::All => None,
        }
    }

    /// When the window starts: New York midnight of its first day.
    pub fn start(self, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
        let today = now.with_timezone(&New_York).date_naive();
        let day = self.first_day(today)?;
        New_York
            .from_local_datetime(&day.and_hms_opt(0, 0, 0)?)
            .earliest()
            .map(|start| start.with_timezone(&Utc))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn windows_match_the_dashboard() {
        let today = day("2026-03-31");
        assert_eq!(Period::Today.first_day(today), Some(today));
        assert_eq!(Period::Week.first_day(today), Some(day("2026-03-25")));
        assert_eq!(
            Period::Month.first_day(today),
            Some(day("2026-03-01")),
            "Feb 28 clamps, then the next day"
        );
        assert_eq!(Period::YearToDate.first_day(today), Some(day("2026-01-01")));
        assert_eq!(Period::Year.first_day(today), Some(day("2025-04-01")));
        assert_eq!(Period::All.first_day(today), None);
    }

    #[test]
    fn a_window_starts_at_new_york_midnight() {
        let now = DateTime::parse_from_rfc3339("2026-07-15T02:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(
            Period::Today.start(now).unwrap().to_rfc3339(),
            "2026-07-14T04:00:00+00:00",
            "02:00 UTC is still the 14th in New York"
        );
    }
}
