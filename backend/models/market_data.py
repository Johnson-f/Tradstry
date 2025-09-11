from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from decimal import Decimal


# =====================================================
# EARNINGS MODELS
# =====================================================

class EarningsCompany(BaseModel):
    symbol: str
    fiscal_year: Optional[int] = None
    fiscal_quarter: Optional[int] = None
    time_of_day: Optional[str] = None
    status: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    eps_estimated: Optional[Decimal] = None
    revenue_estimated: Optional[Decimal] = None
    actual_eps: Optional[Decimal] = None
    eps_surprise_percent: Optional[Decimal] = None
    actual_revenue: Optional[Decimal] = None
    revenue_surprise_percent: Optional[Decimal] = None
    eps_beat_miss_met: Optional[str] = None
    revenue_beat_miss_met: Optional[str] = None
    news_count: Optional[int] = 0
    avg_sentiment: Optional[Decimal] = None
    latest_news_date: Optional[datetime] = None
    recent_news: Optional[List[Dict[str, Any]]] = []


class DailyEarningsSummary(BaseModel):
    earnings_date: date
    total_companies_reporting: int
    companies_scheduled: Optional[List[EarningsCompany]] = []
    companies_reported: Optional[List[EarningsCompany]] = []
    quarterly_breakdown: Optional[Dict[str, Any]] = {}
    summary_stats: Optional[Dict[str, Any]] = {}
    news_summary: Optional[Dict[str, Any]] = {}


# =====================================================
# COMPANY INFO MODELS
# =====================================================

class CompanyInfo(BaseModel):
    id: int
    symbol: str
    exchange_id: Optional[int] = None
    name: Optional[str] = None
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    about: Optional[str] = None
    employees: Optional[int] = None
    logo: Optional[str] = None
    
    # Real-time price data
    price: Optional[Decimal] = None
    pre_market_price: Optional[Decimal] = None
    after_hours_price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    open: Optional[Decimal] = None
    high: Optional[Decimal] = None
    low: Optional[Decimal] = None
    year_high: Optional[Decimal] = None
    year_low: Optional[Decimal] = None
    
    # Volume and trading metrics
    volume: Optional[int] = None
    avg_volume: Optional[int] = None
    
    # Financial ratios and metrics
    market_cap: Optional[int] = None
    beta: Optional[Decimal] = None
    pe_ratio: Optional[Decimal] = None
    eps: Optional[Decimal] = None
    
    # Dividend information
    dividend: Optional[Decimal] = None
    yield_: Optional[Decimal] = Field(None, alias="yield")  # yield is a Python keyword
    ex_dividend: Optional[date] = None
    last_dividend: Optional[Decimal] = None
    
    # Fund-specific metrics (for ETFs/Mutual Funds)
    net_assets: Optional[int] = None
    nav: Optional[Decimal] = None
    expense_ratio: Optional[Decimal] = None
    
    # Corporate events
    earnings_date: Optional[date] = None
    
    # Performance returns
    five_day_return: Optional[Decimal] = None
    one_month_return: Optional[Decimal] = None
    three_month_return: Optional[Decimal] = None
    six_month_return: Optional[Decimal] = None
    ytd_return: Optional[Decimal] = None
    year_return: Optional[Decimal] = None
    five_year_return: Optional[Decimal] = None
    ten_year_return: Optional[Decimal] = None
    max_return: Optional[Decimal] = None
    
    # Metadata fields
    ipo_date: Optional[date] = None
    currency: Optional[str] = None
    fiscal_year_end: Optional[str] = None
    data_provider: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CompanyBasic(BaseModel):
    id: int
    symbol: str
    name: Optional[str] = None
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[int] = None
    price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    volume: Optional[int] = None
    pe_ratio: Optional[Decimal] = None
    yield_: Optional[Decimal] = Field(None, alias="yield")  # yield is a Python keyword
    ytd_return: Optional[Decimal] = None
    year_return: Optional[Decimal] = None
    data_provider: Optional[str] = None
    updated_at: Optional[datetime] = None


