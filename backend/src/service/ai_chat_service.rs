use crate::models::ai::chat::{
    ChatMessage, ChatSession, ChatRequest, ChatResponse, ContextSource, 
    MessageRole, ChatSessionDetailsResponse, ChatSessionListResponse, ChatSessionSummary
};
use crate::service::vectorization_service::VectorizationService;
use crate::service::gemini_client::{GeminiClient, MessageRole as GeminiMessageRole};
use crate::turso::client::TursoClient;
use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
use serde_json;
use std::sync::Arc;
use uuid::Uuid;

/// AI Chat Service for handling chat functionality
pub struct AIChatService {
    vectorization_service: Arc<VectorizationService>,
    gemini_client: Arc<GeminiClient>,
    turso_client: Arc<TursoClient>,
    max_context_vectors: usize,
}

impl AIChatService {
    pub fn new(
        vectorization_service: Arc<VectorizationService>,
        gemini_client: Arc<GeminiClient>,
        turso_client: Arc<TursoClient>,
        max_context_vectors: usize,
    ) -> Self {
        Self {
            vectorization_service,
            gemini_client,
            turso_client,
            max_context_vectors,
        }
    }

    /// Generate a chat response with context retrieval
    pub async fn generate_response(
        &self,
        user_id: &str,
        request: ChatRequest,
        conn: &Connection,
    ) -> Result<ChatResponse> {
        let start_time = std::time::Instant::now();

        // Get or create session
        let session = if let Some(session_id) = request.session_id {
            self.get_session(conn, &session_id, user_id).await?
        } else {
            self.create_session(conn, user_id, None).await?
        };

        // Retrieve relevant context using vector similarity search
        let context_sources = if request.include_context.unwrap_or(true) {
            self.retrieve_context(user_id, &request.message, request.max_context_vectors.unwrap_or(self.max_context_vectors)).await?
        } else {
            Vec::new()
        };

        // Build conversation history
        let mut messages = self.get_session_messages(conn, &session.id).await?;
        
        // Add user message
        let user_message = ChatMessage::new(MessageRole::User, request.message.clone());
        messages.push(user_message.clone());

        // Convert to Gemini format
        let gemini_messages: Vec<crate::service::gemini_client::ChatMessage> = messages
            .iter()
            .map(|msg| crate::service::gemini_client::ChatMessage {
                role: match msg.role {
                    MessageRole::User => GeminiMessageRole::User,
                    MessageRole::Assistant => GeminiMessageRole::Assistant,
                    MessageRole::System => GeminiMessageRole::System,
                },
                content: msg.content.clone(),
            })
            .collect();

        // Generate AI response
        let ai_response = self.gemini_client.generate_chat(gemini_messages).await?;

        // Create assistant message
        let assistant_message = ChatMessage::new(MessageRole::Assistant, ai_response.clone())
            .with_context(context_sources.iter().map(|s| s.vector_id.clone()).collect());

        // Store messages in database
        self.store_message(conn, &user_message).await?;
        self.store_message(conn, &assistant_message).await?;

        // Update session
        self.update_session_last_message(conn, &session.id).await?;

        let processing_time = start_time.elapsed().as_millis() as u64;

        Ok(ChatResponse {
            message: ai_response,
            session_id: session.id,
            message_id: assistant_message.id,
            sources: context_sources,
            token_count: None, // Would be populated from Gemini response
            processing_time_ms: processing_time,
        })
    }

