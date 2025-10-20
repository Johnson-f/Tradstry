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

// Re-export commonly used items
pub use auth::{
    get_user_id,
    get_supabase_user_id,
    validate_jwt_token,
    validate_supabase_jwt_token,
    AuthError,
};
pub use client::TursoClient;
pub use config::{TursoConfig, ClerkClaims, SupabaseClaims};
pub use webhook::ClerkWebhookHandler;

use std::sync::Arc;
use crate::service::cache_service::CacheService;

/// Application state containing Turso configuration and connections
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<TursoConfig>,
    pub turso_client: Arc<TursoClient>,
    pub webhook_handler: Arc<ClerkWebhookHandler>,
    pub cache_service: Arc<CacheService>,
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
        let mut cache_service = CacheService::new(redis_client);
        cache_service.initialize().await
            .map_err(|e| format!("Failed to initialize cache service: {}", e))?;
        
        let cache_service = Arc::new(cache_service);

        Ok(Self {
            config,
            turso_client,
            webhook_handler,
            cache_service,
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
