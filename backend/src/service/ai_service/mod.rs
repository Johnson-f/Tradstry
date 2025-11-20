// AI service module - centralized AI functionality
pub mod chat_service;
pub mod insights_service;
pub mod reports_service;
pub mod notes_service;
pub mod openrouter_client;
pub mod vector_service;

// Re-export commonly used types
pub use chat_service::AIChatService;
pub use insights_service::AIInsightsService;
pub use reports_service::AiReportsService;
pub use notes_service::AINotesService;
pub use openrouter_client::OpenRouterClient;

// Re-export vector_service types
pub use vector_service::VoyagerClient;
pub use vector_service::QdrantDocumentClient;
pub use vector_service::TradeVectorService;
pub use vector_service::ChatVectorization;
pub use vector_service::PlaybookVectorization;
