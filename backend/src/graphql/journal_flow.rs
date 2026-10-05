use crate::service::trade_review::journal_flow::{
    self, JournalTrade, backfill, grouping, reflection, sessions, suggestions,
};
use async_graphql::{Context, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sqlx::Row;

#[derive(SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct JournalFlowStatus {
    pub api_version: i32,
    pub enabled: bool,
    pub source_revision: i64,
    pub projection_revision: i64,
    pub import_state: String,
    pub last_error: Option<String>,
    pub timezone: String,
    pub change_cursor: String,
}

#[derive(SimpleObject)]
#[graphql(name = "JournalExecutionV2", rename_fields = "camelCase")]
pub struct Execution {
    pub transaction_id: String,
    pub role: String,
    pub side: String,
    pub quantity: String,
    pub price: String,
    pub fee: Option<String>,
    pub executed_at: Option<String>,
    pub precision: String,
    pub source_quantity: String,
}

#[derive(SimpleObject)]
#[graphql(name = "JournalGroupingHistoryV2", rename_fields = "camelCase")]
pub struct GroupingHistory {
    pub id: String,
    pub kind: String,
    pub state: String,
    pub created_at: String,
    pub entry_ids: Vec<String>,
}

#[derive(Default)]
pub struct JournalFlowQuery;

