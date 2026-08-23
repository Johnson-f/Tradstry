use anyhow::{Context, Result, bail, ensure};
use async_graphql::{Enum, SimpleObject};
use chrono::{Months, NaiveDate, Utc};
use sqlx::{PgExecutor, PgPool, Row};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Enum)]
#[graphql(rename_items = "snake_case")]
pub enum TransactionImportMode {
    OneYear,
    TwoYears,
    All,
    Custom,
}

impl TransactionImportMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneYear => "one_year",
            Self::TwoYears => "two_years",
            Self::All => "all",
            Self::Custom => "custom",
        }
    }

    fn parse(value: &str) -> Result<Self> {
        match value {
            "one_year" => Ok(Self::OneYear),
            "two_years" => Ok(Self::TwoYears),
            "all" => Ok(Self::All),
            "custom" => Ok(Self::Custom),
            _ => bail!("Unsupported transaction import mode"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct TransactionImportPolicy {
    pub mode: TransactionImportMode,
    pub start_date: Option<String>,
    pub configured_at: String,
    pub initial_import_completed_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolvedTransactionImportPolicy {
    pub mode: TransactionImportMode,
    pub start_date: Option<NaiveDate>,
}

pub fn eastern_today() -> NaiveDate {
    Utc::now()
        .with_timezone(&chrono_tz::US::Eastern)
        .date_naive()
}

pub fn resolve(
    mode: TransactionImportMode,
    custom_start_date: Option<&str>,
    today: NaiveDate,
) -> Result<ResolvedTransactionImportPolicy> {
    let start_date = match mode {
        TransactionImportMode::All => {
            ensure!(
                custom_start_date.is_none(),
                "All history does not accept a start date"
            );
            None
        }
        TransactionImportMode::OneYear => {
            ensure!(
                custom_start_date.is_none(),
                "Past year does not accept a custom date"
            );
            Some(
                today
                    .checked_sub_months(Months::new(12))
                    .context("Could not resolve the one-year import date")?,
            )
        }
        TransactionImportMode::TwoYears => {
            ensure!(
                custom_start_date.is_none(),
                "Past 2 years does not accept a custom date"
            );
            Some(
                today
                    .checked_sub_months(Months::new(24))
                    .context("Could not resolve the two-year import date")?,
            )
        }
        TransactionImportMode::Custom => {
            let value = custom_start_date.context("Choose a custom start date")?;
            let date = NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .context("Custom start date must use YYYY-MM-DD")?;
            ensure!(date <= today, "Custom start date cannot be in the future");
            Some(date)
        }
    };
    Ok(ResolvedTransactionImportPolicy { mode, start_date })
}

pub async fn upsert<'e, E>(
    executor: E,
    user_id: &str,
    workspace_id: &str,
    snaptrade_account_id: &str,
    policy: ResolvedTransactionImportPolicy,
) -> Result<()>
where
    E: PgExecutor<'e>,
{
    sqlx::query(
        "INSERT INTO brokerage_sync_state (
             user_id, workspace_id, snaptrade_account_id,
             transaction_import_mode, transaction_import_start_date,
             transaction_import_configured_at
         ) VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (user_id, workspace_id, snaptrade_account_id) DO UPDATE SET
             transaction_import_mode=EXCLUDED.transaction_import_mode,
             transaction_import_start_date=EXCLUDED.transaction_import_start_date,
             transaction_import_configured_at=EXCLUDED.transaction_import_configured_at,
             updated_at=now()",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(snaptrade_account_id)
    .bind(policy.mode.as_str())
    .bind(policy.start_date)
    .execute(executor)
    .await
    .context("Failed to save transaction import policy")?;
    Ok(())
}

pub async fn get(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    snaptrade_account_id: &str,
) -> Result<Option<TransactionImportPolicy>> {
    let row = sqlx::query(
        "SELECT transaction_import_mode,
                to_char(transaction_import_start_date, 'YYYY-MM-DD'),
                to_char(transaction_import_configured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'),
                to_char(transaction_initial_import_completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
         FROM brokerage_sync_state
         WHERE user_id=$1 AND workspace_id=$2 AND snaptrade_account_id=$3
           AND transaction_import_configured_at IS NOT NULL",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(snaptrade_account_id)
    .fetch_optional(pool)
    .await
    .context("Failed to read transaction import policy")?;

    row.map(|row| {
        Ok(TransactionImportPolicy {
            mode: TransactionImportMode::parse(row.try_get::<&str, _>(0)?)?,
            start_date: row.try_get(1)?,
            configured_at: row.try_get(2)?,
            initial_import_completed_at: row.try_get(3)?,
        })
    })
    .transpose()
}

pub async fn mark_initial_import_completed(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    snaptrade_account_id: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE brokerage_sync_state
         SET transaction_initial_import_completed_at=COALESCE(
                 transaction_initial_import_completed_at,
                 now()
             ),
             updated_at=now()
         WHERE user_id=$1 AND workspace_id=$2 AND snaptrade_account_id=$3",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(snaptrade_account_id)
    .execute(pool)
    .await
    .context("Failed to mark initial transaction import complete")?;
    Ok(())
}

pub async fn clear_transaction_watermark(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    snaptrade_account_id: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE brokerage_sync_state
         SET transactions_last_successful_sync=NULL, updated_at=now()
         WHERE user_id=$1 AND workspace_id=$2 AND snaptrade_account_id=$3",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(snaptrade_account_id)
    .execute(pool)
    .await
    .context("Failed to reset the transaction sync watermark")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{TransactionImportMode, resolve};
    use chrono::NaiveDate;

    #[test]
    fn presets_resolve_to_fixed_calendar_dates() {
        let today = NaiveDate::from_ymd_opt(2028, 2, 29).unwrap();
        assert_eq!(
            resolve(TransactionImportMode::OneYear, None, today)
                .unwrap()
                .start_date,
            Some(NaiveDate::from_ymd_opt(2027, 2, 28).unwrap())
        );
        assert_eq!(
            resolve(TransactionImportMode::TwoYears, None, today)
                .unwrap()
                .start_date,
            Some(NaiveDate::from_ymd_opt(2026, 2, 28).unwrap())
        );
    }

    #[test]
    fn custom_date_must_not_be_in_the_future() {
        let today = NaiveDate::from_ymd_opt(2026, 8, 22).unwrap();
        assert!(resolve(TransactionImportMode::Custom, Some("2026-08-23"), today).is_err());
        assert_eq!(
            resolve(TransactionImportMode::Custom, Some("2026-08-22"), today)
                .unwrap()
                .start_date,
            Some(today)
        );
    }
}
