use std::sync::Arc;

use super::{
    EmbeddingProvider, KnowledgeOutboxRecord, KnowledgeStore, chunking::chunk_source,
    sources::build_source,
};
use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone)]
pub struct KnowledgeIndexer {
    store: KnowledgeStore,
    embeddings: Arc<dyn EmbeddingProvider>,
}

impl KnowledgeIndexer {
    pub fn new(store: KnowledgeStore, embeddings: Arc<dyn EmbeddingProvider>) -> Self {
        Self { store, embeddings }
    }

    pub fn store(&self) -> &KnowledgeStore {
        &self.store
    }

    pub async fn process(
        &self,
        record: &KnowledgeOutboxRecord,
        lease_owner: &str,
    ) -> AgentResult<()> {
        if record.operation == "delete" {
            if self.store.complete_delete(record, lease_owner).await? {
                return Ok(());
            }
            return Err(AgentError::Conflict);
        }
        let Some(source) = build_source(self.store.pool(), record).await? else {
            if self.store.complete_delete(record, lease_owner).await? {
                return Ok(());
            }
            return Err(AgentError::Conflict);
        };
        let unchanged: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM agent_knowledge_passages
             WHERE user_id = $1 AND workspace_id = $2 AND source_type = $3
               AND source_id = $4 AND content_hash = $5)",
        )
        .bind(&record.user_id)
        .bind(&record.workspace_id)
        .bind(record.source_type.as_str())
        .bind(&record.source_id)
        .bind(&source.content_hash)
        .fetch_one(self.store.pool())
        .await?;
        if unchanged {
            return if self.store.complete_noop(record.id, lease_owner).await? {
                Ok(())
            } else {
                Err(AgentError::Conflict)
            };
        }
        let mut passages = chunk_source(&source);
        let inputs = passages
            .iter()
            .map(|passage| passage.search_text.clone())
            .collect::<Vec<_>>();
        let vectors = self.embeddings.embed_documents(&inputs).await?;
        if vectors.len() != passages.len() {
            return Err(AgentError::ProviderUnavailable);
        }
        for (passage, vector) in passages.iter_mut().zip(vectors) {
            passage.embedding = Some(vector);
        }
        if self
            .store
            .replace_projection(record, lease_owner, &passages)
            .await?
        {
            Ok(())
        } else {
            Err(AgentError::Conflict)
        }
    }
}
