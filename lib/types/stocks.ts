export interface Stock {
  id: number;
  symbol: string;
  tradeType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entryPrice: string; // returned as string (DECIMAL)
  exitPrice?: string | null;
  stopLoss: string;
  commissions: string;
  numberShares: string;
  takeProfit?: string | null;
  initialTarget?: string | null;
  profitTarget?: string | null;
  tradeRatings?: number | null; // 1-5 stars
  entryDate: string; // ISO datetime
  exitDate?: string | null; // ISO datetime
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  reviewed: boolean;
  mistakes?: string | null;
  brokerageName?: string | null;
  // Multi-entry/exit trade linking fields
  tradeGroupId?: string | null;
  parentTradeId?: number | null;
  quantity?: string | null; // Transaction quantity (may differ from numberShares for partial fills)
  transactionSequence?: number | null; // Order within trade group (1, 2, 3...)
  isDeleted: boolean; // Soft delete flag
}

export interface CreateStockRequest {
  symbol: string;
  tradeType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entryPrice: number;
  stopLoss: number;
  commissions?: number;
  numberShares: number;
  takeProfit?: number;
  initialTarget?: number;
  profitTarget?: number;
  tradeRatings?: number; // 1-5 stars
  entryDate: string; // ISO
  reviewed?: boolean;
  mistakes?: string;
  brokerageName?: string;
  // Multi-entry/exit trade linking fields
  tradeGroupId?: string;
  parentTradeId?: number;
  quantity?: number;
  transactionSequence?: number;
}

export interface UpdateStockRequest {
  symbol?: string;
  tradeType?: 'BUY' | 'SELL';
  orderType?: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entryPrice?: number;
  exitPrice?: number | null;
  stopLoss?: number;
  commissions?: number;
  numberShares?: number;
  takeProfit?: number | null;
  initialTarget?: number | null;
  profitTarget?: number | null;
  tradeRatings?: number | null; // 1-5 stars
  entryDate?: string;
  exitDate?: string | null;
  reviewed?: boolean;
  mistakes?: string | null;
  brokerageName?: string | null;
  // Multi-entry/exit trade linking fields
  tradeGroupId?: string | null;
  parentTradeId?: number | null;
  quantity?: number | null;
  transactionSequence?: number | null;
}


