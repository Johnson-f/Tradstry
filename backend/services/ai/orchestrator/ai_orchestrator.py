from typing import Dict, Any, Optional, List, AsyncGenerator
import logging
from datetime import datetime

from .ai_model_manager import AIModelManager
from .ai_auth_validator import AIAuthValidator
from .ai_llm_handler import AILLMHandler
from .ai_report_generator import AIReportGenerator
from .ai_chat_processor import AIChatProcessor
from .ai_stream_handler import AIStreamHandler
from .ai_insights_generator import AIInsightsGenerator
from .ai_context_manager import AIContextManager
from .ai_content_processor import AIContentProcessor
from .ai_health_mointor import AIHealthMonitor

from ..trade_embeddings_service import TradeEmbeddingsService
from models.ai_insights import InsightType

logger = logging.getLogger(__name__)


class AIOrchestrator:
    """
    Main AI Orchestrator that coordinates all modular AI services.
    Provides a unified interface while distributing functionality across specialized components.
    """

    def __init__(self):
        """Initialize all AI orchestrator components."""
        try:
            logger.info("Initializing AI Orchestrator with modular architecture...")
            
            # Initialize core components first
            self.model_manager = AIModelManager()
            self.auth_validator = AIAuthValidator()
            self.llm_handler = AILLMHandler(self.model_manager)
            
            # Initialize context and content management
            self.context_manager = AIContextManager()
            self.content_processor = AIContentProcessor()
            
            # Initialize specialized AI handlers
            self.report_generator = AIReportGenerator(
                self.llm_handler, 
                self.auth_validator
            )
            
            self.chat_processor = AIChatProcessor(
                self.llm_handler,
                self.auth_validator,
                self.context_manager
            )
            
            self.stream_handler = AIStreamHandler(
                self.llm_handler,
                self.auth_validator,
                self.context_manager
            )
            
            self.insights_generator = AIInsightsGenerator(
                self.llm_handler,
                self.auth_validator
            )
            
            # Initialize health monitoring
            self.health_monitor = AIHealthMonitor()
            
            # Initialize trade embeddings service for RAG-enhanced context
            self.trade_embeddings = TradeEmbeddingsService()
            
            logger.info("AI Orchestrator initialization completed successfully (with trade embeddings support)")
            
        except Exception as e:
            logger.error(f"Error initializing AI Orchestrator: {str(e)}")
            raise

    # Report Generation Methods
    async def generate_daily_report(self, user: Dict[str, Any], time_range: str = "1d",
                                  custom_start_date: Optional[datetime] = None,
                                  custom_end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Generate a comprehensive daily trading report."""
        logger.info("Orchestrator: Generating daily report")
        try:
            result = await self.report_generator.generate_daily_report(
                user, time_range, custom_start_date, custom_end_date
            )
            
            # Index the generated report in RAG system for future context
            if result.get("report") and self.context_manager:
                await self.context_manager.index_ai_generated_content(
                    self.auth_validator.extract_access_token(user),
                    result["report"],
                    "daily_report"
                )
            
            return result
        except Exception as e:
            logger.error(f"Error in orchestrator daily report generation: {str(e)}")
            raise

    async def generate_performance_summary(self, user: Dict[str, Any], 
                                         time_range: str = "30d") -> Dict[str, Any]:
        """Generate a performance summary report."""
        logger.info("Orchestrator: Generating performance summary")
        return await self.report_generator.generate_performance_summary(user, time_range)

    async def get_reports(self, user: Dict[str, Any], 
                         report_type: Optional[str] = None,
                         limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieve generated reports for a user."""
        return await self.report_generator.get_reports(user, report_type, limit, offset)

    # Chat Processing Methods
    async def process_chat_message(self, user: Dict[str, Any], session_id: str,
                                 user_message: str, context_limit: int = 10) -> Dict[str, Any]:
        """Process a chat message with enhanced trade context."""
        logger.info("Orchestrator: Processing chat message with trade embeddings context")
        try:
            # Step 1: Extract symbols from user query
            symbols = await self.trade_embeddings.extract_symbols_from_query(user_message)
            logger.info(f"Extracted symbols from query: {symbols}")
            
            # Step 2: Get trade-specific context
            trade_context = ""
            user_token = self.auth_validator.extract_access_token(user)
            
            if user_token:
                # Search for relevant trade context
                trade_results = await self.trade_embeddings.search_user_trade_context(
                    query=user_message,
                    user_token=user_token,
                    symbol=symbols[0] if symbols else None,  # Use first symbol if available
                    limit=3
                )
                
                # Format context for LLM
                if trade_results:
                    trade_context = await self.trade_embeddings.format_context_for_llm(
                        trade_results, max_context_length=1500
                    )
                    logger.info(f"Added {len(trade_results)} trade context results to chat")
            
            # Step 3: Process chat with enhanced context
            # Pass trade context to chat processor via context manager
            if trade_context and hasattr(self.context_manager, 'set_additional_context'):
                self.context_manager.set_additional_context(trade_context)
            
            result = await self.chat_processor.process_chat_message(
                user, session_id, user_message, context_limit
            )
            
            # Step 4: Enhance result with trade context metadata
            if trade_context:
                result['trade_context_used'] = True
                result['symbols_detected'] = symbols
                result['context_sources'] = len(trade_results) if 'trade_results' in locals() else 0
            else:
                result['trade_context_used'] = False
                result['symbols_detected'] = symbols
                result['context_sources'] = 0
            
            # Step 5: Index the AI response in RAG system for future context
            if result.get("response") and self.context_manager:
                await self.context_manager.index_ai_generated_content(
                    user_token,
                    result["response"],
                    "chat_response"
                )
            
            return result
        except Exception as e:
            logger.error(f"Error in orchestrator chat processing: {str(e)}")
            # Fallback to standard processing without trade context
            try:
                return await self.chat_processor.process_chat_message(
                    user, session_id, user_message, context_limit
                )
            except Exception as fallback_error:
                logger.error(f"Fallback chat processing also failed: {str(fallback_error)}")
                raise

    async def process_chat_message_stream(self, user: Dict[str, Any], session_id: str,
                                        user_message: str, context_limit: int = 10) -> AsyncGenerator:
        """Process a chat message with streaming response and trade context."""
        logger.info("Orchestrator: Processing streaming chat message with trade embeddings context")
        try:
            # Get trade context before streaming (same as non-streaming)
            symbols = await self.trade_embeddings.extract_symbols_from_query(user_message)
            trade_context = ""
            user_token = self.auth_validator.extract_access_token(user)
            
            if user_token:
                trade_results = await self.trade_embeddings.search_user_trade_context(
                    query=user_message,
                    user_token=user_token,
                    symbol=symbols[0] if symbols else None,
                    limit=3
                )
                
                if trade_results:
                    trade_context = await self.trade_embeddings.format_context_for_llm(
                        trade_results, max_context_length=1500
                    )
                    logger.info(f"Added {len(trade_results)} trade context results to streaming chat")
            
            # Pass trade context to stream handler
            if trade_context and hasattr(self.context_manager, 'set_additional_context'):
                self.context_manager.set_additional_context(trade_context)
            
            full_response = ""
            first_chunk = True
            
            async for chunk in self.stream_handler.process_chat_message_stream(
                user, session_id, user_message, context_limit
            ):
                # Add trade context metadata to first chunk
                if first_chunk and trade_context:
                    chunk['trade_context_used'] = True
                    chunk['symbols_detected'] = symbols
                    chunk['context_sources'] = len(trade_results) if 'trade_results' in locals() else 0
                    first_chunk = False
                elif first_chunk:
                    chunk['trade_context_used'] = False
                    chunk['symbols_detected'] = symbols
                    chunk['context_sources'] = 0
                    first_chunk = False
                    
                if chunk.get("type") == "token":
                    full_response += chunk.get("content", "")
                yield chunk
            
            # Index the complete streaming response in RAG system
            if full_response and self.context_manager:
                await self.context_manager.index_ai_generated_content(
                    user_token,
                    {"content": full_response, "session_id": session_id, "had_trade_context": bool(trade_context)},
                    "streaming_chat_response"
                )
                
        except Exception as e:
            logger.error(f"Error in orchestrator streaming chat: {str(e)}")
            yield {"type": "error", "message": f"Streaming error: {str(e)}"}

    async def get_chat_sessions(self, user: Dict[str, Any], 
                              limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieve chat sessions for a user."""
        return await self.chat_processor.get_chat_sessions(user, limit, offset)

    async def get_session_messages(self, user: Dict[str, Any], session_id: str,
                                 limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieve messages for a specific chat session."""
        return await self.chat_processor.get_session_messages(user, session_id, limit, offset)

    async def search_messages(self, user: Dict[str, Any], query: str,
                            session_id: Optional[str] = None,
                            limit: int = 10, min_similarity: float = 0.7) -> List[Dict[str, Any]]:
        """Search messages using vector similarity."""
        return await self.chat_processor.search_messages(user, query, session_id, limit, min_similarity)

    # Insights Generation Methods
    async def generate_insights(self, user: Dict[str, Any], insight_types: List[InsightType],
                              time_range: str = "30d", min_confidence: float = 0.7) -> List[Dict[str, Any]]:
        """Generate AI insights based on trading data analysis."""
        logger.info("Orchestrator: Generating insights")
        try:
            result = await self.insights_generator.generate_insights(
                user, insight_types, time_range, min_confidence
            )
            
            # Index generated insights in RAG system
            if result and self.context_manager:
                for insight in result:
                    await self.context_manager.index_ai_generated_content(
                        self.auth_validator.extract_access_token(user),
                        insight,
                        "insight"
                    )
            
            return result
        except Exception as e:
            logger.error(f"Error in orchestrator insights generation: {str(e)}")
            raise

    async def generate_risk_insights(self, user: Dict[str, Any], 
                                   time_range: str = "7d") -> Dict[str, Any]:
        """Generate specific risk analysis insights."""
        logger.info("Orchestrator: Generating risk insights")
        return await self.insights_generator.generate_risk_insights(user, time_range)

    async def get_insights(self, user: Dict[str, Any], 
                         insight_type: Optional[str] = None,
                         limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        """Retrieve generated insights for a user."""
        return await self.insights_generator.get_insights(user, insight_type, limit, offset)

    # Context and Content Management Methods
    async def get_relevant_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Get relevant trading context using RAG and vector search."""
        if self.context_manager:
            return await self.context_manager.get_relevant_trading_context(access_token, query)
        else:
            return {"message": "Context manager not available"}

    def extract_symbols_from_query(self, query: str) -> List[str]:
        """Extract stock symbols from user query."""
        return self.content_processor.extract_symbols_from_query(query)

    async def search_contextual_content(self, access_token: str, query: str,
                                      content_types: List[str] = None,
                                      max_results: int = 10) -> List[Dict[str, Any]]:
        """Search for contextual content across different document types."""
        if self.context_manager:
            return await self.context_manager.search_contextual_content(
                access_token, query, content_types, max_results
            )
        else:
            return []

    # Model Management Methods
    def select_model(self, model_type: str, model_key: str) -> bool:
        """Select a specific model for use."""
        return self.model_manager.select_model(model_type, model_key)

    def get_model_info(self, model_type: str = None) -> Dict[str, Any]:
        """Get information about current and available models."""
        return self.model_manager.get_model_info(model_type)

    def validate_current_models(self) -> Dict[str, bool]:
        """Validate that current models are available and working."""
        return self.model_manager.validate_current_models()

    def get_fallback_model(self, model_type: str, current_model: str) -> Optional[str]:
        """Get a fallback model when the current model is unavailable."""
        return self.model_manager.get_fallback_model(model_type, current_model)

    def switch_to_stable_model(self, tier: int = 1) -> bool:
        """Switch to a stable model from the specified tier."""
        return self.model_manager.switch_to_stable_model(tier)

    def auto_recover_model(self) -> bool:
        """Automatically recover by trying stable models in order."""
        return self.model_manager.auto_recover_model()

    def get_stable_models_info(self) -> Dict[str, Any]:
        """Get information about stable models organized by tier."""
        return self.model_manager.get_stable_models_info()

    # Conversation Management Methods - Deprecated
    # Conversation history is now managed by AIChatService for persistence
    def clear_conversation_history(self):
        """Deprecated: Conversation history is now managed by AIChatService."""
        logger.warning("clear_conversation_history called on AIOrchestrator - this is deprecated. Use AIChatService instead.")
        pass

    def add_to_conversation_history(self, message: str, role: str = "user"):
        """Deprecated: Conversation history is now managed by AIChatService."""
        logger.warning("add_to_conversation_history called on AIOrchestrator - this is deprecated. Use AIChatService instead.")
        pass

    # Testing and Status Methods
    async def test_streaming_connection(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Test streaming connection and capabilities."""
        return await self.stream_handler.test_streaming_connection(user)

    async def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive health status of all orchestrator components."""
        try:
            return await self.health_monitor.get_comprehensive_health_status(self)
        except Exception as e:
            logger.error(f"Error getting health status: {str(e)}")
            return self.health_monitor.get_quick_health_status(self)

    def get_quick_health_status(self) -> Dict[str, Any]:
        """Get a quick synchronous health status check."""
        return self.health_monitor.get_quick_health_status(self)

    def get_orchestrator_status(self) -> Dict[str, Any]:
        """Get comprehensive status of the orchestrator and all components."""
        try:
            component_statuses = {}
            
            # Core components
            component_statuses["model_manager"] = {
                "available": bool(self.model_manager),
                "current_llm_model": getattr(self.model_manager, 'current_llm_model', None),
                "stable_models_count": len(getattr(self.model_manager, 'stable_models', []))
            }
            
            component_statuses["auth_validator"] = {
                "available": bool(self.auth_validator)
            }
            
            component_statuses["llm_handler"] = {
                "available": bool(self.llm_handler),
                "llm_available": self.llm_handler.is_available() if self.llm_handler else False
            }
            
            # AI handlers
            component_statuses["report_generator"] = {
                "available": bool(self.report_generator),
                "ready": self.report_generator.get_generator_status().get("ready_for_generation", False) if self.report_generator else False
            }
            
            component_statuses["chat_processor"] = {
                "available": bool(self.chat_processor),
                "ready": self.chat_processor.get_processor_status().get("ready_for_processing", False) if self.chat_processor else False
            }
            
            component_statuses["stream_handler"] = {
                "available": bool(self.stream_handler),
                "ready": self.stream_handler.get_stream_status().get("ready_for_streaming", False) if self.stream_handler else False
            }
            
            component_statuses["insights_generator"] = {
                "available": bool(self.insights_generator),
                "ready": self.insights_generator.get_generator_status().get("ready_for_generation", False) if self.insights_generator else False
            }
            
            # Support components
            component_statuses["context_manager"] = {
                "available": bool(self.context_manager),
                "rag_enabled": self.context_manager.rag_enabled if self.context_manager else False
            }
            
            component_statuses["content_processor"] = {
                "available": bool(self.content_processor),
                "ready": self.content_processor.get_processor_status().get("ready", False) if self.content_processor else False
            }
            
            component_statuses["health_monitor"] = {
                "available": bool(self.health_monitor)
            }
            
            return {
                "timestamp": datetime.now().isoformat(),
                "orchestrator_version": "modular_v1.0",
                "total_components": len(component_statuses),
                "available_components": sum(1 for status in component_statuses.values() if status.get("available", False)),
                "components": component_statuses,
                "core_services_operational": all([
                    bool(self.model_manager),
                    bool(self.auth_validator), 
                    bool(self.llm_handler),
                    self.llm_handler.is_available() if self.llm_handler else False
                ])
            }
            
        except Exception as e:
            logger.error(f"Error getting orchestrator status: {str(e)}")
            return {
                "timestamp": datetime.now().isoformat(),
                "orchestrator_version": "modular_v1.0",
                "error": str(e),
                "status": "error"
            }

    # Trade Embeddings Methods
    async def trigger_trade_data_embedding(self, user: Dict[str, Any], 
                                         table_name: str, record_id: str) -> Dict[str, Any]:
        """
        Trigger embedding generation for a trade data record.
        
        Args:
            user: User object containing authentication info
            table_name: Source table name (stocks, options, notes, etc.)
            record_id: ID of the record to embed
            
        Returns:
            Dictionary containing embedding result
        """
        try:
            user_token = self.auth_validator.extract_access_token(user)
            return await self.trade_embeddings.trigger_embedding_for_trade_data(
                table_name, record_id, user_token
            )
        except Exception as e:
            logger.error(f"Error triggering trade data embedding: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    async def search_trade_context(self, user: Dict[str, Any], query: str, 
                                 symbol: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Search user's trade history for relevant context.
        
        Args:
            user: User object containing authentication info
            query: Search query describing what context to find
            symbol: Optional symbol filter
            limit: Maximum number of results
            
        Returns:
            List of search results
        """
        try:
            user_token = self.auth_validator.extract_access_token(user)
            results = await self.trade_embeddings.search_user_trade_context(
                query, user_token, symbol, limit
            )
            
            # Convert SearchResult objects to dictionaries for API response
            return [
                {
                    'content': result.content,
                    'similarity_score': result.similarity_score,
                    'metadata': result.metadata,
                    'document_type': result.document_type
                }
                for result in results
            ]
        except Exception as e:
            logger.error(f"Error searching trade context: {str(e)}")
            return []
    
    async def get_embeddings_analytics(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get analytics and statistics about user's trade embeddings.
        
        Args:
            user: User object containing authentication info
            
        Returns:
            Dictionary containing embedding analytics
        """
        try:
            user_token = self.auth_validator.extract_access_token(user)
            return await self.trade_embeddings.get_embeddings_dashboard_data(user_token)
        except Exception as e:
            logger.error(f"Error getting embeddings analytics: {str(e)}")
            return {'error': str(e)}
    
    async def batch_embed_user_data(self, user: Dict[str, Any], 
                                  table_names: Optional[List[str]] = None,
                                  limit_per_table: int = 100) -> Dict[str, Any]:
        """
        Batch embed existing trade data for a user.
        
        Args:
            user: User object containing authentication info
            table_names: List of table names to process (default: all supported tables)
            limit_per_table: Maximum records to process per table
            
        Returns:
            Dictionary containing batch processing results
        """
        try:
            user_token = self.auth_validator.extract_access_token(user)
            return await self.trade_embeddings.batch_embed_existing_data(
                user_token, table_names, limit_per_table
            )
        except Exception as e:
            logger.error(f"Error in batch embedding process: {str(e)}")
            return {'success': False, 'error': str(e)}