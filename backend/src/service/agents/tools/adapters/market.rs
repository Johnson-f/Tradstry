use async_trait::async_trait;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolPolicy, ToolResult, ToolSchema,
};

use super::super::{ToolScopeApplied, persist_tool_result};
use crate::service::agents::NewAgentEvidence;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::market::research;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketToolKind {
    Price,
    News,
    Company,
    Financials,
    Earnings,
}

impl MarketToolKind {
    fn name(self) -> &'static str {
        match self {
            Self::Price => "market_price",
            Self::News => "market_news",
            Self::Company => "market_company",
            Self::Financials => "market_financials",
            Self::Earnings => "market_earnings",
        }
    }
}

pub struct MarketTool(pub MarketToolKind);

#[derive(Debug, Deserialize)]
struct MarketArgs {
    symbol: String,
    quarter: Option<i32>,
    year: Option<i32>,
}

#[async_trait]
impl Tool<AgentRuntimeState> for MarketTool {
    fn name(&self) -> &str {
        self.0.name()
    }

    fn description(&self) -> &str {
        match self.0 {
            MarketToolKind::Price => "Returns a fresh external market price for one symbol.",
            MarketToolKind::News => "Returns up to 12 recent external news records for one symbol.",
            MarketToolKind::Company => {
                "Returns bounded external company profile data for one symbol."
            }
            MarketToolKind::Financials => {
                "Returns bounded external annual financial statements for one symbol."
            }
            MarketToolKind::Earnings => {
                "Returns an external earnings transcript or available transcript dates for one symbol."
            }
        }
    }

    fn schema(&self) -> ToolSchema {
        let mut properties = json!({
            "symbol": {"type": "string", "minLength": 1, "maxLength": 20}
        });
        if self.0 == MarketToolKind::Earnings {
            properties["quarter"] = json!({"type": "integer", "minimum": 1, "maximum": 4});
            properties["year"] = json!({"type": "integer", "minimum": 1990, "maximum": 2200});
        }
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({"type": "object", "properties": properties, "required": ["symbol"]}),
        )
    }

    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("External market research is temporarily unavailable.".into())
    }

    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let mut args: MarketArgs = serde_json::from_value(call.arguments.clone())
            .map_err(|error| tinyagents::TinyAgentsError::Validation(error.to_string()))?;
        if let Some(symbol) = state.message_context.market_symbol.as_deref() {
            args.symbol = symbol.into();
        }
        let symbol = normalize_symbol(&args.symbol)?;
        let retrieved_at = Utc::now().to_rfc3339();
        let (mut value, source_url, title) = match self.0 {
            MarketToolKind::Price => (
                json!({"symbol": symbol, "price": research::price(&symbol).await.map_err(provider_error)?}),
                format!("https://finance.yahoo.com/quote/{symbol}"),
                format!("{symbol} market price"),
            ),
            MarketToolKind::News => (
                serde_json::to_value(
                    research::news(&symbol)
                        .await
                        .map_err(provider_error)?
                        .into_iter()
                        .take(12)
                        .collect::<Vec<_>>(),
                )
                .map_err(serialization_error)?,
                format!("https://finance.yahoo.com/quote/{symbol}/news"),
                format!("{symbol} market news"),
            ),
            MarketToolKind::Company => (
                research::company(&symbol).await.map_err(provider_error)?,
                format!("https://finance.yahoo.com/quote/{symbol}/profile"),
                format!("{symbol} company profile"),
            ),
            MarketToolKind::Financials => (
                research::financials(&symbol)
                    .await
                    .map_err(provider_error)?,
                format!("https://finance.yahoo.com/quote/{symbol}/financials"),
                format!("{symbol} financial statements"),
            ),
            MarketToolKind::Earnings => match (args.quarter, args.year) {
                (Some(quarter), Some(year)) => {
                    let transcript = research::transcript(&symbol, quarter, year)
                        .await
                        .map_err(provider_error)?;
                    let url = transcript.source_url.clone();
                    (
                        serde_json::to_value(transcript).map_err(serialization_error)?,
                        url,
                        format!("{symbol} Q{quarter} {year} earnings transcript"),
                    )
                }
                (None, None) => (
                    serde_json::to_value(
                        research::transcript_list(&symbol)
                            .await
                            .map_err(provider_error)?
                            .into_iter()
                            .take(20)
                            .collect::<Vec<_>>(),
                    )
                    .map_err(serialization_error)?,
                    format!("https://financialmodelingprep.com/earnings-call-transcript/{symbol}"),
                    format!("{symbol} earnings transcripts"),
                ),
                _ => {
                    return Err(tinyagents::TinyAgentsError::Validation(
                        "quarter and year must be supplied together".into(),
                    ));
                }
            },
        };
        bound_external_value(&mut value, 0);
        let excerpt = format!("External {} data retrieved at {retrieved_at}.", self.name());
        let evidence = vec![NewAgentEvidence {
            tool_call_id: None,
            source_type: self.name().into(),
            source_id: format!("{}:{symbol}", self.name()),
            source_version: retrieved_at.clone(),
            title,
            excerpt: excerpt.clone(),
            source_url: Some(source_url),
            freshness: "external".into(),
            payload: value.clone(),
        }];
        persist_tool_result(
            state,
            &call,
            value,
            ToolScopeApplied {
                workspace_id: state.scope.workspace_id.clone(),
                symbols: vec![symbol],
                ..Default::default()
            },
            evidence,
            vec!["External market data can change after retrieval.".into()],
            excerpt,
        )
        .await
    }
}

fn normalize_symbol(value: &str) -> tinyagents::Result<String> {
    let symbol = value.trim().to_ascii_uppercase();
    if symbol.is_empty()
        || symbol.len() > 20
        || !symbol
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '^'))
    {
        return Err(tinyagents::TinyAgentsError::Validation(
            "invalid market symbol".into(),
        ));
    }
    Ok(symbol)
}

fn bound_external_value(value: &mut Value, depth: usize) {
    if depth > 8 {
        *value = Value::String("[truncated]".into());
        return;
    }
    match value {
        Value::String(text) => {
            if text.chars().count() > 12_000 {
                *text = text.chars().take(12_000).collect();
            }
        }
        Value::Array(values) => {
            values.truncate(30);
            for child in values {
                bound_external_value(child, depth + 1);
            }
        }
        Value::Object(object) => {
            for child in object.values_mut() {
                bound_external_value(child, depth + 1);
            }
        }
        _ => {}
    }
}

fn provider_error(error: anyhow::Error) -> tinyagents::TinyAgentsError {
    log::warn!("agent market provider failed: {error}");
    tinyagents::TinyAgentsError::Tool("external market provider unavailable".into())
}

fn serialization_error(error: serde_json::Error) -> tinyagents::TinyAgentsError {
    tinyagents::TinyAgentsError::Tool(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_external_strings_are_truncated_on_character_boundaries() {
        let mut value = Value::String("🦀".repeat(12_100));
        bound_external_value(&mut value, 0);
        assert_eq!(value.as_str().unwrap().chars().count(), 12_000);
    }

    #[test]
    fn symbols_are_strictly_normalized() {
        assert_eq!(normalize_symbol(" brk.b ").unwrap(), "BRK.B");
        assert!(normalize_symbol("AAPL; delete").is_err());
    }
}
