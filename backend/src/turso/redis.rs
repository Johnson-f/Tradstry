use anyhow::{Context, Result};
use deadpool_redis::{Config, Pool, Runtime};
use deadpool_redis::redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Redis configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct RedisConfig {
    pub url: String,
    #[allow(dead_code)]
    pub token: String,
    #[allow(dead_code)]
    pub max_connections: u32,
    #[allow(dead_code)]
    pub connection_timeout: Duration,
    #[allow(dead_code)]
    pub command_timeout: Duration,
}

impl RedisConfig {
    /// Load Redis configuration from environment variables
    pub fn from_env() -> Result<Self> {
        let url = std::env::var("UPSTASH_REDIS_REST_URL")
            .context("UPSTASH_REDIS_REST_URL environment variable not set")?;
        
        let token = std::env::var("UPSTASH_REDIS_REST_TOKEN")
            .context("UPSTASH_REDIS_REST_TOKEN environment variable not set")?;

        Ok(Self {
            url,
            token,
            max_connections: 10,
            connection_timeout: Duration::from_secs(5),
            command_timeout: Duration::from_secs(10),
        })
    }
}

/// Redis client wrapper with connection management
#[derive(Debug, Clone)]
pub struct RedisClient {
    pool: Pool,
}

impl RedisClient {
    /// Create a new Redis client with connection pooling
    pub async fn new(config: RedisConfig) -> Result<Self> {
        let pool_config = Config::from_url(config.url);
        let pool = pool_config.create_pool(Some(Runtime::Tokio1))?;
        Ok(Self { pool })
    }

    /// Get a value from Redis cache
    pub async fn get<T>(&self, key: &str) -> Result<Option<T>>
    where
        T: for<'de> Deserialize<'de>,
    {
        let mut conn = self.pool.get().await?;
        let cached_data: Option<String> = conn.get(key).await?;
        Ok(cached_data.map(|data| serde_json::from_str(&data)).transpose()?)
    }

    /// Set a value in Redis cache with TTL
    pub async fn set<T>(&self, key: &str, value: &T, ttl_seconds: usize) -> Result<()>
    where
        T: Serialize,
    {
        let mut conn = self.pool.get().await?;
        let serialized_value = serde_json::to_string(value)?;
        let _: () = conn.set_ex(key, serialized_value, ttl_seconds as u64).await?;
        Ok(())
    }

    /// Delete a key from Redis
    #[allow(dead_code)]
    pub async fn del(&self, key: &str) -> Result<()> {
        let mut conn = self.pool.get().await?;
        let _: () = conn.del(key).await?;
        Ok(())
    }

    /// Set expiration time for a key
    #[allow(dead_code)]
    pub async fn expire(&self, key: &str, ttl_seconds: usize) -> Result<()> {
        let mut conn = self.pool.get().await?;
        let _: () = conn.expire(key, ttl_seconds as i64).await?;
        Ok(())
    }

    /// Delete all keys matching a pattern
    pub async fn del_pattern(&self, pattern: &str) -> Result<usize> {
        let mut conn = self.pool.get().await?;
        let keys: Vec<String> = conn.keys(pattern).await?;
        let count = keys.len();
        if !keys.is_empty() {
            let _: () = conn.del(keys).await?;
        }
        Ok(count)
    }

    /// Health check for Redis connection
    pub async fn health_check(&self) -> Result<()> {
        let mut conn = self.pool.get().await?;
        // Simple health check by trying to get a non-existent key
        let _: Option<String> = conn.get("health_check").await?;
        Ok(())
    }
}

/// Cache key patterns for consistent key generation
pub mod cache_keys {
    #[allow(dead_code)]
    pub fn user_data(user_id: &str, table: &str) -> String {
        format!("db:{}:{}:all", user_id, table)
    }

    #[allow(dead_code)]
    pub fn user_list(user_id: &str, table: &str, query_hash: &str) -> String {
        format!("db:{}:{}:list:{}", user_id, table, query_hash)
    }

    #[allow(dead_code)]
    pub fn user_item(user_id: &str, table: &str, id: &str) -> String {
        format!("db:{}:{}:item:{}", user_id, table, id)
    }

    #[allow(dead_code)]
    pub fn analytics(user_id: &str, table: &str, time_range: &str) -> String {
        format!("analytics:db:{}:{}:{}", user_id, table, time_range)
    }

    #[allow(dead_code)]
    pub fn analytics_metric(user_id: &str, table: &str, metric: &str) -> String {
        format!("analytics:db:{}:{}:{}", user_id, table, metric)
    }
}

/// TTL constants for different data types
pub mod ttl {
    pub const STOCKS_LIST: usize = 1800; // 30 minutes
    pub const OPTIONS_LIST: usize = 1800; // 30 minutes
    pub const TRADE_NOTES_LIST: usize = 1800; // 30 minutes
    pub const PLAYBOOK_LIST: usize = 3600; // 1 hour
    pub const NOTEBOOK_NOTES_LIST: usize = 600; // 10 minutes
    pub const IMAGES_LIST: usize = 3600; // 1 hour
    pub const ANALYTICS: usize = 900; // 15 minutes
    #[allow(dead_code)]
    pub const ANALYTICS_PNL: usize = 1800; // 30 minutes
    pub const CALENDAR_EVENTS: usize = 300; // 5 minutes
    pub const PUBLIC_HOLIDAYS: usize = 86400; // 24 hours
    #[allow(dead_code)]
    pub const MARKET_DATA: usize = 120; // 2 minutes
    #[allow(dead_code)]
    pub const MARKET_MOVERS: usize = 300; // 5 minutes
}