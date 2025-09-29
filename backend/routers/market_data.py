from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal

from services.market_data_service import MarketDataService
from models.market_data import (
    DailyEarningsSummary,
    CompanyInfo,
    CompanyBasic,
    MarketNews,
    FinanceNews,
    NewsStats,
    NewsSearch,
    FundamentalData,
    PriceMovement,
    TopMover,
    MarketMoverWithPrices,
    StockQuoteWithPrices,
    StockPeerWithPrices,
    WatchlistItemWithPrices,
    WatchlistWithItemsAndPrices,
    HistoricalDataRequest,
    HistoricalDataResponse,
    SingleSymbolDataRequest,
    CompanyLogo,
    EarningsCalendarLogo,
    HistoricalPrice,
    HistoricalPriceSummary,
    LatestHistoricalPrice,
    HistoricalPriceRange,
    EarningsRequest,
    CompanySearchRequest,
    CompanySectorRequest,
    CompanySearchTermRequest,
    MarketNewsRequest,
    FilteredNewsRequest,
    SymbolNewsRequest,
    NewsStatsRequest,
    NewsSearchRequest,
    StockQuoteRequest,
    FundamentalRequest,
    PriceMovementRequest,
    TopMoversRequest,
    SymbolCheckResponse,
    SymbolSaveRequest,
    SymbolSaveResponse,
    HistoricalPriceRequest,
    HistoricalPriceSummaryRequest,
    LatestHistoricalPriceRequest,
    HistoricalPriceRangeRequest,
    CacheData,
    CachedSymbolData,
    MajorIndicesResponse,
    CacheDataRequest,
    MarketMoversRequest,
    CompanyLogosRequest,
    EarningsCalendarLogosRequest,
    SymbolSearchRequest,
    SymbolSearchResponse,
    QuoteRequest,
    QuoteResponse,
    CreateWatchlistRequest,
    AddWatchlistItemRequest,
    DeleteWatchlistItemRequest,
    WatchlistResponse,
    DeleteResponse,
    PeersPaginatedRequest,
    # Financial Statements
    IncomeStatement,
    BalanceSheet,
    CashFlow,
    FinancialStatementRequest,
    KeyStats,
    KeyStatsRequest,
)

router = APIRouter(prefix="/market-data", tags=["Market Data"])
security = HTTPBearer()


def get_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract token from Authorization header."""
    return credentials.credentials


# =====================================================
# EARNINGS ENDPOINTS
# =====================================================


@router.get("/earnings/daily-summary", response_model=Optional[DailyEarningsSummary])
async def get_daily_earnings_summary(
    target_date: Optional[date] = Query(
        None, description="Target date for earnings summary"
    ),
    token: str = Depends(get_token),
):
    """Get comprehensive daily earnings summary with news and statistics."""
    try:
        service = MarketDataService()
        request = EarningsRequest(target_date=target_date)
        result = await service.get_daily_earnings_summary(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get earnings summary: {str(e)}"
        )


# =====================================================
# COMPANY INFO ENDPOINTS
# =====================================================


def validate_symbol(symbol: str) -> str:
    """Validate and normalize stock symbol."""
    if not symbol or len(symbol.strip()) == 0:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty")

    symbol = symbol.upper().strip()

    # Check if symbol is just a number (like "0", "123")
    if symbol.isdigit():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid symbol '{symbol}'. Please use a valid stock symbol like AAPL, TSLA, or MSFT",
        )

    # Basic symbol format validation
    import re

    if not re.match(r"^[A-Z0-9.-]{1,10}$", symbol):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid symbol format '{symbol}'. Symbol should contain only letters, numbers, dots, and dashes",
        )

    return symbol


@router.get("/company/{symbol}", response_model=Optional[CompanyInfo])
async def get_company_info(
    symbol: str,
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token),
):
    """Get detailed company information by symbol."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = CompanySearchRequest(
            symbol=validated_symbol, data_provider=data_provider
        )
        result = await service.get_company_info_by_symbol(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get company info: {str(e)}"
        )


