"""
Core RAG Vector Service for Tradistry
Manages vector indexes for semantic search and retrieval
"""

from typing import List, Dict, Any, Optional
import logging
from enum import Enum
from dataclasses import dataclass
from datetime import datetime

# Note: Not inheriting from BaseDatabaseService to avoid constructor conflicts
# from services.base_database_service import BaseDatabaseService
from services.ai_embedding_service import AIEmbeddingService

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
    
    def __init__(self):
        try:
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
            
            doc_data = {
                'user_id': user_id,
                'document_type': doc_type.value,
                'title': title,
                'content': content,
                'content_embedding': embedding,
                'metadata': metadata or {}
            }
            
            # Route to appropriate table based on document type
            if doc_type in [DocumentType.TRADE_ENTRY, DocumentType.TRADE_NOTE]:
                result = await self._call_sql_function('upsert_rag_trade_document', doc_data, user_token)
            elif doc_type in [DocumentType.AI_REPORT, DocumentType.AI_INSIGHT]:
                result = await self._call_sql_function('upsert_rag_ai_document', doc_data, user_token)
            else:
                result = await self._call_sql_function('upsert_rag_market_document', doc_data, user_token)
                
            return result.get('id') if result else None
            
        except Exception as e:
            logger.error(f"Error indexing document: {str(e)}")
            raise
            
    async def semantic_search(self, user_token: str, query: str, 
                            limit: int = 5) -> List[SearchResult]:
        """Perform semantic search across all indexes"""
        try:
            query_embedding = self.embedding_service.generate_embedding(query)
            
            search_params = {
                'query_embedding': query_embedding,
                'similarity_threshold': 0.7,
                'limit_count': limit
            }
            
            results = await self._call_sql_function('semantic_search_all', search_params, user_token)
            
            return [
                SearchResult(
                    content=r.get('content', ''),
                    similarity_score=r.get('similarity_score', 0.0),
                    metadata=r.get('metadata', {}),
                    document_type=r.get('document_type', '')
                )
                for r in (results or [])
            ]
            
        except Exception as e:
            logger.error(f"Error in semantic search: {str(e)}")
            return []
