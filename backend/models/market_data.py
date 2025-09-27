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
    """REDESIGNED: Selective real-time data - REMOVED: price, pre_market_price, after_hours_price, change, percent_change
    KEPT: open, high, low, volume, avg_volume, year_high, year_low"""
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
    
    # Daily price data (kept for trading analysis)
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
    """REDESIGNED: Basic company info with selective price data - NO current price, change, percent_change"""
    id: int
    symbol: str
    name: Optional[str] = None
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[int] = None
    high: Optional[Decimal] = None  # Day's high
    low: Optional[Decimal] = None   # Day's low
    volume: Optional[int] = None    # Current day's volume
    avg_volume: Optional[int] = None
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
# FINANCIAL STATEMENTS MODELS
# =====================================================

class IncomeStatement(BaseModel):
    symbol: str
    frequency: str
    fiscal_date: date
    total_revenue: Optional[Decimal] = None
    operating_revenue: Optional[Decimal] = None
    cost_of_revenue: Optional[Decimal] = None
    gross_profit: Optional[Decimal] = None
    reconciled_cost_of_revenue: Optional[Decimal] = None
    operating_expense: Optional[Decimal] = None
    selling_general_and_administrative: Optional[Decimal] = None
    research_and_development: Optional[Decimal] = None
    total_expenses: Optional[Decimal] = None
    reconciled_depreciation: Optional[Decimal] = None
    operating_income: Optional[Decimal] = None
    total_operating_income_as_reported: Optional[Decimal] = None
    net_non_operating_interest_income_expense: Optional[Decimal] = None
    non_operating_interest_income: Optional[Decimal] = None
    non_operating_interest_expense: Optional[Decimal] = None
    other_income_expense: Optional[Decimal] = None
    other_non_operating_income_expenses: Optional[Decimal] = None
    pretax_income: Optional[Decimal] = None
    net_income_common_stockholders: Optional[Decimal] = None
    net_income_attributable_to_parent_shareholders: Optional[Decimal] = None
    net_income_including_non_controlling_interests: Optional[Decimal] = None
    net_income_continuous_operations: Optional[Decimal] = None
    diluted_ni_available_to_common_stockholders: Optional[Decimal] = None
    net_income_from_continuing_discontinued_operation: Optional[Decimal] = None
    net_income_from_continuing_operation_net_minority_interest: Optional[Decimal] = None
    normalized_income: Optional[Decimal] = None
    interest_income: Optional[Decimal] = None
    interest_expense: Optional[Decimal] = None
    net_interest_income: Optional[Decimal] = None
    basic_eps: Optional[Decimal] = None
    diluted_eps: Optional[Decimal] = None
    basic_average_shares: Optional[int] = None
    diluted_average_shares: Optional[int] = None
    ebit: Optional[Decimal] = None
    ebitda: Optional[Decimal] = None
    normalized_ebitda: Optional[Decimal] = None
    tax_provision: Optional[Decimal] = None
    tax_rate_for_calcs: Optional[Decimal] = None
    tax_effect_of_unusual_items: Optional[Decimal] = None
    data_provider: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class BalanceSheet(BaseModel):
    symbol: str
    frequency: str
    fiscal_date: date
    total_assets: Optional[Decimal] = None
    total_current_assets: Optional[Decimal] = None
    cash_cash_equivalents_and_short_term_investments: Optional[Decimal] = None
    cash_and_cash_equivalents: Optional[Decimal] = None
    cash: Optional[Decimal] = None
    cash_equivalents: Optional[Decimal] = None
    other_short_term_investments: Optional[Decimal] = None
    receivables: Optional[Decimal] = None
    accounts_receivable: Optional[Decimal] = None
    other_receivables: Optional[Decimal] = None
    inventory: Optional[Decimal] = None
    other_current_assets: Optional[Decimal] = None
    total_non_current_assets: Optional[Decimal] = None
    net_ppe: Optional[Decimal] = None
    gross_ppe: Optional[Decimal] = None
    properties: Optional[Decimal] = None
    land_and_improvements: Optional[Decimal] = None
    machinery_furniture_equipment: Optional[Decimal] = None
    other_properties: Optional[Decimal] = None
    leases: Optional[Decimal] = None
    accumulated_depreciation: Optional[Decimal] = None
    investments_and_advances: Optional[Decimal] = None
    investment_in_financial_assets: Optional[Decimal] = None
    available_for_sale_securities: Optional[Decimal] = None
    other_investments: Optional[Decimal] = None
    non_current_deferred_assets: Optional[Decimal] = None
    non_current_deferred_taxes_assets: Optional[Decimal] = None
    other_non_current_assets: Optional[Decimal] = None
    net_tangible_assets: Optional[Decimal] = None
    tangible_book_value: Optional[Decimal] = None
    total_liabilities: Optional[Decimal] = None
    total_current_liabilities: Optional[Decimal] = None
    payables_and_accrued_expenses: Optional[Decimal] = None
    payables: Optional[Decimal] = None
    accounts_payable: Optional[Decimal] = None
    total_tax_payable: Optional[Decimal] = None
    income_tax_payable: Optional[Decimal] = None
    current_debt_and_capital_lease_obligation: Optional[Decimal] = None
    current_debt: Optional[Decimal] = None
    commercial_paper: Optional[Decimal] = None
    other_current_borrowings: Optional[Decimal] = None
    current_capital_lease_obligation: Optional[Decimal] = None
    current_deferred_liabilities: Optional[Decimal] = None
    current_deferred_revenue: Optional[Decimal] = None
    other_current_liabilities: Optional[Decimal] = None
    total_non_current_liabilities: Optional[Decimal] = None
    long_term_debt_and_capital_lease_obligation: Optional[Decimal] = None
    long_term_debt: Optional[Decimal] = None
    long_term_capital_lease_obligation: Optional[Decimal] = None
    trade_and_other_payables_non_current: Optional[Decimal] = None
    other_non_current_liabilities: Optional[Decimal] = None
    capital_lease_obligations: Optional[Decimal] = None
    total_debt: Optional[Decimal] = None
    net_debt: Optional[Decimal] = None
    total_equity: Optional[Decimal] = None
    stockholders_equity: Optional[Decimal] = None
    capital_stock: Optional[Decimal] = None
    common_stock: Optional[Decimal] = None
    retained_earnings: Optional[Decimal] = None
    gains_losses_not_affecting_retained_earnings: Optional[Decimal] = None
    other_equity_adjustments: Optional[Decimal] = None
    common_stock_equity: Optional[Decimal] = None
    shares_issued: Optional[int] = None
    ordinary_shares_number: Optional[int] = None
    treasury_shares_number: Optional[int] = None
    working_capital: Optional[Decimal] = None
    invested_capital: Optional[Decimal] = None
    total_capitalization: Optional[Decimal] = None
    data_provider: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class CashFlow(BaseModel):
    symbol: str
    frequency: str
    fiscal_date: date
    operating_cash_flow: Optional[Decimal] = None
    net_income_from_continuing_operations: Optional[Decimal] = None
    depreciation_and_amortization: Optional[Decimal] = None
    deferred_income_tax: Optional[Decimal] = None
    stock_based_compensation: Optional[Decimal] = None
    other_non_cash_items: Optional[Decimal] = None
    change_in_working_capital: Optional[Decimal] = None
    change_in_receivables: Optional[Decimal] = None
    change_in_inventory: Optional[Decimal] = None
    change_in_payables_and_accrued_expense: Optional[Decimal] = None
    change_in_other_current_assets: Optional[Decimal] = None
    change_in_other_current_liabilities: Optional[Decimal] = None
    change_in_other_working_capital: Optional[Decimal] = None
    investing_cash_flow: Optional[Decimal] = None
    net_investment_purchase_and_sale: Optional[Decimal] = None
    purchase_of_investment: Optional[Decimal] = None
    sale_of_investment: Optional[Decimal] = None
    net_ppe_purchase_and_sale: Optional[Decimal] = None
    purchase_of_ppe: Optional[Decimal] = None
    net_business_purchase_and_sale: Optional[Decimal] = None
    purchase_of_business: Optional[Decimal] = None
    net_other_investing_changes: Optional[Decimal] = None
    capital_expenditure: Optional[Decimal] = None
    financing_cash_flow: Optional[Decimal] = None
    net_issuance_payments_of_debt: Optional[Decimal] = None
    net_long_term_debt_issuance: Optional[Decimal] = None
    long_term_debt_issuance: Optional[Decimal] = None
    long_term_debt_payments: Optional[Decimal] = None
    net_short_term_debt_issuance: Optional[Decimal] = None
    short_term_debt_issuance: Optional[Decimal] = None
    short_term_debt_payments: Optional[Decimal] = None
    net_common_stock_issuance: Optional[Decimal] = None
    common_stock_issuance: Optional[Decimal] = None
    common_stock_payments: Optional[Decimal] = None
    cash_dividends_paid: Optional[Decimal] = None
    net_other_financing_charges: Optional[Decimal] = None
    issuance_of_capital_stock: Optional[Decimal] = None
    issuance_of_debt: Optional[Decimal] = None
    repayment_of_debt: Optional[Decimal] = None
    repurchase_of_capital_stock: Optional[Decimal] = None
    end_cash_position: Optional[Decimal] = None
    changes_in_cash: Optional[Decimal] = None
    beginning_cash_position: Optional[Decimal] = None
    free_cash_flow: Optional[Decimal] = None
    income_tax_paid_supplemental_data: Optional[Decimal] = None
    interest_paid_supplemental_data: Optional[Decimal] = None
    data_provider: Optional[str] = None
    created_at: Optional[datetime] = None
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
# MARKET MOVERS MODELS
# =====================================================

