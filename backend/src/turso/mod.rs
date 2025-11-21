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
use crate::service::storage_quota::StorageQuotaService;
use crate::service::account_deletion::AccountDeletionService;
use crate::service::ai_service::{AIChatService, AIInsightsService, AiReportsService, OpenRouterClient, GeminiClient, VoyagerClient, QdrantDocumentClient, TradeVectorService, ChatVectorization, NotebookVectorization, PlaybookVectorization};

/// Application state containing Turso configuration and connections
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<TursoConfig>,
    pub turso_client: Arc<TursoClient>,
    pub webhook_handler: Arc<ClerkWebhookHandler>,
    pub cache_service: Arc<CacheService>,
    pub rate_limiter: Arc<RateLimiter>,
    pub storage_quota_service: Arc<StorageQuotaService>,
    pub account_deletion_service: Arc<AccountDeletionService>,
    pub ai_chat_service: Arc<AIChatService>,
    #[allow(dead_code)]
    pub ai_insights_service: Arc<AIInsightsService>,
    #[allow(dead_code)]
    pub ai_reports_service: Arc<AiReportsService>,
    pub trade_notes_service: Arc<TradeNotesService>,
    pub trade_vector_service: Arc<TradeVectorService>,
    pub notebook_vector_service: Arc<NotebookVectorization>,
    pub playbook_vector_service: Arc<PlaybookVectorization>,
    #[allow(dead_code)]
    pub gemini_client: Option<Arc<GeminiClient>>,
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

        // Initialize storage quota service
        let storage_quota_service = Arc::new(StorageQuotaService::new(Arc::clone(&turso_client)));

        // Initialize AI services
        let openrouter_config = crate::turso::vector_config::OpenRouterConfig::from_env()
            .map_err(|e| format!("Failed to load OpenRouter config: {}", e))?;
        let openrouter_client = Arc::new(OpenRouterClient::new(openrouter_config)?);
        
        // Initialize Gemini client (optional - only if GEMINI_API_KEY is set)
        let gemini_client = match crate::turso::vector_config::GeminiConfig::from_env() {
            Ok(gemini_config) => {
                match GeminiClient::new(gemini_config) {
                    Ok(client) => {
                        log::info!("Gemini client initialized successfully");
                        Some(Arc::new(client))
                    }
                    Err(e) => {
                        log::warn!("Failed to initialize Gemini client: {}. Continuing without Gemini support.", e);
                        None
                    }
                }
            }
            Err(_) => {
                log::debug!("GEMINI_API_KEY not set, skipping Gemini client initialization");
                None
            }
        };
        
        let voyager_config = crate::turso::vector_config::VoyagerConfig::from_env()
            .map_err(|e| format!("Failed to load Voyager config: {}", e))?;
        let voyager_client = Arc::new(VoyagerClient::new(voyager_config)?);
        
        let qdrant_config = crate::turso::vector_config::QdrantConfig::from_env()
            .map_err(|e| format!("Failed to load Qdrant config: {}", e))?;
        let qdrant_client = Arc::new(QdrantDocumentClient::new(qdrant_config.clone()).await
            .map_err(|e| format!("Failed to create Qdrant client: {}", e))?);
        
        // Perform health check (non-blocking - log warning if it fails but don't fail startup)
        let qdrant_client_for_health = Arc::clone(&qdrant_client);
        tokio::spawn(async move {
            if let Err(e) = qdrant_client_for_health.health_check().await {
                log::warn!("Qdrant health check failed: {}. The service will continue, but vector operations may fail.", e);
            }
        });
        
        // Initialize ChatVectorization service
        let chat_vector_service = Arc::new(ChatVectorization::new(
            Arc::clone(&voyager_client),
            Arc::clone(&qdrant_client),
        ));
        
        // Initialize PlaybookVectorization service
        let playbook_vector_service = Arc::new(PlaybookVectorization::new(
            Arc::clone(&voyager_client),
            Arc::clone(&qdrant_client),
        ));
        
        // Initialize NotebookVectorization service
        let notebook_vector_service = Arc::new(NotebookVectorization::new(
            Arc::clone(&voyager_client),
            Arc::clone(&qdrant_client),
        ));
        
        let ai_chat_service = Arc::new(AIChatService::new(
            Arc::clone(&chat_vector_service),
            Arc::clone(&qdrant_client),
            Arc::clone(&openrouter_client),
            Arc::clone(&turso_client),
            Arc::clone(&voyager_client),
            10, // max_context_vectors
        ));
        
        let ai_insights_service = Arc::new(AIInsightsService::new(
            Arc::clone(&openrouter_client),
            Arc::clone(&turso_client),
            Arc::clone(&voyager_client),
            Arc::clone(&qdrant_client),
            10, // max_context_vectors
        ));

        let ai_reports_service = Arc::new(AiReportsService::new(
            Arc::clone(&turso_client),
            Arc::clone(&ai_insights_service),
        ));

        let trade_notes_service = Arc::new(TradeNotesService::new(
            Arc::clone(&cache_service),
        ));

        // Initialize ImageUploadService for account deletion (used for Supabase Storage cleanup)
        let image_storage_config = crate::service::image_upload::SupabaseStorageConfig::from_env()
            .map_err(|e| format!("Failed to load Supabase Storage config: {}", e))?;
        let image_upload_service = Arc::new(
            crate::service::image_upload::ImageUploadService::new(image_storage_config)
                .map_err(|e| format!("Failed to create ImageUploadService: {}", e))?
        );

        // Initialize AccountDeletionService
        let supabase_url = std::env::var("SUPABASE_URL")
            .map_err(|_| "SUPABASE_URL environment variable not set")?;
        let supabase_service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY environment variable not set")?;

        let account_deletion_service = Arc::new(AccountDeletionService::new(
            Arc::clone(&turso_client),
            Arc::clone(&image_upload_service),
            Arc::clone(&qdrant_client),
            supabase_url,
            supabase_service_role_key,
        ));

        // Initialize TradeVectorService for vectorizing trade mistakes and notes
        let trade_vector_service = Arc::new(TradeVectorService::new(
            Arc::clone(&voyager_client),
            Arc::clone(&qdrant_client),
        ));

        Ok(Self {
            config,
            turso_client,
            webhook_handler,
            cache_service,
            rate_limiter,
            storage_quota_service,
            account_deletion_service,
            ai_chat_service,
            ai_insights_service,
            ai_reports_service,
            trade_notes_service,
            trade_vector_service,
            notebook_vector_service,
            playbook_vector_service,
            gemini_client,
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
