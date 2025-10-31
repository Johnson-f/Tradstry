use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::service::ai_service::openrouter_client::{OpenRouterClient, ChatMessage, MessageRole};

/// AI metadata extracted from trade note analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMetadata {
    pub tags: Vec<String>,
    pub summary: Option<String>,
    pub key_points: Vec<String>,
    pub sentiment: Option<String>, // 'positive', 'negative', 'neutral'
    pub action_items: Vec<String>,
}

/// AI Notes Service for analyzing trade notes
pub struct AINotesService {
    openrouter_client: Arc<OpenRouterClient>,
}

impl AINotesService {
    pub fn new(openrouter_client: Arc<OpenRouterClient>) -> Self {
        Self { openrouter_client }
    }

    /// Analyze a trade note and extract metadata
    pub async fn analyze_note(
        &self,
        note_content: &str,
        trade_context: Option<&str>, // Optional trade context (symbol, trade type, etc.)
    ) -> Result<NoteMetadata> {
        log::info!("Analyzing trade note - content_length={}, has_context={}", 
                   note_content.len(), trade_context.is_some());

        let prompt = self.build_analysis_prompt(note_content, trade_context);

        let messages = vec![ChatMessage {
            role: MessageRole::User,
            content: prompt,
        }];

        let response = self.openrouter_client.generate_chat(messages).await?;

        if response.trim().is_empty() {
            return Err(anyhow::anyhow!("AI service returned empty response"));
        }

        log::debug!("AI response (first 200 chars): {}", 
                   response.chars().take(200).collect::<String>());

        // Try to parse as JSON
        let metadata: NoteMetadata = match serde_json::from_str(&response) {
            Ok(m) => m,
            Err(e) => {
                log::warn!("Failed to parse AI response as JSON: {}. Using fallback.", e);
                // Fallback: extract basic info from raw response
                self.extract_metadata_fallback(&response, note_content)
            }
        };

        log::info!("Note analysis completed - tags={}, sentiment={:?}, action_items={}", 
                   metadata.tags.len(), 
                   metadata.sentiment, 
                   metadata.action_items.len());

        Ok(metadata)
    }

    /// Build analysis prompt for AI
    fn build_analysis_prompt(&self, note_content: &str, trade_context: Option<&str>) -> String {
        let mut prompt = String::from(
            r#"Analyze this trading journal note and extract structured metadata. Return ONLY a valid JSON object with this exact structure:

{
  "tags": ["tag1", "tag2"],
  "summary": "Brief summary of the note",
  "key_points": ["point1", "point2"],
  "sentiment": "positive|negative|neutral",
  "action_items": ["action1", "action2"]
}

Focus on extracting:
- Relevant trading tags (strategies, setups, mistakes, improvements)
- A concise summary
- Key trading insights or observations
- Overall sentiment about the trade
- Actionable items for future trades

Note content:
"#
        );

        if let Some(context) = trade_context {
            prompt.push_str(&format!("Trade context: {}\n\n", context));
        }

        prompt.push_str(note_content);
        prompt.push_str("\n\nReturn ONLY the JSON object, no additional text.");
        
        prompt
    }

    /// Fallback metadata extraction when JSON parsing fails
    fn extract_metadata_fallback(&self, ai_response: &str, note_content: &str) -> NoteMetadata {
        // Simple keyword-based extraction
        let content_lower = note_content.to_lowercase();
        let mut tags = Vec::new();

        // Extract sentiment keywords
        let sentiment = if content_lower.contains("good") || content_lower.contains("profit") || content_lower.contains("win") {
            Some("positive".to_string())
        } else if content_lower.contains("bad") || content_lower.contains("loss") || content_lower.contains("mistake") {
            Some("negative".to_string())
        } else {
            Some("neutral".to_string())
        };

        // Extract common trading tags
        if content_lower.contains("gap") {
            tags.push("gap".to_string());
        }
        if content_lower.contains("breakout") {
            tags.push("breakout".to_string());
        }
        if content_lower.contains("pullback") {
            tags.push("pullback".to_string());
        }
        if content_lower.contains("support") || content_lower.contains("resistance") {
            tags.push("levels".to_string());
        }
        if content_lower.contains("stop") || content_lower.contains("risk") {
            tags.push("risk_management".to_string());
        }

        // Create summary from first 100 chars of response or note
        let summary = if ai_response.len() > 100 {
            Some(ai_response.chars().take(100).collect::<String>() + "...")
        } else if note_content.len() > 100 {
            Some(note_content.chars().take(100).collect::<String>() + "...")
        } else {
            Some(note_content.to_string())
        };

        NoteMetadata {
            tags: if tags.is_empty() { vec!["general".to_string()] } else { tags },
            summary,
            key_points: Vec::new(),
            sentiment,
            action_items: Vec::new(),
        }
    }
}

