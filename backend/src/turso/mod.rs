//! Turso integration module for Rust backend
//! 
//! This module provides database connection, user database management,
//! and Clerk webhook integration for a multi-tenant system where each
//! user gets their own Turso database.

pub mod schema;

pub mod auth;
pub mod client;
pub mod config;
pub mod webhook;
pub mod redis;
pub mod vector_config;
pub mod jwt_cache;

// Re-export commonly used items
pub use auth::{
    get_user_id,
    get_supabase_user_id,
    validate_jwt_token,
    validate_supabase_jwt_token,
    validate_jwt_token_from_query,
    AuthError,
};
pub use client::TursoClient;
pub use config::{TursoConfig, ClerkClaims, SupabaseClaims};
pub use webhook::ClerkWebhookHandler;

use std::sync::Arc;
use crate::service::cache_service::CacheService;
use crate::service::trade_notes_service::TradeNotesService;
use crate::service::rate_limiter::RateLimiter;
use crate::service::ai_service::{AIChatService, AIInsightsService, AiReportsService, AINotesService, VectorizationService, OpenRouterClient, VoyagerClient, UpstashVectorClient, QdrantDocumentClient, HybridSearchService};

/// Application state containing Turso configuration and connections
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<TursoConfig>,
    pub turso_client: Arc<TursoClient>,
    pub webhook_handler: Arc<ClerkWebhookHandler>,
    pub cache_service: Arc<CacheService>,
    pub rate_limiter: Arc<RateLimiter>,
    pub ai_chat_service: Arc<AIChatService>,
    #[allow(dead_code)]
    pub ai_insights_service: Arc<AIInsightsService>,
    #[allow(dead_code)]
    pub ai_reports_service: Arc<AiReportsService>,
    #[allow(dead_code)]
    pub ai_notes_service: Arc<AINotesService>,
    pub trade_notes_service: Arc<TradeNotesService>,
    pub vectorization_service: Arc<VectorizationService>,
}

impl AppState {
    /// Initialize application state with Turso connections
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Load configuration from environment
        let config = Arc::new(TursoConfig::from_env()?);
        
        // Initialize Turso client
        let turso_client = Arc::new(TursoClient::new((*config).clone()).await?);
        
        // Initialize webhook handler
        let webhook_handler = Arc::new(ClerkWebhookHandler::new(
            Arc::clone(&turso_client),
            Arc::clone(&config),
        ));

        // Initialize Redis client
        let redis_config = crate::turso::redis::RedisConfig::from_env()
            .map_err(|e| format!("Failed to load Redis config: {}", e))?;
        
        let redis_client = crate::turso::redis::RedisClient::new(redis_config).await
            .map_err(|e| format!("Failed to create Redis client: {}", e))?;

        // Initialize cache service
        let mut cache_service = CacheService::new(redis_client.clone());
        cache_service.initialize().await
            .map_err(|e| format!("Failed to initialize cache service: {}", e))?;
        
        let cache_service = Arc::new(cache_service);

        // Initialize rate limiter (uses same Redis client)
        let rate_limiter = Arc::new(RateLimiter::new(redis_client));

        // Initialize AI services
        let openrouter_config = crate::turso::vector_config::OpenRouterConfig::from_env()
            .map_err(|e| format!("Failed to load OpenRouter config: {}", e))?;
        let openrouter_client = Arc::new(OpenRouterClient::new(openrouter_config)?);
        
        let vector_config = crate::turso::vector_config::VectorConfig::from_env()
            .map_err(|e| format!("Failed to load Vector config: {}", e))?;
        let upstash_vector_client = Arc::new(UpstashVectorClient::new(vector_config)?);
        
        let voyager_config = crate::turso::vector_config::VoyagerConfig::from_env()
            .map_err(|e| format!("Failed to load Voyager config: {}", e))?;
        let voyager_client = Arc::new(VoyagerClient::new(voyager_config)?);
        
        let qdrant_config = crate::turso::vector_config::QdrantConfig::from_env()
            .map_err(|e| format!("Failed to load Qdrant config: {}", e))?;
        let qdrant_client = Arc::new(QdrantDocumentClient::new(qdrant_config).await
            .map_err(|e| format!("Failed to create Qdrant client: {}", e))?);
        
        let ai_config = crate::turso::vector_config::AIConfig::from_env()
            .map_err(|e| format!("Failed to load AI config: {}", e))?;
        let vectorization_service = Arc::new(VectorizationService::new(
            Arc::clone(&voyager_client),
            Arc::clone(&upstash_vector_client),
            Arc::clone(&qdrant_client),
            ai_config.clone(),
        ));
        
        // Initialize hybrid search service
        let hybrid_search_service = Arc::new(HybridSearchService::new(
            Arc::clone(&upstash_vector_client),
            Arc::clone(&qdrant_client),
            Arc::clone(&voyager_client),
            ai_config.hybrid_config.clone(),
        ));
        
        let ai_chat_service = Arc::new(AIChatService::new(
            Arc::clone(&vectorization_service),
            Arc::clone(&hybrid_search_service),
            Arc::clone(&openrouter_client),
            Arc::clone(&turso_client),
            Arc::clone(&voyager_client),
            10, // max_context_vectors
        ));
        
        let ai_insights_service = Arc::new(AIInsightsService::new(
            Arc::clone(&vectorization_service),
            Arc::clone(&openrouter_client),
            Arc::clone(&turso_client),
            10, // max_context_vectors
        ));

        let ai_reports_service = Arc::new(AiReportsService::new(
            Arc::clone(&turso_client),
            Arc::clone(&ai_insights_service),
        ));

        let ai_notes_service = Arc::new(AINotesService::new(
            Arc::clone(&openrouter_client),
        ));

        let trade_notes_service = Arc::new(TradeNotesService::new(
            Arc::clone(&ai_notes_service),
            Arc::clone(&cache_service),
        ));

        Ok(Self {
            config,
            turso_client,
            webhook_handler,
            cache_service,
            rate_limiter,
            ai_chat_service,
            ai_insights_service,
            ai_reports_service,
            ai_notes_service,
            trade_notes_service,
            vectorization_service,
        })
    }

    /// Get user database connection for a specific user
    pub async fn get_user_db_connection(&self, user_id: &str) -> Result<Option<libsql::Connection>, Box<dyn std::error::Error>> {
        Ok(self.turso_client.get_user_database_connection(user_id).await?)
    }

    /// Health check for all services
    pub async fn health_check(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Check registry database connection
        self.turso_client.health_check().await?;
        
        // Check Redis connection
        self.cache_service.health_check().await?;
        
        log::info!("All services healthy (Turso + Redis)");
        Ok(())
    }
}
