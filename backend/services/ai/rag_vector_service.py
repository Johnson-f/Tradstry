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
    """Unified content types for trade_embeddings table"""
    TRADE_DATA = "trade_data"
    STOCK_TRADE = "stock_trade"
    OPTIONS_TRADE = "options_trade"
    TRADING_NOTE = "trading_note"
    TRADING_SETUP = "trading_setup"
    AI_REPORT = "ai_report"
    AI_INSIGHT = "ai_insight"
    MARKET_NEWS = "market_news"
    TAG = "tag"
    TEMPLATE = "template"

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
        """Index a document in the unified trade_embeddings table"""
        try:
            user_id = await self._get_user_id_from_token(user_token)
            
            # Generate embedding for the content
            full_content = f"{title}\n{content}" if title else content
            embedding_vectors = self.embedding_service.generate_embeddings_batch([full_content])
            if not embedding_vectors:
                logger.error("Failed to generate embedding for document")
                return None
            
            embedding = embedding_vectors[0]
            
            # Prepare metadata with defaults
            if metadata is None:
                metadata = {}
            
            # Create content hash to prevent duplicates
            import hashlib
            content_hash = hashlib.md5(full_content.encode()).hexdigest()
            
            # Prepare unified document data for trade_embeddings table
            doc_data = {
                'p_user_id': user_id,
                'p_source_table': metadata.get('source_table', 'manual'),
                'p_source_id': str(metadata.get('source_id', '')),
                'p_content_text': full_content,
                'p_embedding_vector': embedding,  # Pass as array, not string
                'p_metadata': metadata,
                'p_symbol': metadata.get('symbol'),
                'p_trade_date': metadata.get('trade_date'),
                'p_content_type': doc_type.value,
                'p_relevance_score': metadata.get('relevance_score', 1.0)
            }
            
            logger.info(f"Indexing document with type {doc_type.value} for user {user_id[:8]}...")
            
            # Call unified upsert function for trade_embeddings table
            result = await self._call_sql_function('upsert_trade_embedding', doc_data, user_token)
            
            # Extract ID from result
            if result:
                if hasattr(result, 'data') and result.data:
                    if isinstance(result.data, list) and len(result.data) > 0:
                        return str(result.data[0].get('id'))
                    elif hasattr(result.data, 'get'):
                        return str(result.data.get('id'))
                elif isinstance(result, list) and len(result) > 0:
                    return str(result[0].get('id'))
                elif hasattr(result, 'get'):
                    return str(result.get('id'))
                else:
                    logger.warning(f"Unexpected result format: {result}")
                    return None
            else:
                logger.warning("No result returned from upsert_trade_embedding")
                return None
            
        except Exception as e:
            logger.error(f"Error indexing document: {str(e)}")
            raise
            
    async def semantic_search(self, user_token: str, query: str, 
                            limit: int = 5, 
                            content_types: List[str] = None,
                            symbol: str = None,
                            similarity_threshold: float = 0.7) -> List[SearchResult]:
        """Perform semantic search using unified trade_embeddings table"""
        try:
            # Use the more comprehensive search_trade_embeddings method for better content type handling
            return await self.search_trade_embeddings(
                user_token=user_token,
                query=query,
                symbol=symbol,
                content_type=content_types[0] if content_types and len(content_types) == 1 else None,
                source_tables=None,
                date_from=None,
                date_to=None,
                similarity_threshold=similarity_threshold,
                limit=limit
            )
            
        except Exception as e:
            logger.error(f"Error in unified semantic search: {str(e)}")
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

    # Unified Trade Embeddings Methods (Single Table Approach)
    # Note: Using trade_embeddings table only - eliminated multi-table RAG approach
    
    async def search_trade_embeddings(
        self, 
        user_token: str,
        query: str,
        symbol: Optional[str] = None,
        content_type: Optional[str] = None,
        source_tables: Optional[List[str]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        similarity_threshold: float = 0.7,
        limit: int = 10
    ) -> List[SearchResult]:
        """
        Search trade embeddings using semantic similarity
        
        Args:
            user_token: Authentication token
            query: Search query text
            symbol: Optional symbol filter (e.g., 'AAPL')
            content_type: Optional content type filter
            source_tables: Optional list of source tables to search
            date_from: Optional start date for filtering
            date_to: Optional end date for filtering
            similarity_threshold: Minimum similarity score (0.0-1.0)
            limit: Maximum number of results
            
        Returns:
            List of SearchResult objects
        """
        try:
            user_id = await self._get_user_id_from_token(user_token)
            
            # Generate query embedding using existing embedding service
            query_embedding = self.embedding_service.generate_embeddings_batch([query])
            query_vector = query_embedding[0] if query_embedding else []
            
            if not query_vector:
                logger.error("Failed to generate query embedding")
                return []
                
            # Use query_vector directly as array for Supabase RPC
            # Supabase will handle the vector format conversion
            
            logger.info(f"Searching trade embeddings for user {user_id[:8]}... with query: {query[:50]}...")
            
            # Log all search parameters for debugging
            search_params = {
                'p_query_vector': query_vector,
                'p_user_id': user_id,
                'p_symbol': symbol,
                'p_content_type': content_type,
                'p_source_tables': source_tables,
                'p_date_from': date_from,
                'p_date_to': date_to,
                'p_min_relevance_score': 0.0,  # Add missing parameter
                'p_similarity_threshold': similarity_threshold,
                'p_limit': limit
            }
            
            logger.info(f"Search parameters: {search_params}")
            
            # Call the database search function with all required parameters
            response = self.supabase.rpc('search_trade_embeddings_by_similarity', search_params).execute()
            
            if response.data is None:
                logger.warning("No trade embedding results returned from database")
                
                # Debug: Check if there are any embeddings at all for this user
                try:
                    count_response = self.supabase.table('trade_embeddings').select('id', count='exact').eq('user_id', user_id).execute()
                    total_count = count_response.count if hasattr(count_response, 'count') else 0
                    logger.info(f"Debug: User {user_id[:8]} has {total_count} total trade embeddings in database")
                    
                    if total_count == 0:
                        logger.warning("Debug: No trade embeddings found for this user. User needs to index some trading data first.")
                    else:
                        # Check embedding dimensions
                        sample_response = self.supabase.table('trade_embeddings').select('embedding_vector').eq('user_id', user_id).limit(1).execute()
                        if sample_response.data:
                            sample_vector = sample_response.data[0].get('embedding_vector')
                            logger.info(f"Debug: Sample embedding vector type: {type(sample_vector)}")
                        
                except Exception as debug_error:
                    logger.error(f"Debug query failed: {debug_error}")
                
                return []
                
            results = []
            for row in response.data:
                try:
                    result = SearchResult(
                        content=row.get('content_text', ''),
                        similarity_score=float(row.get('similarity_score', 0.0)),
                        metadata={
                            'source_table': row.get('source_table'),
                            'source_id': row.get('source_id'),
                            'symbol': row.get('symbol'),
                            'trade_date': row.get('trade_date'),
                            'content_type': row.get('content_type'),
                            'relevance_score': row.get('relevance_score'),
                            'metadata': row.get('metadata', {}),
                            'created_at': row.get('created_at')
                        },
                        document_type=row.get('content_type', 'trade_data')
                    )
                    results.append(result)
                    
                except Exception as row_error:
                    logger.error(f"Error processing trade embedding result: {row_error}")
                    continue
                    
            logger.info(f"Retrieved {len(results)} trade embedding results")
            return results
            
        except Exception as e:
            logger.error(f"Error searching trade embeddings: {str(e)}")
            return []
    
    async def get_similar_trades_for_symbol(
        self,
        user_token: str,
        symbol: str,
        query: str,
        limit: int = 5
    ) -> List[SearchResult]:
        """
        Get trades similar to query for a specific symbol
        
        Args:
            user_token: Authentication token
            symbol: Stock symbol to search (e.g., 'AAPL')
            query: Search query describing trade characteristics
            limit: Maximum number of results
            
        Returns:
            List of SearchResult objects
        """
        try:
            user_id = await self._get_user_id_from_token(user_token)
            
            # Generate query embedding
            query_embedding = self.embedding_service.generate_embeddings_batch([query])
            query_vector = query_embedding[0] if query_embedding else []
            
            if not query_vector:
                return []
            
            logger.info(f"Searching similar trades for symbol {symbol}")
            
            # Call the specialized symbol search function
            response = self.supabase.rpc('get_similar_trades_for_symbol', {
                'p_symbol': symbol,
                'p_query_vector': query_vector,
                'p_user_id': user_id,
                'p_limit': limit
            }).execute()
            
            if response.data is None:
                return []
                
            results = []
            for row in response.data:
                try:
                    result = SearchResult(
                        content=row.get('content_text', ''),
                        similarity_score=float(row.get('similarity_score', 0.0)),
                        metadata={
                            'trade_date': row.get('trade_date'),
                            'source_table': row.get('source_table'),
                            'source_id': row.get('source_id'),
                            'metadata': row.get('metadata', {}),
                            'symbol': symbol
                        },
                        document_type='symbol_trade'
                    )
                    results.append(result)
                    
                except Exception as row_error:
                    logger.error(f"Error processing symbol trade result: {row_error}")
                    continue
                    
            return results
            
        except Exception as e:
            logger.error(f"Error getting similar trades for symbol {symbol}: {str(e)}")
            return []
    
    async def get_trade_embeddings_stats(self, user_token: str) -> Dict[str, Any]:
        """
        Get comprehensive statistics for user's trade embeddings
        Uses unified trade_embeddings table approach
        """
        """
        Get statistics about user's trade embeddings
        
        Args:
            user_token: Authentication token
            
        Returns:
            Dictionary containing embedding statistics
        """
        try:
            user_id = await self._get_user_id_from_token(user_token)
            
            response = self.supabase.rpc('get_trade_embeddings_stats', {
                'p_user_id': user_id
            }).execute()
            
            if response.data and len(response.data) > 0:
                stats = response.data[0]
                return {
                    'total_embeddings': stats.get('total_embeddings', 0),
                    'embeddings_by_source': stats.get('embeddings_by_source', {}),
                    'embeddings_by_content_type': stats.get('embeddings_by_content_type', {}),
                    'embeddings_by_symbol': stats.get('embeddings_by_symbol', {}),
                    'latest_embedding': stats.get('latest_embedding'),
                    'avg_relevance_score': float(stats.get('avg_relevance_score', 0.0))
                }
            else:
                return {
                    'total_embeddings': 0,
                    'embeddings_by_source': {},
                    'embeddings_by_content_type': {},
                    'embeddings_by_symbol': {},
                    'latest_embedding': None,
                    'avg_relevance_score': 0.0
                }
                
        except Exception as e:
            logger.error(f"Error getting trade embeddings stats: {str(e)}")
            return {
                'total_embeddings': 0,
                'embeddings_by_source': {},
                'embeddings_by_content_type': {},
                'embeddings_by_symbol': {},
                'latest_embedding': None,
                'avg_relevance_score': 0.0,
                'error': str(e)
            }
    
    async def call_embedding_edge_function(
        self,
        action: str,
        user_id: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Helper method to call the embedding edge function
        
        Args:
            action: Action to perform ('embed_trade_data' or 'search_embeddings')
            user_id: User ID
            **kwargs: Additional parameters for the action
            
        Returns:
            Dictionary containing the edge function response
        """
        try:
            import httpx
            
            # Get the Supabase URL for edge functions
            supabase_url = self.supabase.supabase_url
            edge_function_url = f"{supabase_url}/functions/v1/embedding"
            
            payload = {
                'action': action,
                'user_id': user_id,
                **kwargs
            }
            
            # Use service key for edge function authentication
            headers = {
                'Authorization': f'Bearer {self.supabase.supabase_key}',
                'Content-Type': 'application/json'
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    edge_function_url,
                    json=payload,
                    headers=headers,
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Edge function error: {response.status_code} - {response.text}")
                    return {'success': False, 'error': f'HTTP {response.status_code}'}
                    
        except Exception as e:
            logger.error(f"Error calling embedding edge function: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    async def _call_sql_function(self, function_name: str, params: Dict[str, Any], access_token: str) -> Any:
        """Helper method to call SQL functions with authentication."""
        try:
            return await self.auth_service.safe_rpc_call(function_name, params, access_token)
        except Exception as e:
            raise Exception(f"Database operation failed: {str(e)}")