class MarketMover(BaseModel):
    symbol: str
    name: Optional[str] = None
    price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    fetch_timestamp: Optional[datetime] = None


class MarketMoverWithLogo(BaseModel):
    symbol: str
    name: Optional[str] = None
    price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    fetch_timestamp: Optional[datetime] = None
    logo: Optional[str] = None


class CompanyLogo(BaseModel):
    symbol: str
    logo: Optional[str] = None


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


# =====================================================
# SYMBOL SEARCH MODELS
# =====================================================

class SymbolSearchRequest(BaseModel):
    query: str
    yahoo: Optional[bool] = True
    limit: Optional[int] = 10


class SymbolSearchResult(BaseModel):
    symbol: str
    name: str
    exchange: str
    type: str
    currency: Optional[str] = None
    marketCap: Optional[int] = None
    sector: Optional[str] = None


class SymbolSearchResponse(BaseModel):
    results: List[SymbolSearchResult]
    total: int


class QuoteRequest(BaseModel):
    symbols: List[str]


class QuoteResult(BaseModel):
    symbol: str
    name: str
    price: float
    change: float
    changePercent: float
    dayHigh: float
    dayLow: float
    volume: int
    marketCap: Optional[int] = None
    logo: Optional[str] = None


class QuoteResponse(BaseModel):
    quotes: List[QuoteResult]


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


