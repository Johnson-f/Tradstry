//! Live, non-mutating smoke check for the TinyAgents Gemini model and Voyage provider.

use std::sync::Arc;

use anyhow::{Context, Result, ensure};
use sqlx::postgres::PgPoolOptions;
use tinyagents::harness::context::RunConfig;
use tinyagents::harness::message::Message;
use tinyagents::harness::runtime::AgentHarness;
use tradstry_backend::service::agents::knowledge::VoyageClient;
use tradstry_backend::service::agents::runtime::{
    AgentModelRegistry, AgentRuntimeState, ModelRole, build_run_policy,
};
use tradstry_backend::service::agents::{
    AgentActor, AgentConfig, AgentMessageContext, AgentScope, AgentStore,
};
use tradstry_backend::service::db::Db;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let config = AgentConfig::from_env()?;
    let models = AgentModelRegistry::from_config(&config)?;
    let voyage = VoyageClient::from_env()?;
    let vectors = voyage
        .embed_texts(
            [
                "Reduce position size when volatility rises.",
                "Sourdough benefits from cold fermentation.",
            ],
            Some("document"),
        )
        .await
        .context("Voyage embedding smoke failed")?;
    ensure!(vectors.len() == 2, "Voyage returned the wrong vector count");
    ensure!(
        vectors
            .iter()
            .all(|vector| vector.len() == voyage.config().output_dimension as usize),
        "Voyage returned an unexpected vector dimension"
    );
    let reranked = voyage
        .rerank(
            "How should I react to volatility?",
            vec![
                "Reduce position size when volatility rises.".into(),
                "Sourdough benefits from cold fermentation.".into(),
            ],
            Some(2),
        )
        .await
        .context("Voyage rerank smoke failed")?;
    ensure!(
        reranked.first().is_some_and(|result| result.index == 0),
        "Voyage did not rank the relevant text first"
    );

    let postgres_url = std::env::var("POSTGRES_URL").context("POSTGRES_URL is required")?;
    let pool = PgPoolOptions::new().connect_lazy(&postgres_url)?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let state = AgentRuntimeState {
        db: Arc::new(Db::from_pool(pool.clone())),
        store: AgentStore::new(pool),
        r2: None,
        knowledge: None,
        actor: AgentActor {
            user_id: "live-smoke".into(),
            clerk_id: "live-smoke".into(),
        },
        scope: AgentScope {
            workspace_id: "live-smoke".into(),
        },
        message_context: AgentMessageContext::default(),
        run_id: request_id.clone(),
        cancellation: tinyagents::CancellationToken::new(),
    };
    let mut harness = AgentHarness::new();
    harness
        .register_model("smoke", models.primary(ModelRole::Fast))
        .set_default_model("smoke")
        .with_policy(build_run_policy());
    let result = harness
        .invoke(
            &state,
            (),
            RunConfig::new(&request_id)
                .with_max_model_calls(1)
                .with_max_tool_calls(0)
                .with_max_turn_output_tokens(64),
            vec![
                Message::system("Return only the exact token requested."),
                Message::user("Return exactly LIVE_TINYAGENTS_OK_73"),
            ],
        )
        .await
        .context("TinyAgents Gemini smoke failed")?;
    ensure!(
        result
            .text()
            .is_some_and(|text| text.trim() == "LIVE_TINYAGENTS_OK_73"),
        "Gemini did not preserve the exact smoke token"
    );
    println!("TinyAgents Gemini and Voyage smoke checks passed");
    Ok(())
}