#[Object]
impl JournalFlowQuery {
    async fn journal_snapshot_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        cursor: Option<String>,
    ) -> Result<journal_flow::JournalSnapshot> {
        let db = super::auth::user_db(ctx).await?;
        Ok(
            journal_flow::snapshot(db.pool(), db.user_id(), &workspace_id, cursor.as_deref())
                .await?,
        )
    }
    async fn journal_review_history_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<Vec<reflection::ReviewView>> {
        let db = super::auth::user_db(ctx).await?;
        let rows = sqlx::query("SELECT id,entry_id,review_version,entry_revision,context_revision,takeaway,choice_ids,plan_adherence,created_at FROM journal_trade_reviews WHERE user_id=$1 AND workspace_id=$2 AND entry_id=$3 ORDER BY review_version DESC LIMIT 100")
            .bind(db.user_id()).bind(&workspace_id).bind(&entry_id).fetch_all(db.pool()).await?;
        rows.into_iter()
            .map(|row| {
                Ok(reflection::ReviewView {
                    id: row.try_get("id")?,
                    entry_id: row.try_get("entry_id")?,
                    version: row.try_get("review_version")?,
                    entry_revision: row.try_get("entry_revision")?,
                    context_revision: row.try_get("context_revision")?,
                    takeaway: row.try_get("takeaway")?,
                    choice_ids: serde_json::from_value(row.try_get("choice_ids")?)?,
                    plan_adherence: row.try_get("plan_adherence")?,
                    created_at: row.try_get::<DateTime<Utc>, _>("created_at")?.to_rfc3339(),
                })
            })
            .collect()
    }
    async fn journal_trade_chart_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        from: Option<i64>,
        to: Option<i64>,
    ) -> Result<journal_flow::chart::TradeChart> {
        let db = super::auth::user_db(ctx).await?;
        Ok(journal_flow::chart::for_trade(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &entry_id,
            from,
            to,
        )
        .await?)
    }
    async fn prepare_journal_flow(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        flat_before: Option<String>,
    ) -> Result<backfill::Preparation> {
        let db = super::auth::user_db(ctx).await?;
        Ok(backfill::prepare(
            db.pool(),
            db.user_id(),
            &workspace_id,
            flat_before.as_deref(),
        )
        .await?)
    }
    async fn journal_grouping_suggestions_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: Option<String>,
        #[graphql(default)] offset: i32,
    ) -> Result<Vec<suggestions::Suggestion>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(suggestions::list(
            db.pool(),
            db.user_id(),
            &workspace_id,
            entry_id.as_deref(),
            offset.max(0) as usize,
        )
        .await?)
    }
    async fn journal_flow_status(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<JournalFlowStatus> {
        let db = super::auth::user_db(ctx).await?;
        let row=sqlx::query("SELECT w.journal_timezone,coalesce(s.enabled,false) AS enabled,coalesce(s.source_revision,0) AS source_revision,coalesce(s.projection_revision,0) AS projection_revision,coalesce(s.import_state,'idle') AS import_state,coalesce(s.last_error,j.last_error) AS last_error,(SELECT coalesce(max(sequence),0)::text FROM journal_changes WHERE user_id=w.user_id AND workspace_id=w.id) AS cursor FROM workspaces w LEFT JOIN journal_workspace_state s ON s.workspace_id=w.id AND s.user_id=w.user_id LEFT JOIN journal_projection_jobs j ON j.workspace_id=w.id AND j.user_id=w.user_id WHERE w.id=$1 AND w.user_id=$2")
            .bind(&workspace_id).bind(db.user_id()).fetch_optional(db.pool()).await?.ok_or_else(||async_graphql::Error::new("Workspace not found"))?;
        Ok(JournalFlowStatus {
            api_version: 2,
            enabled: row.try_get("enabled")?,
            source_revision: row.try_get("source_revision")?,
            projection_revision: row.try_get("projection_revision")?,
            import_state: row.try_get("import_state")?,
            last_error: row.try_get("last_error")?,
            timezone: row.try_get("journal_timezone")?,
            change_cursor: row.try_get("cursor")?,
        })
    }

    async fn journal_trades_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<JournalTrade>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(journal_flow::list_trades(db.pool(), db.user_id(), &workspace_id).await?)
    }
    async fn journal_trade_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<Option<JournalTrade>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(journal_flow::get_trade(db.pool(), db.user_id(), &workspace_id, &entry_id).await?)
    }
    async fn journal_context_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<reflection::ContextView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(reflection::context(db.pool(), db.user_id(), &workspace_id, &entry_id).await?)
    }
    async fn journal_review_draft_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<reflection::DraftView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(reflection::draft(db.pool(), db.user_id(), &workspace_id, &entry_id).await?)
    }
    async fn journal_executions_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<Vec<Execution>> {
        let db = super::auth::user_db(ctx).await?;
        let rows=sqlx::query("SELECT b.id,coalesce(f.role,'unassigned') AS role,b.transaction_type,coalesce(f.quantity,greatest(0,abs(b.units::text::numeric)-(SELECT coalesce(sum(af.quantity),0) FROM trade_episode_fills af JOIN trade_episodes ae ON ae.id=af.episode_id WHERE ae.retired_at IS NULL AND af.brokerage_transaction_id=b.id))) AS quantity,coalesce(f.price,b.price::text::numeric) AS price,coalesce(f.fee,b.fee::text::numeric-(SELECT coalesce(sum(af.fee),0) FROM trade_episode_fills af JOIN trade_episodes ae ON ae.id=af.episode_id WHERE ae.retired_at IS NULL AND af.brokerage_transaction_id=b.id)) AS fee,b.trade_date,b.raw_json,abs(b.units::text::numeric) AS source_quantity
            FROM journal_entries e JOIN brokerage_transactions b ON b.user_id=e.user_id AND b.workspace_id=e.workspace_id
            LEFT JOIN trade_episode_fills f ON f.episode_id=e.episode_id AND f.brokerage_transaction_id=b.id
            WHERE e.id=$1 AND e.user_id=$2 AND e.workspace_id=$3 AND e.deleted_at IS NULL AND (f.id IS NOT NULL OR (e.episode_id IS NULL AND (e.issue_json->'source_ids') ? b.id)) ORDER BY b.trade_date,coalesce(f.allocation_order,0),b.id")
            .bind(&entry_id).bind(db.user_id()).bind(&workspace_id).fetch_all(db.pool()).await?;
        rows.into_iter()
            .map(|row| {
                let raw: serde_json::Value =
                    serde_json::from_str(&row.try_get::<String, _>("raw_json")?)
                        .unwrap_or_default();
                Ok(Execution {
                    transaction_id: row.try_get("id")?,
                    role: row.try_get("role")?,
                    side: row.try_get("transaction_type")?,
                    quantity: row
                        .try_get::<Decimal, _>("quantity")?
                        .normalize()
                        .to_string(),
                    price: row.try_get::<Decimal, _>("price")?.normalize().to_string(),
                    fee: if raw["fee"].is_null() {
                        None
                    } else {
                        Some(row.try_get::<Decimal, _>("fee")?.normalize().to_string())
                    },
                    executed_at: row
                        .try_get::<Option<DateTime<Utc>>, _>("trade_date")?
                        .map(|d| d.to_rfc3339()),
                    precision: if raw["trade_date"]
                        .as_str()
                        .is_some_and(|date| DateTime::parse_from_rfc3339(date).is_ok())
                    {
                        "timestamp"
                    } else {
                        "date"
                    }
                    .into(),
                    source_quantity: row
                        .try_get::<Decimal, _>("source_quantity")?
                        .normalize()
                        .to_string(),
                })
            })
            .collect()
    }
    async fn journal_grouping_history_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<Vec<GroupingHistory>> {
        let db = super::auth::user_db(ctx).await?;
        let rows=sqlx::query("SELECT id,kind,state,created_at,ARRAY(SELECT jsonb_object_keys(expected_versions)) || ARRAY(SELECT jsonb_array_elements_text(coalesce(after_json->'result'->'entry_ids','[]'))) AS entry_ids FROM journal_grouping_operations WHERE user_id=$1 AND workspace_id=$2 AND state IN ('committed','undone') AND (expected_versions ? $3 OR (after_json->'result'->'entry_ids') ? $3) ORDER BY created_at DESC LIMIT 100")
            .bind(db.user_id()).bind(&workspace_id).bind(&entry_id).fetch_all(db.pool()).await?;
        rows.into_iter()
            .map(|row| {
                Ok(GroupingHistory {
                    id: row.try_get("id")?,
                    kind: row.try_get("kind")?,
                    state: row.try_get("state")?,
                    created_at: row.try_get::<DateTime<Utc>, _>("created_at")?.to_rfc3339(),
                    entry_ids: row
                        .try_get::<Vec<String>, _>("entry_ids")?
                        .into_iter()
                        .collect::<std::collections::BTreeSet<_>>()
                        .into_iter()
                        .collect(),
                })
            })
            .collect()
    }
}

