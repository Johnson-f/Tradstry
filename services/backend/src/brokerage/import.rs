//! Importing linked accounts' history and keeping it current within
//! SnapTrade's polling rules: holdings at most four times a day in the
//! background, transactions once a day (they arrive a day late anyway), with
//! webhooks pulling work earlier when SnapTrade says there is new data.

use std::sync::Arc;
use std::time::Duration as StdDuration;

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde_json::Value;
use sqlx::PgConnection;
use tracing::{info, warn};
use uuid::Uuid;

use super::Brokerage;
use super::history::{self, ImportMode};
use super::session::{Session, SessionError};
use super::store;
use crate::snaptrade::{Activity, ActivityQuery, Order};

const PAGE_SIZE: u64 = 1000;
/// A safety stop: 500 pages is half a million transactions for one account.
const MAX_PAGES: u64 = 500;
/// Re-read the last week each day in case a brokerage corrected recent rows.
const OVERLAP_DAYS: i64 = 7;
const HOLDINGS_INTERVAL: Duration = Duration::hours(6);
const BLOCKED_RETRY: Duration = Duration::hours(6);
const ORDER_DAYS: u32 = 90;
const SNAPSHOT_RETENTION_DAYS: i32 = 30;
/// Manual refreshes of holdings are allowed at most this often.
const MANUAL_REFRESH_MINUTES: i64 = 5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JobKind {
    Initial,
    Transactions,
    Holdings,
}

impl JobKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Initial => "initial",
            Self::Transactions => "transactions",
            Self::Holdings => "holdings",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "initial" => Self::Initial,
            "transactions" => Self::Transactions,
            "holdings" => Self::Holdings,
            _ => return None,
        })
    }
}

