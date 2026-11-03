//! The tools assistants call, one file per tool. Each answers a whole question
//! in one call and returns the numbers as structured content plus a one-line
//! summary. A new tool adds its file here and its router to [`TradstryMcp::new`].

mod common;
mod get_overview;

use rmcp::{
    ServerHandler,
    handler::server::router::tool::ToolRouter,
    model::{Implementation, ServerCapabilities, ServerConfig},
    tool_handler,
};
use sqlx::PgPool;

const INSTRUCTIONS: &str = "Tradstry is the user's trading journal. Numbers are computed from their closed trades, \
in US dollars, with days and sessions in New York time. Prefer one well-chosen tool call over many.";

#[derive(Clone)]
pub struct TradstryMcp {
    pool: PgPool,
    tool_router: ToolRouter<Self>,
}

impl TradstryMcp {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            tool_router: Self::get_overview_router(),
        }
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for TradstryMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("tradstry", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}
