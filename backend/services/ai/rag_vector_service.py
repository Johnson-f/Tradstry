"""
Core RAG Vector Service for Tradistry
Manages vector indexes for semantic search and retrieval
"""

from typing import List, Dict, Any, Optional
import logging
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
from supabase import Client
from database import get_supabase
from auth_service import AuthService

# Note: Not inheriting from BaseDatabaseService to avoid constructor conflicts
# from services.base_database_service import BaseDatabaseService
from .ai_embedding_service import AIEmbeddingService

logger = logging.getLogger(__name__)

class DocumentType(Enum):
    TRADE_ENTRY = "trade_entry"
    TRADE_NOTE = "trade_note" 
    AI_REPORT = "ai_report"
    AI_INSIGHT = "ai_insight"
    MARKET_NEWS = "market_news"

@dataclass
class SearchResult:
    content: str
    similarity_score: float
    metadata: Dict[str, Any]
    document_type: str

class RAGVectorService:
    """Core RAG vector search service"""
    
    def __init__(self, supabase: Optional[Client] = None):
        try:
            self.supabase = supabase or get_supabase()
            self.auth_service = AuthService(self.supabase)
            self.embedding_service = AIEmbeddingService()
            logger.info("RAGVectorService initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing embedding service in RAGVectorService: {str(e)}")
            raise Exception(f"RAGVectorService initialization failed: {str(e)}")
        
    async def index_document(self, user_token: str, doc_type: DocumentType, 
                           title: str, content: str, metadata: Dict = None) -> str:
        """Index a document for vector search"""
        try:
            user_id = await self._get_user_id_from_token(user_token)
            embedding = self.embedding_service.generate_embedding(f"{title}\n{content}")
            
            # Route to appropriate table based on document type with correct parameter names
            if doc_type in [DocumentType.TRADE_ENTRY, DocumentType.TRADE_NOTE]:
                doc_data = {
                    'p_user_id': user_id,
                    'p_document_type': doc_type.value,
                    'p_source_table': metadata.get('source_table', 'unknown'),
                    'p_source_id': metadata.get('source_id'),
                    'p_title': title,
                    'p_content': content,
                    'p_content_embedding': embedding,
                    'p_symbol': metadata.get('symbol'),
                    'p_trade_date': metadata.get('trade_date'),
                    'p_trade_type': metadata.get('trade_type'),
                    'p_action': metadata.get('action'),
                    'p_pnl': metadata.get('pnl'),
                    'p_tags': metadata.get('tags', []),
                    'p_confidence_score': metadata.get('confidence_score', 0.0),
                    'p_chunk_index': metadata.get('chunk_index', 0),
                    'p_total_chunks': metadata.get('total_chunks', 1)
                }
                result = await self._call_sql_function('upsert_rag_trade_document', doc_data, user_token)
                
            elif doc_type in [DocumentType.AI_REPORT, DocumentType.AI_INSIGHT]:
                doc_data = {
                    'p_user_id': user_id,
                    'p_document_type': doc_type.value,
                    'p_title': title,
                    'p_content': content,
                    'p_content_embedding': embedding,
                    'p_source_table': metadata.get('source_table', 'ai_reports'),
                    'p_source_id': metadata.get('source_id'),
                    'p_insight_types': metadata.get('insight_types', []),
                    'p_model_used': metadata.get('model_used'),
                    'p_generation_date': metadata.get('generation_date'),
                    'p_confidence_score': metadata.get('confidence_score'),
                    'p_time_horizon': metadata.get('time_horizon'),
                    'p_actionability_score': metadata.get('actionability_score')
                }
                result = await self._call_sql_function('upsert_rag_ai_document', doc_data, user_token)
                
            else:  # Market documents
                doc_data = {
                    'p_user_id': user_id,
                    'p_document_type': doc_type.value,
                    'p_title': title,
                    'p_content': content,
                    'p_content_embedding': embedding,
                    'p_source': metadata.get('source'),
                    'p_source_id': metadata.get('source_id'),
                    'p_symbols': metadata.get('symbols', []),
                    'p_categories': metadata.get('categories', []),
                    'p_sector': metadata.get('sector'),
                    'p_market_cap_range': metadata.get('market_cap_range'),
                    'p_publication_date': metadata.get('publication_date'),
                    'p_sentiment_score': metadata.get('sentiment_score'),
                    'p_relevance_score': metadata.get('relevance_score'),
                    'p_expires_at': metadata.get('expires_at')
                }
                result = await self._call_sql_function('upsert_rag_market_document', doc_data, user_token)
            
            # Extract ID from result - handle different response formats
            if result:
                # Case 1: Result is a response object with 'data' attribute
                if hasattr(result, 'data') and result.data:
                    if isinstance(result.data, list) and len(result.data) > 0:
                        return str(result.data[0].get('id'))
                    elif hasattr(result.data, 'get'):
                        return str(result.data.get('id'))
                
                # Case 2: Result is a direct list
                elif isinstance(result, list) and len(result) > 0:
                    return str(result[0].get('id'))
                
                # Case 3: Result is a direct dictionary
                elif hasattr(result, 'get'):
                    return str(result.get('id'))
                
                # Case 4: Log unexpected format for debugging
                else:
                    logger.warning(f"Unexpected result format from SQL function: {result}")
                    return None
            else:
                logger.warning("No result returned from SQL function")
                return None
            
        except Exception as e:
            logger.error(f"Error indexing document: {str(e)}")
            raise
            
    async def semantic_search(self, user_token: str, query: str, 
                            limit: int = 5) -> List[SearchResult]:
        """Perform semantic search across all indexes"""
        try:
            user_id = await self._get_user_id_from_token(user_token)
            query_embedding = self.embedding_service.generate_embedding(query)
            
            search_params = {
                'p_user_id': user_id,
                'p_query_embedding': query_embedding,
                'p_similarity_threshold': 0.7,
                'p_limit_count': limit
            }
            
            results = await self._call_sql_function('semantic_search_all', search_params, user_token)
            
            # Handle the response format (Supabase returns response object with 'data' attribute)
            search_results = []
            if results:
                # Extract data from Supabase response
                data_list = []
                if hasattr(results, 'data') and results.data is not None:
                    data_list = results.data if isinstance(results.data, list) else [results.data]
                elif isinstance(results, list):
                    data_list = results
                else:
                    logger.warning(f"Unexpected results format: {type(results)}")
                    data_list = []
                
                for r in data_list:
                    # Handle different response formats - r could be dict, object, or tuple
                    try:
                        if isinstance(r, dict):
                            # Standard dictionary response
                            content = r.get('content', '')
                            similarity_score = float(r.get('similarity_score', 0.0))
                            metadata = r.get('metadata', {})
                            document_type = r.get('document_type', '')
                        elif hasattr(r, '__dict__'):
                            # Object with attributes
                            content = getattr(r, 'content', '')
                            similarity_score = float(getattr(r, 'similarity_score', 0.0))
                            metadata = getattr(r, 'metadata', {})
                            document_type = getattr(r, 'document_type', '')
                        elif isinstance(r, (list, tuple)) and len(r) >= 4:
                            # Tuple/list response (id, content, document_type, similarity_score, metadata, source_table, created_at)
                            content = str(r[1]) if len(r) > 1 else ''
                            similarity_score = float(r[3]) if len(r) > 3 else 0.0
                            metadata = r[4] if len(r) > 4 and isinstance(r[4], dict) else {}
                            document_type = str(r[2]) if len(r) > 2 else ''
                        else:
                            logger.warning(f"Unexpected row format: {type(r)} - {r}")
                            continue
                        
                        search_results.append(SearchResult(
                            content=content,
                            similarity_score=similarity_score,
                            metadata=metadata,
                            document_type=document_type
                        ))
                    except Exception as row_error:
                        logger.error(f"Error processing search result row: {row_error}")
                        continue
            
            return search_results
            
        except Exception as e:
            logger.error(f"Error in semantic search: {str(e)}")
            return []
    
    async def _get_user_id_from_token(self, access_token: str) -> str:
        """
        Helper method to extract and validate user_id from access_token.
        
        This method:
        1. Validates the access token
        2. Extracts the authenticated user
        3. Returns the user_id
        
        Raises:
            Exception: If authentication fails or token is invalid
        """
        try:
            # Get authenticated client to extract user_id
            client = await self.auth_service.get_authenticated_client(access_token)
            user_response = client.auth.get_user(access_token.replace("Bearer ", ""))
            if not user_response.user:
                raise Exception("Invalid authentication token")
            
            return user_response.user.id
            
        except Exception as e:
            raise Exception(f"Authentication failed: {str(e)}")
    
    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str) -> Any:
        """Helper method to call SQL functions with authentication."""
        try:
            return await self.auth_service.safe_rpc_call(function_name, params, access_token)
        except Exception as e:
            raise Exception(f"Database operation failed: {str(e)}")
