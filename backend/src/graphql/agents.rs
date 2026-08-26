use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;

use async_graphql::{Context, Enum, InputObject, Object, Result, SimpleObject, Subscription};
use clerk_rs::validators::authorizer::ClerkJwt;
use futures_util::stream;

use crate::service::agents::{
    AgentActionProposal, AgentActor, AgentConversation, AgentDateRange, AgentIntent, AgentLane,
    AgentMemoryRecord, AgentMessage, AgentMessageContext, AgentRun, AgentRunEvent, AgentRunHandle,
    AgentRunStatus, AgentScope, AgentService, SendAgentMessage,
};

async fn actor_and_service(ctx: &Context<'_>) -> Result<(AgentActor, Arc<AgentService>)> {
    let (_, user_id) = crate::graphql::auth::resolve_user(ctx).await?;
    let clerk_id = ctx.data::<ClerkJwt>()?.sub.clone();
    Ok((
        AgentActor { user_id, clerk_id },
        ctx.data::<Arc<AgentService>>()?.clone(),
    ))
}

fn gql_error(error: crate::service::agents::AgentError) -> async_graphql::Error {
    async_graphql::Error::new(error.to_string())
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AgentLaneGql {
    Instant,
    FastAi,
    Deep,
}

impl From<AgentLane> for AgentLaneGql {
    fn from(value: AgentLane) -> Self {
        match value {
            AgentLane::Instant => Self::Instant,
            AgentLane::FastAi => Self::FastAi,
            AgentLane::Deep => Self::Deep,
        }
    }
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AgentRunStatusGql {
    Queued,
    Running,
    WaitingForApproval,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AgentRewriteAction {
    Summarize,
    FixSpelling,
    Simplify,
    Expand,
}

impl From<AgentRewriteAction> for crate::service::agents::assistance::RewriteAction {
    fn from(value: AgentRewriteAction) -> Self {
        match value {
            AgentRewriteAction::Summarize => Self::Summarize,
            AgentRewriteAction::FixSpelling => Self::FixSpelling,
            AgentRewriteAction::Simplify => Self::Simplify,
            AgentRewriteAction::Expand => Self::Expand,
        }
    }
}

impl From<AgentRunStatus> for AgentRunStatusGql {
    fn from(value: AgentRunStatus) -> Self {
        match value {
            AgentRunStatus::Queued => Self::Queued,
            AgentRunStatus::Running => Self::Running,
            AgentRunStatus::WaitingForApproval => Self::WaitingForApproval,
            AgentRunStatus::Completed => Self::Completed,
            AgentRunStatus::Failed => Self::Failed,
            AgentRunStatus::Cancelled => Self::Cancelled,
        }
    }
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
#[graphql(rename_items = "SCREAMING_SNAKE_CASE")]
pub enum AgentIntentInput {
    PerformanceSnapshot,
    TradeLookup,
    PlaybookLookup,
    MarketQuote,
    MarketNews,
}

impl From<AgentIntentInput> for AgentIntent {
    fn from(value: AgentIntentInput) -> Self {
        match value {
            AgentIntentInput::PerformanceSnapshot => Self::PerformanceSnapshot,
            AgentIntentInput::TradeLookup => Self::TradeLookup,
            AgentIntentInput::PlaybookLookup => Self::PlaybookLookup,
            AgentIntentInput::MarketQuote => Self::MarketQuote,
            AgentIntentInput::MarketNews => Self::MarketNews,
        }
    }
}

#[derive(InputObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentDateRangeInput {
    pub from: String,
    pub to: String,
}

#[derive(InputObject, Clone, Default)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentMessageContextInput {
    pub explicit_intent: Option<AgentIntentInput>,
    pub trade_ids: Option<Vec<String>>,
    pub playbook_ids: Option<Vec<String>>,
    pub date_range: Option<AgentDateRangeInput>,
    pub market_symbol: Option<String>,
    pub media_ids: Option<Vec<String>>,
}

impl From<AgentMessageContextInput> for AgentMessageContext {
    fn from(value: AgentMessageContextInput) -> Self {
        Self {
            explicit_intent: value.explicit_intent.map(Into::into),
            trade_ids: value.trade_ids.unwrap_or_default(),
            playbook_ids: value.playbook_ids.unwrap_or_default(),
            date_range: value.date_range.map(|range| AgentDateRange {
                from: range.from,
                to: range.to,
            }),
            market_symbol: value.market_symbol,
            media_ids: value.media_ids.unwrap_or_default(),
        }
    }
}

#[derive(InputObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct SendAgentMessageInput {
    pub conversation_id: String,
    pub content: String,
    pub context: Option<AgentMessageContextInput>,
    pub idempotency_key: String,
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentConversationGql {
    pub id: String,
    pub workspace_id: String,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<AgentConversation> for AgentConversationGql {
    fn from(value: AgentConversation) -> Self {
        Self {
            id: value.id,
            workspace_id: value.workspace_id,
            title: value.title,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentMessageGql {
    pub id: String,
    pub conversation_id: String,
    pub sequence: i64,
    pub role: String,
    pub content_json: String,
    pub sources: Vec<AgentSourceGql>,
    pub created_at: String,
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentSourceGql {
    pub title: String,
    pub source_type: String,
    pub excerpt: String,
    pub source_url: Option<String>,
    pub freshness: String,
}

impl From<AgentMessage> for AgentMessageGql {
    fn from(value: AgentMessage) -> Self {
        Self {
            id: value.id,
            conversation_id: value.conversation_id,
            sequence: value.sequence,
            role: value.role,
            content_json: value.content.to_string(),
            sources: Vec::new(),
            created_at: value.created_at,
        }
    }
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentRunGql {
    pub id: String,
    pub conversation_id: String,
    pub lane: AgentLaneGql,
    pub status: AgentRunStatusGql,
    pub stage: String,
    pub model_calls: i64,
    pub tool_calls: i64,
    pub error_code: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

impl From<AgentRun> for AgentRunGql {
    fn from(value: AgentRun) -> Self {
        Self {
            id: value.id,
            conversation_id: value.conversation_id,
            lane: value.lane.into(),
            status: value.status.into(),
            stage: value.stage,
            model_calls: value.model_calls,
            tool_calls: value.tool_calls,
            error_code: value.error_code,
            created_at: value.created_at,
            updated_at: value.updated_at,
            completed_at: value.completed_at,
        }
    }
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentRunHandleGql {
    pub run_id: String,
    pub conversation_id: String,
    pub status: AgentRunStatusGql,
}

impl From<AgentRunHandle> for AgentRunHandleGql {
    fn from(value: AgentRunHandle) -> Self {
        Self {
            run_id: value.run_id,
            conversation_id: value.conversation_id,
            status: value.status.into(),
        }
    }
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentRunEventGql {
    pub run_id: String,
    pub sequence: i64,
    pub kind: String,
    pub payload_json: String,
    pub created_at: String,
}

impl From<AgentRunEvent> for AgentRunEventGql {
    fn from(value: AgentRunEvent) -> Self {
        Self {
            run_id: value.run_id,
            sequence: value.sequence,
            kind: value.kind,
            payload_json: value.payload.to_string(),
            created_at: value.created_at,
        }
    }
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentCapabilitiesGql {
    pub enabled: bool,
    pub runtime_version: String,
    pub lanes: Vec<AgentLaneGql>,
    pub model_roles_ready: bool,
    pub memory: bool,
    pub actions: bool,
    pub notebook_assistance: bool,
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentMemoryGql {
    pub id: String,
    pub workspace_id: Option<String>,
    pub kind: String,
    pub subject_key: String,
    pub text: String,
    pub status: String,
    pub pinned: bool,
    pub provenance_excerpt: String,
    pub confidence: f64,
    pub user_edited: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<AgentMemoryRecord> for AgentMemoryGql {
    fn from(value: AgentMemoryRecord) -> Self {
        Self {
            id: value.id,
            workspace_id: value.workspace_id,
            kind: value.kind.as_str().into(),
            subject_key: value.subject_key,
            text: value.text,
            status: value.status.as_str().into(),
            pinned: value.pinned,
            provenance_excerpt: value.provenance_excerpt,
            confidence: value.confidence,
            user_edited: value.user_edited,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(SimpleObject, Clone)]
#[graphql(rename_fields = "camelCase")]
pub struct AgentActionProposalGql {
    pub id: String,
    pub run_id: String,
    pub conversation_id: String,
    pub kind: String,
    pub payload_json: String,
    pub preview_json: String,
    pub status: String,
    pub expires_at: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<AgentActionProposal> for AgentActionProposalGql {
    fn from(value: AgentActionProposal) -> Self {
        Self {
            id: value.id,
            run_id: value.run_id,
            conversation_id: value.conversation_id,
            kind: value.kind,
            payload_json: serde_json::to_string(&value.payload).unwrap_or_default(),
            preview_json: serde_json::to_string(&value.preview).unwrap_or_default(),
            status: value.status,
            expires_at: value.expires_at,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Default)]
pub struct AgentQuery;

#[Object]
impl AgentQuery {
    async fn agent_capabilities(&self, ctx: &Context<'_>) -> Result<AgentCapabilitiesGql> {
        let (_, service) = actor_and_service(ctx).await?;
        let value = service.capabilities();
        Ok(AgentCapabilitiesGql {
            enabled: value.enabled,
            runtime_version: value.runtime_version,
            lanes: value.lanes.into_iter().map(Into::into).collect(),
            model_roles_ready: value.model_roles_ready,
            memory: value.memory,
            actions: value.actions,
            notebook_assistance: value.notebook_assistance,
        })
    }

    async fn agent_conversations(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
        limit: Option<i32>,
    ) -> Result<Vec<AgentConversationGql>> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .list_conversations(
                &actor,
                &AgentScope { workspace_id },
                i64::from(limit.unwrap_or(50)),
            )
            .await
            .map(|values| values.into_iter().map(Into::into).collect())
            .map_err(gql_error)
    }

    async fn agent_messages(
        &self,
        ctx: &Context<'_>,
        conversation_id: String,
        limit: Option<i32>,
    ) -> Result<Vec<AgentMessageGql>> {
        let (actor, service) = actor_and_service(ctx).await?;
        let mut messages: Vec<AgentMessageGql> = service
            .list_messages(&actor, &conversation_id, i64::from(limit.unwrap_or(50)))
            .await
            .map(|values| values.into_iter().map(Into::into).collect())
            .map_err(gql_error)?;
        for message in &mut messages {
            message.sources = service
                .store()
                .evidence_for_message(&actor, &message.id)
                .await
                .map_err(gql_error)?
                .into_iter()
                .map(|evidence| AgentSourceGql {
                    title: evidence.title,
                    source_type: evidence.source_type,
                    excerpt: evidence.excerpt,
                    source_url: evidence.source_url,
                    freshness: evidence.freshness,
                })
                .collect();
        }
        Ok(messages)
    }

    async fn agent_run(&self, ctx: &Context<'_>, run_id: String) -> Result<AgentRunGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .get_run(&actor, &run_id)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn agent_memories(
        &self,
        ctx: &Context<'_>,
        workspace_id: Option<String>,
        include_inactive: Option<bool>,
    ) -> Result<Vec<AgentMemoryGql>> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .list_memories(
                &actor,
                workspace_id.as_deref(),
                include_inactive.unwrap_or(false),
            )
            .await
            .map(|values| values.into_iter().map(Into::into).collect())
            .map_err(gql_error)
    }

    async fn agent_action_proposal(
        &self,
        ctx: &Context<'_>,
        id: String,
    ) -> Result<AgentActionProposalGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .get_action_proposal(&actor, &id)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }
}

#[derive(Default)]
pub struct AgentMutation;

#[Object]
impl AgentMutation {
    async fn create_agent_conversation(
        &self,
        ctx: &Context<'_>,
        workspace_id: String,
    ) -> Result<AgentConversationGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .create_conversation(&actor, &AgentScope { workspace_id })
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn rename_agent_conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: String,
        title: String,
    ) -> Result<AgentConversationGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .rename_conversation(&actor, &conversation_id, &title)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn delete_agent_conversation(
        &self,
        ctx: &Context<'_>,
        conversation_id: String,
    ) -> Result<bool> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .delete_conversation(&actor, &conversation_id)
            .await
            .map_err(gql_error)
    }

    async fn send_agent_message(
        &self,
        ctx: &Context<'_>,
        input: SendAgentMessageInput,
    ) -> Result<AgentRunHandleGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .send_message(
                &actor,
                SendAgentMessage {
                    conversation_id: input.conversation_id,
                    content: input.content,
                    context: input.context.unwrap_or_default().into(),
                    idempotency_key: input.idempotency_key,
                },
            )
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn cancel_agent_run(&self, ctx: &Context<'_>, run_id: String) -> Result<bool> {
        let (actor, service) = actor_and_service(ctx).await?;
        service.cancel_run(&actor, &run_id).await.map_err(gql_error)
    }

    async fn update_agent_memory(
        &self,
        ctx: &Context<'_>,
        id: String,
        text: String,
    ) -> Result<AgentMemoryGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .update_memory(&actor, &id, &text)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn set_agent_memory_pinned(
        &self,
        ctx: &Context<'_>,
        id: String,
        pinned: bool,
    ) -> Result<AgentMemoryGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .set_memory_pinned(&actor, &id, pinned)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn forget_agent_memory(&self, ctx: &Context<'_>, id: String) -> Result<bool> {
        let (actor, service) = actor_and_service(ctx).await?;
        service.forget_memory(&actor, &id).await.map_err(gql_error)
    }

    async fn approve_agent_action(
        &self,
        ctx: &Context<'_>,
        proposal_id: String,
        idempotency_key: String,
    ) -> Result<AgentActionProposalGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .approve_action(&actor, &proposal_id, &idempotency_key)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn reject_agent_action(
        &self,
        ctx: &Context<'_>,
        proposal_id: String,
    ) -> Result<AgentActionProposalGql> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .reject_action(&actor, &proposal_id)
            .await
            .map(Into::into)
            .map_err(gql_error)
    }

    async fn agent_notebook_autocomplete(
        &self,
        ctx: &Context<'_>,
        title: String,
        text: String,
    ) -> Result<String> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .notebook_autocomplete(&actor, &title, &text)
            .await
            .map_err(gql_error)
    }

    async fn agent_notebook_rewrite(
        &self,
        ctx: &Context<'_>,
        action: AgentRewriteAction,
        text: String,
    ) -> Result<String> {
        let (actor, service) = actor_and_service(ctx).await?;
        service
            .notebook_rewrite(&actor, action.into(), &text)
            .await
            .map_err(gql_error)
    }
}

#[derive(Default)]
pub struct AgentSubscription;

struct EventStreamState {
    actor: AgentActor,
    service: Arc<AgentService>,
    run_id: String,
    last_sequence: i64,
    buffered: VecDeque<AgentRunEvent>,
}

#[Subscription]
impl AgentSubscription {
    async fn agent_run_events(
        &self,
        ctx: &Context<'_>,
        run_id: String,
        after_sequence: i32,
    ) -> Result<impl futures_util::Stream<Item = AgentRunEventGql>> {
        if after_sequence < 0 {
            return Err(async_graphql::Error::new(
                "event sequence cannot be negative",
            ));
        }
        let (actor, service) = actor_and_service(ctx).await?;
        service.get_run(&actor, &run_id).await.map_err(gql_error)?;
        Ok(stream::unfold(
            EventStreamState {
                actor,
                service,
                run_id,
                last_sequence: i64::from(after_sequence),
                buffered: VecDeque::new(),
            },
            |mut state| async move {
                loop {
                    if let Some(event) = state.buffered.pop_front() {
                        state.last_sequence = event.sequence;
                        return Some((event.into(), state));
                    }
                    match state
                        .service
                        .replay_events(&state.actor, &state.run_id, state.last_sequence)
                        .await
                    {
                        Ok(events) if !events.is_empty() => {
                            state.buffered.extend(events);
                            continue;
                        }
                        Ok(_) => {}
                        Err(_) => return None,
                    }
                    match state.service.get_run(&state.actor, &state.run_id).await {
                        Ok(run)
                            if matches!(
                                run.status,
                                AgentRunStatus::Completed
                                    | AgentRunStatus::Failed
                                    | AgentRunStatus::Cancelled
                            ) =>
                        {
                            return None;
                        }
                        Err(_) => return None,
                        _ => {}
                    }
                    let wake = state.service.wake_handle();
                    tokio::select! {
                        _ = wake.notified() => {}
                        _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                    }
                }
            },
        ))
    }
}
