// AI service module - centralized AI functionality
pub mod interface;
pub mod model_connection;
pub mod vector_service;

// Re-export commonly used types
pub use interface::AIChatService;
pub use interface::AIInsightsService;
pub use interface::AiReportsService;
pub use model_connection::OpenRouterClient;
pub use model_connection::GeminiClient;

// Re-export vector_service types
pub use vector_service::VoyagerClient;
pub use vector_service::QdrantDocumentClient;
pub use vector_service::TradeVectorService;
pub use vector_service::ChatVectorization;
pub use vector_service::NotebookVectorization;
pub use vector_service::PlaybookVectorization;
