// =====================================================
// EARNINGS TYPES
// =====================================================

export interface EarningsCompany {
  symbol: string;
  fiscal_year?: number;
  fiscal_quarter?: number;
  time_of_day?: string;
  status?: string;
  sector?: string;
  industry?: string;
  eps_estimated?: number;
  revenue_estimated?: number;
  actual_eps?: number;
  eps_surprise_percent?: number;
  actual_revenue?: number;
  revenue_surprise_percent?: number;
  eps_beat_miss_met?: string;
  revenue_beat_miss_met?: string;
  news_count?: number;
  avg_sentiment?: number;
  latest_news_date?: string;
  recent_news?: Record<string, unknown>[];
}

export interface DailyEarningsSummary {
  earnings_date: string;
  total_companies_reporting: number;
  companies_scheduled?: EarningsCompany[];
  companies_reported?: EarningsCompany[];
  quarterly_breakdown?: Record<string, unknown>;
  summary_stats?: Record<string, unknown>;
  news_summary?: Record<string, unknown>;
}

// =====================================================
// COMPANY INFO TYPES
// =====================================================

export interface CompanyInfo {
  id: number;
  symbol: string;
  exchange_id?: number;
  name?: string;
  company_name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  employees?: number;
  revenue?: number;
  net_income?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  dividend_yield?: number;
  description?: string;
  website?: string;
  ceo?: string;
  headquarters?: string;
  founded?: string;
  phone?: string;
  email?: string;
  ipo_date?: string;
  currency?: string;
  fiscal_year_end?: string;
  data_provider?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyBasic {
  id: number;
  symbol: string;
  name?: string;
  company_name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  market_cap?: number;
  pe_ratio?: number;
  dividend_yield?: number;
  data_provider?: string;
  updated_at?: string;
}

// =====================================================
// NEWS TYPES
// =====================================================

export interface MarketNews {
  id: number;
  title: string;
  summary?: string;
  content?: string;
  url?: string;
  source?: string;
  published_at?: string;
  updated_at?: string;
  author?: string;
  category?: string;
  sentiment?: number;
  relevance_score?: number;
  sentiment_confidence?: number;
  language?: string;
  word_count?: number;
  image_url?: string;
  tags?: string[];
  data_provider?: string;
  created_at?: string;
  news_age_hours?: number;
}

export interface FinanceNews {
  id: number;
  title: string;
  news_url?: string;
  source_name?: string;
  image_url?: string;
  time_published?: string;
  published_at?: string;
  sentiment_score?: number;
  relevance_score?: number;
  sentiment_confidence?: number;
  mentioned_symbols?: string[];
  primary_symbols?: string[];
  word_count?: number;
  category?: string;
  data_provider?: string;
  mention_type?: string;
  sentiment_impact?: number;
  confidence_score?: number;
}

export interface NewsStats {
  symbol: string;
  total_articles: number;
  positive_articles: number;
  negative_articles: number;
  neutral_articles: number;
  avg_sentiment?: number;
  avg_relevance?: number;
  latest_article_date?: string;
  top_sources?: string[];
}

export interface NewsSearch {
  id: number;
  title: string;
  news_url?: string;
  source_name?: string;
  published_at?: string;
  sentiment_score?: number;
  relevance_score?: number;
  match_rank?: number;
}

// =====================================================
// STOCK METRICS TYPES
// =====================================================

export interface StockQuote {
  symbol: string;
  quote_date: string;
  previous_close?: number;
  open_price?: number;
  high_price?: number;
  low_price?: number;
  current_price?: number;
  volume?: number;
  price_change?: number;
  price_change_percent?: number;
  quote_timestamp?: string;
  data_provider?: string;
}

export interface FundamentalData {
  symbol: string;
  pe_ratio?: number;
  market_cap?: number;
  dividend_yield?: number;
  eps?: number;
  fundamental_period?: string;
  fiscal_year?: number;
  fiscal_quarter?: number;
  report_type?: string;
  period_end_date?: string;
  data_provider?: string;
  updated_at?: string;
}

// =====================================================
// PRICE MOVEMENTS TYPES
// =====================================================

export interface PriceMovement {
  symbol: string;
  movement_date: string;
  price_change_percent: number;
  price_change_amount?: number;
  open_price?: number;
  close_price?: number;
  high_price?: number;
  low_price?: number;
  volume?: number;
  movement_type?: string;
  quote_timestamp?: string;
  news_id?: number;
  news_title?: string;
  news_url?: string;
  news_source?: string;
  news_published_at?: string;
  news_sentiment?: number;
  news_relevance?: number;
  time_diff_hours?: number;
}

export interface TopMover {
  symbol: string;
  price_change_percent: number;
  price_change_amount?: number;
  current_price?: number;
  volume?: number;
  movement_type?: string;
  news_count?: number;
  latest_news_title?: string;
  latest_news_sentiment?: number;
  latest_news_url?: string;
}

// =====================================================
// REQUEST TYPES
// =====================================================

export interface EarningsRequest {
  target_date?: string;
}

export interface CompanySearchRequest {
  symbol?: string;
  data_provider?: string;
}

export interface CompanySectorRequest {
  sector?: string;
  industry?: string;
  limit?: number;
  offset?: number;
}

export interface CompanySearchTermRequest {
  search_term: string;
  limit?: number;
}

export interface MarketNewsRequest {
  article_limit?: number;
}

export interface FilteredNewsRequest {
  article_limit?: number;
  source_filter?: string;
  category_filter?: string;
  min_relevance_score?: number;
  days_back?: number;
}

export interface SymbolNewsRequest {
  symbol: string;
  limit?: number;
  offset?: number;
  days_back?: number;
  min_relevance?: number;
  data_provider?: string;
}

export interface NewsStatsRequest {
  symbol: string;
  days_back?: number;
}

export interface NewsSearchRequest {
  symbol: string;
  search_term: string;
  limit?: number;
}

export interface StockQuoteRequest {
  symbol: string;
  quote_date?: string;
  data_provider?: string;
}

export interface FundamentalRequest {
  symbol: string;
  data_provider?: string;
}

export interface PriceMovementRequest {
  symbol?: string;
  days_back?: number;
  min_change_percent?: number;
  limit?: number;
  data_provider?: string;
}

export interface TopMoversRequest {
  limit?: number;
  min_change_percent?: number;
}

// =====================================================
// INDICES DATA TYPES
// =====================================================

export interface HistoricalDataPoint {
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number | null;
  volume: number;
}

export interface HistoricalData {
  [timestamp: string]: HistoricalDataPoint;
}

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap?: number;
  logo?: string;
}

