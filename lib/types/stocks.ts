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
  entryDate: string; // ISO datetime
  exitDate?: string | null; // ISO datetime
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  reviewed: boolean;
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
  entryDate: string; // ISO
  reviewed?: boolean;
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
  entryDate?: string;
  exitDate?: string | null;
  reviewed?: boolean;
}


