use async_trait::async_trait;
use tinyagents::harness::context::RunContext;
use tinyagents::harness::message::Message;
use tinyagents::harness::middleware::Middleware;
use tinyagents::harness::model::ModelResponse;
use tinyagents::harness::tool::ToolResult;

use crate::service::agents::runtime::AgentRuntimeState;

pub struct TurnJournalMiddleware;

#[async_trait]
impl Middleware<AgentRuntimeState> for TurnJournalMiddleware {
    fn name(&self) -> &str {
        "tradstry_turn_journal"
    }

    async fn after_model(
        &self,
        ctx: &mut RunContext<()>,
        state: &AgentRuntimeState,
        response: &mut ModelResponse,
    ) -> tinyagents::Result<()> {
        state
            .store
            .append_run_item(
                ctx.run_id().as_str(),
                &Message::Assistant(response.message.clone()),
            )
            .await
            .map_err(persistence_error)?;
        Ok(())
    }

    async fn after_tool(
        &self,
        ctx: &mut RunContext<()>,
        state: &AgentRuntimeState,
        result: &mut ToolResult,
    ) -> tinyagents::Result<()> {
        state
            .store
            .append_run_item(ctx.run_id().as_str(), &Message::tool_from_result(result))
            .await
            .map_err(persistence_error)?;
        Ok(())
    }
}

fn persistence_error(error: crate::service::agents::AgentError) -> tinyagents::TinyAgentsError {
    log::error!("agent turn journal persistence failed: {error}");
    tinyagents::TinyAgentsError::Tool("Tradstry could not persist the agent transcript".into())
}
