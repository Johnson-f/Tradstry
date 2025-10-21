#![allow(dead_code)]

use crate::models::ai::chat::{
    ChatMessage, ChatSession, ChatRequest, ChatResponse, ContextSource, 
    MessageRole, ChatSessionDetailsResponse, ChatSessionListResponse, ChatSessionSummary
};
use crate::models::ai::chat_templates::{ChatPromptConfig, ContextFormatter};
use crate::service::ai_service::vectorization_service::VectorizationService;
use crate::service::ai_service::openrouter_client::{OpenRouterClient, MessageRole as OpenRouterMessageRole};
use crate::service::ai_service::embedding_service::EmbeddingService;
use crate::turso::client::TursoClient;
use crate::turso::vector_client::VectorClient;
use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
use log::warn;
use serde_json;
use std::sync::Arc;
use uuid::Uuid;

/// AI Chat Service for handling chat functionality
#[derive(Clone)]
pub struct AIChatService {
    vectorization_service: Arc<VectorizationService>,
    openrouter_client: Arc<OpenRouterClient>,
    turso_client: Arc<TursoClient>,
    vector_client: Arc<VectorClient>,
    embedding_service: Arc<EmbeddingService>,
    max_context_vectors: usize,
    prompt_config: ChatPromptConfig,
}

impl AIChatService {
    pub fn new(
        vectorization_service: Arc<VectorizationService>,
        openrouter_client: Arc<OpenRouterClient>,
        turso_client: Arc<TursoClient>,
        vector_client: Arc<VectorClient>,
        embedding_service: Arc<EmbeddingService>,
        max_context_vectors: usize,
    ) -> Self {
        Self {
            vectorization_service,
            openrouter_client,
            turso_client,
            vector_client,
            embedding_service,
            max_context_vectors,
            prompt_config: ChatPromptConfig::default(),
        }
    }

    /// Configure prompt templates dynamically
    pub fn configure_prompts(&mut self, config: ChatPromptConfig) {
        self.prompt_config = config;
    }
    
    /// Get current prompt configuration
    pub fn get_prompt_config(&self) -> &ChatPromptConfig {
        &self.prompt_config
    }

    /// Build enhanced system prompt based on query type and context
    fn build_enhanced_system_prompt(
        &self,
        query: &str,
        context_sources: &[ContextSource],
    ) -> String {
        // Detect query type and get appropriate template
        let template = self.prompt_config.detect_query_type(query);
        
        // Build base system prompt
        let mut system_prompt = ContextFormatter::build_system_prompt(template);
        
        // Add context if available
        if !context_sources.is_empty() {
            let formatted_context = ContextFormatter::format_context_sources(
                context_sources,
                self.prompt_config.context_max_length,
                self.prompt_config.include_relevance_scores,
            );
            
            system_prompt.push_str(&format!("\n\n{}", formatted_context));
        }
        
        system_prompt
    }
    
