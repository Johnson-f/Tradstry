//! Read-only evaluation harness for the TinyAgents knowledge service.

use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use tradstry_backend::service::agents::AgentActor;
use tradstry_backend::service::agents::knowledge::{
    KnowledgeSearchRequest, KnowledgeService, VoyageClient, VoyageEmbeddingProvider, VoyageReranker,
};

const DEFAULT_AUTO_CASES: usize = 8;
const DEFAULT_MIN_HIT_RATE_AT_5: f64 = 0.80;
const DEFAULT_MIN_MRR: f64 = 0.60;

#[derive(Deserialize)]
struct Fixtures {
    user_id: String,
    workspace_id: String,
    min_hit_rate_at_5: Option<f64>,
    min_mrr: Option<f64>,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    query: String,
    expected_source_ids: Vec<String>,
    #[serde(skip)]
    source_type: Option<String>,
}

#[derive(sqlx::FromRow)]
struct IndexedSource {
    user_id: String,
    workspace_id: String,
    source_type: String,
    source_id: String,
    title: String,
    excerpt: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let pool = read_only_pool().await?;
    let fixtures = if args.first().is_some_and(|arg| arg == "--auto") {
        let count = args
            .get(1)
            .map(|value| value.parse::<usize>())
            .transpose()
            .context("--auto case count must be a positive integer")?
            .unwrap_or(DEFAULT_AUTO_CASES);
        if count == 0 || count > 25 {
            bail!("--auto case count must be between 1 and 25");
        }
        build_auto_fixtures(&pool, count).await?
    } else {
        let path = args
            .first()
            .cloned()
            .unwrap_or_else(|| "rag_eval_fixtures.json".into());
        let raw = std::fs::read_to_string(&path).with_context(|| format!("read {path}"))?;
        let fixtures: Fixtures = serde_json::from_str(&raw).context("parse fixtures")?;
        reject_placeholders(&fixtures)?;
        fixtures
    };
    let voyage = Arc::new(VoyageClient::from_env()?);
    let knowledge = KnowledgeService::new(
        pool,
        Arc::new(VoyageEmbeddingProvider::new(voyage.clone())),
        Arc::new(VoyageReranker::new(voyage)),
    )?;
    run_eval(&knowledge, &fixtures).await
}

fn reject_placeholders(fixtures: &Fixtures) -> Result<()> {
    if fixtures.user_id.contains("REPLACE_")
        || fixtures.workspace_id.contains("REPLACE_")
        || fixtures.cases.iter().any(|case| {
            case.expected_source_ids
                .iter()
                .any(|id| id.contains("REPLACE_"))
        })
    {
        bail!("fixture contains placeholder IDs; provide safe fixture values or use --auto");
    }
    if fixtures.cases.is_empty() {
        bail!("fixture must contain at least one case");
    }
    Ok(())
}