#[derive(sqlx::FromRow)]
struct LeasedJob {
    id: Uuid,
    account_id: Uuid,
    kind: String,
    attempts: i32,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct SyncState {
    pub initial_import_completed_at: Option<DateTime<Utc>>,
    pub transactions_synced_through: Option<NaiveDate>,
    pub holdings_synced_at: Option<DateTime<Utc>>,
    pub next_sync_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct StoredActivity {
    pub snaptrade_activity_id: String,
    pub r#type: String,
    pub trade_date: Option<DateTime<Utc>>,
    pub settlement_date: Option<DateTime<Utc>>,
    pub units: Option<f64>,
    pub price: Option<f64>,
    pub amount: Option<f64>,
    pub currency: Option<String>,
    pub fee: Option<f64>,
    pub symbol: Option<String>,
    pub option_symbol: Option<String>,
    pub description: Option<String>,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct StoredOrder {
    pub brokerage_order_id: String,
    pub status: Option<String>,
    pub action: Option<String>,
    pub symbol: Option<String>,
    pub total_units: Option<f64>,
    pub filled_units: Option<f64>,
    pub execution_price: Option<f64>,
    pub time_placed: Option<DateTime<Utc>>,
    pub time_executed: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Snapshot {
    pub captured_at: DateTime<Utc>,
    pub positions: Value,
    pub balances: Value,
}

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error("Not found")]
    NotFound,
    #[error("{0}")]
    InvalidRange(String),
    #[error("Synced recently; try again in a few minutes")]
    TooSoon,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// The account's daily sync time: spread across the day by account so syncs
/// are not bunched, and at least 20 hours after `now`.
pub fn next_daily_slot(account_id: Uuid, now: DateTime<Utc>) -> DateTime<Utc> {
    let offset = Duration::seconds((account_id.as_u128() % 86_400) as i64);
    let mut at = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("midnight exists")
        .and_utc()
        + offset;
    while at < now + Duration::hours(20) {
        at += Duration::days(1);
    }
    at
}

impl Brokerage {
    /// Queues a job for an account. If one is already queued, it only moves earlier.
    pub async fn enqueue(&self, account_id: Uuid, kind: JobKind, due: DateTime<Utc>) -> Result<()> {
        sqlx::query(
            "INSERT INTO sync_jobs (id, account_id, kind, due_at) VALUES ($1, $2, $3, $4)
             ON CONFLICT (account_id, kind) DO UPDATE SET due_at = LEAST(sync_jobs.due_at, EXCLUDED.due_at)",
        )
        .bind(crate::db::new_id())
        .bind(account_id)
        .bind(kind.as_str())
        .bind(due)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Queues the first import for newly chosen accounts and catches up
    /// re-linked ones.
    pub(crate) async fn queue_imports(&self, accounts: &[store::Account]) -> Result<()> {
        let now = Utc::now();
        for account in accounts {
            let kind = if account.initial_import_completed_at.is_none() {
                JobKind::Initial
            } else {
                JobKind::Transactions
            };
            self.enqueue(account.id, kind, now).await?;
            if kind == JobKind::Transactions {
                self.enqueue(account.id, JobKind::Holdings, now).await?;
            }
        }
        Ok(())
    }

    /// Leases and runs up to `limit` due jobs. Leases expire, so a crash only
    /// delays a job.
    pub async fn run_due_jobs(&self, limit: i64) -> Result<usize> {
        let jobs = sqlx::query_as::<_, LeasedJob>(
            "UPDATE sync_jobs SET leased_until = now() + interval '10 minutes', attempts = attempts + 1
             WHERE id IN (
                SELECT id FROM sync_jobs
                WHERE due_at <= now() AND (leased_until IS NULL OR leased_until < now())
                ORDER BY due_at LIMIT $1 FOR UPDATE SKIP LOCKED
             )
             RETURNING id, account_id, kind, attempts",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        for job in &jobs {
            if let Err(error) = self.run_job(job).await {
                warn!(job_id = %job.id, error = %error, "could not record a sync job's outcome");
            }
        }
        Ok(jobs.len())
    }

    async fn run_job(&self, job: &LeasedJob) -> Result<()> {
        let Some(kind) = JobKind::parse(&job.kind) else {
            return self.drop_job(job.id).await;
        };
        let account = sqlx::query_as::<_, store::Account>(sqlx::AssertSqlSafe(
            "SELECT a.id, a.user_id, a.connection_id, a.snaptrade_account_id, a.name, a.masked_number, a.kind,
                a.raw_type, a.is_paper, a.import_mode, a.import_start_date, a.initial_import_completed_at,
                a.unlinked_at, w.id AS workspace_id
             FROM brokerage_accounts a LEFT JOIN workspaces w ON w.brokerage_account_id = a.id WHERE a.id = $1",
        ))
        .bind(job.account_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some(account) = account.filter(|a| a.unlinked_at.is_none()) else {
            return self.drop_job(job.id).await;
        };
        let connection =
            store::connection_for_user(&self.pool, account.user_id, account.connection_id)
                .await?
                .context("account without its connection")?;
        if connection.unlinked_at.is_some() {
            return self.drop_job(job.id).await;
        }
        if connection.disabled {
            return self
                .reschedule(
                    job.id,
                    Utc::now() + BLOCKED_RETRY,
                    Some("the connection is disabled"),
                )
                .await;
        }

        let outcome = async {
            let mut session = self.session_for_connection(&connection).await?;
            match kind {
                JobKind::Initial => self.run_initial(&mut session, &account).await,
                JobKind::Transactions => self.run_transactions(&mut session, &account).await,
                JobKind::Holdings => self.run_holdings(&mut session, &account).await,
            }
        }
        .await;
        match outcome {
            Ok(Some(next)) => self.reschedule(job.id, next, None).await,
            Ok(None) => self.drop_job(job.id).await,
            Err(SessionError::ReauthorizationRequired | SessionError::StaleCredentials) => {
                self.reschedule(
                    job.id,
                    Utc::now() + BLOCKED_RETRY,
                    Some("SnapTrade access needs attention"),
                )
                .await
            }
            Err(error) => {
                let backoff = Duration::minutes(5 * 2_i64.pow(job.attempts.clamp(1, 7) as u32 - 1))
                    .min(BLOCKED_RETRY);
                warn!(account_id = %account.id, kind = kind.as_str(), error = %error, "sync job failed");
                self.reschedule_failed(job.id, Utc::now() + backoff, &error.to_string())
                    .await
            }
        }
    }

    async fn run_initial(
        &self,
        session: &mut Session<'_>,
        account: &store::Account,
    ) -> Result<Option<DateTime<Utc>>, SessionError> {
        let today = history::eastern_today();
        self.import_activities(session, account, account.import_start_date, today)
            .await?;
        self.import_holdings(session, account).await?;
        sqlx::query(
            "UPDATE brokerage_accounts SET initial_import_completed_at = COALESCE(initial_import_completed_at, now()),
                transactions_synced_through = $2, updated_at = now() WHERE id = $1",
        )
        .bind(account.id)
        .bind(today.pred_opt())
        .execute(&self.pool)
        .await
        .map_err(anyhow::Error::from)?;
        let now = Utc::now();
        self.enqueue(
            account.id,
            JobKind::Transactions,
            next_daily_slot(account.id, now),
        )
        .await?;
        self.enqueue(account.id, JobKind::Holdings, now + HOLDINGS_INTERVAL)
            .await?;
        info!(account_id = %account.id, "finished the initial import");
        Ok(None)
    }

    async fn run_transactions(
        &self,
        session: &mut Session<'_>,
        account: &store::Account,
    ) -> Result<Option<DateTime<Utc>>, SessionError> {
        let synced_through: Option<NaiveDate> = sqlx::query_scalar(
            "SELECT transactions_synced_through FROM brokerage_accounts WHERE id = $1",
        )
        .bind(account.id)
        .fetch_one(&self.pool)
        .await
        .map_err(anyhow::Error::from)?;
        let today = history::eastern_today();
        let overlap_start = synced_through.map(|day| day - Duration::days(OVERLAP_DAYS));
        // Never read before the account's import boundary.
        let start = match (overlap_start, account.import_start_date) {
            (Some(from), Some(boundary)) => Some(from.max(boundary)),
            (Some(from), None) => Some(from),
            (None, boundary) => boundary,
        };
        self.import_activities(session, account, start, today)
            .await?;
        sqlx::query("UPDATE brokerage_accounts SET transactions_synced_through = $2, updated_at = now() WHERE id = $1")
            .bind(account.id)
            .bind(today.pred_opt())
            .execute(&self.pool)
            .await
            .map_err(anyhow::Error::from)?;
        Ok(Some(next_daily_slot(account.id, Utc::now())))
    }

    async fn run_holdings(
        &self,
        session: &mut Session<'_>,
        account: &store::Account,
    ) -> Result<Option<DateTime<Utc>>, SessionError> {
        self.import_holdings(session, account).await?;
        Ok(Some(Utc::now() + HOLDINGS_INTERVAL))
    }

    async fn import_activities(
        &self,
        session: &mut Session<'_>,
        account: &store::Account,
        start: Option<NaiveDate>,
        end: NaiveDate,
    ) -> Result<u64, SessionError> {
        let mut offset = 0;
        for _ in 0..MAX_PAGES {
            let id = account.snaptrade_account_id.clone();
            let query = ActivityQuery {
                start,
                end,
                offset,
                limit: PAGE_SIZE,
            };
            let page = session
                .run(|client, auth| {
                    let id = id.clone();
                    async move { client.activities(auth.credentials(), &id, query).await }
                })
                .await?;
            let received = page.activities.len() as u64;
            let mut tx = self.pool.begin().await.map_err(anyhow::Error::from)?;
            for activity in &page.activities {
                upsert_activity(&mut tx, account.id, activity).await?;
            }
            tx.commit().await.map_err(anyhow::Error::from)?;
            offset += received;
            let done = received < PAGE_SIZE || page.total.is_some_and(|total| offset >= total);
            if done {
                return Ok(offset);
            }
        }
        warn!(account_id = %account.id, "stopped importing after the page limit");
        Ok(offset)
    }

    async fn import_holdings(
        &self,
        session: &mut Session<'_>,
        account: &store::Account,
    ) -> Result<(), SessionError> {
        let id = account.snaptrade_account_id.clone();
        let positions = session
            .run(|client, auth| {
                let id = id.clone();
                async move { client.positions(auth.credentials(), &id).await }
            })
            .await?;
        let balances = session
            .run(|client, auth| {
                let id = id.clone();
                async move { client.balances(auth.credentials(), &id).await }
            })
            .await?;
        let orders = session
            .run(|client, auth| {
                let id = id.clone();
                async move { client.orders(auth.credentials(), &id, ORDER_DAYS).await }
            })
            .await?;
        let mut tx = self.pool.begin().await.map_err(anyhow::Error::from)?;
        for order in &orders {
            upsert_order(&mut tx, account.id, order).await?;
        }
        sqlx::query("INSERT INTO brokerage_snapshots (account_id, captured_at, positions, balances) VALUES ($1, now(), $2, $3)")
            .bind(account.id)
            .bind(positions)
            .bind(balances)
            .execute(&mut *tx)
            .await
            .map_err(anyhow::Error::from)?;
        sqlx::query("DELETE FROM brokerage_snapshots WHERE account_id = $1 AND captured_at < now() - make_interval(days => $2)")
            .bind(account.id)
            .bind(SNAPSHOT_RETENTION_DAYS)
            .execute(&mut *tx)
            .await
            .map_err(anyhow::Error::from)?;
        sqlx::query("UPDATE brokerage_accounts SET holdings_synced_at = now(), updated_at = now() WHERE id = $1")
            .bind(account.id)
            .execute(&mut *tx)
            .await
            .map_err(anyhow::Error::from)?;
        tx.commit().await.map_err(anyhow::Error::from)?;
        Ok(())
    }

    async fn reschedule(&self, job_id: Uuid, due: DateTime<Utc>, note: Option<&str>) -> Result<()> {
        sqlx::query("UPDATE sync_jobs SET due_at = $2, leased_until = NULL, attempts = 0, last_error = $3 WHERE id = $1")
            .bind(job_id)
            .bind(due)
            .bind(note)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn reschedule_failed(&self, job_id: Uuid, due: DateTime<Utc>, error: &str) -> Result<()> {
        sqlx::query(
            "UPDATE sync_jobs SET due_at = $2, leased_until = NULL, last_error = $3 WHERE id = $1",
        )
        .bind(job_id)
        .bind(due)
        .bind(error)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn drop_job(&self, job_id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM sync_jobs WHERE id = $1")
            .bind(job_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Runs the importer, the webhook retry sweeper, and attempt cleanup until
    /// the process exits.
    pub fn spawn_background(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut ticks: u64 = 0;
            loop {
                if let Err(error) = self.run_due_jobs(10).await {
                    warn!(error = %error, "the sync scheduler failed a round");
                }
                if ticks.is_multiple_of(2)
                    && let Err(error) = self.process_pending_webhooks().await
                {
                    warn!(error = %error, "the webhook sweeper failed a round");
                }
                if ticks.is_multiple_of(240)
                    && let Err(error) = store::delete_stale_attempts(&self.pool).await
                {
                    warn!(error = %error, "could not delete stale OAuth attempts");
                }
                if ticks.is_multiple_of(240)
                    && let Err(error) = super::webhooks::delete_old_events(&self.pool).await
                {
                    warn!(error = %error, "could not delete old webhook events");
                }
                ticks += 1;
                tokio::time::sleep(StdDuration::from_secs(15)).await;
            }
        });
    }

    // ── Reading imported data ──────────────────────────────────────────────

    pub async fn account_for_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Option<store::Account>> {
        let account_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT brokerage_account_id FROM workspaces WHERE id = $1 AND user_id = $2",
        )
        .bind(workspace_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?
        .flatten();
        match account_id {
            Some(id) => store::account_for_user(&self.pool, user_id, id).await,
            None => Ok(None),
        }
    }

    pub async fn activities(
        &self,
        account_id: Uuid,
        offset: i64,
        limit: i64,
    ) -> Result<(Vec<StoredActivity>, i64)> {
        let rows = sqlx::query_as::<_, StoredActivity>(
            "SELECT snaptrade_activity_id, type, trade_date, settlement_date, units, price, amount, currency, fee,
                symbol, option_symbol, description
             FROM brokerage_activities WHERE account_id = $1
             ORDER BY trade_date DESC NULLS LAST, snaptrade_activity_id OFFSET $2 LIMIT $3",
        )
        .bind(account_id)
        .bind(offset)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        let total: i64 =
            sqlx::query_scalar("SELECT count(*) FROM brokerage_activities WHERE account_id = $1")
                .bind(account_id)
                .fetch_one(&self.pool)
                .await?;
        Ok((rows, total))
    }

    pub async fn orders(&self, account_id: Uuid, limit: i64) -> Result<Vec<StoredOrder>> {
        Ok(sqlx::query_as::<_, StoredOrder>(
            "SELECT brokerage_order_id, status, action, symbol, total_units, filled_units, execution_price,
                time_placed, time_executed
             FROM brokerage_orders WHERE account_id = $1 ORDER BY time_placed DESC NULLS LAST LIMIT $2",
        )
        .bind(account_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?)
    }

    pub async fn latest_snapshot(&self, account_id: Uuid) -> Result<Option<Snapshot>> {
        Ok(sqlx::query_as::<_, Snapshot>(
            "SELECT captured_at, positions, balances FROM brokerage_snapshots
             WHERE account_id = $1 ORDER BY captured_at DESC LIMIT 1",
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn sync_state(&self, account_id: Uuid) -> Result<SyncState> {
        Ok(sqlx::query_as::<_, SyncState>(
            "SELECT a.initial_import_completed_at, a.transactions_synced_through, a.holdings_synced_at,
                (SELECT min(due_at) FROM sync_jobs WHERE account_id = a.id) AS next_sync_at,
                (SELECT last_error FROM sync_jobs WHERE account_id = a.id AND last_error IS NOT NULL
                 ORDER BY due_at LIMIT 1) AS last_error
             FROM brokerage_accounts a WHERE a.id = $1",
        )
        .bind(account_id)
        .fetch_one(&self.pool)
        .await?)
    }

    /// Imports further back. The boundary only ever moves earlier.
    pub async fn expand_history(
        &self,
        user_id: Uuid,
        account_id: Uuid,
        mode: ImportMode,
        custom_start_date: Option<NaiveDate>,
    ) -> Result<store::Account, ImportError> {
        let account = store::account_for_user(&self.pool, user_id, account_id)
            .await?
            .filter(|a| a.unlinked_at.is_none())
            .ok_or(ImportError::NotFound)?;
        let policy = history::resolve(mode, custom_start_date, history::eastern_today())
            .map_err(|error| ImportError::InvalidRange(error.to_string()))?;
        if !history::widens(account.import_start_date, policy.start_date) {
            return Err(ImportError::InvalidRange(
                "History can only be extended further back".into(),
            ));
        }
        sqlx::query("UPDATE brokerage_accounts SET import_mode = $2, import_start_date = $3, updated_at = now() WHERE id = $1")
            .bind(account.id)
            .bind(policy.mode.as_str())
            .bind(policy.start_date)
            .execute(&self.pool)
            .await
            .map_err(anyhow::Error::from)?;
        self.enqueue(account.id, JobKind::Initial, Utc::now())
            .await?;
        store::account_for_user(&self.pool, user_id, account_id)
            .await?
            .ok_or(ImportError::NotFound)
    }

    /// A user-requested refresh of holdings and recent orders. Transactions
    /// follow SnapTrade's once-a-day schedule.
    pub async fn refresh_holdings(
        &self,
        user_id: Uuid,
        account_id: Uuid,
    ) -> Result<(), ImportError> {
        let account = store::account_for_user(&self.pool, user_id, account_id)
            .await?
            .filter(|a| a.unlinked_at.is_none())
            .ok_or(ImportError::NotFound)?;
        let state = self.sync_state(account.id).await?;
        if state
            .holdings_synced_at
            .is_some_and(|at| at > Utc::now() - Duration::minutes(MANUAL_REFRESH_MINUTES))
        {
            return Err(ImportError::TooSoon);
        }
        self.enqueue(account.id, JobKind::Holdings, Utc::now())
            .await?;
        Ok(())
    }
}

async fn upsert_activity(
    tx: &mut PgConnection,
    account_id: Uuid,
    activity: &Activity,
) -> Result<(), SessionError> {
    sqlx::query(
        "INSERT INTO brokerage_activities (account_id, snaptrade_activity_id, type, trade_date, settlement_date,
            units, price, amount, currency, fee, instrument_id, symbol, figi_code, option_symbol, description, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (account_id, snaptrade_activity_id) DO UPDATE SET
            type = EXCLUDED.type, trade_date = EXCLUDED.trade_date, settlement_date = EXCLUDED.settlement_date,
            units = EXCLUDED.units, price = EXCLUDED.price, amount = EXCLUDED.amount, currency = EXCLUDED.currency,
            fee = EXCLUDED.fee, instrument_id = EXCLUDED.instrument_id, symbol = EXCLUDED.symbol,
            figi_code = EXCLUDED.figi_code, option_symbol = EXCLUDED.option_symbol,
            description = EXCLUDED.description, raw = EXCLUDED.raw, updated_at = now()",
    )
    .bind(account_id)
    .bind(&activity.id)
    .bind(&activity.kind)
    .bind(activity.trade_date)
    .bind(activity.settlement_date)
    .bind(activity.units)
    .bind(activity.price)
    .bind(activity.amount)
    .bind(&activity.currency)
    .bind(activity.fee)
    .bind(&activity.instrument_id)
    .bind(&activity.symbol)
    .bind(&activity.figi_code)
    .bind(&activity.option_symbol)
    .bind(&activity.description)
    .bind(&activity.raw)
    .execute(tx)
    .await
    .map_err(anyhow::Error::from)?;
    Ok(())
}

async fn upsert_order(
    tx: &mut PgConnection,
    account_id: Uuid,
    order: &Order,
) -> Result<(), SessionError> {
    sqlx::query(
        "INSERT INTO brokerage_orders (account_id, brokerage_order_id, status, action, symbol, total_units,
            filled_units, execution_price, time_placed, time_executed, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (account_id, brokerage_order_id) DO UPDATE SET
            status = EXCLUDED.status, action = EXCLUDED.action, symbol = EXCLUDED.symbol,
            total_units = EXCLUDED.total_units, filled_units = EXCLUDED.filled_units,
            execution_price = EXCLUDED.execution_price, time_placed = EXCLUDED.time_placed,
            time_executed = EXCLUDED.time_executed, raw = EXCLUDED.raw, updated_at = now()",
    )
    .bind(account_id)
    .bind(&order.brokerage_order_id)
    .bind(&order.status)
    .bind(&order.action)
    .bind(&order.symbol)
    .bind(order.total_units)
    .bind(order.filled_units)
    .bind(order.execution_price)
    .bind(order.time_placed)
    .bind(order.time_executed)
    .bind(&order.raw)
    .execute(tx)
    .await
    .map_err(anyhow::Error::from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daily_slots_are_stable_spread_and_far_enough_ahead() {
        let now = DateTime::parse_from_rfc3339("2026-10-27T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let account = Uuid::now_v7();
        let first = next_daily_slot(account, now);
        assert!(first >= now + Duration::hours(20) && first < now + Duration::hours(44));
        assert_eq!(
            next_daily_slot(account, now + Duration::minutes(1)),
            first,
            "stable for an account"
        );
        let other = next_daily_slot(Uuid::from_u128(account.as_u128() + 3600), now);
        assert_ne!(other, first, "different accounts land at different times");
    }

    #[test]
    fn job_kinds_round_trip() {
        for kind in [JobKind::Initial, JobKind::Transactions, JobKind::Holdings] {
            assert_eq!(JobKind::parse(kind.as_str()), Some(kind));
        }
        assert_eq!(JobKind::parse("trades"), None);
    }
}