class FinancialStatementRequest(BaseModel):
    symbol: str
    frequency: str
    limit: Optional[int] = 10

class KeyStats(BaseModel):
    market_cap: Optional[int] = None
    cash_and_cash_equivalents: Optional[Decimal] = None
    total_debt: Optional[Decimal] = None
    enterprise_value: Optional[Decimal] = None
    revenue: Optional[Decimal] = None
    gross_profit: Optional[Decimal] = None
    ebitda: Optional[Decimal] = None
    net_income_common_stockholders: Optional[Decimal] = None
    diluted_eps: Optional[Decimal] = None
    operating_cash_flow: Optional[Decimal] = None
    capital_expenditure: Optional[Decimal] = None
    free_cash_flow: Optional[Decimal] = None

class KeyStatsRequest(BaseModel):
    symbol: str
    frequency: str = 'annual'


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
# HISTORICAL PRICES MODELS
# =====================================================

class HistoricalPrice(BaseModel):
    id: int  # Matches SERIAL (INTEGER) in database
    symbol: str
    exchange_id: Optional[int] = None
    timestamp_utc: datetime
    date_only: date
    time_interval: str  # Removed time_range - intervals only
    open: Optional[Decimal] = None
    high: Optional[Decimal] = None
    low: Optional[Decimal] = None
    close: Optional[Decimal] = None
    volume: Optional[int] = None
    adjusted_close: Optional[Decimal] = None
    dividend: Optional[Decimal] = None
    split_ratio: Optional[Decimal] = None
    data_provider: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class HistoricalPriceSummary(BaseModel):
    time_interval: str  # Removed time_range - intervals only
    data_count: int
    earliest_date: datetime
    latest_date: datetime
    data_providers: List[str]


