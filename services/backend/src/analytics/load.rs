use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use super::{
    compute_with,
    model::{Outcome, StatTrade, Stats},
};
use crate::trades::read::{TRADE_COLUMNS, TradeRow};

/// Statistics over closed, economic, top-level trades closed in the window,
/// in one workspace or all of the user's.
pub async fn stats(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Option<Uuid>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> Result<Stats> {
    let rows = sqlx::query_as::<_, TradeRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {TRADE_COLUMNS} WHERE t.user_id = $1 AND ($2::uuid IS NULL OR t.workspace_id = $2)
           AND t.status = 'closed' AND t.parent_id IS NULL AND NOT t.non_economic AND t.net IS NOT NULL
           AND ($3::timestamptz IS NULL OR t.closed_at >= $3) AND ($4::timestamptz IS NULL OR t.closed_at < $4)"
    )))
    .bind(user_id)
    .bind(workspace_id)
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;
    let breakeven_band = crate::users::settings::get(pool, user_id)
        .await?
        .breakeven_band;
    let skipped: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM trade_plans WHERE user_id = $1 AND ($2::uuid IS NULL OR workspace_id = $2)
           AND status = 'skipped' AND ($3::timestamptz IS NULL OR created_at >= $3)
           AND ($4::timestamptz IS NULL OR created_at < $4)",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;
    let mut stats = compute_with(
        rows.iter()
            .filter_map(|row| {
                Some(StatTrade {
                    symbol: row.underlying.clone(),
                    direction: row.direction.clone(),
                    opened_at: row.opened_at,
                    closed_at: row.closed_at?,
                    net: row.net?,
                    return_pct: row.return_pct,
                    entry_cost: row.entry_cost,
                    holding_seconds: row.holding_seconds.unwrap_or_default(),
                    r: row.r_multiple(),
                    edges: row.edges.0.clone(),
                    entry_tactics: row.entry_tactics.0.clone(),
                    tags: row.tags.0.clone(),
                    mistakes: row.mistakes.0.clone(),
                    behavior: row.behavior,
                    planned: row.has_plan,
                    outcome: Outcome::default(),
                })
            })
            .collect(),
        breakeven_band,
    );
    stats.plans.skipped = usize::try_from(skipped).unwrap_or_default();
    Ok(stats)
}
