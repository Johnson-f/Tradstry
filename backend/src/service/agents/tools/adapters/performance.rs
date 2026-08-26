use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolPolicy, ToolResult, ToolSchema,
};

use super::super::{ToolScopeApplied, persist_tool_result};
use crate::service::agents::NewAgentEvidence;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::read_service::analytics::{self, AnalyticsTimeFilter};

pub struct TradingPerformanceTool;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PerformanceRange {
    Today,
    #[serde(rename = "last_7_days")]
    Last7Days,
    #[serde(rename = "last_30_days")]
    Last30Days,
    YearToDate,
    #[serde(rename = "last_1_year")]
    Last1Year,
    All,
    Custom,
}

#[derive(Debug, Deserialize)]
struct PerformanceArgs {
    range: PerformanceRange,
    date_from: Option<String>,
    date_to: Option<String>,
}

#[async_trait]
impl Tool<AgentRuntimeState> for TradingPerformanceTool {
    fn name(&self) -> &str {
        "trading_performance"
    }

    fn description(&self) -> &str {
        "Returns canonical realized trading performance for the authenticated Tradstry workspace."
    }

    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({
                "type": "object",
                "properties": {
                    "range": {
                        "type": "string",
                        "enum": ["today", "last_7_days", "last_30_days", "year_to_date", "last_1_year", "all", "custom"]
                    },
                    "date_from": {"type": "string"},
                    "date_to": {"type": "string"}
                },
                "required": ["range"]
            }),
        )
    }

    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("Trading performance is temporarily unavailable.".into())
    }

    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let args: PerformanceArgs = serde_json::from_value(call.arguments.clone())
            .map_err(|error| tinyagents::TinyAgentsError::Validation(error.to_string()))?;
        let filter = to_filter(&args)?;
        let user_db = state.db.get_user_db(&state.actor.user_id);
        let value =
            analytics::get_trading_performance(&user_db, &state.scope.workspace_id, &filter)
                .await
                .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
        let date_range = match (&args.date_from, &args.date_to) {
            (Some(from), Some(to)) => Some(crate::service::agents::AgentDateRange {
                from: from.clone(),
                to: to.clone(),
            }),
            _ => None,
        };
        let summary = format!(
            "Canonical trading performance: {} closed trades, win rate {:.2}%, realized P&L {:.2}.",
            value.closed_trade_count, value.win_rate, value.total_realized_pnl
        );
        persist_tool_result(
            state,
            &call,
            value.clone(),
            ToolScopeApplied {
                workspace_id: state.scope.workspace_id.clone(),
                date_range,
                ..Default::default()
            },
            vec![NewAgentEvidence {
                tool_call_id: None,
                source_type: "calculation".into(),
                source_id: format!("trading-performance:{}", state.scope.workspace_id),
                source_version: "trading-performance-v1".into(),
                title: "Trading performance".into(),
                excerpt: summary.clone(),
                source_url: None,
                freshness: "canonical".into(),
                payload: serde_json::to_value(&value).unwrap_or_default(),
            }],
            Vec::new(),
            summary,
        )
        .await
    }
}

fn to_filter(args: &PerformanceArgs) -> tinyagents::Result<AnalyticsTimeFilter> {
    Ok(match args.range {
        PerformanceRange::Today => AnalyticsTimeFilter::Today,
        PerformanceRange::Last7Days => AnalyticsTimeFilter::Last7Days,
        PerformanceRange::Last30Days => AnalyticsTimeFilter::Last1Month,
        PerformanceRange::YearToDate => AnalyticsTimeFilter::YearToDate,
        PerformanceRange::Last1Year => AnalyticsTimeFilter::Last1Year,
        PerformanceRange::All => AnalyticsTimeFilter::All,
        PerformanceRange::Custom => AnalyticsTimeFilter::Custom {
            start_date: args.date_from.clone().ok_or_else(|| {
                tinyagents::TinyAgentsError::Validation(
                    "custom performance range requires date_from".into(),
                )
            })?,
            end_date: args.date_to.clone().ok_or_else(|| {
                tinyagents::TinyAgentsError::Validation(
                    "custom performance range requires date_to".into(),
                )
            })?,
        },
    })
}