    /// Generate a streaming chat response
    pub async fn generate_streaming_response(
        &self,
        user_id: &str,
        request: ChatRequest,
        conn: &Connection,
    ) -> Result<(tokio::sync::mpsc::Receiver<String>, String, String)> {
        // Get or create session
        let session = if let Some(session_id) = request.session_id {
            self.get_session(conn, &session_id, user_id).await?
        } else {
            self.create_session(conn, user_id, None).await?
        };

        // Retrieve relevant context
        let context_sources = if request.include_context.unwrap_or(true) {
            self.retrieve_context(user_id, &request.message, request.max_context_vectors.unwrap_or(self.max_context_vectors)).await?
        } else {
            Vec::new()
        };

        // Build conversation history
        let mut messages = self.get_session_messages(conn, &session.id).await?;
        
        // Add user message
        let user_message = ChatMessage::new(MessageRole::User, request.message.clone());
        messages.push(user_message.clone());

        // Convert to Gemini format
        let gemini_messages: Vec<crate::service::gemini_client::ChatMessage> = messages
            .iter()
            .map(|msg| crate::service::gemini_client::ChatMessage {
                role: match msg.role {
                    MessageRole::User => GeminiMessageRole::User,
                    MessageRole::Assistant => GeminiMessageRole::Assistant,
                    MessageRole::System => GeminiMessageRole::System,
                },
                content: msg.content.clone(),
            })
            .collect();

        // Generate streaming AI response
        let mut stream_receiver = self.gemini_client.generate_chat_stream(gemini_messages).await?;

        // Store user message
        self.store_message(conn, &user_message).await?;

        // Create assistant message placeholder
        let assistant_message_id = Uuid::new_v4().to_string();
        let assistant_message = ChatMessage {
            id: assistant_message_id.clone(),
            role: MessageRole::Assistant,
            content: String::new(), // Will be updated as stream progresses
            timestamp: Utc::now(),
            context_vectors: Some(context_sources.iter().map(|s| s.vector_id.clone()).collect()),
            token_count: None,
        };

        // Store initial assistant message
        self.store_message(conn, &assistant_message).await?;

        // Update session
        self.update_session_last_message(conn, &session.id).await?;

        Ok((stream_receiver, session.id, assistant_message_id))
    }

    /// Retrieve relevant context using vector similarity search
    async fn retrieve_context(
        &self,
        user_id: &str,
        query: &str,
        max_vectors: usize,
    ) -> Result<Vec<ContextSource>> {
        // Query similar vectors
        let vector_matches = self.vectorization_service
            .query_similar_vectors(
                user_id,
                query,
                max_vectors,
                None, // No specific data type filter
            )
            .await?;

        // Convert to context sources
        let context_sources: Vec<ContextSource> = vector_matches
            .into_iter()
            .map(|match_| ContextSource::new(
                match_.id,
                format!("{:?}", match_.metadata.data_type),
                match_.metadata.entity_id.clone(),
                match_.score,
                format!("Trade data for {}", match_.metadata.entity_id), // Simplified snippet
            ))
            .collect();

        Ok(context_sources)
    }

    /// Create a new chat session
    pub async fn create_session(
        &self,
        conn: &Connection,
        user_id: &str,
        title: Option<String>,
    ) -> Result<ChatSession> {
        let session = ChatSession::new(user_id.to_string(), title);
        
        conn.execute(
            "INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at, message_count, last_message_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                session.id.clone(),
                session.user_id.clone(),
                session.title.clone(),
                session.created_at.to_rfc3339(),
                session.updated_at.to_rfc3339(),
                session.message_count,
                session.last_message_at.map(|d| d.to_rfc3339())
            ],
        ).await?;

