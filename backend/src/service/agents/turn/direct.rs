use std::sync::Arc;

use serde_json::json;
use tinyagents::harness::tool::{Tool, ToolCall};

use crate::service::agents::answer::{journal_answer, performance_answer};
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::tools::ToolEnvelope;
use crate::service::agents::tools::adapters::{JournalRecordsTool, TradingPerformanceTool};
use crate::service::agents::{
    AgentActor, AgentError, AgentIntent, AgentMessageContext, AgentResult, AgentRun, AgentScope,
    AgentService,
};
use crate::service::db::Db;
use crate::service::db::schema::tables::journal_table::JournalEntry;
use crate::service::trading_performance::TradingPerformance;

pub async fn execute(
    service: &AgentService,
    run: &AgentRun,
    lease_owner: &str,
    context: AgentMessageContext,
    intent: AgentIntent,
    cancellation: tinyagents::CancellationToken,
) -> AgentResult<bool> {
    let supported = matches!(
        intent,
        AgentIntent::PerformanceSnapshot | AgentIntent::TradeLookup
    );
    if !supported {
        return Ok(false);
    }
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
        cancellation,
    };
    let answer = match intent {
        AgentIntent::PerformanceSnapshot => {
            let args = context.date_range.map_or_else(
                || json!({"range": "last_30_days"}),
                |range| json!({"range": "custom", "date_from": range.from, "date_to": range.to}),
            );
            let result = TradingPerformanceTool
                .call(
                    &state,
                    ToolCall::new("direct-performance", "trading_performance", args),
                )
                .await
                .map_err(tool_failure)?;
            let envelope: ToolEnvelope<TradingPerformance> =
                serde_json::from_value(result.raw.ok_or(AgentError::Internal)?)
                    .map_err(|_| AgentError::Internal)?;
            performance_answer(&envelope)
        }
        AgentIntent::TradeLookup => {
            let result = JournalRecordsTool
                .call(
                    &state,
                    ToolCall::new("direct-journal", "journal_records", json!({"limit": 50})),
                )
                .await
                .map_err(tool_failure)?;
            let envelope: ToolEnvelope<Vec<JournalEntry>> =
                serde_json::from_value(result.raw.ok_or(AgentError::Internal)?)
                    .map_err(|_| AgentError::Internal)?;
            journal_answer(&envelope)
        }
        AgentIntent::PlaybookLookup | AgentIntent::MarketQuote | AgentIntent::MarketNews => {
            unreachable!("unsupported direct intent checked above")
        }
    };
    service
        .store()
        .complete_claimed_answer(&run.id, lease_owner, &answer)
        .await?;
    service.wake_handle().notify_waiters();
    Ok(true)
}

fn tool_failure(error: tinyagents::TinyAgentsError) -> AgentError {
    match error {
        tinyagents::TinyAgentsError::Cancelled => AgentError::Cancelled,
        _ => AgentError::Internal,
    }
}
