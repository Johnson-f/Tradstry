from typing import Dict, Any, Optional, List
import logging
import re
from datetime import datetime

from services.ai.rag_retriever_service import RAGRetrieverService
from services.ai.ai_reports_service import AIReportsService
from services.ai.ai_chat_service import AIChatService
from services.ai.ai_insights_service import AIInsightsService

logger = logging.getLogger(__name__)


class AIContextManager:
    """
    Manages context retrieval and RAG operations for AI services.
    Handles symbol extraction, vector search, and contextual document retrieval.
    """

    def __init__(self):
        # Initialize RAG service with error handling
        try:
            logger.info("Initializing RAG system for context management...")
            self.rag_service = RAGRetrieverService()
            self.rag_enabled = True
            logger.info("RAG system initialized successfully for context management")
        except Exception as e:
            logger.error(f"RAG system initialization failed: {str(e)}")
            logger.error(f"RAG error details: {type(e).__name__}: {str(e)}")
            self.rag_service = None
            self.rag_enabled = False
            logger.info("Continuing without RAG system - basic functionality will be available")
        
        # Initialize fallback services
        self.reports_service = AIReportsService()
        self.chat_service = AIChatService()
        self.insights_service = AIInsightsService()
        
        logger.info("AI Context Manager initialized")

    async def get_relevant_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Enhanced RAG-based context retrieval using vector similarity search."""
        
        # Check if RAG is enabled and available
        if not self.rag_enabled or self.rag_service is None:
            logger.info("RAG system not available, using fallback context retrieval")
            return await self._get_fallback_trading_context(access_token, query)
        
        try:
            logger.info(f"Getting RAG context for query: '{query[:100]}...'")
            
            # Use RAG service to get contextually relevant documents
            context_documents = await self.rag_service.get_contextual_documents(
                access_token, 
                query, 
                content_types=['trades', 'insights', 'reports'],  # Fixed parameter name
                time_range_days=30,
                max_documents=8
            )
            
            # Get recent trading context for baseline data
            try:
                recent_trading_context = await self.reports_service.get_trading_context(
                    access_token, time_range="7d"
                )
            except Exception as e:
                logger.error(f"Error getting recent trading context: {str(e)}")
                recent_trading_context = {"message": "Recent trading data unavailable"}
            
            # Organize context by document type
            trade_contexts = []
            insight_contexts = []
            report_contexts = []
            
            for doc in context_documents:
                doc_type = doc.get('document_type', '')
                content_summary = doc.get('content', '')[:500]  # Limit content length
                
                context_item = {
                    'content': content_summary,
                    'similarity_score': doc.get('similarity_score', 0.0),
                    'relevance': doc.get('relevance_explanation', ''),
                    'metadata': doc.get('metadata', {})
                }
                
                if 'trade' in doc_type:
                    trade_contexts.append(context_item)
                elif 'insight' in doc_type:
                    insight_contexts.append(context_item)
                elif 'report' in doc_type:
                    report_contexts.append(context_item)
            
            # Extract key symbols and themes from the query for additional context
            query_symbols = self.extract_symbols_from_query(query)
            if query_symbols:
                try:
                    symbol_contexts = []
                    for symbol in query_symbols[:3]:  # Limit to 3 symbols
                        symbol_docs = await self.rag_service.get_trade_specific_context(
                            access_token, symbol, ['trades', 'insights']
                        )
                        symbol_contexts.extend(symbol_docs[:2])  # Top 2 per symbol
                except Exception as e:
                    logger.error(f"Error getting symbol-specific context: {str(e)}")
                    symbol_contexts = []
            else:
                symbol_contexts = []
            
            enhanced_context = {
                "query_analysis": {
                    "original_query": query,
                    "extracted_symbols": query_symbols,
                    "context_documents_found": len(context_documents)
                },
                "recent_trading": recent_trading_context,
                "relevant_trades": trade_contexts,
                "relevant_insights": insight_contexts,
                "relevant_reports": report_contexts,
                "symbol_specific": symbol_contexts,
                "rag_metadata": {
                    "total_documents_searched": len(context_documents),
                    "avg_similarity_score": sum(doc.get('similarity_score', 0) for doc in context_documents) / max(len(context_documents), 1),
                    "context_types_found": list(set(doc.get('document_type', '') for doc in context_documents))
                }
            }
            
            logger.info(f"RAG context retrieval successful: {len(context_documents)} documents, {len(symbol_contexts)} symbol-specific")
            return enhanced_context

        except Exception as e:
            logger.error(f"Error in RAG context retrieval: {str(e)}")
            # Fallback to basic context
            return await self._get_fallback_trading_context(access_token, query)
    
    async def _get_fallback_trading_context(self, access_token: str, query: str) -> Dict[str, Any]:
        """Fallback context retrieval when RAG system is unavailable."""
        try:
            logger.info("Using fallback context retrieval (non-RAG)")
            
            # Get basic trading context
            try:
                recent_trading_context = await self.reports_service.get_trading_context(
                    access_token, time_range="7d"
                )
            except Exception as e:
                logger.error(f"Error getting recent trading context: {str(e)}")
                recent_trading_context = {"message": "Recent trading data unavailable"}
            
            # Search for relevant chat messages (if available)
            try:
                relevant_messages = await self.chat_service.search_messages(
                    access_token, query, None, 3, 0.6
                )
                message_contents = []
                for msg in relevant_messages:
                    try:
                        if hasattr(msg, 'content'):
                            message_contents.append(msg.content)
                        elif isinstance(msg, dict) and 'content' in msg:
                            message_contents.append(msg['content'])
                    except Exception as e:
                        logger.error(f"Error processing message content: {str(e)}")
                        continue
            except Exception as e:
                logger.error(f"Error searching messages: {str(e)}")
                message_contents = []
            
            # Search for relevant insights (if available)
            try:
                relevant_insights = await self.insights_service.search_insights(
                    access_token, query, None, 3, 0.6
                )
                insight_descriptions = []
                for insight in relevant_insights:
                    try:
                        if hasattr(insight, 'description'):
                            insight_descriptions.append(insight.description)
                        elif isinstance(insight, dict) and 'description' in insight:
                            insight_descriptions.append(insight['description'])
                    except Exception as e:
                        logger.error(f"Error processing insight description: {str(e)}")
                        continue
            except Exception as e:
                logger.error(f"Error searching insights: {str(e)}")
                insight_descriptions = []
            
            return {
                "mode": "fallback",
                "recent_trading": recent_trading_context,
                "relevant_messages": message_contents,
                "relevant_insights": insight_descriptions,
                "extracted_symbols": self.extract_symbols_from_query(query),
                "note": "Using basic context retrieval - RAG system unavailable"
            }
            
        except Exception as e:
            logger.error(f"Error in fallback context retrieval: {str(e)}")
            return {
                "mode": "minimal",
                "message": "All context retrieval methods failed", 
                "error": str(e)
            }
    
    def extract_symbols_from_query(self, query: str) -> List[str]:
        """Extract stock symbols from the user's query."""
        try:
            # Common patterns for stock symbols
            patterns = [
                r'\b[A-Z]{1,5}\b',  # 1-5 uppercase letters
                r'\$([A-Z]{1,5})\b',  # $SYMBOL format
                r'\b([A-Z]{1,5})\s+stock\b',  # SYMBOL stock
                r'\b([A-Z]{1,5})\s+shares?\b',  # SYMBOL shares
            ]
            
            symbols = set()
            query_upper = query.upper()
            
            for pattern in patterns:
                matches = re.findall(pattern, query_upper)
                for match in matches:
                    symbol = match if isinstance(match, str) else match[0] if match else ""
                    if len(symbol) >= 1 and len(symbol) <= 5 and symbol.isalpha():
                        symbols.add(symbol)
            
            # Filter out common words that might be mistaken for symbols
            common_words = {'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'USE', 'MAN', 'NEW', 'NOW', 'WAY', 'MAY', 'SAY', 'SEE', 'HIM', 'TWO', 'HOW', 'ITS', 'WHO', 'BOY', 'DID', 'HAS', 'LET', 'PUT', 'TOO', 'OLD', 'ANY', 'SUN', 'SET'}
            symbols = symbols - common_words
            
            return list(symbols)
            
        except Exception as e:
            logger.error(f"Error extracting symbols from query: {str(e)}")
            return []
    
    async def index_ai_generated_content(
        self, 
        user_token: str, 
        ai_content: Any,  # Changed to Any to handle both dicts and Pydantic models
        content_type: str
    ) -> Optional[str]:
        """Index AI-generated content in the RAG system for future retrieval."""
        
        # Check if RAG service is available
        if not self.rag_enabled or self.rag_service is None:
            logger.warning("RAG service not available - cannot index AI content")
            return None
            
        try:
            logger.info(f"Indexing AI content of type: {content_type}")
            
            # Extract content details - handle both dict and object types
            if hasattr(ai_content, 'title'):
                title = getattr(ai_content, 'title', 'AI Generated Content')
                content = getattr(ai_content, 'content', '')
                content_id = getattr(ai_content, 'id', None)
            else:
                title = ai_content.get('title', 'AI Generated Content')
                content = ai_content.get('content', '')
                content_id = ai_content.get('id')
            
            if not content:
                logger.warning("No content to index in RAG system")
                return None
            
            # Prepare metadata - handle both dict and object types
            if hasattr(ai_content, 'model_used'):
                model_used = getattr(ai_content, 'model_used', 'unknown')
                confidence_score = getattr(ai_content, 'confidence_score', 0.0)
                insights = getattr(ai_content, 'insights', None)
                recommendations = getattr(ai_content, 'recommendations', None)
            else:
                model_used = ai_content.get('model_used', 'unknown')
                confidence_score = ai_content.get('confidence_score', 0.0)
                insights = ai_content.get('insights')
                recommendations = ai_content.get('recommendations')
            
            metadata = {
                'model_used': model_used,
                'confidence_score': confidence_score,
                'content_type': content_type,
                'generated_at': datetime.now().isoformat(),
                'source_id': content_id
            }
            
            # Add insights and recommendations if available
            if insights:
                metadata['has_insights'] = True
                if isinstance(insights, dict) and 'items' in insights:
                    metadata['insights_count'] = len(insights.get('items', []))
            
            if recommendations:
                metadata['has_recommendations'] = True
                if isinstance(recommendations, dict) and 'items' in recommendations:
                    metadata['recommendations_count'] = len(recommendations.get('items', []))
            
            # Index the content
            doc_id = await self.rag_service.index_ai_content(
                user_token, ai_content, content_type
            )
            
            if doc_id:
                logger.info(f"Successfully indexed {content_type} in RAG system: {doc_id}")
            else:
                logger.warning(f"Failed to index {content_type} in RAG system")
                
            return doc_id
            
        except Exception as e:
            logger.error(f"Error indexing AI content in RAG system: {str(e)}")
            return None

    async def get_symbol_specific_context(self, access_token: str, symbol: str, 
                                        content_types: List[str] = None) -> List[Dict[str, Any]]:
        """
        Get context specific to a trading symbol.
        
        Args:
            access_token: User access token
            symbol: Trading symbol (e.g., 'AAPL')
            content_types: Types of content to retrieve
            
        Returns:
            List of relevant context documents
        """
        if not self.rag_enabled or self.rag_service is None:
            logger.warning("RAG service not available for symbol context")
            return []
        
        content_types = content_types or ['trades', 'insights', 'reports']
        
        try:
            symbol_contexts = await self.rag_service.get_trade_specific_context(
                access_token, symbol, content_types
            )
            
            logger.info(f"Retrieved {len(symbol_contexts)} symbol-specific contexts for {symbol}")
            return symbol_contexts
            
        except Exception as e:
            logger.error(f"Error getting symbol-specific context: {str(e)}")
            return []

    async def search_contextual_content(self, access_token: str, query: str,
                                      content_types: List[str] = None,
                                      max_results: int = 10) -> List[Dict[str, Any]]:
        """
        Search for contextual content across different document types.
        
        Args:
            access_token: User access token
            query: Search query
            content_types: Types of content to search
            max_results: Maximum number of results
            
        Returns:
            List of matching documents with similarity scores
        """
        try:
            logger.info(f"Searching contextual content for query: '{query[:100]}...'")
            
            if not self.rag_enabled or self.rag_service is None:
                logger.warning("RAG service not available for contextual search")
                return await self._fallback_contextual_search(access_token, query, max_results)
            
            content_types = content_types or ['trades', 'insights', 'reports', 'ai_content']
            
            search_results = await self.rag_service.search_contextual_documents(
                access_token, query, content_types, max_results
            )
            
            logger.info(f"Found {len(search_results)} contextual documents")
            return search_results
            
        except Exception as e:
            logger.error(f"Error searching contextual content: {str(e)}")
            return await self._fallback_contextual_search(access_token, query, max_results)

    async def _fallback_contextual_search(self, access_token: str, query: str, 
                                        max_results: int) -> List[Dict[str, Any]]:
        """Fallback search when RAG is unavailable."""
        try:
            results = []
            
            # Search chat messages
            try:
                messages = await self.chat_service.search_messages(
                    access_token, query, None, max_results // 2, 0.6
                )
                for msg in messages:
                    results.append({
                        'content': msg.get('content', '') if isinstance(msg, dict) else getattr(msg, 'content', ''),
                        'document_type': 'chat_message',
                        'similarity_score': 0.7,  # Default score
                        'metadata': {'source': 'chat_fallback'}
                    })
            except Exception as e:
                logger.error(f"Error in fallback message search: {str(e)}")
            
            # Search insights
            try:
                insights = await self.insights_service.search_insights(
                    access_token, query, None, max_results // 2, 0.6
                )
                for insight in insights:
                    results.append({
                        'content': insight.get('description', '') if isinstance(insight, dict) else getattr(insight, 'description', ''),
                        'document_type': 'insight',
                        'similarity_score': 0.7,  # Default score
                        'metadata': {'source': 'insights_fallback'}
                    })
            except Exception as e:
                logger.error(f"Error in fallback insight search: {str(e)}")
            
            return results[:max_results]
            
        except Exception as e:
            logger.error(f"Error in fallback contextual search: {str(e)}")
            return []

    def get_context_manager_status(self) -> Dict[str, Any]:
        """Get current status of the context manager."""
        return {
            "rag_enabled": self.rag_enabled,
            "rag_service_available": bool(self.rag_service),
            "fallback_services_available": {
                "reports_service": bool(self.reports_service),
                "chat_service": bool(self.chat_service),
                "insights_service": bool(self.insights_service)
            },
            "supported_context_types": ['trades', 'insights', 'reports', 'ai_content'],
            "symbol_extraction_available": True,
            "contextual_search_available": self.rag_enabled or bool(self.chat_service)
        }