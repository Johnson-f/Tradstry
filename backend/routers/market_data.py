from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal

from services.market_data_service import MarketDataService
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
    SymbolSearchRequest, SymbolSearchResponse, QuoteRequest, QuoteResponse
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
    target_date: Optional[date] = Query(None, description="Target date for earnings summary"),
    token: str = Depends(get_token)
):
    """Get comprehensive daily earnings summary with news and statistics."""
    try:
        service = MarketDataService()
        request = EarningsRequest(target_date=target_date)
        result = await service.get_daily_earnings_summary(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get earnings summary: {str(e)}")


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
        raise HTTPException(status_code=400, detail=f"Invalid symbol '{symbol}'. Please use a valid stock symbol like AAPL, TSLA, or MSFT")
    
    # Basic symbol format validation
    import re
    if not re.match(r'^[A-Z0-9.-]{1,10}$', symbol):
        raise HTTPException(status_code=400, detail=f"Invalid symbol format '{symbol}'. Symbol should contain only letters, numbers, dots, and dashes")
    
    return symbol


@router.get("/company/{symbol}", response_model=Optional[CompanyInfo])
async def get_company_info(
    symbol: str,
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get detailed company information by symbol."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = CompanySearchRequest(symbol=validated_symbol, data_provider=data_provider)
        result = await service.get_company_info_by_symbol(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get company info: {str(e)}")


@router.get("/companies/by-sector", response_model=List[CompanyBasic])
async def get_companies_by_sector_industry(
    sector: Optional[str] = Query(None, description="Sector filter"),
    industry: Optional[str] = Query(None, description="Industry filter"),
    limit: int = Query(50, description="Maximum number of results"),
    offset: int = Query(0, description="Offset for pagination"),
    token: str = Depends(get_token)
):
    """Get companies filtered by sector and/or industry."""
    try:
        service = MarketDataService()
        request = CompanySectorRequest(
            sector=sector, 
            industry=industry, 
            limit=limit, 
            offset=offset
        )
        result = await service.get_companies_by_sector_industry(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get companies: {str(e)}")


@router.get("/companies/search", response_model=List[CompanyBasic])
async def search_companies(
    search_term: str = Query(..., description="Search term for company name or symbol"),
    limit: int = Query(20, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Search companies by name or symbol."""
    try:
        service = MarketDataService()
        request = CompanySearchTermRequest(search_term=search_term, limit=limit)
        result = await service.search_companies(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search companies: {str(e)}")


# =====================================================
# MARKET NEWS ENDPOINTS
# =====================================================

@router.get("/news/latest", response_model=List[MarketNews])
async def get_latest_market_news(
    article_limit: int = Query(7, description="Number of articles to retrieve"),
    token: str = Depends(get_token)
):
    """Get latest market news articles."""
    try:
        service = MarketDataService()
        request = MarketNewsRequest(article_limit=article_limit)
        result = await service.get_latest_market_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get market news: {str(e)}")


@router.get("/news/filtered", response_model=List[MarketNews])
async def get_filtered_market_news(
    article_limit: int = Query(7, description="Number of articles to retrieve"),
    source_filter: Optional[str] = Query(None, description="Source filter"),
    category_filter: Optional[str] = Query(None, description="Category filter"),
    min_relevance_score: Optional[Decimal] = Query(None, description="Minimum relevance score"),
    days_back: Optional[int] = Query(None, description="Number of days to look back"),
    token: str = Depends(get_token)
):
    """Get filtered market news with advanced filtering options."""
    try:
        service = MarketDataService()
        request = FilteredNewsRequest(
            article_limit=article_limit,
            source_filter=source_filter,
            category_filter=category_filter,
            min_relevance_score=min_relevance_score,
            days_back=days_back
        )
        result = await service.get_filtered_market_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get filtered news: {str(e)}")


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
    token: str = Depends(get_token)
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
            data_provider=data_provider
        )
        result = await service.get_symbol_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get symbol news: {str(e)}")


@router.get("/news/symbol/{symbol}/latest", response_model=List[FinanceNews])
async def get_latest_symbol_news(
    symbol: str,
    limit: int = Query(10, description="Number of articles to retrieve"),
    token: str = Depends(get_token)
):
    """Get latest news for a specific symbol (simplified)."""
    try:
        service = MarketDataService()
        result = await service.get_latest_symbol_news(symbol, limit, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get latest symbol news: {str(e)}")


@router.get("/news/symbol/{symbol}/stats", response_model=Optional[NewsStats])
async def get_symbol_news_stats(
    symbol: str,
    days_back: int = Query(30, description="Number of days to analyze"),
    token: str = Depends(get_token)
):
    """Get news statistics for a specific symbol."""
    try:
        service = MarketDataService()
        request = NewsStatsRequest(symbol=symbol, days_back=days_back)
        result = await service.get_symbol_news_stats(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get news stats: {str(e)}")


@router.get("/news/symbol/{symbol}/search", response_model=List[NewsSearch])
async def search_symbol_news(
    symbol: str,
    search_term: str = Query(..., description="Search term for news content"),
    limit: int = Query(10, description="Number of articles to retrieve"),
    token: str = Depends(get_token)
):
    """Search news by keyword for a specific symbol."""
    try:
        service = MarketDataService()
        request = NewsSearchRequest(symbol=symbol, search_term=search_term, limit=limit)
        result = await service.search_symbol_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search symbol news: {str(e)}")


# =====================================================
# STOCK METRICS ENDPOINTS
# =====================================================

@router.get("/quotes/{symbol}", response_model=Optional[StockQuote])
async def get_stock_quotes(
    symbol: str,
    quote_date: Optional[date] = Query(None, description="Quote date (defaults to today)"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get stock quote data."""
    try:
        service = MarketDataService()
        request = StockQuoteRequest(
            symbol=symbol,
            quote_date=quote_date,
            data_provider=data_provider
        )
        result = await service.get_stock_quotes(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stock quotes: {str(e)}")


@router.get("/fundamentals/{symbol}", response_model=Optional[FundamentalData])
async def get_fundamental_data(
    symbol: str,
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get fundamental data for a stock."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = FundamentalRequest(symbol=validated_symbol, data_provider=data_provider)
        result = await service.get_fundamental_data(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get fundamental data: {str(e)}")


@router.get("/stock/{symbol}/combined", response_model=Dict[str, Any])
async def get_combined_stock_data(
    symbol: str,
    quote_date: Optional[date] = Query(None, description="Quote date (defaults to today)"),
    token: str = Depends(get_token)
):
    """Get combined stock quotes and fundamental data."""
    try:
        service = MarketDataService()
        result = await service.get_combined_stock_data(symbol, quote_date, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get combined stock data: {str(e)}")


# =====================================================
# PRICE MOVEMENTS ENDPOINTS
# =====================================================

@router.get("/movements/significant", response_model=List[PriceMovement])
async def get_significant_price_movements_with_news(
    symbol: Optional[str] = Query(None, description="Symbol filter (optional)"),
    days_back: int = Query(30, description="Number of days to look back"),
    min_change_percent: Decimal = Query(3.0, description="Minimum price change percentage"),
    limit: int = Query(50, description="Maximum number of results"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get significant price movements with related news."""
    try:
        service = MarketDataService()
        request = PriceMovementRequest(
            symbol=symbol,
            days_back=days_back,
            min_change_percent=min_change_percent,
            limit=limit,
            data_provider=data_provider
        )
        result = await service.get_significant_price_movements_with_news(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get price movements: {str(e)}")


@router.get("/movements/top-movers-today", response_model=List[TopMover])
async def get_top_movers_with_news_today(
    limit: int = Query(20, description="Maximum number of results"),
    min_change_percent: Decimal = Query(3.0, description="Minimum price change percentage"),
    token: str = Depends(get_token)
):
    """Get today's top movers with related news."""
    try:
        service = MarketDataService()
        request = TopMoversRequest(limit=limit, min_change_percent=min_change_percent)
        result = await service.get_top_movers_with_news_today(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get top movers: {str(e)}")


# =====================================================
# COMPREHENSIVE OVERVIEW ENDPOINT
# =====================================================

@router.get("/overview/{symbol}", response_model=Dict[str, Any])
async def get_symbol_overview(
    symbol: str,
    token: str = Depends(get_token)
):
    """Get comprehensive overview for a symbol including company info, quotes, news, and movements."""
    try:
        service = MarketDataService()
        result = await service.get_symbol_overview(symbol, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get symbol overview: {str(e)}")



# =====================================================
# SYMBOL MANAGEMENT ENDPOINTS
# =====================================================

@router.get("/symbols/check/{symbol}", response_model=SymbolCheckResponse)
async def check_symbol_exists(
    symbol: str,
    token: str = Depends(get_token)
):
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
    request: SymbolSaveRequest,
    token: str = Depends(get_token)
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
            "quotes/{symbol}",
            "fundamentals/{symbol}",
            "stock/{symbol}/combined",
            "movements/significant",
            "movements/top-movers-today",
            "overview/{symbol}",
            "symbols/check/{symbol}",
            "symbols/save",
            "cache/symbol/{symbol}",
            "cache/major-indices",
            "cache/spy",
            "cache/qqq",
            "cache/dia",
            "cache/vix",
            "movers/gainers",
            "movers/losers",
            "movers/most-active",
            "movers/gainers-with-logos",
            "movers/losers-with-logos",
            "movers/most-active-with-logos",
            "movers/overview",
            "logos/batch",
            "logos/earnings-calendar-batch"
        ]
    }


# =====================================================
# MARKET MOVERS ENDPOINTS
# =====================================================

@router.get("/movers/gainers", response_model=List[MarketMover])
async def get_top_gainers(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Get top gainers for a specific date."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_top_gainers(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get top gainers: {str(e)}")


@router.get("/movers/losers", response_model=List[MarketMover])
async def get_top_losers(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Get top losers for a specific date."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_top_losers(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get top losers: {str(e)}")


@router.get("/movers/most-active", response_model=List[MarketMover])
async def get_most_active(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Get most active stocks for a specific date."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_most_active(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get most active stocks: {str(e)}")


@router.get("/movers/gainers-with-logos", response_model=List[MarketMoverWithLogo])
async def get_top_gainers_with_logos(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Get top gainers with company logos."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_top_gainers_with_logos(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get top gainers with logos: {str(e)}")


@router.get("/movers/losers-with-logos", response_model=List[MarketMoverWithLogo])
async def get_top_losers_with_logos(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Get top losers with company logos."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_top_losers_with_logos(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get top losers with logos: {str(e)}")


@router.get("/movers/most-active-with-logos", response_model=List[MarketMoverWithLogo])
async def get_most_active_with_logos(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Get most active stocks with company logos."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_most_active_with_logos(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get most active stocks with logos: {str(e)}")


@router.get("/movers/overview", response_model=Dict[str, Any])
async def get_market_movers_overview(
    data_date: Optional[date] = Query(None, description="Date for market movers (defaults to today)"),
    limit: int = Query(10, description="Maximum number of results per category"),
    token: str = Depends(get_token)
):
    """Get comprehensive market movers overview with logos (gainers, losers, most active)."""
    try:
        service = MarketDataService()
        request = MarketMoversRequest(data_date=data_date, limit=limit)
        result = await service.get_market_movers_overview(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get market movers overview: {str(e)}")


# =====================================================
# COMPANY LOGOS ENDPOINTS
# =====================================================

@router.post("/logos/batch", response_model=List[CompanyLogo])
async def get_company_logos_batch(
    request: CompanyLogosRequest,
    token: str = Depends(get_token)
):
    """Get company logos for multiple symbols at once."""
    try:
        service = MarketDataService()
        result = await service.get_company_logos_batch(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get company logos: {str(e)}")


# =====================================================
# CACHING ENDPOINTS
# =====================================================

@router.get("/cache/symbol/{symbol}", response_model=Optional[CachedSymbolData])
async def get_cached_symbol_data(
    symbol: str,
    limit: int = Query(100, description="Maximum number of data points to return"),
    period_type: str = Query("1min", description="Time period type (1min, 5min, 1hour, 1day, etc.)"),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get cached market data for a specific symbol."""
    try:
        validated_symbol = validate_symbol(symbol)
        service = MarketDataService()
        request = CacheDataRequest(
            symbol=validated_symbol,
            limit=limit,
            period_type=period_type,
            data_provider=data_provider
        )
        result = await service.get_cached_symbol_data(request, token)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get cached symbol data: {str(e)}")


@router.get("/cache/major-indices", response_model=MajorIndicesResponse)
async def get_major_indices_data(
    limit: int = Query(100, description="Maximum number of data points per symbol"),
    period_type: str = Query("1min", description="Time period type (1min, 5min, 1hour, 1day, etc.)"),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get cached data for major indices (SPY, QQQ, DIA, VIX)."""
    try:
        service = MarketDataService()
        result = await service.get_major_indices_data(limit, period_type, data_provider, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get major indices data: {str(e)}")


@router.get("/cache/spy", response_model=Optional[CachedSymbolData])
async def get_spy_data(
    limit: int = Query(100, description="Maximum number of data points to return"),
    period_type: str = Query("1min", description="Time period type"),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get cached SPY (S&P 500 ETF) data."""
    try:
        service = MarketDataService()
        request = CacheDataRequest(
            symbol="SPY",
            limit=limit,
            period_type=period_type,
            data_provider=data_provider
        )
        result = await service.get_cached_symbol_data(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get SPY data: {str(e)}")


@router.get("/cache/qqq", response_model=Optional[CachedSymbolData])
async def get_qqq_data(
    limit: int = Query(100, description="Maximum number of data points to return"),
    period_type: str = Query("1min", description="Time period type"),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get cached QQQ (Nasdaq-100 ETF) data."""
    try:
        service = MarketDataService()
        request = CacheDataRequest(
            symbol="QQQ",
            limit=limit,
            period_type=period_type,
            data_provider=data_provider
        )
        result = await service.get_cached_symbol_data(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get QQQ data: {str(e)}")


@router.get("/cache/dia", response_model=Optional[CachedSymbolData])
async def get_dia_data(
    limit: int = Query(100, description="Maximum number of data points to return"),
    period_type: str = Query("1min", description="Time period type"),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get cached DIA (Dow Jones Industrial Average ETF) data."""
    try:
        service = MarketDataService()
        request = CacheDataRequest(
            symbol="DIA",
            limit=limit,
            period_type=period_type,
            data_provider=data_provider
        )
        result = await service.get_cached_symbol_data(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get DIA data: {str(e)}")


@router.get("/cache/vix", response_model=Optional[CachedSymbolData])
async def get_vix_data(
    limit: int = Query(100, description="Maximum number of data points to return"),
    period_type: str = Query("1min", description="Time period type"),
    data_provider: str = Query("finance_query", description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get cached VIX (fear & greed index) data."""
    try:
        service = MarketDataService()
        request = CacheDataRequest(
            symbol="VIX",
            limit=limit,
            period_type=period_type,
            data_provider=data_provider
        )
        result = await service.get_cached_symbol_data(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get VIX data: {str(e)}")


@router.post("/logos/earnings-calendar-batch", response_model=List[EarningsCalendarLogo])
async def get_earnings_calendar_logos_batch(
    request: EarningsCalendarLogosRequest,
    token: str = Depends(get_token)
):
    """Get company logos for multiple symbols from earnings_calendar table only."""
    try:
        service = MarketDataService()
        result = await service.get_earnings_calendar_logos_batch(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get earnings calendar logos: {str(e)}")


# =====================================================
# HISTORICAL PRICES ENDPOINTS
# =====================================================

@router.get("/historical/{symbol}", response_model=List[HistoricalPrice])
async def get_historical_prices(
    symbol: str,
    time_range: str = Query(..., description="Time range (1d, 5d, 1mo, 3mo, 6mo, ytd, 1y, 2y, 5y, 10y, max)"),
    time_interval: str = Query(..., description="Time interval (1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo)"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    limit: Optional[int] = Query(1000, ge=1, le=10000, description="Maximum number of records to return"),
    token: str = Depends(get_token)
):
    """Get historical price data for a symbol with specific range and interval."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = HistoricalPriceRequest(
        symbol=validated_symbol,
        time_range=time_range,
        time_interval=time_interval,
        data_provider=data_provider,
        limit=limit
    )
    result = await service.get_historical_prices(request, token)
    return result


@router.get("/historical/{symbol}/summary", response_model=List[HistoricalPriceSummary])
async def get_historical_prices_summary(
    symbol: str,
    token: str = Depends(get_token)
):
    """Get all available range/interval combinations for a specific symbol."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = HistoricalPriceSummaryRequest(symbol=validated_symbol)
    result = await service.get_historical_prices_by_symbol(request, token)
    return result


@router.get("/historical/{symbol}/latest", response_model=List[LatestHistoricalPrice])
async def get_latest_historical_prices(
    symbol: str,
    limit: Optional[int] = Query(10, ge=1, le=100, description="Maximum number of records to return"),
    token: str = Depends(get_token)
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
    time_range: str = Query(..., description="Time range (1d, 5d, 1mo, 3mo, 6mo, ytd, 1y, 2y, 5y, 10y, max)"),
    time_interval: str = Query(..., description="Time interval (1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo)"),
    start_date: datetime = Query(..., description="Start date for the range query"),
    end_date: datetime = Query(..., description="End date for the range query"),
    data_provider: Optional[str] = Query(None, description="Data provider filter"),
    token: str = Depends(get_token)
):
    """Get historical prices within a specific date range for analysis."""
    validated_symbol = validate_symbol(symbol)
    service = MarketDataService()
    request = HistoricalPriceRangeRequest(
        symbol=validated_symbol,
        time_range=time_range,
        time_interval=time_interval,
        start_date=start_date,
        end_date=end_date,
        data_provider=data_provider
    )
    result = await service.get_historical_price_range(request, token)
    return result


@router.get("/historical/{symbol}/overview", response_model=Dict[str, Any])
async def get_symbol_historical_overview(
    symbol: str,
    token: str = Depends(get_token)
):
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
    limit: Optional[int] = Query(10, ge=1, le=50, description="Maximum number of results"),
    token: str = Depends(get_token)
):
    """Search for stock symbols, ETFs, and other securities."""
    try:
        service = MarketDataService()
        request = SymbolSearchRequest(query=query, yahoo=yahoo, limit=limit)
        result = await service.search_symbols(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search symbols: {str(e)}")


@router.get("/quotes", response_model=QuoteResponse)
async def get_quotes(
    symbols: str = Query(..., description="Comma-separated list of symbols"),
    token: str = Depends(get_token)
):
    """Get stock quotes for multiple symbols."""
    try:
        service = MarketDataService()
        symbols_list = [s.strip().upper() for s in symbols.split(',') if s.strip()]
        request = QuoteRequest(symbols=symbols_list)
        result = await service.get_quotes(request, token)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch quotes: {str(e)}")
