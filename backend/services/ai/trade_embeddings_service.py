"""
Trade Embeddings Service for Tradistry
Handles trade data embedding and retrieval for RAG-enhanced AI responses
"""

from typing import List, Dict, Any, Optional
import logging
import httpx
from datetime import datetime
from supabase import Client
from database import get_supabase
from utils.auth import get_user_with_token_retry
from .ai_embedding_service import AIEmbeddingService
from .rag_vector_service import RAGVectorService, SearchResult

logger = logging.getLogger(__name__)

class TradeEmbeddingsService:
    """Service for managing trade data embeddings and semantic search"""
    
    def __init__(self, supabase: Optional[Client] = None):
        try:
            self.supabase = supabase or get_supabase()
            self.embedding_service = AIEmbeddingService()
            self.rag_service = RAGVectorService(supabase)
            logger.info("TradeEmbeddingsService initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing TradeEmbeddingsService: {str(e)}")
            raise Exception(f"TradeEmbeddingsService initialization failed: {str(e)}")
    
    async def trigger_embedding_for_trade_data(
        self, 
        table_name: str, 
        record_id: str, 
        user_token: str
    ) -> Dict[str, Any]:
        """
        Trigger embedding generation for a trade data record
        
        Args:
            table_name: Source table name (stocks, options, notes, etc.)
            record_id: ID of the record to embed
            user_token: Authentication token
            
        Returns:
            Dictionary containing embedding result
        """
        try:
            # Get user info
            user_info = await get_user_with_token_retry(user_token)
            user_id = user_info.get('id')
            
            if not user_id:
                return {'success': False, 'error': 'Invalid user token'}
            
            logger.info(f"Triggering embedding for {table_name}:{record_id} (user: {user_id[:8]}...)")
            
            # Call edge function to process the embedding
            result = await self.rag_service.call_embedding_edge_function(
                action='embed_trade_data',
                user_id=user_id,
                table_name=table_name,
                record_id=record_id
            )
            
            if result.get('success'):
                logger.info(f"Successfully created embedding for {table_name}:{record_id}")
            else:
                logger.error(f"Failed to create embedding: {result.get('error', 'Unknown error')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error triggering embedding for {table_name}:{record_id}: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    async def search_user_trade_context(
        self,
        query: str,
        user_token: str,
        symbol: Optional[str] = None,
        limit: int = 5
    ) -> List[SearchResult]:
        """
        Search user's trade history for relevant context
        
        Args:
            query: Search query describing what context to find
            user_token: Authentication token
            symbol: Optional symbol filter
            limit: Maximum number of results
            
        Returns:
            List of SearchResult objects
        """
        try:
            logger.info(f"Searching trade context for query: {query[:50]}...")
            
            # Use the RAG service to search trade embeddings
            results = await self.rag_service.search_trade_embeddings(
                user_token=user_token,
                query=query,
                symbol=symbol,
                similarity_threshold=0.6,  # Lower threshold for broader context
                limit=limit
            )
            
            logger.info(f"Found {len(results)} relevant trade context results")
            return results
            
        except Exception as e:
            logger.error(f"Error searching trade context: {str(e)}")
            return []
    
    async def get_symbol_specific_context(
        self,
        symbol: str,
        query: str,
        user_token: str,
        limit: int = 3
    ) -> List[SearchResult]:
        """
        Get context specific to a trading symbol
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            query: Context query
            user_token: Authentication token
            limit: Maximum number of results
            
        Returns:
            List of SearchResult objects
        """
        try:
            logger.info(f"Getting context for symbol {symbol}")
            
            results = await self.rag_service.get_similar_trades_for_symbol(
                user_token=user_token,
                symbol=symbol,
                query=query,
                limit=limit
            )
            
            return results
            
        except Exception as e:
            logger.error(f"Error getting symbol context for {symbol}: {str(e)}")
            return []
    
    async def format_context_for_llm(
        self, 
        search_results: List[SearchResult],
        max_context_length: int = 2000
    ) -> str:
        """
        Format search results into context suitable for LLM prompts
        
        Args:
            search_results: List of search results
            max_context_length: Maximum context length in characters
            
        Returns:
            Formatted context string
        """
        if not search_results:
            return ""
        
        context_parts = []
        current_length = 0
        
        for i, result in enumerate(search_results):
            # Format each result
            similarity_pct = int(result.similarity_score * 100)
            
            # Add metadata context
            metadata_info = ""
            if result.metadata.get('symbol'):
                metadata_info += f"Symbol: {result.metadata['symbol']} "
            if result.metadata.get('trade_date'):
                metadata_info += f"Date: {result.metadata['trade_date'][:10]} "
            if result.metadata.get('source_table'):
                metadata_info += f"Source: {result.metadata['source_table']} "
            
            # Format the context entry
            context_entry = f"[Context {i+1}] ({similarity_pct}% match)\n"
            if metadata_info:
                context_entry += f"{metadata_info}\n"
            context_entry += f"Content: {result.content}\n"
            
            # Check if adding this entry would exceed the limit
            if current_length + len(context_entry) > max_context_length:
                break
                
            context_parts.append(context_entry)
            current_length += len(context_entry)
        
        if context_parts:
            return "=== Relevant Trade Context ===\n\n" + "\n".join(context_parts) + "\n=== End Context ===\n"
        else:
            return ""
    
    async def extract_symbols_from_query(self, query: str) -> List[str]:
        """
        Extract trading symbols from a user query
        
        Args:
            query: User's query text
            
        Returns:
            List of detected symbols
        """
        import re
        
        # Simple symbol extraction - look for common patterns
        # This could be enhanced with a more sophisticated approach
        symbols = []
        
        # Pattern for typical stock symbols (2-5 uppercase letters)
        symbol_pattern = r'\b[A-Z]{2,5}\b'
        potential_symbols = re.findall(symbol_pattern, query.upper())
        
        # Filter out common words that aren't symbols
        common_words = {'THE', 'AND', 'OR', 'BUT', 'FOR', 'FROM', 'TO', 'AT', 'BY', 'UP', 'ON', 'IN', 'OUT', 'OFF', 'OVER', 'UNDER', 'IS', 'WAS', 'ARE', 'WERE', 'AM', 'BE', 'BEEN', 'BEING', 'HAVE', 'HAS', 'HAD', 'DO', 'DOES', 'DID', 'WILL', 'WOULD', 'COULD', 'SHOULD', 'MAY', 'MIGHT', 'MUST', 'SHALL', 'CAN', 'THIS', 'THAT', 'THESE', 'THOSE', 'ALL', 'ANY', 'SOME', 'MANY', 'MUCH', 'MORE', 'MOST', 'LESS', 'FEW', 'SEVERAL', 'BOTH', 'EACH', 'EVERY', 'OTHER', 'ANOTHER', 'SUCH', 'ONLY', 'OWN', 'SAME', 'SO', 'THAN', 'TOO', 'VERY', 'JUST', 'NOW', 'HERE', 'THERE', 'WHERE', 'WHEN', 'WHY', 'HOW', 'WHAT', 'WHO', 'WHICH', 'WHOSE', 'WHOM', 'YES', 'NO', 'NOT', 'ALSO', 'WELL', 'BACK', 'STILL', 'GOOD', 'NEW', 'OLD', 'LAST', 'LONG', 'GREAT', 'LITTLE', 'OWN', 'RIGHT', 'BIG', 'HIGH', 'DIFFERENT', 'SMALL', 'LARGE', 'NEXT', 'EARLY', 'YOUNG', 'IMPORTANT', 'FEW', 'PUBLIC', 'BAD', 'SAME', 'ABLE'}
        
        for symbol in potential_symbols:
            if symbol not in common_words and len(symbol) >= 2:
                symbols.append(symbol)
        
        return list(set(symbols))  # Remove duplicates
    
    async def get_embeddings_dashboard_data(self, user_token: str) -> Dict[str, Any]:
        """
        Get data for embeddings dashboard/analytics
        
        Args:
            user_token: Authentication token
            
        Returns:
            Dictionary containing dashboard data
        """
        try:
            stats = await self.rag_service.get_trade_embeddings_stats(user_token)
            
            # Enhanced dashboard data
            dashboard_data = {
                'stats': stats,
                'last_updated': datetime.now().isoformat(),
                'embedding_health': {
                    'total_embeddings': stats.get('total_embeddings', 0),
                    'avg_quality': stats.get('avg_relevance_score', 0.0),
                    'coverage_by_source': stats.get('embeddings_by_source', {}),
                    'content_distribution': stats.get('embeddings_by_content_type', {}),
                    'symbol_coverage': len(stats.get('embeddings_by_symbol', {}))
                }
            }
            
            return dashboard_data
            
        except Exception as e:
            logger.error(f"Error getting embeddings dashboard data: {str(e)}")
            return {
                'stats': {},
                'error': str(e),
                'last_updated': datetime.now().isoformat()
            }

    async def batch_embed_existing_data(
        self,
        user_token: str,
        table_names: List[str] = None,
        limit_per_table: int = 100
    ) -> Dict[str, Any]:
        """
        Batch embed existing trade data for a user
        
        Args:
            user_token: Authentication token
            table_names: List of table names to process (default: all supported tables)
            limit_per_table: Maximum records to process per table
            
        Returns:
            Dictionary containing batch processing results
        """
        if table_names is None:
            table_names = ['stocks', 'options', 'setups', 'notes', 'tags', 'templates', 'trade_notes']
        
        try:
            user_info = await get_user_with_token_retry(user_token)
            user_id = user_info.get('id')
            
            if not user_id:
                return {'success': False, 'error': 'Invalid user token'}
                
            results = {
                'total_processed': 0,
                'total_success': 0,
                'total_errors': 0,
                'results_by_table': {},
                'errors': []
            }
            
            for table_name in table_names:
                try:
                    logger.info(f"Processing batch embeddings for table: {table_name}")
                    
                    # Get records from table
                    response = self.supabase.table(table_name)\
                        .select('id')\
                        .eq('user_id', user_id)\
                        .limit(limit_per_table)\
                        .execute()
                    
                    if not response.data:
                        continue
                        
                    table_results = {
                        'processed': 0,
                        'success': 0,
                        'errors': 0
                    }
                    
                    for record in response.data:
                        record_id = str(record['id'])
                        
                        try:
                            # Trigger embedding for this record
                            embedding_result = await self.trigger_embedding_for_trade_data(
                                table_name, record_id, user_token
                            )
                            
                            table_results['processed'] += 1
                            
                            if embedding_result.get('success'):
                                table_results['success'] += 1
                            else:
                                table_results['errors'] += 1
                                results['errors'].append({
                                    'table': table_name,
                                    'record_id': record_id,
                                    'error': embedding_result.get('error', 'Unknown error')
                                })
                                
                        except Exception as record_error:
                            table_results['errors'] += 1
                            results['errors'].append({
                                'table': table_name,
                                'record_id': record_id,
                                'error': str(record_error)
                            })
                    
                    results['results_by_table'][table_name] = table_results
                    results['total_processed'] += table_results['processed']
                    results['total_success'] += table_results['success']
                    results['total_errors'] += table_results['errors']
                    
                except Exception as table_error:
                    logger.error(f"Error processing table {table_name}: {str(table_error)}")
                    results['errors'].append({
                        'table': table_name,
                        'error': str(table_error)
                    })
            
            results['success'] = True
            return results
            
        except Exception as e:
            logger.error(f"Error in batch embedding process: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'total_processed': 0,
                'total_success': 0,
                'total_errors': 0
            }