export interface IndexData {
  symbol: string;
  historical: HistoricalDataPoint[];
  quote: QuoteData | null;
  lastUpdated: number;
}

// =====================================================
// MARKET MOVERS TYPES
// =====================================================

export interface MarketMover {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  percent_change?: number;
  changePercent?: number; // Legacy field for backward compatibility
  fetch_timestamp?: string;
  logo?: string; // Add logo field for consistency
}

export interface MarketMoverWithLogo {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  percent_change?: number;
  fetch_timestamp?: string;
  logo?: string;
}

export interface CompanyLogo {
  symbol: string;
  logo?: string;
}

export interface MarketMoversRequest {
  data_date?: string;
  limit?: number;
}

export interface CompanyLogosRequest {
  symbols: string[];
}

export interface EarningsCalendarLogo {
  symbol: string;
  logo?: string;
}

export interface EarningsCalendarLogosRequest {
  symbols: string[];
}

export interface MarketMoversOverview {
  gainers: MarketMoverWithLogo[];
  losers: MarketMoverWithLogo[];
  most_active: MarketMoverWithLogo[];
  data_date: string;
  limit_per_category: number;
  timestamp: string;
}

// =====================================================
// SYMBOL MANAGEMENT TYPES
// =====================================================

export interface SymbolCheckResponse {
  exists: boolean;
  symbol: string;
}

export interface SymbolSaveRequest {
  symbol: string;
}

export interface SymbolSaveResponse {
  success: boolean;
  symbol: string;
  message?: string;
}

// =====================================================
// HEALTH CHECK TYPE
// =====================================================

export interface MarketDataHealth {
  status: string;
  service: string;
  timestamp: string;
  available_endpoints: string[];
}

// =====================================================
// CACHING TYPES
// =====================================================

export interface CacheData {
  id: number;
  symbol: string;
  exchange_id?: number;
  open?: number;
  high?: number;
  low?: number;
  adjclose?: number;
  volume?: number;
  period_start: string;
  period_end: string;
  period_type: string;
  data_provider: string;
  cache_timestamp: string;
  created_at?: string;
  updated_at?: string;
}

export interface CachedSymbolData {
  symbol: string;
  data_points: CacheData[];
  latest_timestamp?: string;
  data_points_count: number;
}

export interface MajorIndicesResponse {
  spy?: CachedSymbolData;
  qqq?: CachedSymbolData;
  dia?: CachedSymbolData;
  vix?: CachedSymbolData;
  timestamp: string;
  total_data_points: number;
}

// =====================================================
// HISTORICAL PRICES TYPES
// =====================================================

export interface HistoricalPrice {
  id: number;
  symbol: string;
  exchange_id?: number;
  timestamp_utc: string;
  date_only: string;
  time_range: string;
  time_interval: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjusted_close?: number;
  dividend?: number;
  split_ratio?: number;
  data_provider: string;
  created_at?: string;
  updated_at?: string;
}

export interface HistoricalPriceSummary {
  time_range: string;
  time_interval: string;
  data_count: number;
  earliest_date: string;
  latest_date: string;
  data_providers: string[];
}

export interface LatestHistoricalPrice {
  timestamp_utc: string;
  time_range: string;
  time_interval: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjusted_close?: number;
  data_provider: string;
}

export interface HistoricalPriceRange {
  timestamp_utc: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adjusted_close?: number;
}

// =====================================================
// HISTORICAL PRICES REQUEST TYPES
// =====================================================

export interface HistoricalPriceRequest {
  symbol: string;
  time_range: string;
  time_interval: string;
  data_provider?: string;
  limit?: number;
}

export interface HistoricalPriceSummaryRequest {
  symbol: string;
}

export interface LatestHistoricalPriceRequest {
  symbol: string;
  limit?: number;
}

export interface HistoricalPriceRangeRequest {
  symbol: string;
  time_range: string;
  time_interval: string;
  start_date: string;
  end_date: string;
  data_provider?: string;
}

export interface SymbolHistoricalOverview {
  symbol: string;
  available_combinations: HistoricalPriceSummary[];
  latest_prices: LatestHistoricalPrice[];
  sample_data: Record<string, HistoricalPrice[]>;
  timestamp: string;
}
