/**
 * TypeScript types for Journal Operations
 * Provides type safety for trading journal data
 */

export * from './schema';

// Stock form data type
export interface StockFormData {
  symbol: string;
  tradeType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit?: number;
  commissions?: number;
  numberShares: number;
  entryDate: string;
  exitDate?: string;
}

// Option form data type
export interface OptionFormData {
  symbol: string;
  strategyType: string;
  tradeDirection: 'Bullish' | 'Bearish' | 'Neutral';
  numberOfContracts: number;
  optionType: 'Call' | 'Put';
  strikePrice: number;
  expirationDate: string;
  entryPrice: number;
  exitPrice?: number;
  totalPremium: number;
  commissions?: number;
  impliedVolatility: number;
  entryDate: string;
  exitDate?: string;
  status?: 'open' | 'closed';
}

// Union type for both form data types
export type TradeFormData = StockFormData | OptionFormData;

export interface TradeFilters {
  status?: 'open' | 'closed';
  symbol?: string;
  dateFrom?: string;
  dateTo?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface TradeStats {
  totalStocks: number;
  totalOptions: number;
  openOptions: number;
  closedOptions: number;
  totalTrades: number;
  totalProfit?: number;
  totalLoss?: number;
  winRate?: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'entryDate' | 'symbol' | 'createdAt' | 'exitDate';
  orderDirection?: 'asc' | 'desc';
}

// Utility type for trade calculations
export interface TradeCalculations {
  profitLoss?: number;
  profitLossPercentage?: number;
  daysDuration?: number;
  isWinner?: boolean;
}

// Form validation schemas (can be used with zod later)
export interface StockValidation {
  symbol: string;
  entryPrice: number;
  numberShares: number;
  stopLoss: number;
  entryDate: string;
}

export interface OptionValidation {
  symbol: string;
  entryPrice: number;
  numberOfContracts: number;
  strikePrice: number;
  expirationDate: string;
  entryDate: string;
}

// Export types for easy imports in components
export type { 
  Stock, 
  NewStock, 
  Option, 
  NewOption, 
  Trade, 
  NewTrade,
  TradeTypeEnum,
  OrderTypeEnum,
  TradeDirectionEnum,
  OptionTypeEnum,
  StatusEnum
} from './schema';
