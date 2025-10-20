use serde::{Deserialize, Serialize};
use std::env;

/// Configuration for Upstash Vector database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorConfig {
    pub url: String,
    pub token: String,
    pub dimensions: usize,
    pub namespace_prefix: String,
    pub max_retries: u32,
    pub timeout_seconds: u64,
}

impl VectorConfig {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(VectorConfig {
            url: env::var("UPSTASH_VECTOR_URL")
                .map_err(|_| "UPSTASH_VECTOR_URL environment variable not set")?,
            token: env::var("UPSTASH_VECTOR_TOKEN")
                .map_err(|_| "UPSTASH_VECTOR_TOKEN environment variable not set")?,
            dimensions: 1024, // voyage-finance-2 uses 1024 dimensions
            namespace_prefix: "user".to_string(),
            max_retries: 3,
            timeout_seconds: 30,
        })
    }

    /// Generate namespace for a specific user
    pub fn get_user_namespace(&self, user_id: &str) -> String {
        format!("{}_{}", self.namespace_prefix, user_id)
    }

    /// Get the base URL for vector operations
    pub fn get_base_url(&self) -> String {
        format!("{}/vectors", self.url)
    }
}

/// Configuration for Voyager API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoyagerConfig {
    pub api_key: String,
    pub api_url: String,
    pub model: String,
    pub max_retries: u32,
    pub timeout_seconds: u64,
    pub batch_size: usize,
}

impl VoyagerConfig {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(VoyagerConfig {
            api_key: env::var("VOYAGER_API_KEY")
                .map_err(|_| "VOYAGER_API_KEY environment variable not set")?,
            api_url: env::var("VOYAGER_API_URL")
                .unwrap_or_else(|_| "https://api.voyageai.com/v1".to_string()),
            model: "voyage-finance-2".to_string(),
            max_retries: 3,
            timeout_seconds: 30,
            batch_size: 10, // Voyager API limit
        })
    }

    /// Get the embeddings endpoint URL
    pub fn get_embeddings_url(&self) -> String {
        format!("{}/embeddings", self.api_url)
    }
}

/// Configuration for Gemini API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiConfig {
    pub api_key: String,
    pub model: String,
    pub max_retries: u32,
    pub timeout_seconds: u64,
    pub max_tokens: u32,
    pub temperature: f32,
}

impl GeminiConfig {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(GeminiConfig {
            api_key: env::var("GEMINI_API_KEY")
                .map_err(|_| "GEMINI_API_KEY environment variable not set")?,
            model: env::var("GEMINI_MODEL")
                .unwrap_or_else(|_| "gemini-1.5-flash".to_string()),
            max_retries: 3,
            timeout_seconds: 60,
            max_tokens: 4096,
            temperature: 0.7,
        })
    }

    /// Get the chat completion endpoint URL
    pub fn get_chat_url(&self) -> String {
        format!("https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent", self.model)
    }

    /// Get the non-streaming chat completion endpoint URL
    pub fn get_chat_url_non_streaming(&self) -> String {
        format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent", self.model)
    }
}

/// AI Configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub vector_config: VectorConfig,
    pub voyager_config: VoyagerConfig,
    pub gemini_config: GeminiConfig,
    pub max_context_vectors: usize,
    pub insights_schedule_enabled: bool,
    pub insights_schedule_hour: u8,
    pub batch_vectorization_interval_minutes: u64,
}

impl AIConfig {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(AIConfig {
            vector_config: VectorConfig::from_env()?,
            voyager_config: VoyagerConfig::from_env()?,
            gemini_config: GeminiConfig::from_env()?,
            max_context_vectors: env::var("MAX_CONTEXT_VECTORS")
                .unwrap_or_else(|_| "10".to_string())
                .parse()
                .unwrap_or(10),
            insights_schedule_enabled: env::var("AI_INSIGHTS_SCHEDULE_ENABLED")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            insights_schedule_hour: env::var("AI_INSIGHTS_SCHEDULE_HOUR")
                .unwrap_or_else(|_| "2".to_string())
                .parse()
                .unwrap_or(2),
            batch_vectorization_interval_minutes: env::var("BATCH_VECTORIZATION_INTERVAL_MINUTES")
                .unwrap_or_else(|_| "60".to_string())
                .parse()
                .unwrap_or(60),
        })
    }
}

