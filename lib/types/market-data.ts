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
export interface StockQuote {
  symbol: string;
  quote_date: string;
  previous_close?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adj_close?: number;
  data_provider?: string;
}

export interface StockQuoteWithPrices {
  // Database metadata
  symbol: string;
  quote_date: string;
  previous_close?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  adj_close?: number;
  data_provider?: string;
  // Real-time price data from finance-query API
  name?: string;
  price?: number;
  after_hours_price?: number;
  change?: number;
  percent_change?: string;
  logo?: string;
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
  changePercent?: number;
  logo?: string;
}

export interface MarketMoverWithPrices {
  symbol: string;
  name?: string;
  rank_position?: number;
  // Real-time price data from finance-query API
  price?: number;
  after_hours_price?: number;
  change?: number;
  percent_change?: string;
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

// =====================================================
// SYMBOL SEARCH TYPES
// =====================================================

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  currency?: string;
  marketCap?: number;
  sector?: string;
}

export interface SymbolSearchResponse {
  results: SymbolSearchResult[];
  total: number;
}

export interface SymbolSearchRequest {
  query: string;
  yahoo?: boolean;
  limit?: number;
}

// =====================================================
// QUOTES TYPES
// =====================================================

export interface QuoteRequest {
  symbols: string[];
}

export interface QuoteResult {
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

export interface QuoteResponse {
  quotes: QuoteResult[];
}

// =====================================================
// WATCHLIST TYPES
// =====================================================

export interface Watchlist {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  company_name?: string;
  price?: number;
  percent_change?: number;
  added_at: string;
}

export interface WatchlistWithItems {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  items: WatchlistItem[];
}

export interface WatchlistItemWithPrices {
  // Database metadata
  id: number;
  symbol: string;
  company_name?: string;
  added_at: string;
  updated_at?: string;
  // Real-time price data from finance-query API
  name?: string;
  price?: number;
  after_hours_price?: number;
  change?: number;
  percent_change?: string;
  logo?: string;
}

export interface WatchlistWithItemsAndPrices {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  items: WatchlistItemWithPrices[];
}

// =====================================================
// WATCHLIST REQUEST TYPES
// =====================================================

export interface CreateWatchlistRequest {
  name: string;
}

export interface AddWatchlistItemRequest {
  watchlist_id: number;
  symbol: string;
  company_name?: string;
  price?: number;
  percent_change?: number;
}

export interface DeleteWatchlistItemRequest {
  item_id?: number;
  watchlist_id?: number;
  symbol?: string;
}

// =====================================================
// WATCHLIST RESPONSE TYPES
// =====================================================

export interface WatchlistResponse {
  success: boolean;
  message: string;
  watchlist_id?: number;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
  deleted_count?: number;
}

// =====================================================
// STOCK PEERS TYPES
// =====================================================

export interface StockPeer {
  peer_symbol: string;
  peer_name?: string;
  price?: number;
  change?: number;
  percent_change?: number;
  logo?: string;
  fetch_timestamp?: string;
}

export interface StockPeerWithPrices {
  // Database metadata
  peer_symbol: string;
  peer_name?: string;
  logo?: string;
  fetch_timestamp?: string;
  // Real-time price data from finance-query API
  name?: string;
  price?: number;
  after_hours_price?: number;
  change?: number;
  percent_change?: string;
}

export interface PeerComparison {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  percent_change?: number;
  logo?: string;
  is_main_stock: boolean;
  peer_rank?: number;
}

export interface StockPeersRequest {
  symbol: string;
  data_date?: string;
  limit?: number;
}

export interface PeersPaginatedRequest {
  symbol: string;
  data_date?: string;
  offset?: number;
  limit?: number;
  sort_column?: string;
  sort_direction?: string;
}

// =====================================================
// FINANCIAL STATEMENTS TYPES
// =====================================================

export interface FinancialStatementRequest {
  symbol: string;
  frequency: 'annual' | 'quarterly';
  limit?: number;
}

export interface KeyStatsRequest {
  symbol: string;
  frequency?: 'annual' | 'quarterly';
}

export interface KeyStats {
  market_cap?: number;
  cash_and_cash_equivalents?: number;
  total_debt?: number;
  enterprise_value?: number;
  revenue?: number;
  gross_profit?: number;
  ebitda?: number;
  net_income_common_stockholders?: number;
  diluted_eps?: number;
  operating_cash_flow?: number;
  capital_expenditure?: number;
  free_cash_flow?: number;
}

export interface IncomeStatement {
  symbol: string;
  frequency: string;
  fiscal_date: string;
  total_revenue?: number;
  operating_revenue?: number;
  cost_of_revenue?: number;
  gross_profit?: number;
  reconciled_cost_of_revenue?: number;
  operating_expense?: number;
  selling_general_and_administrative?: number;
  research_and_development?: number;
  total_expenses?: number;
  reconciled_depreciation?: number;
  operating_income?: number;
  total_operating_income_as_reported?: number;
  net_non_operating_interest_income_expense?: number;
  non_operating_interest_income?: number;
  non_operating_interest_expense?: number;
  other_income_expense?: number;
  other_non_operating_income_expenses?: number;
  pretax_income?: number;
  net_income_common_stockholders?: number;
  net_income_attributable_to_parent_shareholders?: number;
  net_income_including_non_controlling_interests?: number;
  net_income_continuous_operations?: number;
  diluted_ni_available_to_common_stockholders?: number;
  net_income_from_continuing_discontinued_operation?: number;
  net_income_from_continuing_operation_net_minority_interest?: number;
  normalized_income?: number;
  interest_income?: number;
  interest_expense?: number;
  net_interest_income?: number;
  basic_eps?: number;
  diluted_eps?: number;
  basic_average_shares?: number;
  diluted_average_shares?: number;
  ebit?: number;
  ebitda?: number;
  normalized_ebitda?: number;
  tax_provision?: number;
  tax_rate_for_calcs?: number;
  tax_effect_of_unusual_items?: number;
  data_provider?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BalanceSheet {
  symbol: string;
  frequency: string;
  fiscal_date: string;
  total_assets?: number;
  total_current_assets?: number;
  cash_cash_equivalents_and_short_term_investments?: number;
  cash_and_cash_equivalents?: number;
  cash?: number;
  cash_equivalents?: number;
  other_short_term_investments?: number;
  receivables?: number;
  accounts_receivable?: number;
  other_receivables?: number;
  inventory?: number;
  other_current_assets?: number;
  total_non_current_assets?: number;
  net_ppe?: number;
  gross_ppe?: number;
  properties?: number;
  land_and_improvements?: number;
  machinery_furniture_equipment?: number;
  other_properties?: number;
  leases?: number;
  accumulated_depreciation?: number;
  investments_and_advances?: number;
  investment_in_financial_assets?: number;
  available_for_sale_securities?: number;
  other_investments?: number;
  non_current_deferred_assets?: number;
  non_current_deferred_taxes_assets?: number;
  other_non_current_assets?: number;
  net_tangible_assets?: number;
  tangible_book_value?: number;
  total_liabilities?: number;
  total_current_liabilities?: number;
  payables_and_accrued_expenses?: number;
  payables?: number;
  accounts_payable?: number;
  total_tax_payable?: number;
  income_tax_payable?: number;
  current_debt_and_capital_lease_obligation?: number;
  current_debt?: number;
  commercial_paper?: number;
  other_current_borrowings?: number;
  current_capital_lease_obligation?: number;
  current_deferred_liabilities?: number;
  current_deferred_revenue?: number;
  other_current_liabilities?: number;
  total_non_current_liabilities?: number;
  long_term_debt_and_capital_lease_obligation?: number;
  long_term_debt?: number;
  long_term_capital_lease_obligation?: number;
  trade_and_other_payables_non_current?: number;
  other_non_current_liabilities?: number;
  capital_lease_obligations?: number;
  total_debt?: number;
  net_debt?: number;
  total_equity?: number;
  stockholders_equity?: number;
  capital_stock?: number;
  common_stock?: number;
  retained_earnings?: number;
  gains_losses_not_affecting_retained_earnings?: number;
  other_equity_adjustments?: number;
  common_stock_equity?: number;
  shares_issued?: number;
  ordinary_shares_number?: number;
  treasury_shares_number?: number;
  working_capital?: number;
  invested_capital?: number;
  total_capitalization?: number;
  data_provider?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CashFlow {
  symbol: string;
  frequency: string;
  fiscal_date: string;
  operating_cash_flow?: number;
  net_income_from_continuing_operations?: number;
  depreciation_and_amortization?: number;
  deferred_income_tax?: number;
  stock_based_compensation?: number;
  other_non_cash_items?: number;
  change_in_working_capital?: number;
  change_in_receivables?: number;
  change_in_inventory?: number;
  change_in_payables_and_accrued_expense?: number;
  change_in_other_current_assets?: number;
  change_in_other_current_liabilities?: number;
  change_in_other_working_capital?: number;
  investing_cash_flow?: number;
  net_investment_purchase_and_sale?: number;
  purchase_of_investment?: number;
  sale_of_investment?: number;
  net_ppe_purchase_and_sale?: number;
  purchase_of_ppe?: number;
  net_business_purchase_and_sale?: number;
  purchase_of_business?: number;
  net_other_investing_changes?: number;
  capital_expenditure?: number;
  financing_cash_flow?: number;
  net_issuance_payments_of_debt?: number;
  net_long_term_debt_issuance?: number;
  long_term_debt_issuance?: number;
  long_term_debt_payments?: number;
  net_short_term_debt_issuance?: number;
  short_term_debt_issuance?: number;
  short_term_debt_payments?: number;
  net_common_stock_issuance?: number;
  common_stock_issuance?: number;
  common_stock_payments?: number;
  cash_dividends_paid?: number;
  net_other_financing_charges?: number;
  issuance_of_capital_stock?: number;
  issuance_of_debt?: number;
  repayment_of_debt?: number;
  repurchase_of_capital_stock?: number;
  end_cash_position?: number;
  changes_in_cash?: number;
  beginning_cash_position?: number;
  free_cash_flow?: number;
  income_tax_paid_supplemental_data?: number;
  interest_paid_supplemental_data?: number;
  data_provider?: string;
  created_at?: string;
  updated_at?: string;
}

// =====================================================
// ENHANCED CACHE TYPES
// =====================================================

export interface HistoricalDataRequest {
  symbols: string[];
  range_param?: string;
  interval?: string;
}

export interface HistoricalDataResponse {
  success: boolean;
  message: string;
  requested_symbols: string[];
  total_symbols: number;
  processed_symbols: number;
  failed_symbols: number;
  failed_symbol_list: string[];
  fetched_data_points: number;
  range: string;
  interval: string;
  data: Record<string, any>;
}

export interface SingleSymbolDataRequest {
  symbol: string;
  range_param?: string;
  interval?: string;
}
