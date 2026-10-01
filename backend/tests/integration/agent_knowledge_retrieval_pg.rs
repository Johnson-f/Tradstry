use std::sync::Arc;

use crate::agent_support::AgentPgFixture;
use async_trait::async_trait;
use tradstry_backend::service::agents::knowledge::{
    EmbeddingProvider, KnowledgeCandidate, KnowledgeSearchRequest, KnowledgeService, Reranker,
};
use tradstry_backend::service::agents::{AgentError, AgentResult};

struct LexicalOnlyEmbedding;

#[async_trait]
impl EmbeddingProvider for LexicalOnlyEmbedding {
    fn model_id(&self) -> &str {
        "test"
    }
    fn dimensions(&self) -> usize {
        2048
    }
    async fn embed_documents(&self, _inputs: &[String]) -> AgentResult<Vec<Vec<f32>>> {
        Err(AgentError::ProviderUnavailable)
    }
    async fn embed_query(&self, _input: &str) -> AgentResult<Vec<f32>> {
        Err(AgentError::ProviderUnavailable)
    }
}

struct IdentityReranker;

#[async_trait]
impl Reranker for IdentityReranker {
    async fn rerank(
        &self,
        _query: &str,
        candidates: &[KnowledgeCandidate],
        take: usize,
    ) -> AgentResult<Vec<usize>> {
        Ok((0..take.min(candidates.len())).collect())
    }
}

async fn insert_note_and_passage(
    pool: &sqlx::PgPool,
    user: &str,
    workspace: &str,
    note: &str,
    version: &str,
    symbol: &str,
) {
    sqlx::query(
        "INSERT INTO notebook_notes(id,user_id,workspace_id,title,document_json,hlc)
         VALUES ($1,$2,$3,'Discipline note','{}',$4)",
    )
    .bind(note)
    .bind(user)
    .bind(workspace)
    .bind(version)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO agent_knowledge_passages
         (id,user_id,workspace_id,source_type,source_id,source_version,chunk_index,title,
          excerpt,search_text,trade_ids,playbook_ids,note_ids,symbols,content_hash)
         VALUES ($1,$2,$3,'notebook_note',$4,$5,0,'Discipline note',
                 'Wait for confirmation','discipline wait for confirmation','{}','{}',ARRAY[$4],ARRAY[$6],$1)",
    )
    .bind(format!("passage-{note}"))
    .bind(user)
    .bind(workspace)
    .bind(note)
    .bind(version)
    .bind(symbol)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn retrieval_prefilters_scope_relationships_and_discards_stale_sources() {
    let fixture = AgentPgFixture::new().await;
    insert_note_and_passage(
        &fixture.pool,
        &fixture.actor.user_id,
        &fixture.scope.workspace_id,
        "mine-fresh",
        "v1",
        "AAPL",
    )
    .await;
    insert_note_and_passage(
        &fixture.pool,
        &fixture.actor.user_id,
        &fixture.scope.workspace_id,
        "mine-stale",
        "canonical-v2",
        "AAPL",
    )
    .await;
    sqlx::query(
        "UPDATE agent_knowledge_passages SET source_version = 'stale-v1'
         WHERE source_id = 'mine-stale'",
    )
    .execute(&fixture.pool)
    .await
    .unwrap();
    let (other_user, other_workspace) = crate::pg_support::seed_user_workspace(&fixture.pool).await;
    insert_note_and_passage(
        &fixture.pool,
        &other_user,
        &other_workspace,
        "foreign",
        "v1",
        "AAPL",
    )
    .await;
    let service = KnowledgeService::new(
        fixture.pool.clone(),
        Arc::new(LexicalOnlyEmbedding),
        Arc::new(IdentityReranker),
    )
    .unwrap();
    let hits = service
        .search(
            &fixture.actor,
            KnowledgeSearchRequest {
                workspace_id: fixture.scope.workspace_id.clone(),
                query: "discipline confirmation".into(),
                symbols: vec!["aapl".into()],
                limit: 10,
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].source_id, "mine-fresh");
    assert_eq!(hits[0].relationships.symbols, ["AAPL"]);

    let wrong_scope = service
        .search(
            &fixture.actor,
            KnowledgeSearchRequest {
                workspace_id: other_workspace,
                query: "discipline".into(),
                limit: 5,
                ..Default::default()
            },
        )
        .await;
    assert!(matches!(wrong_scope, Err(AgentError::NotFound)));
}
