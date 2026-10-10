use std::sync::Arc;
use std::time::Duration;

use log::{error, info};

use crate::service::db::Db;
use crate::service::db::schema::tables::notebook::crdt;

/// Both sweeps are idempotent and cheap when there is nothing to do, so the
/// interval only bounds how long a note stays stuck or oversized.
const SWEEP_INTERVAL_SECS: u64 = 60;

const PURGE_BATCH: i64 = 100;
const LEGACY_BATCH: i64 = 50;

/// Heals notes stranded mid-seed, compacts overgrown update chains and purges
/// notes deleted longer ago than they can be restored.
///
/// Neither job belongs on the write path: seeding and compaction each spawn the
/// projector subprocess (~130ms), and a user's keystroke must never wait on one.
pub async fn run_notebook_maintenance(
    db: Arc<Db>,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) {
    info!("[notebook] maintenance sweeper started");
    let mut ticker = tokio::time::interval(Duration::from_secs(SWEEP_INTERVAL_SECS));

    loop {
        tokio::select! {
            _ = ticker.tick() => {}
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    info!("[notebook] maintenance sweeper stopped");
                    return;
                }
                continue;
            }
        }

        match crdt::sweep_stale_seeding(db.pool()).await {
            Ok(0) => {}
            Ok(n) => info!("[notebook] re-seeded {n} note(s) stranded mid-seed"),
            Err(error) => error!("[notebook] stale-seeding sweep failed: {error:#}"),
        }

        match crdt::sweep_legacy_notes(db.pool(), LEGACY_BATCH).await {
            Ok(0) => {}
            Ok(n) => info!("[notebook] converted {n} note(s) to the update log"),
            Err(error) => error!("[notebook] legacy conversion sweep failed: {error:#}"),
        }

        match crdt::sweep_compaction(db.pool()).await {
            Ok(0) => {}
            Ok(n) => info!("[notebook] compacted {n} note(s)"),
            Err(error) => error!("[notebook] compaction sweep failed: {error:#}"),
        }

        // After compaction: it appends a merged blob at a higher seq, which leaves the
        // projection stale. Projecting last converges both in one tick.
        match crdt::sweep_projections(db.pool()).await {
            Ok(0) => {}
            Ok(n) => info!("[notebook] re-projected {n} note(s)"),
            Err(error) => error!("[notebook] projection sweep failed: {error:#}"),
        }

        match super::library::purge_deleted_notes(db.pool(), PURGE_BATCH).await {
            Ok(0) => {}
            Ok(n) => info!("[notebook] purged {n} note(s) past their restore window"),
            Err(error) => error!("[notebook] purge sweep failed: {error:#}"),
        }
    }
}
