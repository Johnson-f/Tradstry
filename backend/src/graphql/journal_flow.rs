use crate::service::trade_review::journal_flow::{
    self, JournalTrade, action_notes, attention, backfill, grouping, opening, reflection,
    review_outcome, sessions, suggestions,
};
use async_graphql::{Context, Error, ErrorExtensions, Object, Result, SimpleObject};
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
    pub held_by: Vec<journal_flow::ExecutionHolder>,
    pub starting_position: bool,
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
    async fn journal_opening_position_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<Option<opening::OpeningPositionView>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(opening::for_entry(db.pool(), db.user_id(), &workspace_id, &entry_id).await?)
    }
    async fn journal_trade_actions_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<action_notes::TradeActions> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::trade_actions(db.pool(), db.user_id(), &workspace_id, &entry_id).await?)
    }
    async fn journal_trade_outcome_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
    ) -> Result<Option<review_outcome::OutcomeView>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(review_outcome::outcome(db.pool(), db.user_id(), &workspace_id, &entry_id).await?)
    }
    async fn journal_orphaned_notes_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<action_notes::NoteView>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::orphaned(db.pool(), db.user_id(), &workspace_id).await?)
    }
    async fn journal_broken_joins_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<attention::BrokenJoin>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(attention::broken_joins(db.pool(), db.user_id(), &workspace_id).await?)
    }
    async fn journal_holdings_mismatches_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<attention::HoldingsMismatch>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(attention::holdings_mismatches(db.pool(), db.user_id(), &workspace_id).await?)
    }
    async fn journal_continuation_suggestions_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<Vec<attention::ContinuationSuggestion>> {
        let db = super::auth::user_db(ctx).await?;
        Ok(attention::continuation_suggestions(db.pool(), db.user_id(), &workspace_id).await?)
    }
    async fn journal_opening_preview_v2(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        input: opening::OpeningPositionInput,
    ) -> Result<opening::OpeningPreview> {
        let db = super::auth::user_db(ctx).await?;
        Ok(opening::preview(db.pool(), db.user_id(), &workspace_id, &entry_id, input).await?)
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
        let released =
            journal_flow::releasable_episodes(db.pool(), db.user_id(), &workspace_id, &entry_id)
                .await?;
        let rows=sqlx::query("SELECT b.id,coalesce(f.role,'unassigned') AS role,b.transaction_type,coalesce(f.quantity,greatest(0,abs(b.units::text::numeric)-(SELECT coalesce(sum(af.quantity),0) FROM trade_episode_fills af JOIN trade_episodes ae ON ae.id=af.episode_id WHERE ae.retired_at IS NULL AND ae.id<>ALL($4) AND af.brokerage_transaction_id=b.id))) AS quantity,coalesce(f.price,b.price::text::numeric) AS price,coalesce(f.fee,b.fee::text::numeric-(SELECT coalesce(sum(af.fee),0) FROM trade_episode_fills af JOIN trade_episodes ae ON ae.id=af.episode_id WHERE ae.retired_at IS NULL AND ae.id<>ALL($4) AND af.brokerage_transaction_id=b.id)) AS fee,b.trade_date,b.raw_json,abs(b.units::text::numeric) AS source_quantity
            FROM journal_entries e JOIN brokerage_transactions b ON b.user_id=e.user_id AND b.workspace_id=e.workspace_id
            LEFT JOIN trade_episode_fills f ON f.episode_id=e.episode_id AND f.brokerage_transaction_id=b.id
            WHERE e.id=$1 AND e.user_id=$2 AND e.workspace_id=$3 AND e.deleted_at IS NULL AND (f.id IS NOT NULL OR (e.episode_id IS NULL AND (e.issue_json->'source_ids') ? b.id)) ORDER BY b.trade_date,coalesce(f.allocation_order,0),b.id")
            .bind(&entry_id).bind(db.user_id()).bind(&workspace_id).bind(&released).fetch_all(db.pool()).await?;
        let ids = rows
            .iter()
            .map(|row| row.try_get::<String, _>("id"))
            .collect::<sqlx::Result<Vec<_>>>()?;
        let mut held_by = journal_flow::execution_holders(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &entry_id,
            &ids,
            &released,
        )
        .await?;
        let openings = sqlx::query("SELECT 'opening:'||p.id AS id,p.direction,f.quantity,f.price,f.executed_at,p.quantity AS position_quantity
            FROM journal_entries j JOIN trade_episode_fills f ON f.episode_id=j.episode_id JOIN journal_opening_positions p ON p.id=f.opening_position_id
            WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3 AND j.deleted_at IS NULL")
            .bind(&entry_id).bind(db.user_id()).bind(&workspace_id).fetch_all(db.pool()).await?;
        let openings = openings.into_iter().map(|row| {
            Ok(Execution {
                transaction_id: row.try_get("id")?,
                role: "entry".into(),
                side: if row.try_get::<String, _>("direction")? == "long" {
                    "BUY"
                } else {
                    "SELL"
                }
                .into(),
                quantity: row
                    .try_get::<Decimal, _>("quantity")?
                    .normalize()
                    .to_string(),
                price: row.try_get::<Decimal, _>("price")?.normalize().to_string(),
                fee: Some("0".into()),
                executed_at: Some(row.try_get::<DateTime<Utc>, _>("executed_at")?.to_rfc3339()),
                precision: "date".into(),
                source_quantity: row
                    .try_get::<Decimal, _>("position_quantity")?
                    .normalize()
                    .to_string(),
                held_by: vec![],
                starting_position: true,
            })
        });
        let executions = rows
            .into_iter()
            .map(|row| {
                let transaction_id: String = row.try_get("id")?;
                let raw: serde_json::Value =
                    serde_json::from_str(&row.try_get::<String, _>("raw_json")?)
                        .unwrap_or_default();
                Ok(Execution {
                    starting_position: false,
                    held_by: held_by.remove(&transaction_id).unwrap_or_default(),
                    transaction_id,
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
            .collect::<Result<Vec<_>>>()?;
        openings.chain(executions.into_iter().map(Ok)).collect()
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

fn grouping_error(error: anyhow::Error) -> Error {
    let Some(exit) = error.downcast_ref::<grouping::ExitExceedsPosition>() else {
        return Error::new(error.to_string());
    };
    let exit = exit.clone();
    Error::new(exit.to_string()).extend_with(move |_, ext| {
        ext.set("code", "EXIT_EXCEEDS_POSITION");
        ext.set("transactionId", exit.transaction_id.clone());
        ext.set("positionBefore", exit.position_before.to_string());
        ext.set("exitQuantity", exit.exit_quantity.to_string());
        ext.set("shortBy", exit.short_by.to_string());
    })
}

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
        suggestions::preview(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &suggestion_id,
            adjustment,
        )
        .await
        .map_err(grouping_error)
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
        #[graphql(default)] separate_from: Vec<String>,
    ) -> Result<grouping::GroupingPreview> {
        let db = super::auth::user_db(ctx).await?;
        grouping::preview_separate(db.pool(), db.user_id(), &workspace_id, input, separate_from)
            .await
            .map_err(grouping_error)
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
    #[expect(
        clippy::too_many_arguments,
        reason = "Preserve the existing GraphQL field arguments for web and desktop clients"
    )]
    async fn save_journal_opening_position(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        input: opening::OpeningPositionInput,
        #[graphql(default)] separate_from: Vec<String>,
        client_id: String,
        mutation_id: String,
    ) -> Result<opening::OpeningPositionView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(opening::save_separate(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &entry_id,
            input,
            separate_from,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn save_journal_action_note(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        input: action_notes::NoteInput,
        client_id: String,
        mutation_id: String,
    ) -> Result<action_notes::NoteView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::save_note(
            db.pool(),
            db.user_id(),
            &workspace_id,
            input,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn add_journal_hindsight_note(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        parent_id: String,
        reason: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<action_notes::NoteView> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::add_hindsight(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &parent_id,
            &reason,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn join_journal_actions(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        execution_ids: Vec<String>,
        client_id: String,
        mutation_id: String,
    ) -> Result<String> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::join(
            db.pool(),
            db.user_id(),
            &workspace_id,
            action_notes::JoinInput {
                entry: &entry_id,
                execution_ids: &execution_ids,
            },
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn keep_journal_orphaned_note(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        note_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::keep_orphan(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &note_id,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn unjoin_journal_actions(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        join_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(action_notes::unjoin(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &join_id,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    #[expect(
        clippy::too_many_arguments,
        reason = "GraphQL field arguments mirror the other journal mutations"
    )]
    async fn skip_journal_trade_review(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        reason: String,
        session_id: Option<String>,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(sessions::skip(
            db.pool(),
            db.user_id(),
            &workspace_id,
            sessions::SkipInput {
                entry: &entry_id,
                reason: &reason,
                session: session_id.as_deref(),
            },
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn unskip_journal_trade_review(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(sessions::unskip(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &entry_id,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    #[expect(
        clippy::too_many_arguments,
        reason = "GraphQL field arguments mirror the other journal mutations"
    )]
    async fn answer_journal_continuation(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        execution_id: String,
        opening_execution_id: String,
        same_position: bool,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(attention::answer_continuation(
            db.pool(),
            db.user_id(),
            &workspace_id,
            attention::ContinuationInput {
                execution_id: &execution_id,
                opening_execution_id: &opening_execution_id,
            },
            same_position,
            &client_id,
            &mutation_id,
        )
        .await?)
    }
    async fn remove_journal_opening_position(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        position_id: String,
        client_id: String,
        mutation_id: String,
    ) -> Result<bool> {
        let db = super::auth::user_db(ctx).await?;
        Ok(opening::remove(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &position_id,
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
    /// Keeps a manual trade held as a possible duplicate as its own trade, so it
    /// counts from now on and is not flagged against those broker trades again.
    async fn keep_manual_trade_separate(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        entry_id: String,
        expected_version: i64,
        client_id: String,
        mutation_id: String,
    ) -> Result<JournalTrade> {
        let db = super::auth::user_db(ctx).await?;
        Ok(journal_flow::duplicates::keep_separate(
            db.pool(),
            db.user_id(),
            &workspace_id,
            &entry_id,
            expected_version,
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
