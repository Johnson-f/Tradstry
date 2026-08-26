use chrono::{Datelike, TimeZone, Utc};
use sqlx::Row;

use super::{AgentActor, AgentError, AgentResult};

#[derive(Clone)]
pub struct AgentBudget {
    pool: sqlx::PgPool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentBudgetPermit {
    pub reserved_now: bool,
    pub used: Option<i32>,
    pub limit: Option<i32>,
}

impl AgentBudget {
    pub fn new(pool: sqlx::PgPool) -> Self {
        Self { pool }
    }

    pub async fn reserve_user_action(
        &self,
        actor: &AgentActor,
        run_id: &str,
        _workload: &str,
    ) -> AgentResult<AgentBudgetPermit> {
        let mut tx = self.pool.begin().await?;
        let run = sqlx::query(
            "SELECT budget_reserved_at FROM agent_runs
             WHERE id = $1 AND user_id = $2 FOR UPDATE",
        )
        .bind(run_id)
        .bind(&actor.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(run) = run else {
            return Err(AgentError::NotFound);
        };
        if run
            .try_get::<Option<chrono::DateTime<Utc>>, _>("budget_reserved_at")?
            .is_some()
        {
            tx.commit().await?;
            return Ok(AgentBudgetPermit {
                reserved_now: false,
                used: None,
                limit: None,
            });
        }

        let entitlement = sqlx::query(
            "SELECT u.plan,
                    pl.ai_actions_per_month,
                    EXISTS (
                        SELECT 1 FROM founder_grants fg
                        WHERE fg.user_id = u.id AND fg.revoked_at IS NULL
                    ) AS active_founder_grant
             FROM users u
             LEFT JOIN plan_limits pl ON pl.plan = u.plan
             WHERE u.id = $1",
        )
        .bind(&actor.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(entitlement) = entitlement else {
            return Err(AgentError::NotFound);
        };
        let plan: String = entitlement.try_get("plan")?;
        let active_founder_grant: bool = entitlement.try_get("active_founder_grant")?;
        let limit: Option<i32> = entitlement.try_get("ai_actions_per_month")?;

        let unlimited = plan == "founder" || active_founder_grant || limit.is_none();
        let used = if unlimited {
            None
        } else {
            let limit = limit.ok_or(AgentError::Internal)?;
            if limit <= 0 {
                return Err(AgentError::Capacity);
            }
            let now = Utc::now();
            let period_start = Utc
                .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
                .single()
                .ok_or(AgentError::Internal)?;
            let (next_year, next_month) = if now.month() == 12 {
                (now.year() + 1, 1)
            } else {
                (now.year(), now.month() + 1)
            };
            let period_end = Utc
                .with_ymd_and_hms(next_year, next_month, 1, 0, 0, 0)
                .single()
                .ok_or(AgentError::Internal)?;
            let used: Option<i32> = sqlx::query_scalar(
                "INSERT INTO usage_counters
                 (user_id, metric, period_start, period_end, used)
                 VALUES ($1, 'ai_actions', $2, $3, 1)
                 ON CONFLICT (user_id, metric, period_start) DO UPDATE SET
                    used = usage_counters.used + 1,
                    period_end = EXCLUDED.period_end
                 WHERE usage_counters.used < $4
                 RETURNING used",
            )
            .bind(&actor.user_id)
            .bind(period_start)
            .bind(period_end)
            .bind(limit)
            .fetch_optional(&mut *tx)
            .await?;
            Some(used.ok_or(AgentError::Capacity)?)
        };

        sqlx::query(
            "UPDATE agent_runs SET budget_reserved_at = now(), updated_at = now()
             WHERE id = $1 AND user_id = $2 AND budget_reserved_at IS NULL",
        )
        .bind(run_id)
        .bind(&actor.user_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(AgentBudgetPermit {
            reserved_now: true,
            used,
            limit,
        })
    }

    pub async fn reserve_assistance_action(
        &self,
        actor: &AgentActor,
        workload: &str,
        idempotency_key: &str,
    ) -> AgentResult<AgentBudgetPermit> {
        if !matches!(workload, "notebook_autocomplete" | "notebook_rewrite")
            || idempotency_key.trim().is_empty()
            || idempotency_key.len() > 200
        {
            return Err(AgentError::Validation(
                "invalid assistance reservation".into(),
            ));
        }
        let mut tx = self.pool.begin().await?;
        let existing: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM agent_assistance_requests
             WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE)",
        )
        .bind(&actor.user_id)
        .bind(idempotency_key.trim())
        .fetch_one(&mut *tx)
        .await?;
        if existing {
            tx.commit().await?;
            return Ok(AgentBudgetPermit {
                reserved_now: false,
                used: None,
                limit: None,
            });
        }
        let entitlement = sqlx::query(
            "SELECT u.plan,pl.ai_actions_per_month,
              EXISTS(SELECT 1 FROM founder_grants fg WHERE fg.user_id=u.id AND fg.revoked_at IS NULL)
              AS active_founder_grant
             FROM users u LEFT JOIN plan_limits pl ON pl.plan=u.plan WHERE u.id=$1",
        ).bind(&actor.user_id).fetch_optional(&mut *tx).await?.ok_or(AgentError::NotFound)?;
        let plan: String = entitlement.try_get("plan")?;
        let active_founder_grant: bool = entitlement.try_get("active_founder_grant")?;
        let limit: Option<i32> = entitlement.try_get("ai_actions_per_month")?;
        let unlimited = plan == "founder" || active_founder_grant || limit.is_none();
        let used = if unlimited {
            None
        } else {
            let limit = limit
                .filter(|value| *value > 0)
                .ok_or(AgentError::Capacity)?;
            let now = Utc::now();
            let period_start = Utc
                .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
                .single()
                .ok_or(AgentError::Internal)?;
            let (year, month) = if now.month() == 12 {
                (now.year() + 1, 1)
            } else {
                (now.year(), now.month() + 1)
            };
            let period_end = Utc
                .with_ymd_and_hms(year, month, 1, 0, 0, 0)
                .single()
                .ok_or(AgentError::Internal)?;
            let value: Option<i32> = sqlx::query_scalar(
                "INSERT INTO usage_counters(user_id,metric,period_start,period_end,used)
                 VALUES($1,'ai_actions',$2,$3,1) ON CONFLICT(user_id,metric,period_start)
                 DO UPDATE SET used=usage_counters.used+1,period_end=EXCLUDED.period_end
                 WHERE usage_counters.used<$4 RETURNING used",
            )
            .bind(&actor.user_id)
            .bind(period_start)
            .bind(period_end)
            .bind(limit)
            .fetch_optional(&mut *tx)
            .await?;
            Some(value.ok_or(AgentError::Capacity)?)
        };
        sqlx::query(
            "INSERT INTO agent_assistance_requests(id,user_id,workload,idempotency_key)
             VALUES($1,$2,$3,$4)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&actor.user_id)
        .bind(workload)
        .bind(idempotency_key.trim())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(AgentBudgetPermit {
            reserved_now: true,
            used,
            limit,
        })
    }

    pub async fn finish_assistance_action(
        &self,
        actor: &AgentActor,
        idempotency_key: &str,
        usage: tinyagents::harness::usage::UsageTotals,
        error_code: Option<&str>,
    ) -> AgentResult<()> {
        sqlx::query(
            "UPDATE agent_assistance_requests SET status=CASE WHEN $5::text IS NULL THEN 'completed' ELSE 'failed' END,
             input_tokens=$3,output_tokens=$4,error_code=$5,completed_at=now()
             WHERE user_id=$1 AND idempotency_key=$2 AND status='reserved'",
        ).bind(&actor.user_id).bind(idempotency_key)
          .bind(i64::try_from(usage.usage.input_tokens).map_err(|_| AgentError::Internal)?)
          .bind(i64::try_from(usage.usage.output_tokens).map_err(|_| AgentError::Internal)?)
          .bind(error_code).execute(&self.pool).await?;
        Ok(())
    }
}
