// Library entry point for the main server binary, the migration binary and the
// integration tests.

// Proving the merged GraphQL resolvers' futures are `Send` nests deeper than the
// default limit allows; incremental builds hit it intermittently.
#![recursion_limit = "256"]

pub mod graphql;
pub mod ids;
pub mod routes;
pub mod service;