# =====================================================
# NEWS MODELS
# =====================================================

class MarketNews(BaseModel):
    id: int
    title: str
    summary: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None
    published_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    author: Optional[str] = None
    category: Optional[str] = None
    sentiment: Optional[Decimal] = None
    relevance_score: Optional[Decimal] = None
    sentiment_confidence: Optional[Decimal] = None
    language: Optional[str] = None
    word_count: Optional[int] = None
    image_url: Optional[str] = None
    tags: Optional[List[str]] = []
    data_provider: Optional[str] = None
    created_at: Optional[datetime] = None
    news_age_hours: Optional[int] = None


class FinanceNews(BaseModel):
    id: int
    title: str
    news_url: Optional[str] = None
    source_name: Optional[str] = None
    image_url: Optional[str] = None
    time_published: Optional[str] = None
    published_at: Optional[datetime] = None
    sentiment_score: Optional[Decimal] = None
    relevance_score: Optional[Decimal] = None
    sentiment_confidence: Optional[Decimal] = None
    mentioned_symbols: Optional[List[str]] = []
    primary_symbols: Optional[List[str]] = []
    word_count: Optional[int] = None
    category: Optional[str] = None
    data_provider: Optional[str] = None
    mention_type: Optional[str] = None
    sentiment_impact: Optional[Decimal] = None
    confidence_score: Optional[Decimal] = None


class NewsStats(BaseModel):
    symbol: str
    total_articles: int
    positive_articles: int
    negative_articles: int
    neutral_articles: int
    avg_sentiment: Optional[Decimal] = None
    avg_relevance: Optional[Decimal] = None
    latest_article_date: Optional[datetime] = None
    top_sources: Optional[List[str]] = []


class NewsSearch(BaseModel):
    id: int
    title: str
    news_url: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[datetime] = None
    sentiment_score: Optional[Decimal] = None
    relevance_score: Optional[Decimal] = None
    match_rank: Optional[float] = None


# =====================================================
# STOCK METRICS MODELS
# =====================================================

class StockQuote(BaseModel):
    symbol: str
    quote_date: date
    previous_close: Optional[Decimal] = None
    open_price: Optional[Decimal] = None
    high_price: Optional[Decimal] = None
    low_price: Optional[Decimal] = None
    current_price: Optional[Decimal] = None
    volume: Optional[int] = None
    price_change: Optional[Decimal] = None
    price_change_percent: Optional[Decimal] = None
    quote_timestamp: Optional[datetime] = None
    data_provider: Optional[str] = None


class FundamentalData(BaseModel):
    symbol: str
    pe_ratio: Optional[Decimal] = None
    market_cap: Optional[int] = None
    dividend_yield: Optional[Decimal] = None
    eps: Optional[Decimal] = None
    fundamental_period: Optional[str] = None
    fiscal_year: Optional[int] = None
    fiscal_quarter: Optional[int] = None
    report_type: Optional[str] = None
    period_end_date: Optional[date] = None
    data_provider: Optional[str] = None
    updated_at: Optional[datetime] = None


# =====================================================
# PRICE MOVEMENTS MODELS
# =====================================================

class PriceMovement(BaseModel):
    symbol: str
    movement_date: date
    price_change_percent: Decimal
    price_change_amount: Optional[Decimal] = None
    open_price: Optional[Decimal] = None
    close_price: Optional[Decimal] = None
    high_price: Optional[Decimal] = None
    low_price: Optional[Decimal] = None
    volume: Optional[int] = None
    movement_type: Optional[str] = None
    quote_timestamp: Optional[datetime] = None
    news_id: Optional[int] = None
    news_title: Optional[str] = None
    news_url: Optional[str] = None
    news_source: Optional[str] = None
    news_published_at: Optional[datetime] = None
    news_sentiment: Optional[Decimal] = None
    news_relevance: Optional[Decimal] = None
    time_diff_hours: Optional[int] = None


