use sha2::{Digest, Sha256};

use super::{KnowledgePassage, block_chunking::chunk_blocks, sources::KnowledgeSource};

pub fn chunk_source(source: &KnowledgeSource) -> Vec<KnowledgePassage> {
    chunk_blocks(&source.blocks)
        .into_iter()
        .map(|chunk| {
            let id = format!(
                "knowledge-{}",
                hex::encode(
                    &Sha256::digest(format!(
                        "{}:{}:{}:{}",
                        source.source_type.as_str(),
                        source.source_id,
                        source.source_version.0,
                        chunk.chunk_index
                    ))[..16]
                )
            );
            let heading = chunk.heading_path.join(" > ");
            let search_text = if heading.is_empty() {
                format!("{}\n{}", source.title, chunk.text)
            } else {
                format!("{}\n{}\n{}", source.title, heading, chunk.text)
            };
            KnowledgePassage {
                id,
                user_id: source.user_id.clone(),
                workspace_id: source.workspace_id.clone(),
                source_type: source.source_type,
                source_id: source.source_id.clone(),
                source_version: source.source_version.clone(),
                chunk_index: chunk.chunk_index as i32,
                title: source.title.clone(),
                excerpt: chunk.text.chars().take(500).collect(),
                search_text,
                embedding: None,
                relationships: source.relationships.clone(),
                effective_from: source.effective_from.clone(),
                effective_to: source.effective_to.clone(),
                content_hash: source.content_hash.clone(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::service::agents::knowledge::sources::KnowledgeSource;
    use crate::service::agents::knowledge::{
        KnowledgeRelationships, KnowledgeSourceType, SourceVersion,
    };
    use crate::service::notebook::blocks::Block;

    use super::*;

    #[test]
    fn passage_ids_and_unicode_excerpts_are_deterministic() {
        let source = KnowledgeSource {
            user_id: "u".into(),
            workspace_id: "w".into(),
            source_type: KnowledgeSourceType::NotebookNote,
            source_id: "n".into(),
            source_version: SourceVersion("1".into()),
            title: "Review".into(),
            blocks: vec![Block::field("Body", "🦀".repeat(600))],
            relationships: KnowledgeRelationships::default(),
            effective_from: None,
            effective_to: None,
            content_hash: "hash".into(),
        };
        let first = chunk_source(&source);
        let second = chunk_source(&source);
        assert_eq!(first[0].id, second[0].id);
        assert!(
            first
                .iter()
                .all(|passage| passage.excerpt.chars().count() <= 500)
        );
    }
}
