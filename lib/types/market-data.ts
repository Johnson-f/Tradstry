// =====================================================
// Market Engine Types (from backend/src/service/market_engine)
// =====================================================

/**
 * Health status response
 */
export interface HealthStatus {
  status: string;
}

/**
 * Market hours information
 */
export interface MarketHours {
  status: string;
  reason?: string | null;
  timestamp: string;
}

/**
 * Quote data for a symbol (detailed)
 */
export interface Quote {
  symbol: string;
  name?: string | null;
  price?: string | null;
  afterHoursPrice?: string | null;
  change?: string | null;
  percentChange?: string | null;
  open?: string | null;
  high?: string | null;
  low?: string | null;
  yearHigh?: string | null;
  yearLow?: string | null;
  volume?: number | null;
  avgVolume?: number | null;
  marketCap?: string | null;
  beta?: string | null;
  pe?: string | null;
  earningsDate?: string | null;
  sector?: string | null;
  industry?: string | null;
  about?: string | null;
  employees?: string | null;
  fiveDaysReturn?: string | null;
  oneMonthReturn?: string | null;
  threeMonthReturn?: string | null;
  sixMonthReturn?: string | null;
  ytdReturn?: string | null;
  yearReturn?: string | null;
  threeYearReturn?: string | null;
  fiveYearReturn?: string | null;
  tenYearReturn?: string | null;
  maxReturn?: string | null;
  logo?: string | null;
}

/**
 * Simple quote data (summary)
 */
export interface SimpleQuote {
  symbol: string;
  name?: string | null;
  price?: string | null;
  afterHoursPrice?: string | null;
  change?: string | null;
  percentChange?: string | null;
  logo?: string | null;
}

// Logo URL for a symbol
export type LogoUrl = string | null;

/**
 * Candle data for historical prices
 */
export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number | null;
  volume?: number | null;
}

/**
 * Historical data response
 */
export interface HistoricalResponse {
  symbol: string;
  interval?: string | null;
  candles: Candle[];
}

/**
 * Market mover item (gainer, loser, or most active)
 */
export interface MoverItem {
  symbol: string;
  name?: string | null;
  price?: string | null;
  change?: string | null;
  percentChange?: string | null;
}

/**
 * Market movers response
 */
export interface MoversResponse {
  gainers: MoverItem[];
  losers: MoverItem[];
  mostActive: MoverItem[];
}

/**
 * News item
 */
export interface NewsItem {
  symbol?: string | null;
  title: string;
  link: string;
  source?: string | null;
  img?: string | null;
  time: string;
}

/**
 * Index item
 */
export interface IndexItem {
  name: string;
  price?: string | null;
  change?: string | null;
  percentChange?: string | null;
}

/**
 * Sector performance item
 */
export interface SectorPerformanceItem {
  sector: string;
  dayReturn?: string | null;
  ytdReturn?: string | null;
  yearReturn?: string | null;
  threeYearReturn?: string | null;
  fiveYearReturn?: string | null;
}

/**
 * Search result item
 */
export interface SearchItem {
  symbol: string;
  name?: string | null;
  type?: string | null;
  exchange?: string | null;
}

/**
 * Indicator data point
 */
export interface IndicatorPoint {
  time: string;
  value: number;
}

/**
 * Indicator series response
 */
export interface IndicatorSeries {
  symbol: string;
  indicator: string;
  interval?: string | null;
  values: IndicatorPoint[];
}

/**
 * WebSocket quote update (for real-time streaming)
 */
export interface QuoteUpdate {
  symbol: string;
  name: string;
  price: string;
  preMarketPrice?: string | null;
  afterHoursPrice?: string | null;
  change: string | number;
  percentChange: string | number;
  logo?: string | null;
}

// =====================================================
// Request Types
// =====================================================

/**
 * Request parameters for getting quotes
 */
export interface GetQuotesRequest {
  symbols?: string[];
}

/**
 * Request parameters for searching symbols
 */
export interface SearchRequest {
  q: string;
  hits?: number;
  yahoo?: boolean;
}

/**
 * Request parameters for getting historical data
 */
export interface GetHistoricalRequest {
  symbol: string;
  range?: string;
  interval?: string;
}

/**
 * Request parameters for getting news
 */
export interface GetNewsRequest {
  symbol?: string;
  limit?: number;
}

/**
 * Request parameters for getting indicators
 */
export interface GetIndicatorRequest {
  symbol: string;
  indicator: string;
  interval?: string;
}

/**
 * Request parameters for subscription
 */
export interface SubscribeRequest {
  symbols: string[];
}

/**
 * Request parameters for unsubscription
 */
export interface UnsubscribeRequest {
  symbols: string[];
}

/**
 * Request parameters for getting financials
 */
export interface GetFinancialsRequest {
  symbol: string;
  statement?: string;
  frequency?: string;
}

/**
 * Financial statement row
 */
export interface FinancialStatementRow {
  Breakdown: string;
  [period: string]: string | number;
}

/**
 * Financial statement response
 */
export interface FinancialsResponse {
  symbol: string;
  statement_type: string;
  frequency: string;
  statement: {
    [key: string]: FinancialStatementRow;
  };
}

/**
 * Earnings transcript
 */
export interface EarningsTranscript {
  symbol: string;
  quarter: string;
  year: number;
  date: string;
  transcript: string;
  participants: string[];
  metadata: {
    source: string;
    retrieved_at: string;
    transcripts_id: number;
  };
}

/**
 * Earnings transcript response
 */
export interface EarningsTranscriptResponse {
  symbol: string;
  transcripts: EarningsTranscript[];
  metadata: {
    total_transcripts: number;
    filters_applied: {
      quarter: string;
      year: number;
    };
    retrieved_at: string;
  };
}

/**
 * Request parameters for getting earnings transcript
 */
export interface GetEarningsTranscriptRequest {
  symbol: string;
  quarter?: string;
  year?: number;
}

/**
 * Institutional holder
 */
export interface InstitutionalHolder {
  holder: string;
  shares: number;
  date_reported: string;
  percent_out?: number | null;
  value: number;
}

/**
 * Mutual fund holder
 */
export interface MutualFundHolder {
  holder: string;
  shares: number;
  date_reported: string;
  percent_out?: number | null;
  value: number;
}

/**
 * Insider transaction
 */
export interface InsiderTransaction {
  insider: string;
  transaction_type: string;
  shares: number;
  price?: number | null;
  date: string;
  value?: number | null;
}

/**
 * Holders response
 */
export interface HoldersResponse {
  symbol: string;
  holder_type: string;
  major_breakdown?: unknown | null;
  institutional_holders?: InstitutionalHolder[] | null;
  mutualfund_holders?: MutualFundHolder[] | null;
  insider_transactions?: InsiderTransaction[] | null;
  insider_purchases?: InsiderTransaction[] | null;
  insider_roster?: unknown[] | null;
}

/**
 * Request parameters for getting holders
 */
export interface GetHoldersRequest {
  symbol: string;
  holder_type?: string;
}
