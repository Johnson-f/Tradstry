mod account;
mod me;
mod routes;
mod ticks;

use std::sync::Arc;

use async_graphql::{MergedObject, MergedSubscription, Schema};

use crate::stytch::StytchApi;

pub use routes::{SESSION_ENDED_CLOSE_CODE, graphiql, graphql_handler, graphql_ws_handler};

#[derive(MergedObject, Default)]
pub struct Query(me::MeQuery, account::AccountQuery);

#[derive(MergedObject, Default)]
pub struct Mutation(account::AccountMutation);

#[derive(MergedSubscription, Default)]
pub struct Subscription(ticks::TicksSubscription);

pub type AppSchema = Schema<Query, Mutation, Subscription>;

pub fn build_schema(stytch: Arc<dyn StytchApi>) -> AppSchema {
    Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .data(stytch)
    .finish()
}
