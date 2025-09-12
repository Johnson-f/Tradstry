from typing import List, Optional, Dict, Any
from datetime import datetime, date
from decimal import Decimal
from supabase import Client
from database import get_supabase, get_supabase_admin_client
from auth_service import AuthService
from models.market_data import (
    DailyEarningsSummary, CompanyInfo, CompanyBasic, MarketNews, FinanceNews,
    NewsStats, NewsSearch, StockQuote, FundamentalData, PriceMovement, TopMover,
    MarketMover, MarketMoverWithLogo, CompanyLogo,
    EarningsRequest, CompanySearchRequest, CompanySectorRequest, CompanySearchTermRequest,
    MarketNewsRequest, FilteredNewsRequest, SymbolNewsRequest, NewsStatsRequest,
    NewsSearchRequest, StockQuoteRequest, FundamentalRequest, PriceMovementRequest,
    TopMoversRequest, SymbolCheckResponse, SymbolSaveRequest, SymbolSaveResponse,
    CacheData, CachedSymbolData, MajorIndicesResponse, CacheDataRequest,
    MarketMoversRequest, CompanyLogosRequest
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
                # Handle the yield field alias since 'yield' is a Python keyword
                data = response.data[0]
                if 'yield' in data:
                    data['yield_'] = data.pop('yield')
                return CompanyInfo(**data)
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
            
            # Handle the yield field alias for each company
            result = []
            if response.data:
                for item in response.data:
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    result.append(CompanyBasic(**item))
            return result
        
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
            
            # Handle the yield field alias for each company
            result = []
            if response.data:
                for item in response.data:
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    result.append(CompanyBasic(**item))
            return result
        
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

    # =====================================================
    # SYMBOL MANAGEMENT FUNCTIONS
    # =====================================================

    async def check_symbol_exists(self, symbol: str, access_token: str = None) -> SymbolCheckResponse:
        """Check if a symbol exists in the stock_quotes table."""
        async def operation(client=None):
            supabase = client or await self.get_authenticated_client(access_token)
            
            # Query stock_quotes table for the symbol
            response = supabase.table('stock_quotes').select('symbol').eq('symbol', symbol).limit(1).execute()
            
            exists = len(response.data) > 0
            
            return SymbolCheckResponse(
                exists=exists,
                symbol=symbol,
                message=f"Symbol {symbol} {'found' if exists else 'not found'} in database"
            )
        
        return await self._execute_with_retry(operation, access_token)

    async def save_symbol_to_database(self, symbol: str, access_token: str = None) -> SymbolSaveResponse:
        """Save a symbol to the stock_quotes table with initial market data."""
        async def operation(client=None):
            supabase = client or await self.get_authenticated_client(access_token)
            
            # First, check if symbol already exists
            existing_check = supabase.table('stock_quotes').select('symbol').eq('symbol', symbol).limit(1).execute()
            
            if len(existing_check.data) > 0:
                return SymbolSaveResponse(
                    success=True,
                    symbol=symbol,
                    message='Symbol already exists in database'
                )
            
            # Fetch initial data for the symbol from external API
            initial_quote_data = None
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    quote_response = await client.get(
                        f"https://finance-query.onrender.com/v1/quotes?symbols={symbol}"
                    )
                    
                    if quote_response.status_code == 200:
                        quote_data = quote_response.json()
                        # Handle case where API returns a list instead of dict
                        if isinstance(quote_data, list) and len(quote_data) > 0:
                            initial_quote_data = quote_data[0]
                        elif isinstance(quote_data, dict):
                            initial_quote_data = quote_data.get(symbol)
            except Exception as api_error:
                print(f"Failed to fetch initial quote data for symbol: {symbol}, {api_error}")
            
            # Insert symbol into stock_quotes table with initial data (if available)
            # Use admin client with service role key to bypass RLS policies
            admin_client = get_supabase_admin_client()
            
            insert_data = {
                'symbol': symbol,
                'price': initial_quote_data.get('price') if initial_quote_data else None,
                'change_amount': initial_quote_data.get('change') if initial_quote_data else None,
                'change_percent': initial_quote_data.get('changePercent') if initial_quote_data else None,
                'volume': initial_quote_data.get('volume') if initial_quote_data else None,
                'open_price': initial_quote_data.get('open') if initial_quote_data else None,
                'high_price': initial_quote_data.get('dayHigh') if initial_quote_data else None,
                'low_price': initial_quote_data.get('dayLow') if initial_quote_data else None,
                'previous_close': initial_quote_data.get('previousClose') if initial_quote_data else None,
                'quote_timestamp': datetime.now().isoformat(),
                'data_provider': 'yahoo_finance',
            }
            
            response = admin_client.table('stock_quotes').insert(insert_data).execute()
            
            if response.data:
                message = 'Symbol saved with initial data' if initial_quote_data else 'Symbol saved without initial data'
                return SymbolSaveResponse(
                    success=True,
                    symbol=symbol,
                    message=message
                )
            else:
                raise Exception("Failed to save symbol to database")
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # MARKET MOVERS FUNCTIONS
    # =====================================================

    async def get_top_gainers(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """Get top gainers for a specific date."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
                'p_limit': request.limit
            }
            
            response = client.rpc('get_top_gainers', params).execute()
            
            return [MarketMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_losers(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """Get top losers for a specific date."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
                'p_limit': request.limit
            }
            
            response = client.rpc('get_top_losers', params).execute()
            
            return [MarketMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_most_active(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """Get most active stocks for a specific date."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
                'p_limit': request.limit
            }
            
            response = client.rpc('get_most_active', params).execute()
            
            return [MarketMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_gainers_with_logos(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithLogo]:
        """Get top gainers with company logos."""
        # First get the gainers
        gainers = await self.get_top_gainers(request, access_token)
        
        if not gainers:
            return []
        
        # Extract symbols for logo lookup
        symbols = [gainer.symbol for gainer in gainers]
        logos_request = CompanyLogosRequest(symbols=symbols)
        logos = await self.get_company_logos_batch(logos_request, access_token)
        
        # Create a logo lookup dictionary
        logo_dict = {logo.symbol: logo.logo for logo in logos}
        
        # Combine gainers with logos
        result = []
        for gainer in gainers:
            mover_with_logo = MarketMoverWithLogo(
                symbol=gainer.symbol,
                name=gainer.name,
                price=gainer.price,
                change=gainer.change,
                percent_change=gainer.percent_change,
                fetch_timestamp=gainer.fetch_timestamp,
                logo=logo_dict.get(gainer.symbol)
            )
            result.append(mover_with_logo)
        
        return result

    async def get_top_losers_with_logos(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithLogo]:
        """Get top losers with company logos."""
        # First get the losers
        losers = await self.get_top_losers(request, access_token)
        
        if not losers:
            return []
        
        # Extract symbols for logo lookup
        symbols = [loser.symbol for loser in losers]
        logos_request = CompanyLogosRequest(symbols=symbols)
        logos = await self.get_company_logos_batch(logos_request, access_token)
        
        # Create a logo lookup dictionary
        logo_dict = {logo.symbol: logo.logo for logo in logos}
        
        # Combine losers with logos
        result = []
        for loser in losers:
            mover_with_logo = MarketMoverWithLogo(
                symbol=loser.symbol,
                name=loser.name,
                price=loser.price,
                change=loser.change,
                percent_change=loser.percent_change,
                fetch_timestamp=loser.fetch_timestamp,
                logo=logo_dict.get(loser.symbol)
            )
            result.append(mover_with_logo)
        
        return result

    async def get_most_active_with_logos(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithLogo]:
        """Get most active stocks with company logos."""
        # First get the most active
        most_active = await self.get_most_active(request, access_token)
        
        if not most_active:
            return []
        
        # Extract symbols for logo lookup
        symbols = [stock.symbol for stock in most_active]
        logos_request = CompanyLogosRequest(symbols=symbols)
        logos = await self.get_company_logos_batch(logos_request, access_token)
        
        # Create a logo lookup dictionary
        logo_dict = {logo.symbol: logo.logo for logo in logos}
        
        # Combine most active with logos
        result = []
        for stock in most_active:
            mover_with_logo = MarketMoverWithLogo(
                symbol=stock.symbol,
                name=stock.name,
                price=stock.price,
                change=stock.change,
                percent_change=stock.percent_change,
                fetch_timestamp=stock.fetch_timestamp,
                logo=logo_dict.get(stock.symbol)
            )
            result.append(mover_with_logo)
        
        return result

    # =====================================================
    # COMPANY LOGOS FUNCTIONS
    # =====================================================

    async def get_company_logos_batch(
        self, 
        request: CompanyLogosRequest, 
        access_token: str = None
    ) -> List[CompanyLogo]:
        """Get company logos for multiple symbols at once."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            # Convert symbols list to PostgreSQL array format
            symbols_array = request.symbols
            
            params = {'p_symbols': symbols_array}
            
            response = client.rpc('get_company_logos_batch', params).execute()
            
            return [CompanyLogo(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_market_movers_overview(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> Dict[str, Any]:
        """Get comprehensive market movers overview with logos."""
        # Get all three types of movers with logos
        gainers = await self.get_top_gainers_with_logos(request, access_token)
        losers = await self.get_top_losers_with_logos(request, access_token)
        most_active = await self.get_most_active_with_logos(request, access_token)
        
        return {
            'gainers': [mover.dict() for mover in gainers],
            'losers': [mover.dict() for mover in losers],
            'most_active': [mover.dict() for mover in most_active],
            'data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
            'limit_per_category': request.limit,
            'timestamp': datetime.now().isoformat()
        }

    # =====================================================
    # CACHING FUNCTIONS
    # =====================================================

    async def get_cached_symbol_data(
        self,
        request: CacheDataRequest,
        access_token: str = None
    ) -> Optional[CachedSymbolData]:
        """Get cached data for a specific symbol."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)

            # Query the caching table directly
            query = client.table('caching').select('*').eq('symbol', request.symbol.upper())

            if request.period_type:
                query = query.eq('period_type', request.period_type)

            if request.data_provider:
                query = query.eq('data_provider', request.data_provider)

            # Order by period_start descending and limit results
            query = query.order('period_start', desc=True)

            if request.limit:
                query = query.limit(request.limit)

            response = query.execute()

            if response.data and len(response.data) > 0:
                # Convert response data to CacheData objects
                data_points = [CacheData(**item) for item in response.data]

                # Find latest timestamp
                latest_timestamp = max((point.period_start for point in data_points)) if data_points else None

                return CachedSymbolData(
                    symbol=request.symbol.upper(),
                    data_points=data_points,
                    latest_timestamp=latest_timestamp,
                    data_points_count=len(data_points)
                )
            return None

        return await self._execute_with_retry(operation, access_token)

    async def get_major_indices_data(
        self,
        limit: int = 100,
        period_type: str = "1min",
        data_provider: str = "finance_query",
        access_token: str = None
    ) -> MajorIndicesResponse:
        """Get cached data for major indices (SPY, QQQ, DIA, VIX)."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)

            indices_symbols = ['SPY', 'QQQ', 'DIA', 'VIX']
            indices_data = {}

            total_data_points = 0

            for symbol in indices_symbols:
                # Query the caching table for each symbol
                query = client.table('caching').select('*').eq('symbol', symbol)

                if period_type:
                    query = query.eq('period_type', period_type)

                if data_provider:
                    query = query.eq('data_provider', data_provider)

                # Order by period_start descending and limit results
                query = query.order('period_start', desc=True)

                if limit:
                    query = query.limit(limit)

                response = query.execute()

                if response.data and len(response.data) > 0:
                    # Convert response data to CacheData objects
                    data_points = [CacheData(**item) for item in response.data]

                    # Find latest timestamp
                    latest_timestamp = max((point.period_start for point in data_points)) if data_points else None

                    indices_data[symbol.lower()] = CachedSymbolData(
                        symbol=symbol,
                        data_points=data_points,
                        latest_timestamp=latest_timestamp,
                        data_points_count=len(data_points)
                    )

                    total_data_points += len(data_points)

            return MajorIndicesResponse(
                spy=indices_data.get('spy'),
                qqq=indices_data.get('qqq'),
                dia=indices_data.get('dia'),
                vix=indices_data.get('vix'),
                timestamp=datetime.now(),
                total_data_points=total_data_points
            )

        return await self._execute_with_retry(operation, access_token)