async fn run_eval(knowledge: &KnowledgeService, fixtures: &Fixtures) -> Result<()> {
    let actor = AgentActor {
        user_id: fixtures.user_id.clone(),
        clerk_id: "rag-eval".into(),
    };
    let ks = [1usize, 3, 5, 10];
    let mut hits = [0u32; 4];
    let mut reciprocal_rank_sum = 0.0;
    let mut latencies = Vec::with_capacity(fixtures.cases.len());
    for (index, case) in fixtures.cases.iter().enumerate() {
        let started = Instant::now();
        let results = knowledge
            .search(
                &actor,
                KnowledgeSearchRequest {
                    workspace_id: fixtures.workspace_id.clone(),
                    query: case.query.clone(),
                    limit: 10,
                    ..Default::default()
                },
            )
            .await?;
        latencies.push(started.elapsed().as_secs_f64() * 1_000.0);
        let first_hit = results.iter().position(|hit| {
            case.expected_source_ids
                .iter()
                .any(|expected| expected == &hit.source_id)
        });
        if let Some(position) = first_hit {
            reciprocal_rank_sum += 1.0 / (position as f64 + 1.0);
            for (metric, k) in ks.iter().enumerate() {
                if position < *k {
                    hits[metric] += 1;
                }
            }
        }
        println!(
            "case {:02} type={:<16} first_hit_rank={:?} latency_ms={:.0}",
            index + 1,
            case.source_type.as_deref().unwrap_or("fixture"),
            first_hit.map(|position| position + 1),
            latencies.last().copied().unwrap_or_default()
        );
    }
    let count = fixtures.cases.len() as f64;
    let hit_rate_at_5 = hits[2] as f64 / count;
    let mrr = reciprocal_rank_sum / count;
    latencies.sort_by(f64::total_cmp);
    println!(
        "\n=== TinyAgents knowledge eval ({} cases) ===",
        fixtures.cases.len()
    );
    for (metric, k) in ks.iter().enumerate() {
        println!("hit-rate@{k}: {:.1}%", 100.0 * hits[metric] as f64 / count);
    }
    println!("MRR: {mrr:.3}");
    println!(
        "latency p50/p95: {:.0}/{:.0} ms",
        percentile(&latencies, 0.50),
        percentile(&latencies, 0.95)
    );
    let min_hit_rate = fixtures
        .min_hit_rate_at_5
        .unwrap_or(DEFAULT_MIN_HIT_RATE_AT_5);
    let min_mrr = fixtures.min_mrr.unwrap_or(DEFAULT_MIN_MRR);
    if hit_rate_at_5 < min_hit_rate || mrr < min_mrr {
        bail!(
            "knowledge eval failed: hit-rate@5={hit_rate_at_5:.3} required={min_hit_rate:.3}, MRR={mrr:.3} required={min_mrr:.3}"
        );
    }
    Ok(())
}

async fn build_auto_fixtures(pool: &sqlx::PgPool, count: usize) -> Result<Fixtures> {
    let sources = sqlx::query_as::<_, IndexedSource>(
        "WITH chosen AS (
             SELECT user_id, workspace_id, COUNT(*) count
             FROM agent_knowledge_passages GROUP BY user_id, workspace_id
             ORDER BY count DESC LIMIT 1
         )
         SELECT p.user_id,p.workspace_id,p.source_type,p.source_id,p.title,p.excerpt
         FROM agent_knowledge_passages p JOIN chosen USING(user_id,workspace_id)
         ORDER BY md5(p.source_id),p.chunk_index LIMIT $1",
    )
    .bind(count as i64)
    .fetch_all(pool)
    .await
    .context("discover new knowledge passages")?;
    let first = sources
        .first()
        .context("no agent knowledge passages found in configured schema")?;
    let cases = sources
        .iter()
        .map(|source| Case {
            query: format!("{} {}", source.title, source.excerpt),
            expected_source_ids: vec![source.source_id.clone()],
            source_type: Some(source.source_type.clone()),
        })
        .collect();
    Ok(Fixtures {
        user_id: first.user_id.clone(),
        workspace_id: first.workspace_id.clone(),
        min_hit_rate_at_5: Some(DEFAULT_MIN_HIT_RATE_AT_5),
        min_mrr: Some(DEFAULT_MIN_MRR),
        cases,
    })
}

async fn read_only_pool() -> Result<sqlx::PgPool> {
    let url = std::env::var("POSTGRES_URL").context("POSTGRES_URL is not configured")?;
    let options: sqlx::postgres::PgConnectOptions = url.parse()?;
    let search_path = tradstry_backend::service::db::config::search_path()?;
    PgPoolOptions::new()
        .max_connections(2)
        .after_connect(move |connection, _| {
            let search_path = search_path.clone();
            Box::pin(async move {
                use sqlx::Executor;
                if let Some(path) = &search_path {
                    connection
                        .execute(sqlx::AssertSqlSafe(format!("SET search_path TO {path}")))
                        .await?;
                }
                connection
                    .execute("SET default_transaction_read_only=on")
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .context("connect to read-only knowledge database")
}

fn percentile(sorted: &[f64], value: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    sorted[((sorted.len() - 1) as f64 * value).ceil() as usize]
}
