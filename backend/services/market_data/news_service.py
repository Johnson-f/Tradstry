# backend/services/market_data/news_service.py

from typing import List, Optional
from .base_service import BaseMarketDataService
from models.market_data import (
    MarketNews, FinanceNews, NewsStats, NewsSearch, MarketNewsRequest,
    FilteredNewsRequest, SymbolNewsRequest, NewsStatsRequest, NewsSearchRequest
)

class NewsService(BaseMarketDataService):
    """Service for market and finance news operations."""

    async def get_latest_market_news(
        self, 
        request: MarketNewsRequest, 
        access_token: str = None
    ) -> List[MarketNews]:
        """Get latest market news articles."""
        async def operation(client):
            params = {'article_limit': request.article_limit}
            response = client.rpc('get_latest_market_news', params).execute()
            return [MarketNews(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_filtered_market_news(
        self, 
        request: FilteredNewsRequest, 
        access_token: str = None
    ) -> List[MarketNews]:
        """Get filtered market news with advanced filtering options."""
        async def operation(client):
            params = {
                'article_limit': request.article_limit,
                'source_filter': request.source_filter,
                'category_filter': request.category_filter,
                'min_relevance_score': float(request.min_relevance_score) if request.min_relevance_score else None,
                'days_back': request.days_back
            }
            response = client.rpc('get_filtered_market_news', params).execute()
            return [MarketNews(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_symbol_news(
        self, 
        request: SymbolNewsRequest, 
        access_token: str = None
    ) -> List[FinanceNews]:
        """Get comprehensive news for a specific symbol."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_limit': request.limit,
                'p_offset': request.offset,
                'p_days_back': request.days_back,
                'p_min_relevance': float(request.min_relevance) if request.min_relevance else 0.0,
                'p_data_provider': request.data_provider
            }
            response = client.rpc('get_symbol_news', params).execute()
            return [FinanceNews(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_latest_symbol_news(
        self, 
        symbol: str, 
        limit: int = 10, 
        access_token: str = None
    ) -> List[FinanceNews]:
        """Get latest news for a specific symbol (simplified)."""
        async def operation(client):
            params = {
                'p_symbol': symbol.upper(),
                'p_limit': limit
            }
            response = client.rpc('get_latest_symbol_news', params).execute()
            result = []
            for item in response.data if response.data else []:
                finance_news = FinanceNews(
                    id=item['id'],
                    title=item['title'],
                    news_url=item['news_url'],
                    source_name=item['source_name'],
                    published_at=item['published_at'],
                    sentiment_score=item['sentiment_score'],
                    relevance_score=item['relevance_score'],
                    image_url=item['image_url']
                )
                result.append(finance_news)
            return result
        
        return await self._execute_with_retry(operation, access_token)

    async def get_symbol_news_stats(
        self, 
        request: NewsStatsRequest, 
        access_token: str = None
    ) -> Optional[NewsStats]:
        """Get news statistics for a specific symbol."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_days_back': request.days_back
            }
            response = client.rpc('get_symbol_news_stats', params).execute()
            if response.data and len(response.data) > 0:
                return NewsStats(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def search_symbol_news(
        self, 
        request: NewsSearchRequest, 
        access_token: str = None
    ) -> List[NewsSearch]:
        """Search news by keyword for a specific symbol."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_search_term': request.search_term,
                'p_limit': request.limit
            }
            response = client.rpc('search_symbol_news', params).execute()
            return [NewsSearch(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
