//! Ready-made routines an assistant offers as one-click starters. Each tells
//! the assistant which tools to use and how to coach from their results.

use rmcp::{
    handler::server::wrapper::Parameters,
    model::{PromptMessage, Role},
    prompt, prompt_router,
};
use schemars::JsonSchema;
use serde::Deserialize;

use super::tools::TradstryMcp;

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct WorkspaceArg {
    /// A workspace name. Leave it out to include every workspace.
    pub workspace: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TradeArg {
    /// The trade's id, from `find_trades` or `review_period`.
    pub trade_id: String,
}

fn scope(workspace: &Option<String>) -> String {
    workspace
        .as_deref()
        .map(str::trim)
        .filter(|w| !w.is_empty())
        .map_or("across all my workspaces".to_owned(), |w| {
            format!("in my \"{w}\" workspace")
        })
}

fn user(text: String) -> Vec<PromptMessage> {
    vec![PromptMessage::new_text(Role::User, text)]
}

#[prompt_router(vis = "pub(crate)")]
impl TradstryMcp {
    /// Review the past week: results, best and worst trades, leaks, behavior,
    /// and one thing to change next week.
    #[prompt(name = "weekly_review")]
    async fn weekly_review(
        &self,
        Parameters(args): Parameters<WorkspaceArg>,
    ) -> Vec<PromptMessage> {
        user(format!(
            "Review my trading for the past week {}.\n\n\
             1. Call review_period with period 1w.\n\
             2. For the biggest leak it finds, call analyze on that dimension over 3m to see whether it's a pattern or one bad week.\n\
             3. Tell me plainly: how the week went, two things to keep doing, two things that cost me money, and one concrete rule for next week.\n\
             4. If trades have no journal note, list them and offer to journal them with me. Ask before calling journal_trade.\n\n\
             Use dollars and R where available, keep it short, and don't invent numbers the tools didn't return.",
            scope(&args.workspace)
        ))
    }

    /// Prepare for the session: open positions, open plans, recent mistakes,
    /// and sizing for today's ideas.
    #[prompt(name = "premarket_plan")]
    async fn premarket_plan(
        &self,
        Parameters(args): Parameters<WorkspaceArg>,
    ) -> Vec<PromptMessage> {
        user(format!(
            "Help me get ready for today's session {}.\n\n\
             1. Call open_positions and list_plans to see what I'm holding and what I planned.\n\
             2. Call analyze with dimension mistake over 1m and remind me of the mistake that cost me most.\n\
             3. Ask which setups I'm watching today. For each, use size_position with my entry and stop so I know the size before the open.\n\
             4. Offer to save each one with save_plan. Ask before saving.",
            scope(&args.workspace)
        ))
    }

    /// Walk through one trade: what happened, how it matched the plan, and
    /// what to write in the journal.
    #[prompt(name = "trade_postmortem")]
    async fn trade_postmortem(&self, Parameters(args): Parameters<TradeArg>) -> Vec<PromptMessage> {
        user(format!(
            "Do a post-mortem of trade {}.\n\n\
             1. Call get_trade to see the fills, my note, labels and any linked plan.\n\
             2. Judge the entry, exit, size and risk against the plan if there is one, and against my usual results for the same edge (use analyze with dimension edge over 3m).\n\
             3. Ask me two short questions about what I was thinking.\n\
             4. Draft a journal note and any mistake or tag labels, show them to me, and only call journal_trade after I agree.",
            args.trade_id.trim()
        ))
    }
}
