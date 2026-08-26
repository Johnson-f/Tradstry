use std::collections::HashMap;

use pgvector::HalfVector;
use sqlx::{Postgres, QueryBuilder, Row};

use super::{KnowledgeSearchRequest, KnowledgeSourceType, SourceVersion};
use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone, Debug)]
pub struct KnowledgeCandidate {
    pub id: String,
    pub source_type: KnowledgeSourceType,
    pub source_id: String,
    pub source_version: SourceVersion,
    pub title: String,
    pub excerpt: String,
    pub search_text: String,
    pub trade_ids: Vec<String>,
    pub playbook_ids: Vec<String>,
    pub note_ids: Vec<String>,
    pub symbols: Vec<String>,
    pub fused_score: f64,
}

pub async fn gather_candidates(
    pool: &sqlx::PgPool,
    user_id: &str,
    request: &KnowledgeSearchRequest,
    query_embedding: Option<&[f32]>,
) -> AgentResult<Vec<KnowledgeCandidate>> {
    let dense = if let Some(dense_vector) = query_embedding {
        let vector = HalfVector::from_f32_slice(dense_vector);
        let mut query = base_query(
            "SELECT id, source_type, source_id, source_version, title, excerpt,
                    search_text, trade_ids, playbook_ids, note_ids, symbols,
                    (embedding <=> ",
            user_id,
            request,
        );
        query.push_bind(vector);
        query.push(")::float8 AS rank_value FROM agent_knowledge_passages WHERE ");
        append_filters(&mut query, user_id, request, true);
        query.push(" ORDER BY embedding <=> ");
        query.push_bind(HalfVector::from_f32_slice(dense_vector));
        query.push(" LIMIT 100");
        query.build().fetch_all(pool).await?
    } else {
        Vec::new()
    };
    let mut lexical = QueryBuilder::<Postgres>::new(
        "SELECT id, source_type, source_id, source_version, title, excerpt,
                search_text, trade_ids, playbook_ids, note_ids, symbols,
                ts_rank_cd(search_vector, websearch_to_tsquery('english', ",
    );
    lexical.push_bind(&request.query);
    lexical.push("))::float8 AS rank_value FROM agent_knowledge_passages WHERE ");
    append_filters(&mut lexical, user_id, request, false);
    lexical.push(" AND search_vector @@ websearch_to_tsquery('english', ");
    lexical.push_bind(&request.query);
    lexical.push(") ORDER BY rank_value DESC, id LIMIT 100");
    let lexical = lexical.build().fetch_all(pool).await?;

    let mut fused = HashMap::<String, (KnowledgeCandidate, f64)>::new();
    for (branch, rows) in [dense, lexical].into_iter().enumerate() {
        for (rank, row) in rows.iter().enumerate() {
            let candidate = candidate_from_row(row)?;
            let score = 1.0 / (60.0 + rank as f64 + 1.0);
            fused
                .entry(candidate.id.clone())
                .and_modify(|(_, total)| *total += score)
                .or_insert((candidate, score + branch as f64 * 0.0));
        }
    }
    let mut values = fused
        .into_values()
        .map(|(mut candidate, score)| {
            candidate.fused_score = score;
            candidate
        })
        .collect::<Vec<_>>();
    values.sort_by(|a, b| {
        b.fused_score
            .total_cmp(&a.fused_score)
            .then_with(|| a.id.cmp(&b.id))
    });
    values.truncate(100);
    Ok(values)
}

fn base_query(
    prefix: &'static str,
    _user_id: &str,
    _request: &KnowledgeSearchRequest,
) -> QueryBuilder<Postgres> {
    QueryBuilder::new(prefix)
}

fn append_filters(
    query: &mut QueryBuilder<Postgres>,
    user_id: &str,
    request: &KnowledgeSearchRequest,
    require_embedding: bool,
) {
    query.push("user_id = ").push_bind(user_id);
    query
        .push(" AND workspace_id = ")
        .push_bind(&request.workspace_id);
    if require_embedding {
        query.push(" AND embedding IS NOT NULL");
    }
    if let Some(range) = &request.date_range {
        query
            .push(" AND COALESCE(effective_to, effective_from) >= ")
            .push_bind(&range.from)
            .push("::timestamptz AND COALESCE(effective_from, effective_to) <= ")
            .push_bind(&range.to)
            .push("::timestamptz");
    }
    for (column, values) in [
        ("symbols", &request.symbols),
        ("trade_ids", &request.trade_ids),
        ("playbook_ids", &request.playbook_ids),
        ("note_ids", &request.note_ids),
    ] {
        if !values.is_empty() {
            query
                .push(" AND ")
                .push(column)
                .push(" && ")
                .push_bind(values);
        }
    }
}

fn candidate_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<KnowledgeCandidate> {
    Ok(KnowledgeCandidate {
        id: row.try_get("id")?,
        source_type: KnowledgeSourceType::parse(row.try_get::<String, _>("source_type")?.as_str())
            .ok_or(AgentError::Internal)?,
        source_id: row.try_get("source_id")?,
        source_version: SourceVersion(row.try_get("source_version")?),
        title: row.try_get("title")?,
        excerpt: row.try_get("excerpt")?,
        search_text: row.try_get("search_text")?,
        trade_ids: row.try_get("trade_ids")?,
        playbook_ids: row.try_get("playbook_ids")?,
        note_ids: row.try_get("note_ids")?,
        symbols: row.try_get("symbols")?,
        fused_score: 0.0,
    })
}