#[derive(Default)]
pub struct JournalFlowMutation;

#[Object]
impl JournalFlowMutation {
    #[expect(
        clippy::too_many_arguments,
        reason = "Preserve the existing GraphQL field arguments for web and desktop clients"
    )]
    async fn enable_journal_flow(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        expected_revision: i64,
        flat_before: Option<String>,
        timezone: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<backfill::Activation> {
        let db = super::auth::user_db(ctx).await?;
        Ok(backfill::enable(
            db.pool(),
            db.user_id(),
            &workspace_id,
            backfill::ActivationInput {
                expected_revision,
                flat_before: flat_before.as_deref(),
                timezone: &timezone,
            },
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn preview_journal_suggestion(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        suggestion_id: String,
        adjustment: Option<grouping::GroupingInput>,
    ) -> Result<grouping::GroupingPreview> {
        let db = super::auth::user_db(ctx).await?;
        Ok(suggestions::preview(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &suggestion_id,
            adjustment,
        )
        .await?)
    }
    async fn dismiss_journal_suggestion(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        suggestion_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(suggestions::dismiss(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &suggestion_id,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn reset_journal_learning(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(suggestions::reset_learning(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn preview_journal_grouping(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        input: grouping::GroupingInput,
    ) -> Result<grouping::GroupingPreview> {
        let db = super::auth::user_db(ctx).await?;
        Ok(grouping::preview(db.pool(), db.user_id(), &workspace_id, input).await?)
    }
    async fn confirm_journal_grouping(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        token: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<grouping::GroupingResult> {
        let db = super::auth::user_db(ctx).await?;
        Ok(grouping::confirm(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &token,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn preview_undo_journal_grouping(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        operation_id: String,
    ) -> Result<grouping::GroupingPreview> {
        let db = super::auth::user_db(ctx).await?;
        Ok(grouping::preview_undo(db.pool(), db.user_id(), &workspace_id, &operation_id).await?)
    }
    async fn save_journal_context(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        input: reflection::ContextInput,
        client_id: String,
        mutation_id: String,
    ) -> Result<reflection::ContextView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(reflection::save_context(
            db.pool(),
            db.user_id(),
            &workspace_id,
            input,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn ensure_journal_context_note(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<String> {
        let db = super::auth::user_db(ctx).await?;
        Ok(reflection::ensure_note(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &entry_id,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn save_journal_review_draft(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        input: reflection::DraftInput,
        client_id: String,
        mutation_id: String,
    ) -> Result<reflection::DraftView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(reflection::save_draft(
            db.pool(),
            db.user_id(),
            &workspace_id,
            input,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn mark_journal_trade_reviewed(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        input: reflection::ReviewInput,
        client_id: String,
        mutation_id: String,
    ) -> Result<reflection::ReviewView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(reflection::finalize(
            db.pool(),
            db.user_id(),
            &workspace_id,
            input,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    #[expect(
        clippy::too_many_arguments,
        reason = "Preserve the existing GraphQL field arguments for web and desktop clients"
    )]
    async fn open_journal_review_session(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        date: Option<String>,
        #[graphql(default)] refresh: bool,
        expected_version: Option<i64>,
        client_id: String,
        mutation_id: String,
    ) -> Result<Option<sessions::ReviewSession>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(sessions::open(
            db.pool(),
            db.user_id(),
            &workspace_id,
            sessions::OpenSessionInput {
                date: date.as_deref(),
                refresh,
                expected_version,
            },
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    #[expect(
        clippy::too_many_arguments,
        reason = "Preserve the existing GraphQL field arguments for web and desktop clients"
    )]
    async fn move_journal_review_cursor(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        session_id: String,
        entry_id: String,
        expected_version: i64,
        client_id: String,
        mutation_id: String,
    ) -> Result<i64> {
        let db = super::auth::user_db(ctx).await?;
        Ok(sessions::move_cursor(
            db.pool(),
            db.user_id(),
            &workspace_id,
            sessions::MoveCursorInput {
                session: &session_id,
                entry: &entry_id,
                expected_version,
            },
            &client_id,
            &mutation_id,
        )
        .await?)
    }
}