@router.get("/companies/by-sector", response_model=List[CompanyBasic])
async def get_companies_by_sector_industry(
    sector: Optional[str] = Query(None, description="Sector filter"),
    industry: Optional[str] = Query(None, description="Industry filter"),
    limit: int = Query(50, description="Maximum number of results"),
    offset: int = Query(0, description="Offset for pagination"),
    token: str = Depends(get_token),
):
    """Get companies filtered by sector and/or industry."""
    try:
        service = MarketDataService()
        request = CompanySectorRequest(
            sector=sector, industry=industry, limit=limit, offset=offset
        )
        result = await service.get_companies_by_sector_industry(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get companies: {str(e)}"
        )


@router.get("/companies/search", response_model=List[CompanyBasic])
async def search_companies(
    search_term: str = Query(..., description="Search term for company name or symbol"),
    limit: int = Query(20, description="Maximum number of results"),
    token: str = Depends(get_token),
):
    """Search companies by name or symbol."""
    try:
        service = MarketDataService()
        request = CompanySearchTermRequest(search_term=search_term, limit=limit)
        result = await service.search_companies(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to search companies: {str(e)}"
        )


# =====================================================
# MARKET NEWS ENDPOINTS
# =====================================================


@router.get("/news/latest", response_model=List[MarketNews])
async def get_latest_market_news(
    article_limit: int = Query(7, description="Number of articles to retrieve"),
    token: str = Depends(get_token),
):
    """Get latest market news articles."""
    try:
        service = MarketDataService()
        request = MarketNewsRequest(article_limit=article_limit)
        result = await service.get_latest_market_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get market news: {str(e)}"
        )


@router.get("/news/filtered", response_model=List[MarketNews])
async def get_filtered_market_news(
    article_limit: int = Query(7, description="Number of articles to retrieve"),
    source_filter: Optional[str] = Query(None, description="Source filter"),
    category_filter: Optional[str] = Query(None, description="Category filter"),
    min_relevance_score: Optional[Decimal] = Query(
        None, description="Minimum relevance score"
    ),
    days_back: Optional[int] = Query(None, description="Number of days to look back"),
    token: str = Depends(get_token),
):
    """Get filtered market news with advanced filtering options."""
    try:
        service = MarketDataService()
        request = FilteredNewsRequest(
            article_limit=article_limit,
            source_filter=source_filter,
            category_filter=category_filter,
            min_relevance_score=min_relevance_score,
            days_back=days_back,
        )
        result = await service.get_filtered_market_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get filtered news: {str(e)}"
        )


# =====================================================
# FINANCE NEWS ENDPOINTS
# =====================================================


@router.get("/news/symbol/{symbol}", response_model=List[FinanceNews])
async def get_symbol_news(
    symbol: str,
    limit: int = Query(20, description="Number of articles to retrieve"),
    offset: int = Query(0, description="Offset for pagination"),
    days_back: int = Query(7, description="Number of days to look back"),
    min_relevance: Decimal = Query(0.0, description="Minimum relevance score"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token),
):
    """Get comprehensive news for a specific symbol."""
    try:
        service = MarketDataService()
        request = SymbolNewsRequest(
            symbol=symbol,
            limit=limit,
            offset=offset,
            days_back=days_back,
            min_relevance=min_relevance,
            data_provider=data_provider,
        )
        result = await service.get_symbol_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get symbol news: {str(e)}"
        )


@router.get("/news/symbol/{symbol}/latest", response_model=List[FinanceNews])
async def get_latest_symbol_news(
    symbol: str,
    limit: int = Query(10, description="Number of articles to retrieve"),
    token: str = Depends(get_token),
):
    """Get latest news for a specific symbol (simplified)."""
    try:
        service = MarketDataService()
        result = await service.get_latest_symbol_news(symbol, limit, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get latest symbol news: {str(e)}"
        )


@router.get("/news/symbol/{symbol}/stats", response_model=Optional[NewsStats])
async def get_symbol_news_stats(
    symbol: str,
    days_back: int = Query(30, description="Number of days to analyze"),
    token: str = Depends(get_token),
):
    """Get news statistics for a specific symbol."""
    try:
        service = MarketDataService()
        request = NewsStatsRequest(symbol=symbol, days_back=days_back)
        result = await service.get_symbol_news_stats(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get news stats: {str(e)}"
        )


