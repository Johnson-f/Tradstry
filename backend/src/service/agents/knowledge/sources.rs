use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;

use super::{KnowledgeOutboxRecord, KnowledgeRelationships, KnowledgeSourceType, SourceVersion};
use crate::service::agents::{AgentError, AgentResult};
use crate::service::db::schema::tables::notebook::crdt;
use crate::service::notebook::blocks::{Block, BlockKind, extract_notebook_blocks};

#[derive(Clone, Debug)]
pub struct KnowledgeSource {
    pub user_id: String,
    pub workspace_id: String,
    pub source_type: KnowledgeSourceType,
    pub source_id: String,
    pub source_version: SourceVersion,
    pub title: String,
    pub blocks: Vec<Block>,
    pub relationships: KnowledgeRelationships,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub content_hash: String,
}

pub async fn build_source(
    pool: &sqlx::PgPool,
    record: &KnowledgeOutboxRecord,
) -> AgentResult<Option<KnowledgeSource>> {
    match record.source_type {
        KnowledgeSourceType::JournalEntry => build_journal(pool, record).await,
        KnowledgeSourceType::NotebookNote => build_note(pool, record).await,
        KnowledgeSourceType::Playbook => build_playbook(pool, record).await,
    }
}

async fn build_journal(
    pool: &sqlx::PgPool,
    record: &KnowledgeOutboxRecord,
) -> AgentResult<Option<KnowledgeSource>> {
    let row = sqlx::query(
        "SELECT to_jsonb(j) AS value, COALESCE(NULLIF(j.hlc, ''), j.updated_at::text) AS version
         FROM journal_entries j WHERE j.id = $1 AND j.user_id = $2 AND j.workspace_id = $3
           AND j.deleted_at IS NULL",
    )
    .bind(&record.source_id)
    .bind(&record.user_id)
    .bind(&record.workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else { return Ok(None) };
    let value: Value = row.try_get("value")?;
    let symbol = string(&value, "symbol");
    let title = format!("{} {} trade", symbol, string(&value, "trade_type"));
    let mut blocks = Vec::new();
    for (name, key) in [
        ("Trade", "symbol_name"),
        ("Entry tactics", "entry_tactics"),
        ("Edges spotted", "edges_spotted"),
        ("Mistakes", "mistakes"),
        ("Notes", "notes"),
        ("Market regime", "market_regime"),
    ] {
        let text = string(&value, key);
        if !text.is_empty() {
            blocks.push(Block::field(name, text));
        }
    }
    blocks.push(Block::field(
        "Outcome",
        format!(
            "status {}; realized P&L {}; net ROI {}",
            string(&value, "status"),
            value["total_pl"],
            value["net_roi"]
        ),
    ));
    let mut relationships = KnowledgeRelationships {
        trade_ids: vec![record.source_id.clone()],
        playbook_ids: value["playbook_id"]
            .as_str()
            .map(str::to_owned)
            .into_iter()
            .collect(),
        note_ids: sqlx::query_scalar(
            "SELECT note_id FROM notebook_note_trades WHERE trade_id = $1 ORDER BY note_id",
        )
        .bind(&record.source_id)
        .fetch_all(pool)
        .await?,
        symbols: (!symbol.is_empty()).then_some(symbol).into_iter().collect(),
    };
    let tags: Vec<String> = sqlx::query_scalar(
        "SELECT t.name FROM trade_tags tt JOIN tags t ON t.id = tt.tag_id
         WHERE tt.journal_entry_id = $1 AND t.deleted_at IS NULL ORDER BY lower(t.name), t.id",
    )
    .bind(&record.source_id)
    .fetch_all(pool)
    .await?;
    if !tags.is_empty() {
        blocks.push(Block::field("Tags", tags.join(", ")));
    }
    let principles: Vec<String> = sqlx::query_scalar(
        "SELECT p.title || ': ' || p.the_rule FROM trade_principle_violations v
         JOIN trading_principles p ON p.id = v.principle_id
         WHERE v.journal_entry_id = $1 AND p.deleted_at IS NULL ORDER BY p.priority DESC, p.id",
    )
    .bind(&record.source_id)
    .fetch_all(pool)
    .await?;
    if !principles.is_empty() {
        blocks.push(Block::field("Principle violations", principles.join("; ")));
    }
    normalize_relationships(&mut relationships);
    Ok(Some(finalize(
        record,
        row.try_get("version")?,
        title,
        blocks,
        relationships,
        value["open_date"].as_str().map(str::to_owned),
        value["close_date"].as_str().map(str::to_owned),
    )))
}

async fn build_note(
    pool: &sqlx::PgPool,
    record: &KnowledgeOutboxRecord,
) -> AgentResult<Option<KnowledgeSource>> {
    let crdt_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM notebook_note_crdt WHERE note_id = $1 AND state = 'crdt')",
    )
    .bind(&record.source_id)
    .fetch_one(pool)
    .await?;
    if crdt_exists
        && !crdt::is_projection_fresh(pool, &record.source_id)
            .await
            .map_err(|_| AgentError::Internal)?
    {
        crdt::refresh_projection(pool, &record.source_id)
            .await
            .map_err(|_| AgentError::Internal)?;
    }
    let row = sqlx::query(
        "SELECT n.title, n.document_json,
                CASE WHEN c.state = 'crdt' THEN 'seq:' || c.projected_seq::text
                     ELSE COALESCE(NULLIF(n.hlc, ''), n.updated_at::text) END AS version
         FROM notebook_notes n LEFT JOIN notebook_note_crdt c ON c.note_id = n.id
         WHERE n.id = $1 AND n.user_id = $2 AND n.workspace_id = $3 AND n.deleted_at IS NULL",
    )
    .bind(&record.source_id)
    .bind(&record.user_id)
    .bind(&record.workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else { return Ok(None) };
    let mut blocks = extract_notebook_blocks(row.try_get("document_json")?);
    if blocks.is_empty() {
        blocks.push(Block {
            kind: BlockKind::Paragraph,
            text: "Empty note".into(),
        });
    }
    let trade_ids: Vec<String> = sqlx::query_scalar(
        "SELECT trade_id FROM notebook_note_trades WHERE note_id = $1 ORDER BY trade_id",
    )
    .bind(&record.source_id)
    .fetch_all(pool)
    .await?;
    let symbols: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT j.symbol FROM notebook_note_trades nt
         JOIN journal_entries j ON j.id = nt.trade_id
         WHERE nt.note_id = $1 ORDER BY j.symbol",
    )
    .bind(&record.source_id)
    .fetch_all(pool)
    .await?;
    let relationships = KnowledgeRelationships {
        trade_ids,
        playbook_ids: Vec::new(),
        note_ids: vec![record.source_id.clone()],
        symbols,
    };
    Ok(Some(finalize(
        record,
        row.try_get("version")?,
        row.try_get("title")?,
        blocks,
        relationships,
        None,
        None,
    )))
}

