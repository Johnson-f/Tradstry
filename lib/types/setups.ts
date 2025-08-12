// Setup Types
export type SetupCategory = 'Breakout' | 'Pullback' | 'Reversal' | 'Continuation' | 'Range' | 'Other';

export interface SetupBase {
  name: string;
  description?: string;
  category: SetupCategory;
  is_active: boolean;
  tags: string[];
  setup_conditions: Record<string, any>;
}

export interface SetupCreate extends SetupBase {}

export interface SetupUpdate {
  name?: string;
  description?: string;
  category?: SetupCategory;
  is_active?: boolean;
  tags?: string[];
  setup_conditions?: Record<string, any>;
}

export interface SetupInDB extends SetupBase {
  id: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Trade Setup Association Types
export interface TradeSetupBase {
  confidence_rating?: number;
  notes?: string;
}

export interface TradeSetupCreate extends TradeSetupBase {
  stock_id?: number;
  option_id?: number;
  setup_id: number;
}

export interface TradeSetupInDB extends TradeSetupBase {
  id: number;
  stock_id?: number;
  option_id?: number;
  setup_id: number;
  user_id: string;
  created_at: string;
}

// Setup with Trades
export interface SetupWithTrades extends SetupInDB {
  trades: TradeSetupInDB[];
}

// Setup Analytics
export interface SetupAnalytics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_profit_loss: number;
  avg_profit: number;
  avg_loss: number;
  profit_factor: number;
  max_drawdown: number;
  avg_holding_period?: string;
  avg_confidence_rating: number;
  trade_type_distribution: Record<string, number>;
  symbol_distribution: Record<string, number>;
}

// Trade by Setup
export interface TradeBySetup {
  trade_id: number;
  trade_type: 'stock' | 'option';
  symbol: string;
  entry_date: string;
  exit_date?: string;
  entry_price: number;
  exit_price?: number;
  profit_loss?: number;
  return_pct?: number;
  status: 'open' | 'closed';
  confidence_rating?: number;
  notes?: string;
}

// Setup Summary
export interface SetupSummary {
  id: number;
  name: string;
  category: SetupCategory;
  is_active: boolean;
  total_trades: number;
  stock_trades: number;
  option_trades: number;
  closed_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_profit_loss: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  largest_win: number;
  largest_loss: number;
  avg_confidence: number;
  created_at: string;
}

// API Response Types
export interface SetupApiResponse<T = any> {
  data: T;
  message?: string;
  status: number;
}

export interface SetupListResponse {
  setups: SetupInDB[];
  total: number;
  page: number;
  limit: number;
}

export interface SetupTradesResponse {
  trades: TradeBySetup[];
  total: number;
  page: number;
  limit: number;
}

// Setup Trade Association
export interface SetupTradeAssociation {
  setup_id: number;
  setup_name: string;
  setup_category: string;
  confidence_rating?: number;
  notes?: string;
  created_at: string;
} 