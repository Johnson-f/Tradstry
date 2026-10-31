//! Rebuilding a user's trades: load everything, compute, replace the output,
//! all in one transaction under a per-user lock.

use std::time::Instant;

use anyhow::Result;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use super::{ENGINE_VERSION, compute, positions, store};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RebuildSummary {
    pub trades: usize,
    pub issues: usize,
    pub duration_ms: i32,
}

pub async fn rebuild(pool: &PgPool, user_id: Uuid) -> Result<RebuildSummary> {
    let started = Instant::now();
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('trades:' || $1::text, 0))")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    let loaded = store::load(&mut tx, user_id).await?;
    let output = compute(&loaded.input);
    let mut issues = output.issues.clone();
    issues.extend(positions::reconcile(
        &output.trades,
        &loaded.snapshots,
        &loaded.input.aliases,
    ));
    let duration_ms = i32::try_from(started.elapsed().as_millis()).unwrap_or(i32::MAX);
    store::write(&mut tx, user_id, &output, &issues, duration_ms).await?;
    tx.commit().await?;
    let summary = RebuildSummary {
        trades: output.trades.len(),
        issues: issues.len(),
        duration_ms: i32::try_from(started.elapsed().as_millis()).unwrap_or(i32::MAX),
    };
    info!(%user_id, trades = summary.trades, issues = summary.issues, ms = summary.duration_ms, "rebuilt trades");
    Ok(summary)
}

/// Rebuilds without failing the caller; the next trigger or start retries.
pub async fn rebuild_quietly(pool: &PgPool, user_id: Uuid) {
    if let Err(error) = rebuild(pool, user_id).await {
        warn!(%user_id, error = %format!("{error:#}"), "could not rebuild trades");
    }
}

/// Users whose trades were built by another engine version, or never built.
pub async fn stale_users(pool: &PgPool) -> Result<Vec<Uuid>> {
    Ok(sqlx::query_scalar(
        "SELECT u.id FROM users u LEFT JOIN trade_engine_state s ON s.user_id = u.id
         WHERE (s.user_id IS NULL OR s.engine_version <> $1)
           AND (EXISTS (SELECT 1 FROM brokerage_accounts a WHERE a.user_id = u.id)
             OR EXISTS (SELECT 1 FROM manual_fills m WHERE m.user_id = u.id))",
    )
    .bind(ENGINE_VERSION)
    .fetch_all(pool)
    .await?)
}

/// Rebuilds, in the background, everyone whose trades an older engine built.
pub fn spawn_upgrade(pool: PgPool) {
    tokio::spawn(async move {
        match stale_users(&pool).await {
            Ok(users) => {
                for user_id in users {
                    rebuild_quietly(&pool, user_id).await;
                }
            }
            Err(error) => warn!(error = %format!("{error:#}"), "could not list users to rebuild"),
        }
    });
}