async fn build_playbook(
    pool: &sqlx::PgPool,
    record: &KnowledgeOutboxRecord,
) -> AgentResult<Option<KnowledgeSource>> {
    let row = sqlx::query(
        "SELECT to_jsonb(p) AS value, COALESCE(NULLIF(p.hlc, ''), p.updated_at::text) AS version
         FROM playbooks p WHERE p.id = $1 AND p.user_id = $2 AND
         (p.workspace_id = $3 OR p.availability = 'universal') AND p.deleted_at IS NULL",
    )
    .bind(&record.source_id)
    .bind(&record.user_id)
    .bind(&record.workspace_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else { return Ok(None) };
    let value: Value = row.try_get("value")?;
    let blocks = [
        ("Edge", "edge_name"),
        ("Entry rules", "entry_rules"),
        ("Exit rules", "exit_rules"),
        ("Position sizing", "position_sizing_rules"),
        ("Additional rules", "additional_rules"),
    ]
    .into_iter()
    .filter_map(|(name, key)| {
        let text = string(&value, key);
        (!text.is_empty()).then(|| Block::field(name, text))
    })
    .collect();
    Ok(Some(finalize(
        record,
        row.try_get("version")?,
        string(&value, "name"),
        blocks,
        KnowledgeRelationships {
            playbook_ids: vec![record.source_id.clone()],
            ..Default::default()
        },
        None,
        None,
    )))
}

fn finalize(
    record: &KnowledgeOutboxRecord,
    version: String,
    title: String,
    blocks: Vec<Block>,
    relationships: KnowledgeRelationships,
    effective_from: Option<String>,
    effective_to: Option<String>,
) -> KnowledgeSource {
    let content_hash = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&serde_json::json!({
                "title": title,
                "blocks": blocks.iter().map(|block| &block.text).collect::<Vec<_>>(),
                "relationships": relationships,
                "effectiveFrom": effective_from,
                "effectiveTo": effective_to,
            }))
            .unwrap_or_default()
        )
    );
    KnowledgeSource {
        user_id: record.user_id.clone(),
        workspace_id: record.workspace_id.clone(),
        source_type: record.source_type,
        source_id: record.source_id.clone(),
        source_version: SourceVersion(version),
        title,
        blocks,
        relationships,
        effective_from,
        effective_to,
        content_hash,
    }
}

fn string(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().trim().to_string()
}

fn normalize_relationships(relationships: &mut KnowledgeRelationships) {
    for values in [
        &mut relationships.trade_ids,
        &mut relationships.playbook_ids,
        &mut relationships.note_ids,
        &mut relationships.symbols,
    ] {
        values.sort();
        values.dedup();
    }
}
