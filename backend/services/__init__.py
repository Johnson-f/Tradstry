# This file makes the services directory a Python package (handle the business logic)

from .market_data_service import MarketDataService

# AI Services - now organized in ai/ subfolder with DAL architecture
from .ai.ai_chat_service import AIChatService
from .ai.ai_insights_service import AIInsightsService
from .ai.ai_reports_service import AIReportsService
from .ai.ai_embedding_service import AIEmbeddingService
from .ai.ai_orchestrator_service import AIOrchestrator
from .ai.rag_vector_service import RAGVectorService
from .ai.rag_retriever_service import RAGRetrieverService

# Legacy imports for backward compatibility (will be deprecated)
# These import from the new ai/ folder but maintain old import paths
from .ai.ai_chat_service import AIChatService as LegacyAIChatService
from .ai.ai_insights_service import AIInsightsService as LegacyAIInsightsService  
from .ai.ai_reports_service import AIReportsService as LegacyAIReportsService
from .ai.ai_embedding_service import AIEmbeddingService as LegacyAIEmbeddingService