class LatestHistoricalPrice(BaseModel):
    timestamp_utc: datetime
    time_interval: str  # Removed time_range - intervals only
    open: Optional[Decimal] = None
    high: Optional[Decimal] = None
    low: Optional[Decimal] = None
    close: Optional[Decimal] = None
    volume: Optional[int] = None
    adjusted_close: Optional[Decimal] = None
    data_provider: str


class HistoricalPriceRange(BaseModel):
    timestamp_utc: datetime
    open: Optional[Decimal] = None
    high: Optional[Decimal] = None
    low: Optional[Decimal] = None
    close: Optional[Decimal] = None
    volume: Optional[int] = None
    adjusted_close: Optional[Decimal] = None


# =====================================================
# HISTORICAL PRICES REQUEST MODELS
# =====================================================

class HistoricalPriceRequest(BaseModel):
    symbol: str
    time_range: str
    time_interval: str
    data_provider: Optional[str] = None
    limit: Optional[int] = 1000


class HistoricalPriceSummaryRequest(BaseModel):
    symbol: str


class LatestHistoricalPriceRequest(BaseModel):
    symbol: str
    limit: Optional[int] = 10


class HistoricalPriceRangeRequest(BaseModel):
    symbol: str
    time_interval: str  # Removed time_range - intervals only
    start_date: datetime
    end_date: datetime
    data_provider: Optional[str] = None


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


class MarketMoversRequest(BaseModel):
    data_date: Optional[date] = None
    limit: Optional[int] = 10


class CompanyLogosRequest(BaseModel):
    symbols: List[str]


class EarningsCalendarLogo(BaseModel):
    symbol: str
    logo: Optional[str] = None


class EarningsCalendarLogosRequest(BaseModel):
    symbols: List[str]


# =====================================================
# WATCHLIST MODELS
# =====================================================

class Watchlist(BaseModel):
    id: int
    name: str
    created_at: datetime
    updated_at: datetime


class WatchlistItem(BaseModel):
    id: int
    symbol: str
    company_name: Optional[str] = None
    price: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    added_at: datetime


class WatchlistWithItems(BaseModel):
    id: int
    name: str
    created_at: datetime
    updated_at: datetime
    items: List[WatchlistItem] = []


# =====================================================
# WATCHLIST REQUEST MODELS
# =====================================================

class CreateWatchlistRequest(BaseModel):
    name: str


class AddWatchlistItemRequest(BaseModel):
    watchlist_id: int
    symbol: str
    company_name: Optional[str] = None
    price: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None


class DeleteWatchlistItemRequest(BaseModel):
    item_id: Optional[int] = None
    watchlist_id: Optional[int] = None
    symbol: Optional[str] = None


# =====================================================
# WATCHLIST RESPONSE MODELS
# =====================================================

class WatchlistResponse(BaseModel):
    success: bool
    message: str
    watchlist_id: Optional[int] = None


class DeleteResponse(BaseModel):
    success: bool
    message: str
    deleted_count: Optional[int] = None


# =====================================================
# STOCK PEERS MODELS
# =====================================================

class StockPeer(BaseModel):
    peer_symbol: str
    peer_name: Optional[str] = None
    price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    logo: Optional[str] = None
    fetch_timestamp: Optional[datetime] = None


class PeerComparison(BaseModel):
    symbol: str
    name: Optional[str] = None
    price: Optional[Decimal] = None
    change: Optional[Decimal] = None
    percent_change: Optional[Decimal] = None
    logo: Optional[str] = None
    is_main_stock: bool
    peer_rank: Optional[int] = None


class StockPeersRequest(BaseModel):
    symbol: str
    data_date: Optional[date] = None
    limit: Optional[int] = 20


class PeersPaginatedRequest(BaseModel):
    symbol: str
    data_date: Optional[date] = None
    offset: Optional[int] = 0
    limit: Optional[int] = 20
    sort_column: Optional[str] = "percent_change"
    sort_direction: Optional[str] = "DESC"
