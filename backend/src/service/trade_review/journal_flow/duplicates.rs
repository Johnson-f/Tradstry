//! Manual trades held because they may duplicate a broker trade. The hold itself
//! lives in the database (`journal_manual_hold`), so every write path applies it.

use super::{JournalTrade, commands, get_trade};
use anyhow::{Result, anyhow, ensure};
use serde_json::{Value, json};
use sqlx::PgPool;

/// The user says a held manual trade is a different trade from the broker trades
/// it overlaps. Those broker trades are never flagged against it again.
pub async fn keep_separate(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry_id: &str,
    expected_version: i64,
    client: &str,
    mutation: &str,
) -> Result<JournalTrade> {
    let payload = json!({"kind":"keep_separate","workspace":workspace,"entry":entry_id,"version":expected_version});
    let mut tx = pool.begin().await?;
    if commands::replay(&mut tx, user, workspace, client, mutation, &payload)
        .await?
        .is_none()
    {
        commands::lock_owner(&mut tx, user, workspace).await?;
        let (version, issue): (i64, Option<Value>) = sqlx::query_as(
            "SELECT record_version,issue_json FROM journal_entries WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND source_kind='manual' AND deleted_at IS NULL AND retired_at IS NULL FOR UPDATE",
        )
        .bind(entry_id)
        .bind(user)
        .bind(workspace)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| anyhow!("Manual trade not found"))?;
        ensure!(
            version == expected_version,
            "CONFLICT: this trade changed on another device"
        );
        let duplicates = issue
            .filter(|issue| issue["code"] == "possible_duplicate")
            .and_then(|issue| {
                serde_json::from_value::<Vec<String>>(issue["possible_duplicates"].clone()).ok()
            })
            .unwrap_or_default();
        ensure!(
            !duplicates.is_empty(),
            "This trade is not waiting for a duplicate check"
        );
        sqlx::query("UPDATE journal_entries SET separate_from=ARRAY(SELECT DISTINCT x FROM unnest(separate_from||$4::text[]) x ORDER BY x) WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
            .bind(entry_id)
            .bind(user)
            .bind(workspace)
            .bind(&duplicates)
            .execute(&mut *tx)
            .await?;
        commands::changed(
            &mut tx,
            user,
            workspace,
            "trade",
            json!({"entryId":entry_id}),
        )
        .await?;
        commands::acknowledge(
            &mut tx,
            user,
            workspace,
            client,
            mutation,
            &payload,
            &json!(entry_id),
        )
        .await?;
    }
    tx.commit().await?;
    get_trade(pool, user, workspace, entry_id)
        .await?
        .ok_or_else(|| anyhow!("Manual trade not found"))
}