@router.get("/news/symbol/{symbol}/search", response_model=List[NewsSearch])
async def search_symbol_news(
    symbol: str,
    search_term: str = Query(..., description="Search term for news content"),
    limit: int = Query(10, description="Number of articles to retrieve"),
    token: str = Depends(get_token),
):
    """Search news by keyword for a specific symbol."""
    try:
        service = MarketDataService()
        request = NewsSearchRequest(symbol=symbol, search_term=search_term, limit=limit)
        result = await service.search_symbol_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to search symbol news: {str(e)}"
        )


# =====================================================
# STOCK METRICS ENDPOINTS
# =====================================================


@router.get("/stock/{symbol}/combined", response_model=Dict[str, Any])
async def get_combined_stock_data(
    symbol: str,
    quote_date: Optional[date] = Query(
        None, description="Quote date (defaults to today)"
    ),
    token: str = Depends(get_token),
):
    """Get combined stock quotes and fundamental data."""
    try:
        service = MarketDataService()
        result = await service.get_combined_stock_data(symbol, quote_date, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get combined stock data: {str(e)}"
        )


# =====================================================
# PRICE MOVEMENTS ENDPOINTS
# =====================================================


@router.get("/movements/significant", response_model=List[PriceMovement])
async def get_significant_price_movements_with_news(
    symbol: Optional[str] = Query(None, description="Symbol filter (optional)"),
    days_back: int = Query(30, description="Number of days to look back"),
    min_change_percent: Decimal = Query(
        3.0, description="Minimum price change percentage"
    ),
    limit: int = Query(50, description="Maximum number of results"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token),
):
    """Get significant price movements with related news."""
    try:
        service = MarketDataService()
        request = PriceMovementRequest(
            symbol=symbol,
            days_back=days_back,
            min_change_percent=min_change_percent,
            limit=limit,
            data_provider=data_provider,
        )
        result = await service.get_significant_price_movements_with_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get price movements: {str(e)}"
        )


@router.get("/movements/top-movers-today", response_model=List[TopMover])
async def get_top_movers_with_news_today(
    limit: int = Query(20, description="Maximum number of results"),
    min_change_percent: Decimal = Query(
        3.0, description="Minimum price change percentage"
    ),
    token: str = Depends(get_token),
):
    """Get today's top movers with related news."""
    try:
        service = MarketDataService()
        request = TopMoversRequest(limit=limit, min_change_percent=min_change_percent)
        result = await service.get_top_movers_with_news_today(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get top movers: {str(e)}"
        )


# =====================================================
# COMPREHENSIVE OVERVIEW ENDPOINT
# =====================================================


@router.get("/overview/{symbol}", response_model=Dict[str, Any])
async def get_symbol_overview(symbol: str, token: str = Depends(get_token)):
    """Get comprehensive overview for a symbol including company info, quotes, news, and movements."""
    try:
        service = MarketDataService()
        result = await service.get_symbol_overview(symbol, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get symbol overview: {str(e)}"
        )


# =====================================================
# SYMBOL MANAGEMENT ENDPOINTS
# =====================================================


