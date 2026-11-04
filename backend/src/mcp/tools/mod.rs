//! The tools assistants call, one file per tool. Each answers a whole question
//! in one call and returns the numbers as structured content plus a short
//! summary. A new tool adds its file here and its router to [`TradstryMcp::new`].

mod analyze;
mod common;
mod find_trades;
mod get_overview;
mod get_trade;
mod journal_trade;
mod link_plan;
mod list_plans;
mod open_positions;
mod plan_args;
mod review_period;
mod save_plan;
mod size_position;

use std::sync::Arc;

use rmcp::{
    ServerHandler,
    handler::server::router::{prompt::PromptRouter, tool::ToolRouter},
    model::{Implementation, ServerCapabilities, ServerConfig},
    prompt_handler, tool_handler,
};
use sqlx::PgPool;

/// Tools that change the user's journal; they need the `tradstry:write` scope.
pub const WRITE_TOOLS: [&str; 3] = ["journal_trade", "save_plan", "link_plan"];

const INSTRUCTIONS: &str = "Tradstry is the user's trading journal. Results come from their closed trades, \
in US dollars, with days and sessions in New York time; R is profit over the risk recorded for a trade. \
Prefer one well-chosen call: review_period for reviews, analyze for 'where do I win or lose', find_trades \
then get_trade for specific trades. Ask the user before calling journal_trade, save_plan or link_plan.";

#[derive(Clone)]
pub struct TradstryMcp {
    pool: PgPool,
    /// The protected resource metadata URL, for write-permission challenges.
    metadata_url: Arc<str>,
    tool_router: ToolRouter<Self>,
    prompt_router: PromptRouter<Self>,
}

impl TradstryMcp {
    pub fn new(pool: PgPool, metadata_url: Arc<str>) -> Self {
        Self {
            pool,
            metadata_url,
            tool_router: Self::get_overview_router()
                + Self::review_period_router()
                + Self::analyze_router()
                + Self::find_trades_router()
                + Self::get_trade_router()
                + Self::open_positions_router()
                + Self::list_plans_router()
                + Self::size_position_router()
                + Self::journal_trade_router()
                + Self::save_plan_router()
                + Self::link_plan_router(),
            prompt_router: Self::prompt_router(),
        }
    }
}

#[tool_handler(router = self.tool_router)]
#[prompt_handler(router = self.prompt_router)]
impl ServerHandler for TradstryMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_prompts()
                .build(),
        )
        .with_server_info(Implementation::new("tradstry", env!("CARGO_PKG_VERSION")))
        .with_instructions(INSTRUCTIONS)
    }
}
