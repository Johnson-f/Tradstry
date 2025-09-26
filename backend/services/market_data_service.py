from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, date
import os
from dotenv import load_dotenv
from supabase import Client

# Load environment variables
load_dotenv()
from database import get_supabase, get_supabase_admin_client
from auth_service import AuthService
from models.market_data import (
    DailyEarningsSummary, CompanyInfo, CompanyBasic, MarketNews, FinanceNews,
    NewsStats, NewsSearch, StockQuote, FundamentalData, PriceMovement, TopMover,
    MarketMover, MarketMoverWithLogo, CompanyLogo, EarningsCalendarLogo,
    HistoricalPrice, HistoricalPriceSummary, LatestHistoricalPrice, HistoricalPriceRange,
    EarningsRequest, CompanySearchRequest, CompanySectorRequest, CompanySearchTermRequest,
    MarketNewsRequest, FilteredNewsRequest, SymbolNewsRequest, NewsStatsRequest,
    NewsSearchRequest, StockQuoteRequest, FundamentalRequest, PriceMovementRequest,
    TopMoversRequest, SymbolCheckResponse, SymbolSaveRequest, SymbolSaveResponse,
    HistoricalPriceRequest, HistoricalPriceSummaryRequest, LatestHistoricalPriceRequest,
    HistoricalPriceRangeRequest, CacheData, CachedSymbolData, MajorIndicesResponse, 
    CacheDataRequest, MarketMoversRequest, CompanyLogosRequest, EarningsCalendarLogosRequest,
    SymbolSearchRequest, SymbolSearchResult, SymbolSearchResponse,
    QuoteRequest, QuoteResult, QuoteResponse,
    IncomeStatement, BalanceSheet, CashFlow, FinancialStatementRequest,
    KeyStats, KeyStatsRequest
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
            
        return await self._execute_with_retry(operation, access_token)

    async def get_key_stats(
        self, 
        request: KeyStatsRequest, 
        access_token: str = None
    ) -> Optional[KeyStats]:
        """Get key stats for a stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency
            }
            
            response = client.rpc('get_key_stats', params).execute()
            
            if response.data and len(response.data) > 0:
                return KeyStats(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # FINANCIAL STATEMENTS FUNCTIONS
    # =====================================================

    async def get_income_statement(
        self, 
        request: FinancialStatementRequest, 
        access_token: str = None
    ) -> List[IncomeStatement]:
        """Get income statement data for a stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency,
                'p_limit': request.limit
            }
            
            response = client.rpc('get_income_statement', params).execute()
            
            return [IncomeStatement(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_balance_sheet(
        self, 
        request: FinancialStatementRequest, 
        access_token: str = None
    ) -> List[BalanceSheet]:
        """Get balance sheet data for a stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency,
                'p_limit': request.limit
            }
            
            response = client.rpc('get_balance_sheet', params).execute()
            
            return [BalanceSheet(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_cash_flow(
        self, 
        request: FinancialStatementRequest, 
        access_token: str = None
    ) -> List[CashFlow]:
        """Get cash flow data for a stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency,
                'p_limit': request.limit
            }
            
            response = client.rpc('get_cash_flow', params).execute()
            
            return [CashFlow(**item) for item in response.data] if response.data else []
        
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
    # HISTORICAL PRICES FUNCTIONS
    # =====================================================

    async def get_historical_prices(
        self, 
        request: HistoricalPriceRequest, 
        access_token: str = None
    ) -> List[HistoricalPrice]:
        """Get historical price data with NEW ARCHITECTURE: 
        Range calculated dynamically from intervals - massive storage savings."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_time_range': request.time_range,
                'p_time_interval': request.time_interval,
                'p_data_provider': request.data_provider,
                'p_limit': request.limit
            }
            
            response = client.rpc('get_historical_prices', params).execute()
            
            return [HistoricalPrice(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_historical_prices_by_symbol(
        self, 
        request: HistoricalPriceSummaryRequest, 
        access_token: str = None
    ) -> List[HistoricalPriceSummary]:
        """Get all available intervals for a specific symbol (no ranges stored - calculated dynamically)."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_symbol': request.symbol.upper()}
            
            response = client.rpc('get_historical_prices_by_symbol', params).execute()
            
            return [HistoricalPriceSummary(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_latest_historical_prices(
        self, 
        request: LatestHistoricalPriceRequest, 
        access_token: str = None
    ) -> List[LatestHistoricalPrice]:
        """Get the most recent historical price data for a symbol across all ranges/intervals."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_limit': request.limit
            }
            
            response = client.rpc('get_latest_historical_prices', params).execute()
            
            return [LatestHistoricalPrice(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_historical_price_range(
        self, 
        request: HistoricalPriceRangeRequest, 
        access_token: str = None
    ) -> List[HistoricalPriceRange]:
        """Get historical prices within a specific date range - NO time_range parameter needed."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': request.symbol.upper(),
                'p_time_interval': request.time_interval,
                'p_start_date': request.start_date.isoformat(),
                'p_end_date': request.end_date.isoformat(),
                'p_data_provider': request.data_provider
            }
            
            response = client.rpc('get_historical_price_range', params).execute()
            
            return [HistoricalPriceRange(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_symbol_historical_overview(
        self, 
        symbol: str, 
        access_token: str = None
    ) -> Dict[str, Any]:
        """Get comprehensive historical price overview for a symbol."""
        # Get available range/interval combinations
        summary_request = HistoricalPriceSummaryRequest(symbol=symbol)
        available_data = await self.get_historical_prices_by_symbol(summary_request, access_token)
        
        # Get latest prices across all ranges/intervals
        latest_request = LatestHistoricalPriceRequest(symbol=symbol, limit=10)
        latest_prices = await self.get_latest_historical_prices(latest_request, access_token)
        
        # Get sample data for each available range/interval combination (limited)
        sample_data = {}
        for combo in available_data[:5]:  # Limit to first 5 combinations to avoid overwhelming response
            try:
                sample_request = HistoricalPriceRequest(
                    symbol=symbol,
                    time_range=combo.time_range,
                    time_interval=combo.time_interval,
                    limit=10
                )
                sample_prices = await self.get_historical_prices(sample_request, access_token)
                sample_data[f"{combo.time_range}_{combo.time_interval}"] = [price.dict() for price in sample_prices]
            except Exception as e:
                print(f"Error getting sample data for {combo.time_range}_{combo.time_interval}: {e}")
                continue
        
        return {
            'symbol': symbol.upper(),
            'available_combinations': [combo.dict() for combo in available_data],
            'latest_prices': [price.dict() for price in latest_prices],
            'sample_data': sample_data,
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

    async def get_earnings_calendar_logos_batch(
        self, 
        request: EarningsCalendarLogosRequest, 
        access_token: str = None
    ) -> List[EarningsCalendarLogo]:
        """Get company logos for multiple symbols from earnings_calendar table only."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            # Convert symbols list to PostgreSQL array format
            symbols_array = request.symbols
            
            params = {'p_symbols': symbols_array}
            
            response = client.rpc('get_earnings_calendar_logos_batch', params).execute()
            
            return [EarningsCalendarLogo(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # SYMBOL SEARCH FUNCTIONS
    # =====================================================

    async def search_symbols(
        self, 
        request: SymbolSearchRequest, 
        access_token: str = None
    ) -> SymbolSearchResponse:
        """Search for stock symbols using multiple APIs in parallel."""
        import httpx
        import asyncio
        
        async def search_finance_query():
            """Search using Finance Query API with retry logic"""
            max_retries = 3
            base_delay = 1.0
            
            for attempt in range(max_retries):
                try:
                    url = "https://finance-query.onrender.com/v1/search"
                    params = {
                        "query": request.query,
                        "yahoo": "true" if request.yahoo else "false"
                    }
                    
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        
                        # Handle rate limiting with exponential backoff
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                print(f"Finance Query rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                                await asyncio.sleep(delay)
                                continue
                            else:
                                print(f"Finance Query API: Max retries exceeded due to rate limiting")
                                return []
                        
                        response.raise_for_status()
                        data = response.json()
                        
                        results = []
                        raw_results = data if isinstance(data, list) else []
                        
                        for item in raw_results:
                            result = SymbolSearchResult(
                                symbol=item.get('symbol', ''),
                                name=item.get('name') or item.get('longName') or item.get('symbol', ''),
                                exchange=item.get('exchange', 'Unknown'),
                                type=item.get('quoteType') or item.get('typeDisp') or item.get('type', 'Stock'),
                                currency=item.get('currency'),
                                marketCap=item.get('marketCap'),
                                sector=item.get('sector')
                            )
                            results.append(result)
                        return results
                        
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        print(f"Finance Query rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        print(f"Finance Query API error: {e}")
                        return []
                except Exception as e:
                    print(f"Finance Query API error: {e}")
                    return []
            
            return []

        async def search_polygon():
            """Search using Polygon.io API with retry logic"""
            polygon_api_key = os.getenv("POLYGON_API_KEY")
            
            # Skip if no API key is configured
            if not polygon_api_key:
                return []
            
            max_retries = 3
            base_delay = 1.0
            
            for attempt in range(max_retries):
                try:
                    url = "https://api.polygon.io/v3/reference/tickers"
                    params = {
                        "search": request.query,
                        "active": "true",
                        "limit": 50,
                        "apikey": polygon_api_key
                    }
                    
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        
                        # Handle rate limiting with exponential backoff
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                print(f"Polygon API rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                                await asyncio.sleep(delay)
                                continue
                            else:
                                print(f"Polygon API: Max retries exceeded due to rate limiting")
                                return []
                        
                        response.raise_for_status()
                        data = response.json()
                        
                        results = []
                        if data.get('results'):
                            for item in data['results']:
                                result = SymbolSearchResult(
                                    symbol=item.get('ticker', ''),
                                    name=item.get('name', ''),
                                    exchange=item.get('primary_exchange', 'Unknown'),
                                    type=item.get('type', 'Stock'),
                                    currency=item.get('currency_name', 'USD'),
                                    marketCap=item.get('market_cap'),
                                    sector=None  # Not provided by Polygon tickers endpoint
                                )
                                results.append(result)
                        return results
                        
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        print(f"Polygon API rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        print(f"Polygon API error: {e}")
                        return []
                except Exception as e:
                    print(f"Polygon API error: {e}")
                    return []
            
            return []

        async def search_finnhub():
            """Search using Finnhub API with retry logic"""
            finnhub_api_key = os.getenv("FINNHUB_API_KEY")
            
            # Skip if no API key is configured
            if not finnhub_api_key:
                return []
            
            max_retries = 3
            base_delay = 1.0
            
            for attempt in range(max_retries):
                try:
                    url = "https://finnhub.io/api/v1/search"
                    params = {
                        "q": request.query,
                        "token": finnhub_api_key
                    }
                    
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        
                        # Handle rate limiting with exponential backoff
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                print(f"Finnhub API rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                                await asyncio.sleep(delay)
                                continue
                            else:
                                print(f"Finnhub API: Max retries exceeded due to rate limiting")
                                return []
                        
                        response.raise_for_status()
                        data = response.json()
                        
                        results = []
                        if data.get('result'):
                            for item in data['result']:
                                result = SymbolSearchResult(
                                    symbol=item.get('symbol', ''),
                                    name=item.get('description', ''),
                                    exchange=item.get('primary', 'Unknown'),
                                    type=item.get('type', 'Stock'),
                                    currency=None,  # Not provided by Finnhub search
                                    marketCap=None,
                                    sector=None
                                )
                                results.append(result)
                        return results
                        
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        print(f"Finnhub API rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        print(f"Finnhub API error: {e}")
                        return []
                except Exception as e:
                    print(f"Finnhub API error: {e}")
                    return []
            
            return []

        async def search_alpha_vantage():
            """Search using Alpha Vantage API with retry logic"""
            alpha_vantage_api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
            
            # Skip if no API key is configured
            if not alpha_vantage_api_key:
                return []
            
            max_retries = 3
            base_delay = 1.0
            
            for attempt in range(max_retries):
                try:
                    url = "https://www.alphavantage.co/query"
                    params = {
                        "function": "SYMBOL_SEARCH",
                        "keywords": request.query,
                        "apikey": alpha_vantage_api_key
                    }
                    
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        response = await client.get(url, params=params)
                        
                        # Handle rate limiting with exponential backoff
                        if response.status_code == 429:
                            if attempt < max_retries - 1:
                                delay = base_delay * (2 ** attempt)
                                print(f"Alpha Vantage API rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                                await asyncio.sleep(delay)
                                continue
                            else:
                                print(f"Alpha Vantage API: Max retries exceeded due to rate limiting")
                                return []
                        
                        response.raise_for_status()
                        data = response.json()
                        
                        results = []
                        if data.get('bestMatches'):
                            for item in data['bestMatches']:
                                result = SymbolSearchResult(
                                    symbol=item.get('1. symbol', ''),
                                    name=item.get('2. name', ''),
                                    exchange=item.get('4. region', 'Unknown'),
                                    type=item.get('3. type', 'Stock'),
                                    currency=item.get('8. currency', 'USD'),
                                    marketCap=item.get('6. marketCap'),
                                    sector=None  # Not provided by Alpha Vantage search
                                )
                                results.append(result)
                        return results
                        
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        print(f"Alpha Vantage API rate limited, retrying in {delay}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        print(f"Alpha Vantage API error: {e}")
                        return []
                except Exception as e:
                    print(f"Alpha Vantage API error: {e}")
                    return []
            
            return []

        try:
            # Execute all searches in parallel
            search_tasks = [
                search_finance_query(),
                search_polygon(),
                search_finnhub(),
                search_alpha_vantage()
            ]
            
            # Wait for all searches to complete (with timeout)
            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
            
            # Combine results from all providers
            all_results = []
            seen_symbols = set()
            
            for provider_results in search_results:
                if isinstance(provider_results, list):
                    for result in provider_results:
                        # Deduplicate by symbol (case-insensitive)
                        symbol_key = result.symbol.upper()
                        if symbol_key not in seen_symbols and result.symbol:
                            seen_symbols.add(symbol_key)
                            all_results.append(result)
            
            # Sort by relevance (exact matches first, then by symbol length)
            query_upper = request.query.upper()
            all_results.sort(key=lambda x: (
                0 if x.symbol.upper() == query_upper else 1,  # Exact symbol match first
                1 if query_upper in x.symbol.upper() else 2,   # Symbol contains query
                2 if query_upper in x.name.upper() else 3,     # Name contains query
                len(x.symbol)  # Shorter symbols first
            ))
            
            # Limit results
            limited_results = all_results[:request.limit]
            
            return SymbolSearchResponse(
                results=limited_results,
                total=len(limited_results)
            )
            
        except Exception as e:
            print(f"Error in parallel symbol search: {e}")
            return SymbolSearchResponse(
                results=[],
                total=0
            )

    async def get_quotes(
        self, 
        request: QuoteRequest, 
        access_token: str = None
    ) -> QuoteResponse:
        """Get stock quotes from database instead of external API."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            # Convert symbols to uppercase for database query
            symbols_array = [s.upper() for s in request.symbols]
            
            params = {'p_symbols': symbols_array}
            
            response = client.rpc('get_company_info_by_symbols', params).execute()
            
            results = []
            if response.data:
                for item in response.data:
                    # Handle the yield field alias since 'yield' is a Python keyword
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    
                    # Convert database fields to QuoteResult format
                    result = QuoteResult(
                        symbol=item.get('symbol', ''),
                        name=item.get('name') or item.get('company_name') or item.get('symbol', ''),
                        price=float(item.get('price', 0) or 0),
                        change=float(item.get('change', 0) or 0),
                        changePercent=float(item.get('percent_change', 0) or 0),
                        dayHigh=float(item.get('high', 0) or 0),  # Use 'high' for day's high
                        dayLow=float(item.get('low', 0) or 0),    # Use 'low' for day's low
                        volume=int(item.get('volume', 0) or 0),
                        marketCap=item.get('market_cap'),
                        logo=item.get('logo')
                    )
                    results.append(result)
            
            # For symbols not found in database, return default values
            found_symbols = {r.symbol.upper() for r in results}
            for symbol in request.symbols:
                if symbol.upper() not in found_symbols:
                    result = QuoteResult(
                        symbol=symbol,
                        name=symbol,
                        price=0.0,
                        change=0.0,
                        changePercent=0.0,
                        dayHigh=0.0,
                        dayLow=0.0,
                        volume=0
                    )
                    results.append(result)
            
            return QuoteResponse(quotes=results)
        
        return await self._execute_with_retry(operation, access_token)

    # =====================================================
    # WATCHLIST FUNCTIONS
    # =====================================================

    async def get_user_watchlists(self, access_token: str = None) -> List['Watchlist']:
        """Get all watchlists for the authenticated user."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            response = client.rpc('get_user_watchlists').execute()
            
            from models.market_data import Watchlist
            return [Watchlist(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_watchlist_items(self, watchlist_id: int, access_token: str = None) -> List['WatchlistItem']:
        """Get all items in a specific watchlist."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_watchlist_id': watchlist_id}
            response = client.rpc('get_watchlist_items', params).execute()
            
            from models.market_data import WatchlistItem
            return [WatchlistItem(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def create_watchlist(self, name: str, access_token: str = None) -> int:
        """Create a new watchlist for the authenticated user."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_name': name}
            
            try:
                response = client.rpc('upsert_watchlist', params).execute()
                
                if response.data is not None:
                    # The RPC function returns a single integer, not an array
                    if isinstance(response.data, list) and len(response.data) > 0:
                        return response.data[0]
                    elif isinstance(response.data, int):
                        return response.data
                    else:
                        print(f"ERROR: Unexpected response format: {response.data}")
                        raise Exception("Failed to create watchlist - unexpected response format")
                else:
                    print(f"ERROR: upsert_watchlist returned no data: {response}")
                    raise Exception("Failed to create watchlist - no data returned")
            except Exception as e:
                print(f"ERROR in create_watchlist: {e}")
                print(f"Response details: {getattr(e, 'response', 'No response details')}")
                raise Exception(f"Failed to create watchlist: {str(e)}")
        
        return await self._execute_with_retry(operation, access_token)

    async def add_watchlist_item(
        self, 
        watchlist_id: int, 
        symbol: str, 
        company_name: str = None, 
        price: float = None, 
        percent_change: float = None,
        access_token: str = None
    ) -> int:
        """Add an item to a watchlist."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_watchlist_id': watchlist_id,
                'p_symbol': symbol.upper(),
                'p_company_name': company_name,
                'p_price': price,
                'p_percent_change': percent_change
            }
            
            try:
                response = client.rpc('upsert_watchlist_item', params).execute()
                
                # The RPC function returns an integer (item ID) directly
                if response.data is not None:
                    if isinstance(response.data, int):
                        return response.data
                    elif isinstance(response.data, list) and len(response.data) > 0:
                        return response.data[0]
                    else:
                        print(f"ERROR: Unexpected add item response format: {response.data}")
                        raise Exception("Failed to add item to watchlist - unexpected response format")
                else:
                    print(f"ERROR: upsert_watchlist_item returned no data: {response}")
                    raise Exception("Failed to add item to watchlist - no data returned")
            except Exception as e:
                print(f"ERROR in add_watchlist_item: {e}")
                print(f"Response details: {getattr(e, 'response', 'No response details')}")
                raise Exception(f"Failed to add item to watchlist: {str(e)}")
        
        return await self._execute_with_retry(operation, access_token)

    async def delete_watchlist(self, watchlist_id: int, access_token: str = None) -> bool:
        """Delete a watchlist."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_watchlist_id': watchlist_id}
            
            try:
                response = client.rpc('delete_watchlist', params).execute()
                
                # The RPC function returns a boolean directly
                if response.data is not None:
                    if isinstance(response.data, bool):
                        return response.data
                    elif isinstance(response.data, list) and len(response.data) > 0:
                        return response.data[0]
                    else:
                        print(f"ERROR: Unexpected delete response format: {response.data}")
                        return False
                return False
            except Exception as e:
                print(f"ERROR in delete_watchlist: {e}")
                return False
        
        return await self._execute_with_retry(operation, access_token)

    async def delete_watchlist_item(self, item_id: int, access_token: str = None) -> bool:
        """Delete a watchlist item by ID."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_item_id': item_id}
            
            try:
                response = client.rpc('delete_watchlist_item', params).execute()
                
                # The RPC function returns a boolean directly
                if response.data is not None:
                    if isinstance(response.data, bool):
                        return response.data
                    elif isinstance(response.data, list) and len(response.data) > 0:
                        return response.data[0]
                    else:
                        print(f"ERROR: Unexpected delete item response format: {response.data}")
                        return False
                return False
            except Exception as e:
                print(f"ERROR in delete_watchlist_item: {e}")
                return False
        
        return await self._execute_with_retry(operation, access_token)

    async def delete_watchlist_item_by_symbol(
        self, 
        watchlist_id: int, 
        symbol: str, 
        access_token: str = None
    ) -> bool:
        """Delete a watchlist item by symbol."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_watchlist_id': watchlist_id,
                'p_symbol': symbol.upper()
            }
            
            try:
                response = client.rpc('delete_watchlist_item_by_symbol', params).execute()
                
                # The RPC function returns a boolean directly
                if response.data is not None:
                    if isinstance(response.data, bool):
                        return response.data
                    elif isinstance(response.data, list) and len(response.data) > 0:
                        return response.data[0]
                    else:
                        print(f"ERROR: Unexpected delete by symbol response format: {response.data}")
                        return False
                return False
            except Exception as e:
                print(f"ERROR in delete_watchlist_item_by_symbol: {e}")
                return False
        
        return await self._execute_with_retry(operation, access_token)

    async def clear_watchlist(self, watchlist_id: int, access_token: str = None) -> int:
        """Clear all items from a watchlist."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {'p_watchlist_id': watchlist_id}
            
            try:
                response = client.rpc('clear_watchlist', params).execute()
                
                # The RPC function returns an integer directly (count of deleted items)
                if response.data is not None:
                    if isinstance(response.data, int):
                        return response.data
                    elif isinstance(response.data, list) and len(response.data) > 0:
                        return response.data[0]
                    else:
                        print(f"ERROR: Unexpected clear watchlist response format: {response.data}")
                        return 0
                return 0
            except Exception as e:
                print(f"ERROR in clear_watchlist: {e}")
                return 0
        
        return await self._execute_with_retry(operation, access_token)

    async def get_watchlist_with_items(self, watchlist_id: int, access_token: str = None) -> Optional['WatchlistWithItems']:
        """Get a watchlist with all its items."""
        # Get watchlist details
        watchlists = await self.get_user_watchlists(access_token)
        watchlist = next((w for w in watchlists if w.id == watchlist_id), None)
        
        if not watchlist:
            return None
        
        # Get watchlist items
        items = await self.get_watchlist_items(watchlist_id, access_token)
        
        from models.market_data import WatchlistWithItems
        return WatchlistWithItems(
            id=watchlist.id,
            name=watchlist.name,
            created_at=watchlist.created_at,
            updated_at=watchlist.updated_at,
            items=items
        )

    # =====================================================
    # STOCK PEERS FUNCTIONS
    # =====================================================

    async def get_stock_peers(
        self, 
        symbol: str, 
        data_date: date = None, 
        limit: int = 20,
        access_token: str = None
    ) -> List['StockPeer']:
        """Get all peers for a specific stock symbol."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_limit': limit
            }
            response = client.rpc('get_stock_peers', params).execute()
            
            from models.market_data import StockPeer
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_performing_peers(
        self, 
        symbol: str, 
        data_date: date = None, 
        limit: int = 10,
        access_token: str = None
    ) -> List['StockPeer']:
        """Get top performing peers for a specific stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_limit': limit
            }
            response = client.rpc('get_top_performing_peers', params).execute()
            
            from models.market_data import StockPeer
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_worst_performing_peers(
        self, 
        symbol: str, 
        data_date: date = None, 
        limit: int = 10,
        access_token: str = None
    ) -> List['StockPeer']:
        """Get worst performing peers for a specific stock."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_limit': limit
            }
            response = client.rpc('get_worst_performing_peers', params).execute()
            
            from models.market_data import StockPeer
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_peer_comparison(
        self, 
        symbol: str, 
        data_date: date = None,
        access_token: str = None
    ) -> List['PeerComparison']:
        """Get peer comparison with the main stock data."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat()
            }
            
            try:
                response = client.rpc('get_peer_comparison', params).execute()
                
                from models.market_data import PeerComparison
                return [PeerComparison(**item) for item in response.data] if response.data else []
            except Exception as e:
                print(f"ERROR in get_peer_comparison for symbol {symbol}: {e}")
                # Return empty list instead of failing completely
                return []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_peers_paginated(
        self, 
        symbol: str, 
        data_date: date = None,
        offset: int = 0,
        limit: int = 20,
        sort_column: str = "percent_change",
        sort_direction: str = "DESC",
        access_token: str = None
    ) -> List['StockPeer']:
        """Get paginated peer results with sorting options."""
        async def operation(client=None):
            if client is None:
                client = await self.get_authenticated_client(access_token)
            
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_offset': offset,
                'p_limit': limit,
                'p_sort_column': sort_column,
                'p_sort_direction': sort_direction
            }
            response = client.rpc('get_peers_paginated', params).execute()
            
            from models.market_data import StockPeer
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
