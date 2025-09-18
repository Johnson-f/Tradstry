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
        context_types: List[str] = None,
        time_range_days: int = 30,
        max_documents: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get contextually relevant documents for a query
        
        Args:
            user_token: User authentication token
            query: User's query or question
            context_types: Types of context to include ['trades', 'insights', 'reports']
            time_range_days: How far back to look for relevant context
            max_documents: Maximum number of documents to return
        """
        try:
            logger.info(f"Getting contextual documents for query: '{query[:100]}...'")
            
            if context_types is None:
                context_types = ['trades', 'insights', 'reports']
            
            # Perform semantic search
            search_results = await self.vector_service.semantic_search(
                user_token, query, limit=max_documents * 2  # Get more than needed for filtering
            )
            
            # Filter and rank results
            filtered_results = self._filter_and_rank_results(
                search_results, context_types, time_range_days
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
        context_types: List[str] = None
    ) -> List[Dict[str, Any]]:
        """Get context specific to a trading symbol"""
        try:
            query = f"trades and analysis for {symbol} stock symbol trading"
            
            results = await self.vector_service.semantic_search(user_token, query, limit=15)
            
            # Filter for symbol-specific content
            symbol_results = []
            for result in results:
                if self._is_symbol_relevant(result, symbol):
                    symbol_results.append({
                        'content': result.content,
                        'document_type': result.document_type,
                        'similarity_score': result.similarity_score,
                        'metadata': result.metadata,
                        'symbol_relevance': self._calculate_symbol_relevance(result, symbol)
                    })
            
            # Sort by symbol relevance
            symbol_results.sort(key=lambda x: x['symbol_relevance'], reverse=True)
            
            return symbol_results[:10]
            
        except Exception as e:
            logger.error(f"Error getting trade-specific context for {symbol}: {str(e)}")
            return []
    
    async def index_trade_data(
        self, 
        user_token: str, 
        trade_data: Dict[str, Any]
    ) -> Optional[str]:
        """Index new trade data for future retrieval"""
        try:
            # Extract relevant information
            symbol = trade_data.get('symbol', '')
            action = trade_data.get('action', '')
            date = trade_data.get('date', '')
            pnl = trade_data.get('pnl', 0)
            notes = trade_data.get('notes', '')
            
            # Create content for indexing
            title = f"{action} {symbol} - {date}"
            content = f"""
Trade: {action} {symbol}
Date: {date}
P&L: ${pnl}
Notes: {notes}
Trade Type: {trade_data.get('trade_type', 'stock')}
Quantity: {trade_data.get('quantity', 0)}
Price: ${trade_data.get('price', 0)}
"""
            
            metadata = {
                'symbol': symbol,
                'action': action,
                'date': date,
                'pnl': pnl,
                'trade_type': trade_data.get('trade_type', 'stock')
            }
            
            # Index the trade
            doc_id = await self.vector_service.index_document(
                user_token, 
                DocumentType.TRADE_ENTRY, 
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
        ai_content: Any,  # Changed from Dict[str, Any] to Any to handle both dicts and objects
        content_type: str = "ai_report"
    ) -> Optional[str]:
        """Index AI-generated content for future retrieval"""
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
            
            # Determine document type
            doc_type = DocumentType.AI_REPORT if content_type == "ai_report" else DocumentType.AI_INSIGHT
            
            # Prepare metadata with correct structure for SQL function
            metadata = {
                'source_table': 'ai_reports',
                'source_id': source_id,
                'model_used': model_used,
                'confidence_score': confidence_score,
                'generation_date': datetime.now().date().isoformat(),
                'content_type': content_type,
                'insight_types': [report_type.value] if report_type else [],
                'time_horizon': 'short_term',  # Default value
                'actionability_score': confidence_score  # Use confidence as actionability
            }
            
            # Index the AI content
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
        context_types: List[str], 
        time_range_days: int
    ) -> List[SearchResult]:
        """Filter and rank search results by relevance and recency"""
        filtered = []
        cutoff_date = datetime.now() - timedelta(days=time_range_days)
        
        for result in results:
            # Check if document type matches requested context
            if not self._matches_context_type(result.document_type, context_types):
                continue
                
            # Check recency if date available
            doc_date = result.metadata.get('date') or result.metadata.get('created_at')
            if doc_date and isinstance(doc_date, str):
                try:
                    doc_datetime = datetime.fromisoformat(doc_date.replace('Z', '+00:00'))
                    if doc_datetime < cutoff_date:
                        continue
                except:
                    pass  # Keep document if we can't parse date
            
            filtered.append(result)
        
        # Sort by similarity score
        filtered.sort(key=lambda x: x.similarity_score, reverse=True)
        return filtered
    
    def _matches_context_type(self, document_type: str, context_types: List[str]) -> bool:
        """Check if document type matches requested context types"""
        type_mapping = {
            'trades': ['trade_entry', 'trade_note'],
            'insights': ['ai_insight'],
            'reports': ['ai_report'],
            'market': ['market_news']
        }
        
        for context_type in context_types:
            if document_type in type_mapping.get(context_type, []):
                return True
        return False
    
    def _explain_relevance(self, result: SearchResult, query: str) -> str:
        """Generate explanation for why this document is relevant"""
        explanations = []
        
        if result.similarity_score > 0.9:
            explanations.append("Very high semantic similarity to your question")
        elif result.similarity_score > 0.8:
            explanations.append("High semantic similarity to your question")
        elif result.similarity_score > 0.7:
            explanations.append("Good semantic similarity to your question")
        
        if result.document_type == 'trade_entry':
            explanations.append("Contains specific trade execution details")
        elif result.document_type == 'ai_insight':
            explanations.append("Contains AI-generated trading insights")
        elif result.document_type == 'ai_report':
            explanations.append("Contains comprehensive trading analysis")
        
        return "; ".join(explanations) if explanations else "Contextually relevant"
    
    def _is_symbol_relevant(self, result: SearchResult, symbol: str) -> bool:
        """Check if result is relevant to a specific symbol"""
        symbol_lower = symbol.lower()
        
        # Check metadata
        if result.metadata.get('symbol', '').lower() == symbol_lower:
            return True
            
        # Check content
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
