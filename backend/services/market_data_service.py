# backend/services/market_data_service.py
"""
Market Data Service - Facade service for all market data operations.
It composes and delegates calls to specialized service classes.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, date
from supabase import Client
from database import get_supabase

# Import the new specialized services
from .market_data.company_service import CompanyService
from .market_data.earnings_service import EarningsService
from .market_data.news_service import NewsService
from .market_data.financials_service import FinancialsService
from .market_data.historical_price_service import HistoricalPriceService
from .market_data.movers_service import MoversService
from .market_data.peers_service import PeersService
from .market_data.quote_service import QuoteService
from .market_data.symbol_service import SymbolService
from .market_data.watchlist_service import WatchlistService
from .market_data.cache_service import CacheService
from .market_data.logo_service import LogoService
from .market_data.price_movement_service import PriceMovementService

# Import all the request/response models that are used in the public methods
from models.market_data import (
    DailyEarningsSummary, CompanyInfo, CompanyBasic, MarketNews, FinanceNews,
    NewsStats, NewsSearch, StockQuote, StockQuoteWithPrices, FundamentalData, PriceMovement, TopMover,
    MarketMover, MarketMoverWithLogo, MarketMoverWithPrices, StockPeerWithPrices, 
    WatchlistItemWithPrices, WatchlistWithItemsAndPrices, CompanyLogo, EarningsCalendarLogo,
    HistoricalDataRequest, HistoricalDataResponse, SingleSymbolDataRequest,
    HistoricalPrice, HistoricalPriceSummary, LatestHistoricalPrice, HistoricalPriceRange,
    EarningsRequest, CompanySearchRequest, CompanySectorRequest, CompanySearchTermRequest,
    MarketNewsRequest, FilteredNewsRequest, SymbolNewsRequest, NewsStatsRequest,
    NewsSearchRequest, StockQuoteRequest, FundamentalRequest, PriceMovementRequest,
    TopMoversRequest, SymbolCheckResponse, SymbolSaveRequest, SymbolSaveResponse,
    HistoricalPriceRequest, HistoricalPriceSummaryRequest, LatestHistoricalPriceRequest,
    HistoricalPriceRangeRequest, CacheData, CachedSymbolData, MajorIndicesResponse, 
    CacheDataRequest, MarketMoversRequest, CompanyLogosRequest, EarningsCalendarLogosRequest,
    SymbolSearchRequest, SymbolSearchResponse,
    QuoteRequest, QuoteResult, QuoteResponse,
    IncomeStatement, BalanceSheet, CashFlow, FinancialStatementRequest,
    KeyStats, KeyStatsRequest, Watchlist, WatchlistItem, WatchlistWithItems, StockPeer, PeerComparison
)


class MarketDataService:
    """
    Facade service for all market data operations.
    It composes and delegates calls to specialized service classes.
    """
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()

        # Instantiate all the specialized services
        self.logos = LogoService(self.supabase)
        self.company = CompanyService(self.supabase)
        self.earnings = EarningsService(self.supabase)
        self.news = NewsService(self.supabase)
        self.financials = FinancialsService(self.supabase)
        self.historical = HistoricalPriceService(self.supabase)
        self.movers = MoversService(self.supabase, logo_service=self.logos)
        self.peers = PeersService(self.supabase)
        self.quotes = QuoteService(self.supabase)
        self.symbols = SymbolService(self.supabase)
        self.watchlist = WatchlistService(self.supabase)
        self.cache = CacheService(self.supabase)
        self.price_movement = PriceMovementService(self.supabase)

    # =====================================================
    # EARNINGS FUNCTIONS
    # =====================================================
    async def get_daily_earnings_summary(self, request: EarningsRequest, access_token: str = None) -> Optional[DailyEarningsSummary]:
        return await self.earnings.get_daily_earnings_summary(request, access_token)

    # =====================================================
    # COMPANY INFO FUNCTIONS
    # =====================================================
    async def get_company_info_by_symbol(self, request: CompanySearchRequest, access_token: str = None) -> Optional[CompanyInfo]:
        return await self.company.get_company_info_by_symbol(request, access_token)

    async def get_companies_by_sector_industry(self, request: CompanySectorRequest, access_token: str = None) -> List[CompanyBasic]:
        return await self.company.get_companies_by_sector_industry(request, access_token)

    async def search_companies(self, request: CompanySearchTermRequest, access_token: str = None) -> List[CompanyBasic]:
        return await self.company.search_companies(request, access_token)

    # =====================================================
    # MARKET NEWS & FINANCE NEWS FUNCTIONS
    # =====================================================
    async def get_latest_market_news(self, request: MarketNewsRequest, access_token: str = None) -> List[MarketNews]:
        return await self.news.get_latest_market_news(request, access_token)

    async def get_filtered_market_news(self, request: FilteredNewsRequest, access_token: str = None) -> List[MarketNews]:
        return await self.news.get_filtered_market_news(request, access_token)

    async def get_symbol_news(self, request: SymbolNewsRequest, access_token: str = None) -> List[FinanceNews]:
        return await self.news.get_symbol_news(request, access_token)

    async def get_latest_symbol_news(self, symbol: str, limit: int = 10, access_token: str = None) -> List[FinanceNews]:
        return await self.news.get_latest_symbol_news(symbol, limit, access_token)

    async def get_symbol_news_stats(self, request: NewsStatsRequest, access_token: str = None) -> Optional[NewsStats]:
        return await self.news.get_symbol_news_stats(request, access_token)

    async def search_symbol_news(self, request: NewsSearchRequest, access_token: str = None) -> List[NewsSearch]:
        return await self.news.search_symbol_news(request, access_token)

    # =====================================================
    # STOCK METRICS & FINANCIALS
    # =====================================================
    async def get_stock_quotes(self, request: StockQuoteRequest, access_token: str = None) -> Optional[StockQuote]:
        return await self.quotes.get_stock_quotes(request, access_token)

    async def get_fundamental_data(self, request: FundamentalRequest, access_token: str = None) -> Optional[FundamentalData]:
        return await self.financials.get_fundamental_data(request, access_token)

    async def get_key_stats(self, request: KeyStatsRequest, access_token: str = None) -> Optional[KeyStats]:
        return await self.financials.get_key_stats(request, access_token)

    async def get_income_statement(self, request: FinancialStatementRequest, access_token: str = None) -> List[IncomeStatement]:
        return await self.financials.get_income_statement(request, access_token)

    async def get_balance_sheet(self, request: FinancialStatementRequest, access_token: str = None) -> List[BalanceSheet]:
        return await self.financials.get_balance_sheet(request, access_token)

    async def get_cash_flow(self, request: FinancialStatementRequest, access_token: str = None) -> List[CashFlow]:
        return await self.financials.get_cash_flow(request, access_token)

    # =====================================================
    # PRICE MOVEMENTS & MOVERS
    # =====================================================
    async def get_significant_price_movements_with_news(self, request: PriceMovementRequest, access_token: str = None) -> List[PriceMovement]:
        return await self.price_movement.get_significant_price_movements_with_news(request, access_token)

    async def get_top_movers_with_news_today(self, request: TopMoversRequest, access_token: str = None) -> List[TopMover]:
        return await self.price_movement.get_top_movers_with_news_today(request, access_token)

    async def get_top_gainers(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMover]:
        return await self.movers.get_top_gainers(request, access_token)

    async def get_top_losers(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMover]:
        return await self.movers.get_top_losers(request, access_token)

    async def get_most_active(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMover]:
        return await self.movers.get_most_active(request, access_token)

    async def get_top_gainers_with_logos(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMoverWithLogo]:
        return await self.movers.get_top_gainers_with_logos(request, access_token)

    async def get_top_losers_with_logos(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMoverWithLogo]:
        return await self.movers.get_top_losers_with_logos(request, access_token)

    async def get_most_active_with_logos(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMoverWithLogo]:
        return await self.movers.get_most_active_with_logos(request, access_token)

    # =====================================================
    # SYMBOL MANAGEMENT & SEARCH
    # =====================================================
    async def check_symbol_exists(self, symbol: str, access_token: str = None) -> SymbolCheckResponse:
        return await self.symbols.check_symbol_exists(symbol, access_token)

    async def save_symbol_to_database(self, symbol: str, access_token: str = None) -> SymbolSaveResponse:
        return await self.symbols.save_symbol_to_database(symbol, access_token)

    async def search_symbols(self, request: SymbolSearchRequest, access_token: str = None) -> SymbolSearchResponse:
        return await self.symbols.search_symbols(request, access_token)
        
    async def get_quotes(self, request: QuoteRequest, access_token: str = None) -> QuoteResponse:
        return await self.quotes.get_quotes(request, access_token)

    # =====================================================
    # LOGOS, HISTORICAL, CACHE
    # =====================================================
    async def get_company_logos_batch(self, request: CompanyLogosRequest, access_token: str = None) -> List[CompanyLogo]:
        return await self.logos.get_company_logos_batch(request, access_token)
        
    async def get_earnings_calendar_logos_batch(self, request: EarningsCalendarLogosRequest, access_token: str = None) -> List[EarningsCalendarLogo]:
        return await self.logos.get_earnings_calendar_logos_batch(request, access_token)

    async def get_historical_prices(self, request: HistoricalPriceRequest, access_token: str = None) -> List[HistoricalPrice]:
        return await self.historical.get_historical_prices(request, access_token)

    async def get_historical_prices_by_symbol(self, request: HistoricalPriceSummaryRequest, access_token: str = None) -> List[HistoricalPriceSummary]:
        return await self.historical.get_historical_prices_by_symbol(request, access_token)

    async def get_latest_historical_prices(self, request: LatestHistoricalPriceRequest, access_token: str = None) -> List[LatestHistoricalPrice]:
        return await self.historical.get_latest_historical_prices(request, access_token)

    async def get_historical_price_range(self, request: HistoricalPriceRangeRequest, access_token: str = None) -> List[HistoricalPriceRange]:
        return await self.historical.get_historical_price_range(request, access_token)

    async def get_cached_symbol_data(self, request: CacheDataRequest, access_token: str = None) -> Optional[CachedSymbolData]:
        return await self.cache.get_cached_symbol_data(request, access_token)

    async def get_major_indices_data(self, limit: int = 100, period_type: str = "1min", data_provider: str = "finance_query", access_token: str = None) -> MajorIndicesResponse:
        return await self.cache.get_major_indices_data(limit, period_type, data_provider, access_token)

    # =====================================================
    # WATCHLIST & PEERS
    # =====================================================
    async def get_user_watchlists(self, access_token: str = None) -> List[Watchlist]:
        return await self.watchlist.get_user_watchlists(access_token)

    async def get_watchlist_items(self, watchlist_id: int, access_token: str = None) -> List[WatchlistItem]:
        return await self.watchlist.get_watchlist_items(watchlist_id, access_token)

    async def create_watchlist(self, name: str, access_token: str = None) -> int:
        return await self.watchlist.create_watchlist(name, access_token)

    async def add_watchlist_item(self, watchlist_id: int, symbol: str, company_name: str = None, price: float = None, percent_change: float = None, access_token: str = None) -> int:
        return await self.watchlist.add_watchlist_item(watchlist_id, symbol, company_name, price, percent_change, access_token)

    async def delete_watchlist(self, watchlist_id: int, access_token: str = None) -> bool:
        return await self.watchlist.delete_watchlist(watchlist_id, access_token)

    async def delete_watchlist_item(self, item_id: int, access_token: str = None) -> bool:
        return await self.watchlist.delete_watchlist_item(item_id, access_token)
        
    async def delete_watchlist_item_by_symbol(self, watchlist_id: int, symbol: str, access_token: str = None) -> bool:
        return await self.watchlist.delete_watchlist_item_by_symbol(watchlist_id, symbol, access_token)

    async def clear_watchlist(self, watchlist_id: int, access_token: str = None) -> int:
        return await self.watchlist.clear_watchlist(watchlist_id, access_token)

    async def get_watchlist_with_items(self, watchlist_id: int, access_token: str = None) -> Optional[WatchlistWithItems]:
        return await self.watchlist.get_watchlist_with_items(watchlist_id, access_token)

    async def get_stock_peers(self, symbol: str, data_date: date = None, limit: int = 20, access_token: str = None) -> List[StockPeer]:
        return await self.peers.get_stock_peers(symbol, data_date, limit, access_token)

    async def get_top_performing_peers(self, symbol: str, data_date: date = None, limit: int = 10, access_token: str = None) -> List[StockPeer]:
        return await self.peers.get_top_performing_peers(symbol, data_date, limit, access_token)

    async def get_worst_performing_peers(self, symbol: str, data_date: date = None, limit: int = 10, access_token: str = None) -> List[StockPeer]:
        return await self.peers.get_worst_performing_peers(symbol, data_date, limit, access_token)

    async def get_peer_comparison(self, symbol: str, data_date: date = None, access_token: str = None) -> List[PeerComparison]:
        return await self.peers.get_peer_comparison(symbol, data_date, access_token)

    async def get_peers_paginated(self, symbol: str, data_date: date = None, offset: int = 0, limit: int = 20, sort_column: str = "percent_change", sort_direction: str = "DESC", access_token: str = None) -> List[StockPeer]:
        return await self.peers.get_peers_paginated(symbol, data_date, offset, limit, sort_column, sort_direction, access_token)

    # =====================================================
    # UTILITY / COMBINED FUNCTIONS
    # =====================================================
    async def get_combined_stock_data(self, symbol: str, quote_date: Optional[date] = None, access_token: str = None) -> Dict[str, Any]:
        quote_data = await self.quotes.get_stock_quotes(StockQuoteRequest(symbol=symbol, quote_date=quote_date), access_token)
        fundamental_data = await self.financials.get_fundamental_data(FundamentalRequest(symbol=symbol), access_token)
        return {
            'quote': quote_data.dict() if quote_data else None,
            'fundamentals': fundamental_data.dict() if fundamental_data else None
        }

    async def get_symbol_overview(self, symbol: str, access_token: str = None) -> Dict[str, Any]:
        company_info = await self.company.get_company_info_by_symbol(CompanySearchRequest(symbol=symbol), access_token)
        stock_data = await self.get_combined_stock_data(symbol, access_token=access_token)
        latest_news = await self.news.get_latest_symbol_news(symbol, limit=5, access_token=access_token)
        news_stats = await self.news.get_symbol_news_stats(NewsStatsRequest(symbol=symbol, days_back=30), access_token)
        movements = await self.price_movement.get_significant_price_movements_with_news(PriceMovementRequest(symbol=symbol, days_back=7, limit=10), access_token)
        
        return {
            'company_info': company_info.dict() if company_info else None,
            'stock_data': stock_data,
            'latest_news': [news.dict() for news in latest_news],
            'news_stats': news_stats.dict() if news_stats else None,
            'recent_movements': [movement.dict() for movement in movements]
        }

    async def get_market_movers_overview(self, request: MarketMoversRequest, access_token: str = None) -> Dict[str, Any]:
        gainers = await self.movers.get_top_gainers_with_logos(request, access_token)
        losers = await self.movers.get_top_losers_with_logos(request, access_token)
        most_active = await self.movers.get_most_active_with_logos(request, access_token)
        
        return {
            'gainers': [mover.dict() for mover in gainers],
            'losers': [mover.dict() for mover in losers],
            'most_active': [mover.dict() for mover in most_active],
            'summary': {
                'total_gainers': len(gainers),
                'total_losers': len(losers),
                'total_most_active': len(most_active),
                'data_date': request.data_date or date.today()
            }
        }

    # =====================================================
    # MARKET MOVERS WITH REAL-TIME PRICES
    # =====================================================
    
    async def get_top_gainers_with_prices(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMoverWithPrices]:
        return await self.movers.get_top_gainers_with_prices(request, access_token)

    async def get_top_losers_with_prices(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMoverWithPrices]:
        return await self.movers.get_top_losers_with_prices(request, access_token)

    async def get_most_active_with_prices(self, request: MarketMoversRequest, access_token: str = None) -> List[MarketMoverWithPrices]:
        return await self.movers.get_most_active_with_prices(request, access_token)

    async def get_market_movers_overview_with_prices(self, request: MarketMoversRequest, access_token: str = None) -> Dict[str, Any]:
        return await self.movers.get_market_movers_overview_with_prices(request, access_token)

    # =====================================================
    # STOCK QUOTES WITH REAL-TIME PRICES
    # =====================================================
    
    async def get_stock_quotes_with_prices(self, symbol: str, access_token: str = None) -> Optional[StockQuoteWithPrices]:
        return await self.quotes.get_stock_quotes_with_prices(symbol, access_token)

    # =====================================================
    # STOCK PEERS WITH REAL-TIME PRICES
    # =====================================================
    
    async def get_stock_peers_with_prices(self, symbol: str, data_date: date = None, limit: int = 20, access_token: str = None) -> List[StockPeerWithPrices]:
        return await self.peers.get_stock_peers_with_prices(symbol, data_date, limit, access_token)

    async def get_top_performing_peers_with_prices(self, symbol: str, data_date: date = None, limit: int = 10, access_token: str = None) -> List[StockPeerWithPrices]:
        return await self.peers.get_top_performing_peers_with_prices(symbol, data_date, limit, access_token)

    # =====================================================
    # WATCHLISTS WITH REAL-TIME PRICES
    # =====================================================
    
    async def get_watchlist_items_with_prices(self, watchlist_id: int, access_token: str = None) -> List[WatchlistItemWithPrices]:
        return await self.watchlist.get_watchlist_items_with_prices(watchlist_id, access_token)

    async def get_watchlist_with_items_and_prices(self, watchlist_id: int, access_token: str = None) -> Optional[WatchlistWithItemsAndPrices]:
        return await self.watchlist.get_watchlist_with_items_and_prices(watchlist_id, access_token)

    async def get_user_watchlists_with_prices(self, access_token: str = None) -> List[WatchlistWithItemsAndPrices]:
        return await self.watchlist.get_user_watchlists_with_prices(access_token)

    # =====================================================
    # ENHANCED CACHE METHODS
    # =====================================================
    
    async def fetch_historical_data_for_symbols(self, symbols: List[str], range_param: str = "1d", interval: str = "5m", access_token: str = None) -> Dict[str, Any]:
        return await self.cache.fetch_historical_data_for_symbols(symbols, range_param, interval, access_token)

    async def fetch_single_symbol_data(self, symbol: str, range_param: str = "1d", interval: str = "5m", access_token: str = None) -> Optional[Dict[str, Any]]:
        return await self.cache.fetch_single_symbol_data(symbol, range_param, interval, access_token)

    async def get_symbol_historical_summary(self, symbol: str, period_type: str = "5m", access_token: str = None) -> Optional[Dict[str, Any]]:
        return await self.cache.get_symbol_historical_summary(symbol, period_type, access_token)

    async def get_symbol_historical_overview(self, symbol: str, access_token: str = None) -> Dict[str, Any]:
        summary_request = HistoricalPriceSummaryRequest(symbol=symbol)
        available_data = await self.historical.get_historical_prices_by_symbol(summary_request, access_token)
        
        latest_request = LatestHistoricalPriceRequest(symbol=symbol, limit=10)
        latest_prices = await self.historical.get_latest_historical_prices(latest_request, access_token)
        
        sample_data = {}
        for combo in available_data[:5]:
            try:
                sample_request = HistoricalPriceRequest(
                    symbol=symbol,
                    time_range=combo.time_range,
                    time_interval=combo.time_interval,
                    limit=10
                )
                sample_prices = await self.historical.get_historical_prices(sample_request, access_token)
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