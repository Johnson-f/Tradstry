/**
 * TypeScript types for Journal Operations
 * Provides type safety for trading journal data
 */

export * from './schema';

// Additional utility types
export interface TradeFormData {
  symbol: string;
  assetType: 'STOCK' | 'OPTION';
  tradeType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit?: number;
  commissions?: number;
  numberOfShares: number;
  
  // Options specific
  strikePrice?: number;
  optionType?: 'CALL' | 'PUT';
  expirationDate?: string;
  premium?: number;
  
  // Dates
  entryDate: string;
  exitDate?: string;
  
  // Metadata
  notes?: string;
  tags?: string[];
}

export interface TradeFilters {
  status?: 'open' | 'closed' | 'cancelled';
  assetType?: 'STOCK' | 'OPTION';
  symbol?: string;
  dateFrom?: string;
  dateTo?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface TradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
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
export interface TradeValidation {
  symbol: string;
  entryPrice: number;
  numberOfShares: number;
  stopLoss: number;
  entryDate: string;
}

// Export types for easy imports in components
export type { JournalTrade, NewJournalTrade } from './schema';
