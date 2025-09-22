"""
RAG Retriever Service integrating LlamaIndex and LangChain
Provides contextual document retrieval for AI responses
"""

from typing import List, Dict, Any, Optional, Tuple
import logging
from datetime import datetime, timedelta
import asyncio
from supabase import Client

# LangChain imports
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun

# Local imports
from .rag_vector_service import RAGVectorService, DocumentType, SearchResult
from .ai_embedding_service import AIEmbeddingService

logger = logging.getLogger(__name__)

class TradistryRetriever(BaseRetriever):
    """Custom LangChain retriever for Tradistry trading data"""
    
    def __init__(self, vector_service: RAGVectorService, user_token: str):
        super().__init__()
        self.vector_service = vector_service
        self.user_token = user_token
        
    def _get_relevant_documents(
        self, 
        query: str, 
        *, 
        run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        """Retrieve relevant documents for a query"""
        try:
            # Use asyncio to run the async search
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                results = loop.run_until_complete(
                    self.vector_service.semantic_search(self.user_token, query, limit=10)
                )
            finally:
                loop.close()
            
            # Convert SearchResult to LangChain Document
            documents = []
            for result in results:
                doc = Document(
                    page_content=result.content,
                    metadata={
                        'similarity_score': result.similarity_score,
                        'document_type': result.document_type,
                        **result.metadata
                    }
                )
                documents.append(doc)
                
            return documents
            
        except Exception as e:
            logger.error(f"Error retrieving documents: {str(e)}")
            return []

class RAGRetrieverService:
    """Enhanced RAG service with contextual retrieval capabilities"""
    
    def __init__(self, supabase: Optional[Client] = None):
        try:
            from supabase import Client
            from database import get_supabase
            
            supabase_client = supabase or get_supabase()
            self.vector_service = RAGVectorService(supabase_client)
            self.embedding_service = AIEmbeddingService()
            logger.info("RAGRetrieverService initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing RAGRetrieverService: {str(e)}")
            raise Exception(f"RAGRetrieverService initialization failed: {str(e)}")
        
    async def get_contextual_documents(
        self, 
        user_token: str, 
        query: str, 
        content_types: List[str] = None,
        time_range_days: int = 30,
        max_documents: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get contextually relevant documents for a query using unified embedding table
        
        Args:
            user_token: User authentication token
            query: User's query or question
            content_types: Content types to include ['trade_data', 'ai_report', 'ai_insight', etc.]
            time_range_days: How far back to look for relevant context
            max_documents: Maximum number of documents to return
        """
        try:
            logger.info(f"Getting contextual documents for query: '{query[:100]}...'")
            
            if content_types is None:
                content_types = ['trade_data', 'stock_trade', 'options_trade', 'ai_report', 'ai_insight']
            
            # Perform unified semantic search
            search_results = await self.vector_service.semantic_search(
                user_token, 
                query, 
                limit=max_documents * 2,  # Get more than needed for filtering
                content_types=content_types,
                similarity_threshold=0.6  # Lower threshold for more inclusive results
            )
            
            # Filter and rank results
            filtered_results = self._filter_and_rank_results(
                search_results, content_types, time_range_days
            )
            
            # Convert to context format
            context_documents = []
            for result in filtered_results[:max_documents]:
                context_doc = {
                    'content': result.content,
                    'document_type': result.document_type,
                    'similarity_score': result.similarity_score,
                    'metadata': result.metadata,
                    'relevance_explanation': self._explain_relevance(result, query)
                }
                context_documents.append(context_doc)
            
            logger.info(f"Retrieved {len(context_documents)} contextual documents")
            return context_documents
            
        except Exception as e:
            logger.error(f"Error getting contextual documents: {str(e)}")
            return []
    
    async def get_trade_specific_context(
        self, 
        user_token: str, 
        symbol: str, 
        content_types: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Get context specific to a trading symbol using unified embedding table"""
        try:
            query = f"trades and analysis for {symbol} stock symbol trading"
            
            if content_types is None:
                content_types = ['trade_data', 'stock_trade', 'options_trade', 'trading_note']
            
            # Use the unified search with symbol filtering
            results = await self.vector_service.semantic_search(
                user_token, 
                query, 
                limit=15,
                content_types=content_types,
                symbol=symbol,  # Direct symbol filtering in the unified table
                similarity_threshold=0.6
            )
            
            # Additional symbol relevance calculation
            symbol_results = []
            for result in results:
                symbol_relevance = self._calculate_symbol_relevance(result, symbol)
                symbol_results.append({
                    'content': result.content,
                    'document_type': result.document_type,
                    'similarity_score': result.similarity_score,
                    'metadata': result.metadata,
                    'symbol_relevance': symbol_relevance
                })
            
            # Sort by combined similarity and symbol relevance
            symbol_results.sort(
                key=lambda x: (x['similarity_score'] + x['symbol_relevance']) / 2, 
                reverse=True
            )
            
            return symbol_results[:10]
            
        except Exception as e:
            logger.error(f"Error getting trade-specific context for {symbol}: {str(e)}")
            return []
    
    async def index_trade_data(
        self, 
        user_token: str, 
        trade_data: Dict[str, Any]
    ) -> Optional[str]:
        """Index new trade data using unified embedding table"""
        try:
            # Extract relevant information
            symbol = trade_data.get('symbol', '')
            action = trade_data.get('action', '')
            date = trade_data.get('date', '')
            pnl = trade_data.get('pnl', 0)
            notes = trade_data.get('notes', '')
            trade_type = trade_data.get('trade_type', 'stock')
            
            # Create content for indexing
            title = f"{action} {symbol} - {date}"
            content = f"""
Trade: {action} {symbol}
Date: {date}
P&L: ${pnl}
Notes: {notes}
Trade Type: {trade_type}
Quantity: {trade_data.get('quantity', 0)}
Price: ${trade_data.get('price', 0)}
"""
            
            # Determine document type based on trade type
            if trade_type.lower() == 'stock':
                doc_type = DocumentType.STOCK_TRADE
            elif trade_type.lower() in ['option', 'options']:
                doc_type = DocumentType.OPTIONS_TRADE
            else:
                doc_type = DocumentType.TRADE_DATA
            
            metadata = {
                'source_table': 'stocks' if trade_type.lower() == 'stock' else 'options',
                'source_id': trade_data.get('id', ''),
                'symbol': symbol,
                'trade_date': date,
                'action': action,
                'pnl': pnl,
                'trade_type': trade_type,
                'quantity': trade_data.get('quantity', 0),
                'price': trade_data.get('price', 0),
                'relevance_score': 1.0
            }
            
            # Index using unified table approach
            doc_id = await self.vector_service.index_document(
                user_token, 
                doc_type, 
                title, 
                content.strip(), 
                metadata
            )
            
            logger.info(f"Indexed trade data: {title} -> {doc_id}")
            return doc_id
            
        except Exception as e:
            logger.error(f"Error indexing trade data: {str(e)}")
            return None
    
    async def index_ai_content(
        self, 
        user_token: str, 
        ai_content: Any,
        content_type: str = "ai_report"
    ) -> Optional[str]:
        """Index AI-generated content using unified embedding table"""
        try:
            # Handle both dictionary and object types (e.g., Pydantic models)
            if hasattr(ai_content, '__dict__') and not isinstance(ai_content, dict):
                # Handle Pydantic models or other objects
                title = getattr(ai_content, 'title', 'AI Generated Content')
                content = getattr(ai_content, 'content', '')
                model_used = getattr(ai_content, 'model_used', '')
                confidence_score = getattr(ai_content, 'confidence_score', 0.0)
                source_id = getattr(ai_content, 'id', None)
                report_type = getattr(ai_content, 'report_type', None)
            else:
                # Handle dictionary objects
                title = ai_content.get('title', 'AI Generated Content')
                content = ai_content.get('content', '')
                model_used = ai_content.get('model_used', '')
                confidence_score = ai_content.get('confidence_score', 0.0)
                source_id = ai_content.get('id')
                report_type = ai_content.get('report_type')
            
            if not content:
                logger.warning("No content provided for AI indexing")
                return None
            
            # Determine document type based on content type
            doc_type = DocumentType.AI_REPORT if content_type == "ai_report" else DocumentType.AI_INSIGHT
            
            # Prepare metadata for unified table
            metadata = {
                'source_table': 'ai_reports',
                'source_id': str(source_id) if source_id else '',
                'model_used': model_used,
                'confidence_score': confidence_score,
                'generation_date': datetime.now().date().isoformat(),
                'insight_types': [report_type.value] if report_type and hasattr(report_type, 'value') else [],
                'time_horizon': 'short_term',
                'actionability_score': confidence_score,
                'relevance_score': confidence_score
            }
            
            # Index using unified table approach
            doc_id = await self.vector_service.index_document(
                user_token, doc_type, title, content, metadata
            )
            
            logger.info(f"Indexed AI content: {title} -> {doc_id}")
            return doc_id
            
        except Exception as e:
            logger.error(f"Error indexing AI content: {str(e)}")
            return None
    
    def create_langchain_retriever(self, user_token: str) -> TradistryRetriever:
        """Create a LangChain-compatible retriever"""
        return TradistryRetriever(self.vector_service, user_token)
    
    def _filter_and_rank_results(
        self, 
        results: List[SearchResult], 
        content_types: List[str], 
        time_range_days: int
    ) -> List[SearchResult]:
        """Filter and rank search results by relevance and recency"""
        filtered = []
        cutoff_date = datetime.now() - timedelta(days=time_range_days)
        
        for result in results:
            # Check if document type matches requested content types
            if not self._matches_content_type(result.document_type, content_types):
                continue
                
            # Check recency if date available
            doc_date = (result.metadata.get('trade_date') or 
                       result.metadata.get('created_at') or 
                       result.metadata.get('date'))
            if doc_date and isinstance(doc_date, str):
                try:
                    doc_datetime = datetime.fromisoformat(doc_date.replace('Z', '+00:00'))
                    if doc_datetime < cutoff_date:
                        continue
                except:
                    pass  # Keep document if we can't parse date
            
            filtered.append(result)
        
        # Sort by similarity score and relevance score combined
        filtered.sort(key=lambda x: (
            x.similarity_score + 
            x.metadata.get('relevance_score', 0.0)
        ) / 2, reverse=True)
        return filtered
    
    def _matches_content_type(self, document_type: str, content_types: List[str]) -> bool:
        """Check if document type matches requested content types for unified table"""
        # Direct match with unified content types
        if document_type in content_types:
            return True
            
        # Legacy context type mapping for backward compatibility
        legacy_mapping = {
            'trades': ['trade_data', 'stock_trade', 'options_trade'],
            'insights': ['ai_insight'],
            'reports': ['ai_report'],
            'market': ['market_news'],
            'notes': ['trading_note'],
            'setups': ['trading_setup']
        }
        
        for content_type in content_types:
            if document_type in legacy_mapping.get(content_type, []):
                return True
        return False
    
    def _explain_relevance(self, result: SearchResult, query: str) -> str:
        """Generate explanation for why this document is relevant"""
        explanations = []
        
        # Similarity score explanation
        if result.similarity_score > 0.9:
            explanations.append("Very high semantic similarity to your question")
        elif result.similarity_score > 0.8:
            explanations.append("High semantic similarity to your question")
        elif result.similarity_score > 0.7:
            explanations.append("Good semantic similarity to your question")
        
        # Content type specific explanations
        content_type_explanations = {
            'trade_data': "Contains general trade data and information",
            'stock_trade': "Contains stock trading execution details",
            'options_trade': "Contains options trading execution details",
            'trading_note': "Contains personal trading notes and observations",
            'trading_setup': "Contains trading setup and strategy information",
            'ai_insight': "Contains AI-generated trading insights",
            'ai_report': "Contains comprehensive AI trading analysis",
            'market_news': "Contains relevant market news and updates"
        }
        
        if result.document_type in content_type_explanations:
            explanations.append(content_type_explanations[result.document_type])
        
        # Symbol-specific relevance
        if result.metadata.get('symbol'):
            explanations.append(f"Related to {result.metadata['symbol']} trading")
        
        return "; ".join(explanations) if explanations else "Contextually relevant"
    
    def _is_symbol_relevant(self, result: SearchResult, symbol: str) -> bool:
        """Check if result is relevant to a specific symbol using unified table fields"""
        symbol_lower = symbol.lower()
        
        # Check direct symbol field in metadata
        if result.metadata.get('symbol', '').lower() == symbol_lower:
            return True
        
        # Check nested metadata for symbol information
        nested_metadata = result.metadata.get('metadata', {})
        if isinstance(nested_metadata, dict):
            if nested_metadata.get('symbol', '').lower() == symbol_lower:
                return True
            
        # Check content for symbol mention
        if symbol_lower in result.content.lower():
            return True
            
        return False
    
    def _calculate_symbol_relevance(self, result: SearchResult, symbol: str) -> float:
        """Calculate how relevant a result is to a specific symbol"""
        relevance = result.similarity_score
        
        # Boost if symbol is in metadata
        if result.metadata.get('symbol', '').lower() == symbol.lower():
            relevance += 0.2
            
        # Boost if symbol appears multiple times in content
        symbol_count = result.content.lower().count(symbol.lower())
        relevance += min(symbol_count * 0.05, 0.15)
        
        return min(relevance, 1.0)
