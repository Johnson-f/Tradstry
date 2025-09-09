from typing import List, Optional, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from supabase import Client
from database import get_supabase
from auth_service import AuthService
from models.market_data import (
    DailyEarningsSummary, CompanyInfo, CompanyBasic, MarketNews, FinanceNews,
    NewsStats, NewsSearch, StockQuote, FundamentalData, PriceMovement, TopMover,
    EarningsRequest, CompanySearchRequest, CompanySectorRequest, CompanySearchTermRequest,
    MarketNewsRequest, FilteredNewsRequest, SymbolNewsRequest, NewsStatsRequest,
    NewsSearchRequest, StockQuoteRequest, FundamentalRequest, PriceMovementRequest,
    TopMoversRequest
)


class MarketDataService:
    """Service class for market data operations using PostgreSQL functions."""
    
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(self.supabase)
    
    async def get_authenticated_client(self, access_token: str = None) -> Client:
        """Get a Supabase client with authentication token."""
        if access_token:
            try:
                return await self.auth_service.get_authenticated_client(access_token)
            except Exception as e:
                print(f"ERROR: Failed to get authenticated client: {e}")
                raise e
        return self.supabase
    
    async def _execute_with_retry(self, operation, access_token: str = None):
        """Execute database operation with automatic token refresh retry."""
        try:
            return await operation()
        except Exception as e:
            if ("JWT expired" in str(e) or "401" in str(e)) and access_token:
                print("JWT expired during operation, refreshing and retrying...")
                client = await self.get_authenticated_client(access_token)
                return await operation(client)
            else:
                raise e

    # =====================================================
    # EARNINGS FUNCTIONS
    # =====================================================

    async def get_daily_earnings_summary(
        self, 
        request: EarningsRequest, 
        access_token: str = None
    ) -> Optional[DailyEarningsSummary]:
        """Get comprehensive daily earnings summary."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            target_date = request.target_date or date.today()
            
            response = client.rpc(
                'get_daily_earnings_summary',
                {'target_date': target_date.isoformat()}
            ).execute()
            
            if response.data and len(response.data) > 0:
                return DailyEarningsSummary(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # COMPANY INFO FUNCTIONS
    # =====================================================

    async def get_company_info_by_symbol(
        self, 
        request: CompanySearchRequest, 
        access_token: str = None
    ) -> Optional[CompanyInfo]:
        """Get detailed company information by symbol."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_symbol': request.symbol.upper()}
            if request.data_provider:
                params['p_data_provider'] = request.data_provider
            
            response = client.rpc('get_company_info_by_symbol', params).execute()
            
            if response.data and len(response.data) > 0:
                return CompanyInfo(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_companies_by_sector_industry(
        self, 
        request: CompanySectorRequest, 
        access_token: str = None
    ) -> List[CompanyBasic]:
        """Get companies filtered by sector and/or industry."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_sector': request.sector,
                'p_industry': request.industry,
                'p_limit': request.limit,
                'p_offset': request.offset
            }
            
            response = client.rpc('get_companies_by_sector_industry', params).execute()
            
            return [CompanyBasic(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def search_companies(
        self, 
        request: CompanySearchTermRequest, 
        access_token: str = None
    ) -> List[CompanyBasic]:
        """Search companies by name or symbol."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_search_term': request.search_term,
                'p_limit': request.limit
            }
            
            response = client.rpc('search_companies', params).execute()
            
            return [CompanyBasic(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # MARKET NEWS FUNCTIONS
    # =====================================================

    async def get_latest_market_news(
        self, 
        request: MarketNewsRequest, 
        access_token: str = None
    ) -> List[MarketNews]:
        """Get latest market news articles."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
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
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
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

    # =====================================================
    # FINANCE NEWS FUNCTIONS
    # =====================================================

    async def get_symbol_news(
        self, 
        request: SymbolNewsRequest, 
        access_token: str = None
    ) -> List[FinanceNews]:
        """Get comprehensive news for a specific symbol."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
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
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': symbol.upper(),
                'p_limit': limit
            }
            
            response = client.rpc('get_latest_symbol_news', params).execute()
            
            # Convert response to match FinanceNews model
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
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
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
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_search_term': request.search_term,
                'p_limit': request.limit
            }
            
            response = client.rpc('search_symbol_news', params).execute()
            
            return [NewsSearch(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # STOCK METRICS FUNCTIONS
    # =====================================================

    async def get_stock_quotes(
        self, 
        request: StockQuoteRequest, 
        access_token: str = None
    ) -> Optional[StockQuote]:
        """Get stock quote data."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_quote_date': request.quote_date.isoformat() if request.quote_date else date.today().isoformat(),
                'p_data_provider': request.data_provider
            }
            
            response = client.rpc('get_stock_quotes', params).execute()
            
            if response.data and len(response.data) > 0:
                return StockQuote(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_fundamental_data(
        self, 
        request: FundamentalRequest, 
        access_token: str = None
    ) -> Optional[FundamentalData]:
        """Get fundamental data for a stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_data_provider': request.data_provider
            }
            
            response = client.rpc('get_fundamental_data', params).execute()
            
            if response.data and len(response.data) > 0:
                return FundamentalData(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # PRICE MOVEMENTS FUNCTIONS
    # =====================================================

    async def get_significant_price_movements_with_news(
        self, 
        request: PriceMovementRequest, 
        access_token: str = None
    ) -> List[PriceMovement]:
        """Get significant price movements with related news."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper() if request.symbol else None,
                'p_days_back': request.days_back,
                'p_min_change_percent': float(request.min_change_percent),
                'p_limit': request.limit,
                'p_data_provider': request.data_provider
            }
            
            response = client.rpc('get_significant_price_movements_with_news', params).execute()
            
            return [PriceMovement(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_movers_with_news_today(
        self, 
        request: TopMoversRequest, 
        access_token: str = None
    ) -> List[TopMover]:
        """Get today's top movers with related news."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_limit': request.limit,
                'p_min_change_percent': float(request.min_change_percent)
            }
            
            response = client.rpc('get_top_movers_with_news_today', params).execute()
            
            return [TopMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # UTILITY FUNCTIONS
    # =====================================================

    async def get_combined_stock_data(
        self, 
        symbol: str, 
        quote_date: Optional[date] = None,
        access_token: str = None
    ) -> Dict[str, Any]:
        """Get combined stock quotes and fundamental data."""
        quote_request = StockQuoteRequest(symbol=symbol, quote_date=quote_date)
        fundamental_request = FundamentalRequest(symbol=symbol)
        
        quote_data = await self.get_stock_quotes(quote_request, access_token)
        fundamental_data = await self.get_fundamental_data(fundamental_request, access_token)
        
        return {
            'quote': quote_data.dict() if quote_data else None,
            'fundamentals': fundamental_data.dict() if fundamental_data else None
        }

    async def get_symbol_overview(
        self, 
        symbol: str, 
        access_token: str = None
    ) -> Dict[str, Any]:
        """Get comprehensive overview for a symbol including company info, quotes, news, and movements."""
        # Get company info
        company_request = CompanySearchRequest(symbol=symbol)
        company_info = await self.get_company_info_by_symbol(company_request, access_token)
        
        # Get stock data
        stock_data = await self.get_combined_stock_data(symbol, access_token=access_token)
        
        # Get latest news
        latest_news = await self.get_latest_symbol_news(symbol, limit=5, access_token=access_token)
        
        # Get news stats
        news_stats_request = NewsStatsRequest(symbol=symbol, days_back=30)
        news_stats = await self.get_symbol_news_stats(news_stats_request, access_token)
        
        # Get recent price movements
        movement_request = PriceMovementRequest(symbol=symbol, days_back=7, limit=10)
        movements = await self.get_significant_price_movements_with_news(movement_request, access_token)
        
        return {
            'company_info': company_info.dict() if company_info else None,
            'stock_data': stock_data,
            'latest_news': [news.dict() for news in latest_news],
            'news_stats': news_stats.dict() if news_stats else None,
            'recent_movements': [movement.dict() for movement in movements]
        }