@router.get("/symbols/check/{symbol}", response_model=SymbolCheckResponse)
async def check_symbol_exists(symbol: str, token: str = Depends(get_token)):
    """Check if a symbol exists in the stock_quotes table."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        result = await service.check_symbol_exists(validated_symbol, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check symbol: {str(e)}")


@router.post("/symbols/save", response_model=SymbolSaveResponse)
async def save_symbol_to_database(
    request: SymbolSaveRequest, token: str = Depends(get_token)
):
    """Save a symbol to the stock_quotes table with initial market data."""
    try:
        validated_symbol = validate_symbol(request.symbol)
        service = MarketDataService()
        result = await service.save_symbol_to_database(validated_symbol, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save symbol: {str(e)}")


# =====================================================
# HEALTH CHECK ENDPOINT
# =====================================================


@router.get("/health")
async def health_check():
    """Health check endpoint for market data service."""
    return {
        "status": "healthy",
        "service": "market_data",
        "timestamp": datetime.now().isoformat(),
        "available_endpoints": [
            "earnings/daily-summary",
            "company/{symbol}",
            "companies/by-sector",
            "companies/search",
            "news/latest",
            "news/filtered",
            "news/symbol/{symbol}",
            "news/symbol/{symbol}/latest",
            "news/symbol/{symbol}/stats",
            "news/symbol/{symbol}/search",
            "fundamentals/{symbol}",
            "stock/{symbol}/combined",
            "movements/significant",
            "movements/top-movers-today",
            "overview/{symbol}",
            "symbols/check/{symbol}",
            "symbols/save",
            "cache/symbol/{symbol}",
            "cache/major-indices",
            "cache/historical-data",
            "cache/single-symbol",
            "cache/{symbol}/historical-summary",
            "movers/gainers-with-prices",
            "movers/losers-with-prices", 
            "movers/most-active-with-prices",
            "movers/overview-with-prices",
            "quotes/{symbol}/with-prices",
            "peers/{symbol}/with-prices",
            "peers/{symbol}/top-performing/with-prices",
            "watchlists/{watchlist_id}/items/with-prices",
            "watchlists/{watchlist_id}/with-prices",
            "watchlists/with-prices",
            "logos/batch",
            "logos/earnings-calendar-batch",
        ],
    }


# =====================================================
# MARKET MOVERS WITH REAL-TIME PRICES ENDPOINTS - newly created endpoints
# =====================================================


@router.get("/movers/gainers-with-prices", response_model=List[MarketMoverWithPrices])
async def get_top_gainers_with_prices(
    data_date: Optional[date] = Query(
        None, description="Date for market movers (defaults to today)"
    ),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token),
):
    """Get top gainers with real-time prices from finance-query API."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_top_gainers_with_prices(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get top gainers with prices: {str(e)}"
        )


@router.get("/movers/losers-with-prices", response_model=List[MarketMoverWithPrices])
async def get_top_losers_with_prices(
    data_date: Optional[date] = Query(
        None, description="Date for market movers (defaults to today)"
    ),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token),
):
    """Get top losers with real-time prices from finance-query API."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_top_losers_with_prices(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get top losers with prices: {str(e)}"
        )


@router.get("/movers/most-active-with-prices", response_model=List[MarketMoverWithPrices])
async def get_most_active_with_prices(
    data_date: Optional[date] = Query(
        None, description="Date for market movers (defaults to today)"
    ),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token),
):
    """Get most active stocks with real-time prices from finance-query API."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_most_active_with_prices(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get most active with prices: {str(e)}"
        )