        Ok(session)
    }

    /// Get a chat session by ID
    pub async fn get_session(
        &self,
        conn: &Connection,
        session_id: &str,
        user_id: &str,
    ) -> Result<ChatSession> {
        let mut stmt = conn.prepare(
            "SELECT id, user_id, title, created_at, updated_at, message_count, last_message_at 
             FROM chat_sessions WHERE id = ? AND user_id = ?"
        ).await?;
        
        let mut rows = stmt.query([session_id, user_id]).await?;
        
        if let Some(row) = rows.next().await? {
            Ok(ChatSession {
                id: row.get(0)?,
                user_id: row.get(1)?,
                title: row.get(2)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(3)?)?.with_timezone(&Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(4)?)?.with_timezone(&Utc),
                message_count: row.get(5)?,
                last_message_at: row.get::<Option<String>>(6)?
                    .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            })
        } else {
            Err(anyhow::anyhow!("Session not found"))
        }
    }

    /// Get user's chat sessions
    pub async fn get_user_sessions(
        &self,
        conn: &Connection,
        user_id: &str,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<ChatSessionListResponse> {
        let limit = limit.unwrap_or(20);
        let offset = offset.unwrap_or(0);

        // Get total count
        let mut count_stmt = conn.prepare("SELECT COUNT(*) FROM chat_sessions WHERE user_id = ?").await?;
        let row = count_stmt.query_row([user_id]).await?;
        let total_count: u32 = row.get(0)?;

        // Get sessions
        let mut stmt = conn.prepare(
            "SELECT id, user_id, title, created_at, updated_at, message_count, last_message_at 
             FROM chat_sessions WHERE user_id = ? 
             ORDER BY updated_at DESC LIMIT ? OFFSET ?"
        ).await?;
        
        let mut rows = stmt.query([user_id, &limit.to_string(), &offset.to_string()]).await?;
        
        let mut sessions = Vec::new();
        while let Some(row) = rows.next().await? {
            let session = ChatSession {
                id: row.get(0)?,
                user_id: row.get(1)?,
                title: row.get(2)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(3)?)?.with_timezone(&Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(4)?)?.with_timezone(&Utc),
                message_count: row.get(5)?,
                last_message_at: row.get::<Option<String>>(6)?
                    .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            };
            
            sessions.push(ChatSessionSummary::from(session));
        }

        Ok(ChatSessionListResponse {
            sessions,
            total_count,
        })
    }

    /// Get session details with messages
    pub async fn get_session_details(
        &self,
        conn: &Connection,
        session_id: &str,
        user_id: &str,
    ) -> Result<ChatSessionDetailsResponse> {
        let session = self.get_session(conn, session_id, user_id).await?;
        let messages = self.get_session_messages(conn, session_id).await?;

        Ok(ChatSessionDetailsResponse {
            session,
            messages: messages.clone(),
            total_messages: messages.len() as u32,
        })
    }

    /// Get messages for a session
    async fn get_session_messages(
        &self,
        conn: &Connection,
        session_id: &str,
    ) -> Result<Vec<ChatMessage>> {
        let mut stmt = conn.prepare(
            "SELECT id, role, content, context_vectors, token_count, created_at 
             FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC"
        ).await?;
        
        let mut rows = stmt.query([session_id]).await?;
        
        let mut messages = Vec::new();
        while let Some(row) = rows.next().await? {
            let context_vectors: Option<String> = row.get(3)?;
            let context_vectors_parsed = if let Some(cv) = context_vectors {
                Some(serde_json::from_str::<Vec<String>>(&cv)?)
            } else {
                None
            };

            messages.push(ChatMessage {
                id: row.get(0)?,
                role: match row.get::<String>(1)?.as_str() {
                    "user" => MessageRole::User,
                    "assistant" => MessageRole::Assistant,
                    "system" => MessageRole::System,
                    _ => MessageRole::User,
                },
                content: row.get(2)?,
                timestamp: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(5)?)?.with_timezone(&Utc),
                context_vectors: context_vectors_parsed,
                token_count: row.get(4)?,
            });
        }

        Ok(messages)
    }

    /// Store a chat message
    async fn store_message(&self, conn: &Connection, message: &ChatMessage) -> Result<()> {
        let context_vectors_json = if let Some(cv) = &message.context_vectors {
            Some(serde_json::to_string(cv)?)
        } else {
            None
        };

        conn.execute(
            "INSERT INTO chat_messages (id, session_id, role, content, context_vectors, token_count, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                message.id.clone(),
                message.timestamp.to_rfc3339(), // Using timestamp as session_id placeholder - this needs to be fixed
                message.role.to_string(),
                message.content.clone(),
                context_vectors_json,
                message.token_count,
                message.timestamp.to_rfc3339()
            ],
        ).await?;

        Ok(())
    }

    /// Update session's last message timestamp
    async fn update_session_last_message(&self, conn: &Connection, session_id: &str) -> Result<()> {
        conn.execute(
            "UPDATE chat_sessions SET last_message_at = ?, updated_at = ? WHERE id = ?",
            params![Utc::now().to_rfc3339(), Utc::now().to_rfc3339(), session_id],
        ).await?;

        Ok(())
    }

    /// Delete a chat session
    pub async fn delete_session(
        &self,
        conn: &Connection,
        session_id: &str,
        user_id: &str,
    ) -> Result<()> {
        // Verify session belongs to user
        self.get_session(conn, session_id, user_id).await?;

        conn.execute(
            "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
            params![session_id, user_id],
        ).await?;

        Ok(())
    }

    /// Update session title
    pub async fn update_session_title(
        &self,
        conn: &Connection,
        session_id: &str,
        user_id: &str,
        title: String,
    ) -> Result<()> {
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            params![title, Utc::now().to_rfc3339(), session_id, user_id],
        ).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_message_creation() {
        let message = ChatMessage::new(MessageRole::User, "Hello".to_string());
        assert_eq!(message.role, MessageRole::User);
        assert_eq!(message.content, "Hello");
    }

    #[test]
    fn test_chat_session_creation() {
        let session = ChatSession::new("user123".to_string(), Some("Test Session".to_string()));
        assert_eq!(session.user_id, "user123");
        assert_eq!(session.title, Some("Test Session".to_string()));
    }
}
