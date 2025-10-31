use anyhow::Result;
use libsql::Connection;
use std::sync::Arc;
use crate::models::notes::TradeNote;
use crate::service::ai_service::AINotesService;
use crate::service::cache_service::CacheService;

/// Service for managing trade notes linked to trades with AI processing
pub struct TradeNotesService {
    ai_service: Arc<AINotesService>,
    cache_service: Arc<CacheService>,
}

impl TradeNotesService {
    pub fn new(
        ai_service: Arc<AINotesService>,
        cache_service: Arc<CacheService>,
    ) -> Self {
        Self {
            ai_service,
            cache_service,
        }
    }

    /// Upsert a trade note for a specific trade with AI analysis
    pub async fn upsert_trade_note(
        &self,
        conn: &Connection,
        user_id: &str,
        trade_type: &str,
        trade_id: i64,
        content: String,
        trade_context: Option<&str>, // Optional: symbol, trade details for AI context
    ) -> Result<TradeNote> {
        log::info!("Upserting trade note - user={}, trade_type={}, trade_id={}, content_len={}", 
                   user_id, trade_type, trade_id, content.len());

        // Generate note name from first line or use default
        let name = Self::extract_name_from_content(&content);

        // Process through AI service
        let ai_metadata = match self.ai_service.analyze_note(&content, trade_context).await {
            Ok(metadata) => {
                log::info!("AI analysis successful - tags={}, sentiment={:?}", 
                           metadata.tags.len(), metadata.sentiment);
                match serde_json::to_string(&metadata) {
                    Ok(json_str) => Some(json_str),
                    Err(e) => {
                        log::warn!("Failed to serialize AI metadata: {}. Continuing without metadata.", e);
                        None
                    }
                }
            }
            Err(e) => {
                log::warn!("AI analysis failed: {}. Continuing without metadata.", e);
                None
            }
        };

        // Upsert to database
        let note_result = TradeNote::upsert_for_trade(
            conn,
            trade_type,
            trade_id,
            name,
            content,
            ai_metadata,
        )
        .await;

        let note = match note_result {
            Ok(n) => n,
            Err(e) => {
                return Err(anyhow::anyhow!("Failed to upsert trade note: {}", e));
            }
        };

        log::info!("Trade note upserted successfully - note_id={}", note.id);

        // Cache the final note using get_or_fetch pattern (though we already have the note)
        let cache_key = Self::build_cache_key(user_id, trade_type, trade_id);
        let note_clone = note.clone();
        let _ = self.cache_service.get_or_fetch(&cache_key, 1800, || async {
            Ok::<TradeNote, anyhow::Error>(note_clone)
        }).await;

        // Invalidate trade notes list cache
        self.cache_service.invalidate_table_cache(user_id, "trade_notes").await.ok();

        Ok(note)
    }

    /// Get a trade note for a specific trade (cache-first)
    pub async fn get_trade_note(
        &self,
        conn: &Connection,
        user_id: &str,
        trade_type: &str,
        trade_id: i64,
    ) -> Result<Option<TradeNote>> {
        let cache_key = Self::build_cache_key(user_id, trade_type, trade_id);
        
        // Try to get from cache using a wrapper key that stores Option<TradeNote>
        let cache_wrapper_key = format!("{}:option", cache_key);
        let conn_clone = conn.clone();
        let trade_type_clone = trade_type.to_string();
        
        // Use get_or_fetch with a wrapper struct to handle Option
        #[derive(serde::Serialize, serde::Deserialize, Clone)]
        struct NoteWrapper(Option<TradeNote>);
        
        let wrapper_result = self.cache_service.get_or_fetch(&cache_wrapper_key, 1800, || {
            let conn = conn_clone.clone();
            let trade_type = trade_type_clone.clone();
            async move {
                let result = match trade_type.as_str() {
                    "stock" => TradeNote::find_by_stock_trade_id(&conn, trade_id).await,
                    "option" => TradeNote::find_by_option_trade_id(&conn, trade_id).await,
                    _ => return Err(anyhow::anyhow!("Invalid trade_type. Must be 'stock' or 'option'")),
                };

                match result {
                    Ok(note) => Ok(NoteWrapper(note)),
                    Err(e) => Err(anyhow::anyhow!("Database error: {}", e)),
                }
            }
        }).await;

        match wrapper_result {
            Ok(wrapper) => Ok(wrapper.0),
            Err(e) => Err(e),
        }
    }

    /// Delete a trade note for a specific trade
    pub async fn delete_trade_note(
        &self,
        conn: &Connection,
        user_id: &str,
        trade_type: &str,
        trade_id: i64,
    ) -> Result<bool> {
        // Find note first
        let note = self.get_trade_note(conn, user_id, trade_type, trade_id).await?;

        if let Some(note) = note {
            // Delete from database
            let delete_result = TradeNote::delete(conn, &note.id).await;
            let deleted = match delete_result {
                Ok(d) => d,
                Err(e) => {
                    return Err(anyhow::anyhow!("Database error: {}", e));
                }
            };

            if deleted {
                // Invalidate cache
                let cache_key = Self::build_cache_key(user_id, trade_type, trade_id);
                self.cache_service.invalidate_pattern(&format!("{}:*", cache_key)).await.ok();
                self.cache_service.invalidate_table_cache(user_id, "trade_notes").await.ok();
            }

            Ok(deleted)
        } else {
            Ok(false)
        }
    }

    /// Build cache key for a trade note
    fn build_cache_key(user_id: &str, trade_type: &str, trade_id: i64) -> String {
        format!("db:{}:trade_note:{}:{}", user_id, trade_type, trade_id)
    }

    /// Extract note name from content (first heading or first 50 chars)
    fn extract_name_from_content(content: &str) -> String {
        // Try to find first heading (H1 in BlockNote format would be in JSON)
        // For now, use first line or first 50 chars
        let lines: Vec<&str> = content.lines().collect();
        if let Some(first_line) = lines.first() {
            let trimmed = first_line.trim();
            if !trimmed.is_empty() && trimmed.len() <= 100 {
                return trimmed.to_string();
            }
        }

        // Fallback: first 50 chars of content
        let name = content.chars().take(50).collect::<String>().trim().to_string();
        if name.is_empty() {
            "Untitled Note".to_string()
        } else {
            name
        }
    }
}