class TopMover(BaseModel):
    symbol: str
    price_change_percent: Decimal
    price_change_amount: Optional[Decimal] = None
    current_price: Optional[Decimal] = None
    volume: Optional[int] = None
    movement_type: Optional[str] = None
    news_count: Optional[int] = 0
    latest_news_title: Optional[str] = None
    latest_news_sentiment: Optional[Decimal] = None
    latest_news_url: Optional[str] = None


# =====================================================
# REQUEST MODELS
# =====================================================

class EarningsRequest(BaseModel):
    target_date: Optional[date] = None


class CompanySearchRequest(BaseModel):
    symbol: Optional[str] = None
    data_provider: Optional[str] = None


class CompanySectorRequest(BaseModel):
    sector: Optional[str] = None
    industry: Optional[str] = None
    limit: Optional[int] = 50
    offset: Optional[int] = 0


class CompanySearchTermRequest(BaseModel):
    search_term: str
    limit: Optional[int] = 20


class MarketNewsRequest(BaseModel):
    article_limit: Optional[int] = 7


class FilteredNewsRequest(BaseModel):
    article_limit: Optional[int] = 7
    source_filter: Optional[str] = None
    category_filter: Optional[str] = None
    min_relevance_score: Optional[Decimal] = None
    days_back: Optional[int] = None


class SymbolNewsRequest(BaseModel):
    symbol: str
    limit: Optional[int] = 20
    offset: Optional[int] = 0
    days_back: Optional[int] = 7
    min_relevance: Optional[Decimal] = 0.0
    data_provider: Optional[str] = None


class NewsStatsRequest(BaseModel):
    symbol: str
    days_back: Optional[int] = 30


class NewsSearchRequest(BaseModel):
    symbol: str
    search_term: str
    limit: Optional[int] = 10


class StockQuoteRequest(BaseModel):
    symbol: str
    quote_date: Optional[date] = None
    data_provider: Optional[str] = None


class FundamentalRequest(BaseModel):
    symbol: str
    data_provider: Optional[str] = None


class PriceMovementRequest(BaseModel):
    symbol: Optional[str] = None
    days_back: Optional[int] = 30
    min_change_percent: Optional[Decimal] = 3.0
    limit: Optional[int] = 50
    data_provider: Optional[str] = None


class TopMoversRequest(BaseModel):
    limit: Optional[int] = 20
    min_change_percent: Optional[Decimal] = 3.0


# =====================================================
# SYMBOL MANAGEMENT MODELS
# =====================================================

class SymbolCheckResponse(BaseModel):
    exists: bool
    symbol: str
    message: Optional[str] = None


class SymbolSaveRequest(BaseModel):
    symbol: str


class SymbolSaveResponse(BaseModel):
    success: bool
    symbol: str
    message: str


# =====================================================
# CACHING MODELS
# =====================================================

class CacheData(BaseModel):
    id: int
    symbol: str
    exchange_id: Optional[int] = None
    open: Optional[Decimal] = None
    high: Optional[Decimal] = None
    low: Optional[Decimal] = None
    adjclose: Optional[Decimal] = None
    volume: Optional[int] = None
    period_start: datetime
    period_end: datetime
    period_type: str
    data_provider: str
    cache_timestamp: datetime
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CachedSymbolData(BaseModel):
    symbol: str
    data_points: List[CacheData] = []
    latest_timestamp: Optional[datetime] = None
    data_points_count: int = 0


class MajorIndicesResponse(BaseModel):
    spy: Optional[CachedSymbolData] = None
    qqq: Optional[CachedSymbolData] = None
    dia: Optional[CachedSymbolData] = None
    vix: Optional[CachedSymbolData] = None
    timestamp: datetime
    total_data_points: int = 0


class CacheDataRequest(BaseModel):
    symbol: str
    limit: Optional[int] = 100
    period_type: Optional[str] = "1min"
    data_provider: Optional[str] = "finance_query"
