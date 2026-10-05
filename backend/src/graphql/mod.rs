mod agents;
mod analytics;
pub(crate) mod auth;
mod brokerage;
mod journal;
mod journal_flow;
mod market;
mod market_research;
pub mod notifications;
mod playbook;
mod position_calculator;
mod principle;
pub(crate) mod tags;
mod user_prompts;
mod users;
mod workspaces;

pub mod notebook;

use async_graphql::{MergedObject, MergedSubscription, Schema};

#[derive(MergedObject, Default)]
pub struct Query(
    agents::AgentQuery,
    brokerage::BrokerageQuery,
    users::UserQuery,
    workspaces::WorkspaceQuery,
    analytics::AnalyticsQuery,
    playbook::PlaybookQuery,
    principle::PrincipleQuery,
    user_prompts::UserPromptQuery,
    journal::JournalQuery,
    journal_flow::JournalFlowQuery,
    notebook::base::NotebookQuery,
    notebook::sync::NotebookSyncQuery,
    notebook::crdt::NotebookCrdtQuery,
    position_calculator::PositionCalculatorQuery,
    tags::TagQuery,
    market::MarketQuery,
    market_research::MarketResearchQuery,
    notifications::NotificationQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    agents::AgentMutation,
    brokerage::BrokerageMutation,
    workspaces::WorkspaceMutation,
    playbook::PlaybookMutation,
    principle::PrincipleMutation,
    user_prompts::UserPromptMutation,
    journal::JournalMutation,
    journal_flow::JournalFlowMutation,
    notebook::base::NotebookMutation,
    notebook::sync::NotebookSyncMutation,
    notebook::crdt::NotebookCrdtMutation,
    position_calculator::PositionCalculatorMutation,
    tags::TagMutation,
    market_research::MarketResearchMutation,
    notifications::NotificationMutation,
);

#[derive(MergedSubscription, Default)]
pub struct Subscription(
    agents::AgentSubscription,
    market::MarketSubscription,
    notifications::NotificationSubscription,
);

pub fn build_schema(
    agent_service: std::sync::Arc<crate::service::agents::AgentService>,
    brokerage_client: std::sync::Arc<crate::service::brokerage::client::BrokerageClient>,
    snaptrade_oauth_config: crate::service::brokerage::oauth::SnapTradeOAuthConfig,
    redis_client: Option<std::sync::Arc<crate::service::redis::client::RedisClient>>,
    notification_events: notifications::NotificationEventBus,
) -> AppSchema {
    let mut builder = Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .limit_complexity(500)
    .limit_depth(15)
    .limit_recursive_depth(32)
    .limit_directives(50)
    .data(agent_service)
    .data(brokerage_client)
    .data(snaptrade_oauth_config)
    .data(notification_events);

    if let Some(redis) = redis_client {
        builder = builder.data(redis);
    }

    builder.finish()
}

pub type AppSchema = Schema<Query, Mutation, Subscription>;
