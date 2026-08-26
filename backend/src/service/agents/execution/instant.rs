use std::sync::Arc;

use serde_json::json;
use tinyagents::harness::tool::{Tool, ToolCall};

use crate::service::agents::answer::{journal_answer, performance_answer};
use crate::service::agents::routing::InstantIntent;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::tools::ToolEnvelope;
use crate::service::agents::tools::adapters::{JournalRecordsTool, TradingPerformanceTool};
use crate::service::agents::{
    AgentActor, AgentError, AgentMessageContext, AgentResult, AgentRun, AgentScope, AgentService,
};
use crate::service::db::Db;
use crate::service::db::schema::tables::journal_table::JournalEntry;
use crate::service::trading_performance::TradingPerformance;

pub async fn execute_instant(
    service: &AgentService,
    run: &AgentRun,
    lease_owner: &str,
    context: AgentMessageContext,
    intent: InstantIntent,
) -> AgentResult<()> {
    let state = AgentRuntimeState {
        db: Arc::new(Db::from_pool(service.store().pool().clone())),
        store: service.store().clone(),
        r2: service.r2().cloned(),
        knowledge: service.knowledge().cloned(),
        actor: AgentActor {
            user_id: run.user_id.clone(),
            clerk_id: String::new(),
        },
        scope: AgentScope {
            workspace_id: run.workspace_id.clone(),
        },
        message_context: context.clone(),
        run_id: run.id.clone(),
        cancellation: tinyagents::CancellationToken::new(),
    };
    let answer = match intent {
        InstantIntent::Performance => {
            let args = context.date_range.map_or_else(
                || json!({"range": "last_30_days"}),
                |range| json!({"range": "custom", "date_from": range.from, "date_to": range.to}),
            );
            let result = TradingPerformanceTool
                .call(
                    &state,
                    ToolCall::new("instant-performance", "trading_performance", args),
                )
                .await
                .map_err(tool_failure)?;
            let envelope: ToolEnvelope<TradingPerformance> =
                serde_json::from_value(result.raw.ok_or(AgentError::Internal)?)
                    .map_err(|_| AgentError::Internal)?;
            performance_answer(&envelope)
        }
        InstantIntent::TradeLookup => {
            let result = JournalRecordsTool
                .call(
                    &state,
                    ToolCall::new("instant-journal", "journal_records", json!({"limit": 50})),
                )
                .await
                .map_err(tool_failure)?;
            let envelope: ToolEnvelope<Vec<JournalEntry>> =
                serde_json::from_value(result.raw.ok_or(AgentError::Internal)?)
                    .map_err(|_| AgentError::Internal)?;
            journal_answer(&envelope)
        }
    };
    service
        .store()
        .complete_claimed_answer(&run.id, lease_owner, &answer, &json!({ "answer": answer }))
        .await?;
    service.wake_handle().notify_waiters();
    Ok(())
}

fn tool_failure(error: tinyagents::TinyAgentsError) -> AgentError {
    log::error!("instant agent tool failed: {error}");
    match error {
        tinyagents::TinyAgentsError::Cancelled => AgentError::Cancelled,
        _ => AgentError::Internal,
    }
}
