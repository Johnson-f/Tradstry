mod account;
mod analytics;
mod brokerage;
mod changes;
mod errors;
mod journal;
mod me;
mod plans;
mod routes;
mod settings;
mod trades;
mod user;
mod workspaces;

use std::sync::Arc;

use async_graphql::{MergedObject, MergedSubscription, Schema};
use sqlx::PgPool;

use crate::{auth::stytch::StytchApi, brokerage::Brokerage};

pub use routes::{SESSION_ENDED_CLOSE_CODE, graphiql, graphql_handler, graphql_ws_handler};
pub use user::RequestUser;

#[derive(MergedObject, Default)]
pub struct Query(
    me::MeQuery,
    account::AccountQuery,
    workspaces::WorkspaceQuery,
    brokerage::BrokerageQuery,
    brokerage::ImportQuery,
    trades::TradeQuery,
    journal::JournalQuery,
    analytics::AnalyticsQuery,
    settings::SettingsQuery,
    plans::PlanQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    account::AccountMutation,
    workspaces::WorkspaceMutation,
    brokerage::BrokerageMutation,
    brokerage::ImportMutation,
    trades::TradeMutation,
    journal::JournalMutation,
    settings::SettingsMutation,
    plans::PlanMutation,
);

#[derive(MergedSubscription, Default)]
pub struct Subscription(changes::ChangeSubscription);

pub type AppSchema = Schema<Query, Mutation, Subscription>;

pub fn build_schema(
    pool: PgPool,
    stytch: Arc<dyn StytchApi>,
    brokerage: Option<Arc<Brokerage>>,
) -> AppSchema {
    let mut builder = Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .data(crate::realtime::Hub::new(pool.clone()))
    .data(pool)
    .data(stytch);
    if let Some(brokerage) = brokerage {
        builder = builder.data(brokerage);
    }
    builder.finish()
}