@router.get("/movers/overview-with-prices", response_model=Dict[str, Any])
async def get_market_movers_overview_with_prices(
    data_date: Optional[date] = Query(
        None, description="Date for market movers (defaults to today)"
    ),
    limit: int = Query(10, description="Maximum number of results per category"),
    token: str = Depends(get_token),
):
    """Get comprehensive market movers overview with real-time prices."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_market_movers_overview_with_prices(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get market movers overview with prices: {str(e)}"
        )


# =====================================================
# STOCK QUOTES WITH REAL-TIME PRICES ENDPOINTS
# =====================================================


@router.get("/quotes/{symbol}/with-prices", response_model=Optional[StockQuoteWithPrices])
async def get_stock_quotes_with_prices(
    symbol: str,
    token: str = Depends(get_token),
):
    """
    Get stock quote with real-time prices.
    Flow: Check database → If not exists, fetch from API & store → Return with prices
    """
    try:
        service = MarketDataService()
        result = await service.get_stock_quotes_with_prices(symbol, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get stock quote with prices: {str(e)}"
        )


# =====================================================
# STOCK PEERS WITH REAL-TIME PRICES ENDPOINTS
# =====================================================


@router.get("/peers/{symbol}/with-prices", response_model=List[StockPeerWithPrices])
async def get_stock_peers_with_prices(
    symbol: str,
    data_date: Optional[date] = Query(None, description="Data date (defaults to today)"),
    limit: int = Query(20, description="Maximum number of results"),
    token: str = Depends(get_token),
):
    """Get stock peers with real-time prices from finance-query API."""
    try:
        service = MarketDataService()
        result = await service.get_stock_peers_with_prices(symbol, data_date, limit, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get stock peers with prices: {str(e)}"
        )


@router.get("/peers/{symbol}/top-performing/with-prices", response_model=List[StockPeerWithPrices])
async def get_top_performing_peers_with_prices(
    symbol: str,
    data_date: Optional[date] = Query(None, description="Data date (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token),
):
    """Get top performing peers with real-time prices from finance-query API."""
    try:
        service = MarketDataService()
        result = await service.get_top_performing_peers_with_prices(symbol, data_date, limit, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get top performing peers with prices: {str(e)}"
        )


# =====================================================
# WATCHLISTS WITH REAL-TIME PRICES ENDPOINTS
# =====================================================


@router.get("/watchlists/{watchlist_id}/items/with-prices", response_model=List[WatchlistItemWithPrices])
async def get_watchlist_items_with_prices(
    watchlist_id: int,
    token: str = Depends(get_token),
):
    """Get watchlist items with real-time prices from finance-query API."""
    try:
        service = MarketDataService()
        result = await service.get_watchlist_items_with_prices(watchlist_id, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get watchlist items with prices: {str(e)}"
        )


@router.get("/watchlists/{watchlist_id}/with-prices", response_model=Optional[WatchlistWithItemsAndPrices])
async def get_watchlist_with_items_and_prices(
    watchlist_id: int,
    token: str = Depends(get_token),
):
    """Get watchlist with items enriched with real-time prices."""
    try:
        service = MarketDataService()
        result = await service.get_watchlist_with_items_and_prices(watchlist_id, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get watchlist with items and prices: {str(e)}"
        )


@router.get("/watchlists/with-prices", response_model=List[WatchlistWithItemsAndPrices])
async def get_user_watchlists_with_prices(
    token: str = Depends(get_token),
):
    """Get all user watchlists with items enriched with real-time prices."""
    try:
        service = MarketDataService()
        result = await service.get_user_watchlists_with_prices(token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get user watchlists with prices: {str(e)}"
        )


# =====================================================  
# COMPANY LOGOS ENDPOINTS
# =====================================================


@router.post("/logos/batch", response_model=List[CompanyLogo])
async def get_company_logos_batch(
    request: CompanyLogosRequest, token: str = Depends(get_token)
):
    """Get company logos for multiple symbols at once."""
    try:
        service = MarketDataService()
        result = await service.get_company_logos_batch(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get company logos: {str(e)}"
        )


# =====================================================
# CACHING ENDPOINTS
# =====================================================


@router.get("/cache/symbol/{symbol}", response_model=Optional[CachedSymbolData])
async def get_cached_symbol_data(
    symbol: str,
    limit: int = Query(100, description="Maximum number of data points to return"),
    period_type: str = Query(
        "1min", description="Time period type (1min, 5min, 1hour, 1day, etc.)"
    ),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token),
):
    """Get cached market data for a specific symbol."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = CacheDataRequest(
            symbol=validated_symbol,
            limit=limit,
            period_type=period_type,
            data_provider=data_provider,
        )
        result = await service.get_cached_symbol_data(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get cached symbol data: {str(e)}"
        )


@router.get("/cache/major-indices", response_model=MajorIndicesResponse)
async def get_major_indices_data(
    limit: int = Query(100, description="Maximum number of data points per symbol"),
    period_type: str = Query(
        "5m", description="Time period type (1m, 5m, 15m, 30m, 1h, 1d, etc.)"
    ),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token),
):
    """Get cached data for major indices (SPY, QQQ, DIA, VIX)."""
    try:
        service = MarketDataService()
        result = await service.get_major_indices_data(
            limit, period_type, data_provider, token
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get major indices data: {str(e)}"
        )


# =====================================================
# ENHANCED CACHE ENDPOINTS - REDESIGNED
# =====================================================


