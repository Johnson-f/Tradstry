use anyhow::{Context, Result};
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::future::Future;

use crate::service::db::client::UserDb;
use crate::service::redis::client::RedisClient;

const CACHE_TTL_SECS: u64 = 300;

/// Everything the cached analytics are computed from: trades, the workspace and
/// its journal time zone, journal context (stops), the tags and broken principles
/// on trades, calculator plans matched to trades (their stops count for R), and,
/// for workspaces without the journal, broker history and which of it is already
/// in the journal. Tables without timestamps are fingerprinted.
pub async fn workspace_version(user_db: &UserDb, workspace_id: &str) -> Result<String> {
    sqlx::query_scalar(
        "SELECT concat_ws(':',
            COALESCE((SELECT extract(epoch FROM max(updated_at))::text
                      FROM journal_entries
                      WHERE user_id = $1 AND workspace_id = $2), '0'),
            COALESCE((SELECT extract(epoch FROM updated_at)::text || '/' || COALESCE(journal_timezone, '')
                      FROM workspaces WHERE id = $2 AND user_id = $1), '0'),
            COALESCE((SELECT extract(epoch FROM max(updated_at))::text
                      FROM journal_trade_context
                      WHERE user_id = $1 AND workspace_id = $2), '0'),
            (SELECT md5(COALESCE(string_agg(t.journal_entry_id || '/' || t.tag_id, ',' ORDER BY t.journal_entry_id, t.tag_id), ''))
               FROM trade_tags t JOIN journal_entries e ON e.id = t.journal_entry_id
              WHERE e.user_id = $1 AND e.workspace_id = $2),
            (SELECT md5(COALESCE(string_agg(v.journal_entry_id || '/' || v.principle_id, ',' ORDER BY v.journal_entry_id, v.principle_id), ''))
               FROM trade_principle_violations v JOIN journal_entries e ON e.id = v.journal_entry_id
              WHERE e.user_id = $1 AND e.workspace_id = $2),
            COALESCE((SELECT enabled::text FROM journal_workspace_state WHERE user_id = $1 AND workspace_id = $2), 'off'),
            (SELECT md5(COALESCE(string_agg(id || '/' || fingerprint || '/' || COALESCE(retired_at::text, ''), ',' ORDER BY id), ''))
               FROM trade_episodes WHERE user_id = $1 AND workspace_id = $2),
            (SELECT md5(COALESCE(string_agg(l.brokerage_transaction_id || '/' || l.journal_entry_id, ',' ORDER BY l.brokerage_transaction_id, l.journal_entry_id), ''))
               FROM journal_brokerage_links l JOIN journal_entries e ON e.id = l.journal_entry_id
              WHERE e.user_id = $1 AND e.workspace_id = $2),
            (SELECT md5(COALESCE(string_agg(episode_id || '/' || journal_entry_id, ',' ORDER BY episode_id), ''))
               FROM brokerage_episode_publications WHERE user_id = $1 AND workspace_id = $2),
            (SELECT md5(COALESCE(string_agg(m.episode_id || '/' || m.status || '/' || p.stop_loss || '/' || p.updated_at || '/' || COALESCE(p.deleted_at::text, ''), ',' ORDER BY m.id), ''))
               FROM trade_episode_matches m JOIN position_calculator_plans p ON p.id = m.plan_id
              WHERE m.user_id = $1 AND m.workspace_id = $2)
         )",
    )
    .bind(user_db.user_id())
    .bind(workspace_id)
    .fetch_one(user_db.pool())
    .await
    .context("Failed to read analytics cache version")
}

/// Versioned cache: journal or workspace writes change the key immediately, so
/// the TTL is only cleanup and never a stale-data window.
pub async fn get_or_load<T, F, Fut>(
    redis: &RedisClient,
    user_db: &UserDb,
    workspace_id: &str,
    kind: &str,
    parameters: &str,
    load: F,
) -> Result<T>
where
    T: Serialize + DeserializeOwned,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T>>,
{
    let version = workspace_version(user_db, workspace_id).await?;
    let parameter_hash = format!("{:x}", md5::compute(parameters.as_bytes()));
    let key = format!(
        "analytics:{kind}:{}:{workspace_id}:{version}:{parameter_hash}",
        user_db.user_id()
    );

    if let Some(cached) = redis.get(&key).await
        && let Ok(value) = serde_json::from_str(&cached)
    {
        return Ok(value);
    }

    let value = load().await?;
    if let Ok(serialized) = serde_json::to_string(&value) {
        redis.set_ex(&key, &serialized, CACHE_TTL_SECS).await;
    }
    Ok(value)
}
