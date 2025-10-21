// AI service module - centralized AI functionality
pub mod chat_service;
pub mod insights_service;
pub mod openrouter_client;
pub mod voyager_client;
pub mod upstash_vector_client;
pub mod vectorization_service;
pub mod data_formatter;
pub mod embedding_service;

// Re-export commonly used types
pub use chat_service::AIChatService;
pub use insights_service::AIInsightsService;
pub use vectorization_service::VectorizationService;
pub use openrouter_client::OpenRouterClient;
pub use voyager_client::VoyagerClient;
pub use upstash_vector_client::UpstashVectorClient;
pub use data_formatter::DataFormatter;
pub use embedding_service::EmbeddingService;