@router.post("/cache/historical-data", response_model=HistoricalDataResponse)
async def fetch_historical_data_for_symbols(
    request: HistoricalDataRequest,
    token: str = Depends(get_token),
):
    """Fetch historical data for multiple symbols from finance-query API."""
    try:
        service = MarketDataService()
        result = await service.fetch_historical_data_for_symbols(
            symbols=request.symbols,
            range_param=request.range_param,
            interval=request.interval,
            access_token=token
        )
        return HistoricalDataResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch historical data: {str(e)}"
        )


@router.post("/cache/single-symbol", response_model=Optional[Dict[str, Any]])
async def fetch_single_symbol_data(
    request: SingleSymbolDataRequest,
    token: str = Depends(get_token),
):
    """Fetch historical data for a single symbol from finance-query API."""
    try:
        service = MarketDataService()
        result = await service.fetch_single_symbol_data(
            symbol=request.symbol,
            range_param=request.range_param,
            interval=request.interval,
            access_token=token
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch single symbol data: {str(e)}"
        )


@router.get("/cache/{symbol}/historical-summary", response_model=Optional[Dict[str, Any]])
async def get_symbol_historical_summary(
    symbol: str,
    period_type: str = Query("5m", description="Time period type"),
    token: str = Depends(get_token),
):
    """Get historical data summary for a symbol from finance-query API."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        result = await service.get_symbol_historical_summary(
            symbol=validated_symbol,
            period_type=period_type,
            access_token=token
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get historical summary: {str(e)}"
        )


@router.post(
    "/logos/earnings-calendar-batch", response_model=List[EarningsCalendarLogo]
)
async def get_earnings_calendar_logos_batch(
    request: EarningsCalendarLogosRequest, token: str = Depends(get_token)
):
    """Get company logos for multiple symbols from earnings_calendar table only."""
    try:
        service = MarketDataService()
        result = await service.get_earnings_calendar_logos_batch(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get earnings calendar logos: {str(e)}"
        )


# =====================================================
# HISTORICAL PRICES ENDPOINTS
# =====================================================


@router.get("/historical/{symbol}", response_model=List[HistoricalPrice])
async def get_historical_prices(
    symbol: str,
    time_range: str = Query(
        ...,
        description="Time range (1d, 5d, 1mo, 3mo, 6mo, ytd, 1y, 2y, 5y, 10y, max) - calculated dynamically",
    ),
    time_interval: str = Query(
        ...,
        description="Time interval (5m, 15m, 30m, 1h, 1d, 1wk, 1mo) - stored intervals only",
    ),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    limit: Optional[int] = Query(
        1000, ge=1, le=10000, description="Maximum number of records to return"
    ),
    token: str = Depends(get_token),
):
    """Get historical price data with NEW ARCHITECTURE: range calculated dynamically from intervals.
    No duplicate storage - massive space savings."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = HistoricalPriceRequest(
        symbol=validated_symbol,
        time_range=time_range,
        time_interval=time_interval,
        data_provider=data_provider,
        limit=limit,
    )
    result = await service.get_historical_prices(request, token)
    return result


@router.get("/historical/{symbol}/summary", response_model=List[HistoricalPriceSummary])
async def get_historical_prices_summary(symbol: str, token: str = Depends(get_token)):
    """Get all available intervals for a specific symbol (no ranges stored - calculated dynamically)."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = HistoricalPriceSummaryRequest(symbol=validated_symbol)
    result = await service.get_historical_prices_by_symbol(request, token)
    return result


@router.get("/historical/{symbol}/latest", response_model=List[LatestHistoricalPrice])
async def get_latest_historical_prices(
    symbol: str,
    limit: Optional[int] = Query(
        10, ge=1, le=100, description="Maximum number of records to return"
    ),
    token: str = Depends(get_token),
):
    """Get the most recent historical price data for a symbol across all ranges/intervals."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = LatestHistoricalPriceRequest(symbol=validated_symbol, limit=limit)
    result = await service.get_latest_historical_prices(request, token)
    return result


