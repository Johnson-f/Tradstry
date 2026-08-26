use std::sync::Arc;

use super::sources::build_source;
use super::{
    EmbeddingProvider, KnowledgeHit, KnowledgeOutboxRecord, KnowledgeRelationships,
    KnowledgeSearchRequest, Reranker, gather_candidates,
};
use crate::service::agents::{AgentActor, AgentError, AgentEvidenceRef, AgentResult};

#[derive(Clone)]
pub struct KnowledgeService {
    pool: sqlx::PgPool,
    embeddings: Arc<dyn EmbeddingProvider>,
    reranker: Arc<dyn Reranker>,
}

impl KnowledgeService {
    pub fn new(
        pool: sqlx::PgPool,
        embeddings: Arc<dyn EmbeddingProvider>,
        reranker: Arc<dyn Reranker>,
    ) -> AgentResult<Self> {
        if embeddings.dimensions() != 2048 {
            return Err(AgentError::Validation(
                "agent knowledge embeddings must use 2048 dimensions".into(),
            ));
        }
        Ok(Self {
            pool,
            embeddings,
            reranker,
        })
    }

    pub async fn search(
        &self,
        actor: &AgentActor,
        mut request: KnowledgeSearchRequest,
    ) -> AgentResult<Vec<KnowledgeHit>> {
        request.query = request.query.trim().to_string();
        if request.query.is_empty() || request.query.chars().count() > 4_000 {
            return Err(AgentError::Validation(
                "knowledge query must contain 1 to 4000 characters".into(),
            ));
        }
        request.limit = request.limit.clamp(1, 20);
        let owned: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2)",
        )
        .bind(&request.workspace_id)
        .bind(&actor.user_id)
        .fetch_one(&self.pool)
        .await?;
        if !owned {
            return Err(AgentError::NotFound);
        }
        normalize_filters(&mut request)?;
        let query_embedding = match self.embeddings.embed_query(&request.query).await {
            Ok(vector) => Some(vector),
            Err(AgentError::ProviderUnavailable) => None,
            Err(error) => return Err(error),
        };
        let candidates = gather_candidates(
            &self.pool,
            &actor.user_id,
            &request,
            query_embedding.as_deref(),
        )
        .await?;
        if candidates.is_empty() {
            return Ok(Vec::new());
        }
        let order = match self
            .reranker
            .rerank(
                &request.query,
                &candidates,
                request.limit.min(candidates.len()),
            )
            .await
        {
            Ok(order) => order,
            Err(AgentError::ProviderUnavailable) => {
                (0..request.limit.min(candidates.len())).collect()
            }
            Err(error) => return Err(error),
        };
        let mut hits = Vec::new();
        for index in order {
            let candidate = &candidates[index];
            let record = KnowledgeOutboxRecord {
                id: 0,
                user_id: actor.user_id.clone(),
                workspace_id: request.workspace_id.clone(),
                source_type: candidate.source_type,
                source_id: candidate.source_id.clone(),
                operation: "upsert".into(),
                status: "completed".into(),
                attempt_count: 0,
            };
            let Some(source) = build_source(&self.pool, &record).await? else {
                continue;
            };
            if source.source_version != candidate.source_version {
                continue;
            }
            hits.push(KnowledgeHit {
                source_type: candidate.source_type,
                source_id: candidate.source_id.clone(),
                source_version: candidate.source_version.clone(),
                title: source.title,
                excerpt: candidate.excerpt.clone(),
                relationships: KnowledgeRelationships {
                    trade_ids: candidate.trade_ids.clone(),
                    playbook_ids: candidate.playbook_ids.clone(),
                    note_ids: candidate.note_ids.clone(),
                    symbols: candidate.symbols.clone(),
                },
                evidence: AgentEvidenceRef {
                    evidence_id: format!(
                        "knowledge:{}:{}",
                        candidate.source_type.as_str(),
                        candidate.source_id
                    ),
                    source_type: candidate.source_type.as_str().into(),
                    source_id: candidate.source_id.clone(),
                    source_version: candidate.source_version.0.clone(),
                },
            });
        }
        Ok(hits)
    }

    pub async fn embed_document(&self, text: &str) -> AgentResult<Vec<f32>> {
        let mut vectors = self.embeddings.embed_documents(&[text.to_string()]).await?;
        vectors.pop().ok_or(AgentError::ProviderUnavailable)
    }

    pub async fn embed_query(&self, text: &str) -> AgentResult<Vec<f32>> {
        self.embeddings.embed_query(text).await
    }
}

fn normalize_filters(request: &mut KnowledgeSearchRequest) -> AgentResult<()> {
    if let Some(range) = &request.date_range {
        let from = normalize_date(&range.from, false)
            .ok_or_else(|| AgentError::Validation("invalid knowledge date_from".into()))?;
        let to = normalize_date(&range.to, true)
            .ok_or_else(|| AgentError::Validation("invalid knowledge date_to".into()))?;
        request.date_range = Some(crate::service::agents::AgentDateRange { from, to });
    }
    for symbol in &mut request.symbols {
        *symbol = symbol.trim().to_ascii_uppercase();
        if symbol.is_empty() || symbol.len() > 20 {
            return Err(AgentError::Validation("invalid knowledge symbol".into()));
        }
    }
    for values in [
        &mut request.symbols,
        &mut request.trade_ids,
        &mut request.playbook_ids,
        &mut request.note_ids,
    ] {
        values.sort();
        values.dedup();
        if values.len() > 50 {
            return Err(AgentError::Validation(
                "knowledge relationship filter exceeds 50 values".into(),
            ));
        }
    }
    Ok(())
}

fn normalize_date(value: &str, end_of_day: bool) -> Option<String> {
    if chrono::DateTime::parse_from_rfc3339(value).is_ok() {
        return Some(value.to_string());
    }
    let date = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?;
    let time = if end_of_day {
        chrono::NaiveTime::from_hms_nano_opt(23, 59, 59, 999_999_999)?
    } else {
        chrono::NaiveTime::from_hms_opt(0, 0, 0)?
    };
    Some(
        chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(
            date.and_time(time),
            chrono::Utc,
        )
        .to_rfc3339(),
    )
}