    /// Build enhanced messages with system prompt
    fn build_enhanced_messages(
        &self,
        messages: &[ChatMessage],
        query: &str,
        context_sources: &[ContextSource],
    ) -> Vec<crate::service::openrouter_client::ChatMessage> {
        let mut openrouter_messages = Vec::new();
        
        // Add system prompt if this is the first user message or if we have context
        if messages.len() == 1 || !context_sources.is_empty() {
            let system_prompt = self.build_enhanced_system_prompt(query, context_sources);
            openrouter_messages.push(crate::service::openrouter_client::ChatMessage {
                role: OpenRouterMessageRole::System,
                content: system_prompt,
            });
        }
        
        // Convert existing messages
        for msg in messages {
            openrouter_messages.push(crate::service::openrouter_client::ChatMessage {
                role: match msg.role {
                    MessageRole::User => OpenRouterMessageRole::User,
                    MessageRole::Assistant => OpenRouterMessageRole::Assistant,
                    MessageRole::System => OpenRouterMessageRole::System,
                },
                content: msg.content.clone(),
            });
        }
        
        openrouter_messages
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

        // Retrieve relevant context using vector similarity search with fallback
        let context_sources = if request.include_context.unwrap_or(true) {
            match self.retrieve_context(user_id, &request.message, request.max_context_vectors.unwrap_or(self.max_context_vectors)).await {
                Ok(sources) => sources,
                Err(e) => {
                    warn!("Failed to retrieve context for regular response: {}. Continuing without context.", e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        // Build conversation history
        let mut messages = self.get_session_messages(conn, &session.id).await?;
        
        // Add user message
        let user_message = ChatMessage::new(session.id.clone(), MessageRole::User, request.message.clone());
        messages.push(user_message.clone());

        // Convert to OpenRouter format with enhanced prompts
        let openrouter_messages = self.build_enhanced_messages(&messages, &request.message, &context_sources);

        // Generate AI response
        let ai_response = self.openrouter_client.generate_chat(openrouter_messages).await?;

        // Create assistant message
        let assistant_message = ChatMessage::new(session.id.clone(), MessageRole::Assistant, ai_response.clone())
            .with_context(context_sources.iter().map(|s| s.vector_id.clone()).collect());

        // Store messages in database
        self.store_message(conn, &user_message).await?;
        self.vectorize_message(&user_message, user_id).await.ok();

        self.store_message(conn, &assistant_message).await?;
        self.vectorize_message(&assistant_message, user_id).await.ok();

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

        // Retrieve relevant context with fallback
        let context_sources = if request.include_context.unwrap_or(true) {
            match self.retrieve_context(user_id, &request.message, request.max_context_vectors.unwrap_or(self.max_context_vectors)).await {
                Ok(sources) => sources,
                Err(e) => {
                    warn!("Failed to retrieve context for streaming response: {}. Continuing without context.", e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        // Build conversation history
        let mut messages = self.get_session_messages(conn, &session.id).await?;
        
        // Add user message
        let user_message = ChatMessage::new(session.id.clone(), MessageRole::User, request.message.clone());
        messages.push(user_message.clone());

        // Convert to OpenRouter format with enhanced prompts
        let openrouter_messages = self.build_enhanced_messages(&messages, &request.message, &context_sources);

        // Generate streaming AI response
        let stream_receiver = self.openrouter_client.generate_chat_stream(openrouter_messages).await?;

        // Store user message
        self.store_message(conn, &user_message).await?;
        self.vectorize_message(&user_message, user_id).await.ok();

        // Create assistant message placeholder
        let assistant_message_id = Uuid::new_v4().to_string();
        let assistant_message = ChatMessage {
            id: assistant_message_id.clone(),
            session_id: session.id.clone(), // ADD THIS
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

        // Create channel for frontend
        let (frontend_tx, frontend_rx) = tokio::sync::mpsc::channel(100);
        
        // Spawn task to accumulate and save content
        let service = self.clone(); // Make service cloneable
        let msg_id = assistant_message_id.clone();
        let user_id_clone = user_id.to_string();
        let assistant_message_clone = assistant_message.clone();
        tokio::spawn(async move {
            let mut accumulated = String::new();
            while let Some(token) = stream_receiver.recv().await {
                accumulated.push_str(&token);
                frontend_tx.send(token).await.ok();
            }
            
            // Update database with final content
            if let Ok(conn) = service.turso_client.get_connection(&user_id_clone).await {
                service.update_message_content(&conn, &msg_id, accumulated.clone()).await.ok();
                
                // Vectorize the completed message
                let mut completed_message = assistant_message_clone;
                completed_message.content = accumulated;
                service.vectorize_message(&completed_message, &user_id_clone).await.ok();
            }
        });

        Ok((frontend_rx, session.id, assistant_message_id))
    }

    /// Vectorize a message and store it in the vector database
    async fn vectorize_message(&self, message: &ChatMessage, user_id: &str) -> Result<()> {
        let embedding = self.embedding_service.embed_text(&message.content).await?;
        
        let metadata = crate::turso::vector_client::VectorMetadata {
            user_id: user_id.to_string(),
            data_type: "chat".to_string(),
            entity_id: message.id.clone(),
            content_snippet: message.content.chars().take(200).collect(),
            created_at: message.timestamp.to_rfc3339(),
        };
        
        self.vector_client
            .upsert_vector(message.id.clone(), embedding, metadata)
            .await?;
        
        Ok(())
    }

    /// Retrieve relevant context using vector similarity search
    async fn retrieve_context(
        &self,
        user_id: &str,
        query: &str,
        max_vectors: usize,
    ) -> Result<Vec<ContextSource>> {
        // Generate embedding for query
        let query_vector = self.embedding_service.embed_text(query).await?;
        
        // Search Upstash Vector (automatically searches all data types)
        let matches = self.vector_client
            .search_similar(query_vector, user_id, max_vectors, None)
            .await?;
        
        // Convert to ContextSource
        let context_sources = matches
            .into_iter()
            .map(|m| ContextSource::new(
                m.id,
                m.metadata.data_type,
                m.metadata.entity_id,
                m.score,
                m.metadata.content_snippet,
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
        let stmt = conn.prepare(
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
        let stmt = conn.prepare(
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
        let stmt = conn.prepare(
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

    /// Update message content after streaming completes
    async fn update_message_content(
        &self,
        conn: &Connection,
        message_id: &str,
        content: String,
    ) -> Result<()> {
        conn.execute(
            "UPDATE chat_messages SET content = ? WHERE id = ?",
            params![content, message_id],
        ).await?;
        Ok(())
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
                message.session_id.clone(), // FIXED: Use actual session_id instead of timestamp
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

    /// Health check for AI chat service
    pub async fn health_check(&self) -> Result<()> {
        // Check vectorization service
        self.vectorization_service.health_check().await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_message_creation() {
        let message = ChatMessage::new("session123".to_string(), MessageRole::User, "Hello".to_string());
        assert_eq!(message.session_id, "session123");
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