@router.get("/historical/{symbol}/range", response_model=List[HistoricalPriceRange])
async def get_historical_price_range(
    symbol: str,
    time_interval: str = Query(
        ...,
        description="Time interval (5m, 15m, 30m, 1h, 1d, 1wk, 1mo) - stored intervals only",
    ),
    start_date: datetime = Query(..., description="Start date for the range query"),
    end_date: datetime = Query(..., description="End date for the range query"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token),
):
    """Get historical prices within a specific date range - NO time_range parameter needed."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = HistoricalPriceRangeRequest(
        symbol=validated_symbol,
        time_interval=time_interval,
        start_date=start_date,
        end_date=end_date,
        data_provider=data_provider,
    )
    result = await service.get_historical_price_range(request, token)
    return result


@router.get("/historical/{symbol}/overview", response_model=Dict[str, Any])
async def get_symbol_historical_overview(symbol: str, token: str = Depends(get_token)):
    """Get comprehensive historical price overview for a symbol."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    result = await service.get_symbol_historical_overview(validated_symbol, token)
    return result


# =====================================================
# SYMBOL SEARCH ENDPOINTS
# =====================================================


@router.get("/search", response_model=SymbolSearchResponse)
async def search_symbols(
    query: str = Query(..., description="Search query for symbols"),
    yahoo: Optional[bool] = Query(True, description="Use Yahoo Finance data"),
    limit: Optional[int] = Query(
        10, ge=1, le=50, description="Maximum number of results"
    ),
    token: str = Depends(get_token),
):
    """Search for stock symbols, ETFs, and other securities."""
    try:
        service = MarketDataService()
        request = SymbolSearchRequest(query=query, yahoo=yahoo, limit=limit)
        result = await service.search_symbols(request, token)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to search symbols: {str(e)}"
        )


