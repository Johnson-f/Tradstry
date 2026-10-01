use crate::agent_support::AgentPgFixture;
use serde_json::json;
use tinyagents::harness::tool::{Tool, ToolCall};
use tradstry_backend::service::agents::runtime::AgentRuntimeState;
use tradstry_backend::service::agents::tools::ToolEnvelope;
use tradstry_backend::service::agents::tools::adapters::{
    JournalRecordsTool, TradingPerformanceTool,
};
use tradstry_backend::service::agents::{AgentMessageContext, AgentStore};
use tradstry_backend::service::db::schema::tables::journal_table::{
    CreateJournalEntryInput, JournalEntry,
};
use tradstry_backend::service::read_service::analytics::{self, AnalyticsTimeFilter};
use tradstry_backend::service::read_service::journal;
use tradstry_backend::service::trading_performance::TradingPerformance;

async fn runtime(fixture: &AgentPgFixture, context: AgentMessageContext) -> AgentRuntimeState {
    let run = fixture
        .create_run(&tradstry_backend::ids::new_uuid_v7().to_string())
        .await;
    AgentRuntimeState {
        db: fixture.db.clone(),
        store: AgentStore::new(fixture.pool.clone()),
        r2: None,
        knowledge: None,
        actor: fixture.actor.clone(),
        scope: fixture.scope.clone(),
        message_context: context,
        run_id: run.id,
        cancellation: tinyagents::CancellationToken::new(),
    }
}

#[tokio::test]
async fn performance_tool_matches_canonical_service_and_persists_evidence() {
    let fixture = AgentPgFixture::new().await;
    let state = runtime(&fixture, AgentMessageContext::default()).await;
    let user_db = fixture.db.get_user_db(&fixture.actor.user_id);
    let canonical = analytics::get_trading_performance(
        &user_db,
        &fixture.scope.workspace_id,
        &AnalyticsTimeFilter::All,
    )
    .await
    .unwrap();
    let result = TradingPerformanceTool
        .call(
            &state,
            ToolCall::new(
                "call-performance",
                "trading_performance",
                json!({"range": "all"}),
            ),
        )
        .await
        .unwrap();
    let envelope: ToolEnvelope<TradingPerformance> =
        serde_json::from_value(result.raw.unwrap()).unwrap();
    assert_eq!(envelope.data.unwrap(), canonical);
    assert_eq!(envelope.evidence.len(), 1);
    let evidence_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM agent_evidence WHERE run_id = $1")
            .bind(&state.run_id)
            .fetch_one(&fixture.pool)
            .await
            .unwrap();
    assert_eq!(evidence_count, 1);
}

#[tokio::test]
async fn attached_trade_scope_overrides_model_filters() {
    let fixture = AgentPgFixture::new().await;
    let user_db = fixture.db.get_user_db(&fixture.actor.user_id);
    let trade = journal::create_journal_entry(
        &user_db,
        CreateJournalEntryInput {
            workspace_id: fixture.scope.workspace_id.clone(),
            open_date: "2026-08-01T14:00:00Z".into(),
            close_date: "2026-08-01T15:00:00Z".into(),
            entry_price: 10.0,
            exit_price: 11.0,
            position_size: 10.0,
            symbol: "AAPL".into(),
            symbol_name: Some("Apple".into()),
            stop_loss: 9.0,
            trade_type: "long".into(),
            playbook_id: None,
            notes: Some("followed plan".into()),
            broke_30min_rule: None,
            pre_trade_conviction: None,
            market_regime: None,
            is_planned_pre_market: None,
            revenge_trade: None,
            rule_adherence_score: None,
            contract_multiplier: Some(1.0),
            brokerage_transaction_ids: None,
            tag_ids: Vec::new(),
            violated_principle_ids: Vec::new(),
        },
    )
    .await
    .unwrap();
    let state = runtime(
        &fixture,
        AgentMessageContext {
            trade_ids: vec![trade.id.clone()],
            ..Default::default()
        },
    )
    .await;
    let result = JournalRecordsTool
        .call(
            &state,
            ToolCall::new(
                "call-journal",
                "journal_records",
                json!({"symbol": "MSFT", "limit": 20}),
            ),
        )
        .await
        .unwrap();
    let envelope: ToolEnvelope<Vec<JournalEntry>> =
        serde_json::from_value(result.raw.unwrap()).unwrap();
    let entries = envelope.data.unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, trade.id);
    assert_eq!(envelope.scope.trade_ids, vec![trade.id]);
}
