mod account;
mod brokerage;
mod errors;
mod journal;
mod me;
mod routes;
mod ticks;
mod trades;
mod user;
mod workspaces;

use std::sync::Arc;

use async_graphql::{MergedObject, MergedSubscription, Schema};
use sqlx::PgPool;

use crate::auth::stytch::StytchApi;
use crate::brokerage::Brokerage;

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
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    account::AccountMutation,
    workspaces::WorkspaceMutation,
    brokerage::BrokerageMutation,
    brokerage::ImportMutation,
    trades::TradeMutation,
    journal::JournalMutation,
);

#[derive(MergedSubscription, Default)]
pub struct Subscription(ticks::TicksSubscription);

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
    .data(pool)
    .data(stytch);
    if let Some(brokerage) = brokerage {
        builder = builder.data(brokerage);
    }
    builder.finish()
}