@router.get("/quotes", response_model=QuoteResponse)
async def get_quotes(
    symbols: str = Query(..., description="Comma-separated list of symbols"),
    token: str = Depends(get_token),
):
    """Get stock quotes for multiple symbols."""
    try:
        service = MarketDataService()
        symbols_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        request = QuoteRequest(symbols=symbols_list)
        result = await service.get_quotes(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch quotes: {str(e)}")


# =====================================================
# WATCHLIST ENDPOINTS
# =====================================================


@router.post("/watchlists", response_model=WatchlistResponse)
async def create_watchlist(
    request: CreateWatchlistRequest, token: str = Depends(get_token)
):
    """Create a new watchlist for the authenticated user."""
    try:
        service = MarketDataService()
        watchlist_id = await service.create_watchlist(request.name, token)
        return WatchlistResponse(
            success=True,
            message="Watchlist created successfully",
            watchlist_id=watchlist_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create watchlist: {str(e)}"
        )


@router.post("/watchlists/items", response_model=WatchlistResponse)
async def add_watchlist_item(
    request: AddWatchlistItemRequest, token: str = Depends(get_token)
):
    """Add an item to a watchlist (REDESIGNED: no price data, use stock_quotes for real-time prices)."""
    try:
        service = MarketDataService()
        # REDESIGNED: No longer passing price/percent_change - removed from table schema
        item_id = await service.add_watchlist_item(
            watchlist_id=request.watchlist_id,
            symbol=request.symbol,
            company_name=request.company_name,
            price=None,  # Kept for backward compatibility but ignored by SQL function
            percent_change=None,  # Kept for backward compatibility but ignored by SQL function
            access_token=token,
        )
        return WatchlistResponse(
            success=True,
            message=f"Symbol {request.symbol} successfully added to watchlist. Real-time prices available via API.",
            watchlist_id=item_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to add item to watchlist: {str(e)}"
        )


@router.delete("/watchlists/{watchlist_id}", response_model=DeleteResponse)
async def delete_watchlist(watchlist_id: int, token: str = Depends(get_token)):
    """Delete a watchlist."""
    try:
        service = MarketDataService()
        success = await service.delete_watchlist(watchlist_id, token)
        if not success:
            raise HTTPException(
                status_code=404, detail="Watchlist not found or access denied"
            )
        return DeleteResponse(success=True, message="Watchlist deleted successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete watchlist: {str(e)}"
        )


@router.delete("/watchlists/items/{item_id}", response_model=DeleteResponse)
async def delete_watchlist_item(item_id: int, token: str = Depends(get_token)):
    """Delete a watchlist item by ID."""
    try:
        service = MarketDataService()
        success = await service.delete_watchlist_item(item_id, token)
        if not success:
            raise HTTPException(
                status_code=404, detail="Watchlist item not found or access denied"
            )
        return DeleteResponse(
            success=True, message="Watchlist item deleted successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete watchlist item: {str(e)}"
        )


@router.delete(
    "/watchlists/{watchlist_id}/items/{symbol}", response_model=DeleteResponse
)
async def delete_watchlist_item_by_symbol(
    watchlist_id: int, symbol: str, token: str = Depends(get_token)
):
    """Delete a watchlist item by symbol."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        success = await service.delete_watchlist_item_by_symbol(
            watchlist_id, validated_symbol, token
        )
        if not success:
            raise HTTPException(
                status_code=404, detail="Watchlist item not found or access denied"
            )
        return DeleteResponse(
            success=True,
            message=f"Symbol {validated_symbol} removed from watchlist successfully",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to delete watchlist item: {str(e)}"
        )


@router.delete("/watchlists/{watchlist_id}/clear", response_model=DeleteResponse)
async def clear_watchlist(watchlist_id: int, token: str = Depends(get_token)):
    """Clear all items from a watchlist."""
    try:
        service = MarketDataService()
        deleted_count = await service.clear_watchlist(watchlist_id, token)
        return DeleteResponse(
            success=True,
            message=f"Watchlist cleared successfully. {deleted_count} items removed.",
            deleted_count=deleted_count,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to clear watchlist: {str(e)}"
        )


# =====================================================
# FINANCIAL STATEMENTS ENDPOINTS
# =====================================================


@router.get(
    "/financials/income-statement/{symbol}", response_model=List[IncomeStatement]
)
async def get_income_statement(
    symbol: str,
    frequency: str = Query(
        ..., description="Frequency of the report (annual or quarterly)"
    ),
    limit: int = Query(10, description="Number of periods to return"),
    token: str = Depends(get_token),
):
    """Get income statement data for a stock."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = FinancialStatementRequest(
            symbol=validated_symbol, frequency=frequency, limit=limit
        )
        result = await service.get_income_statement(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get income statement: {str(e)}"
        )


@router.get("/financials/balance-sheet/{symbol}", response_model=List[BalanceSheet])
async def get_balance_sheet(
    symbol: str,
    frequency: str = Query(
        ..., description="Frequency of the report (annual or quarterly)"
    ),
    limit: int = Query(10, description="Number of periods to return"),
    token: str = Depends(get_token),
):
    """Get balance sheet data for a stock."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = FinancialStatementRequest(
            symbol=validated_symbol, frequency=frequency, limit=limit
        )
        result = await service.get_balance_sheet(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get balance sheet: {str(e)}"
        )


@router.get("/financials/cash-flow/{symbol}", response_model=List[CashFlow])
async def get_cash_flow(
    symbol: str,
    frequency: str = Query(
        ..., description="Frequency of the report (annual or quarterly)"
    ),
    limit: int = Query(10, description="Number of periods to return"),
    token: str = Depends(get_token),
):
    """Get cash flow data for a stock."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = FinancialStatementRequest(
            symbol=validated_symbol, frequency=frequency, limit=limit
        )
        result = await service.get_cash_flow(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get cash flow: {str(e)}"
        )


@router.get("/financials/key-stats/{symbol}", response_model=Optional[KeyStats])
async def get_key_stats(
    symbol: str,
    frequency: str = Query(
        "annual", description="Frequency of the report (annual or quarterly)"
    ),
    token: str = Depends(get_token),
):
    """Get key stats for a stock."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = KeyStatsRequest(symbol=validated_symbol, frequency=frequency)
        result = await service.get_key_stats(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get key stats: {str(e)}"
        )


