// Base types
export type TradeStatus = 'open' | 'closed';
export type TradeDirection = 'Bullish' | 'Bearish' | 'Neutral';
export type OptionType = 'Call' | 'Put';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type TradeType = 'BUY' | 'SELL';

// Stock Trading Types
export interface StockBase {
  symbol: string;
  trade_type: TradeType;
  order_type: OrderType;
  entry_price: number;
  exit_price?: number;
  stop_loss: number;
  commissions: number;
  number_shares: number;
  take_profit?: number;
  entry_date: string;
  exit_date?: string;
  notes?: string;
  tags?: string[];
  risk_reward_ratio?: number;
  profit_loss?: number;
  profit_loss_percentage?: number;
  status?: TradeStatus;
  sector?: string;
  exchange?: string;
}

export type StockCreate = StockBase;

export interface StockUpdate {
  exit_price?: number;
  exit_date?: string;
  notes?: string;
  tags?: string[];
  status?: TradeStatus;
}

export interface StockInDB extends StockBase {
  id: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// Options Trading Types
export interface OptionBase {
  symbol: string;
  strategy_type: string;
  trade_direction: TradeDirection;
  number_of_contracts: number;
  option_type: OptionType;
  strike_price: number;
  expiration_date: string;
  entry_price: number;
  exit_price?: number;
  total_premium: number;
  commissions: number;
  implied_volatility: number;
  entry_date: string;
  exit_date?: string;
  notes?: string;
  tags?: string[];
  probability_of_profit?: number;
  max_profit?: number;
  max_loss?: number;
  status?: TradeStatus;
  underlying_price?: number;
  delta?: number;
  theta?: number;
  vega?: number;
  gamma?: number;
}

export type OptionCreate = OptionBase;

export interface OptionUpdate {
  exit_price?: number;
  exit_date?: string;
  notes?: string;
  tags?: string[];
  status?: TradeStatus;
}

export interface OptionInDB extends OptionBase {
  id: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  status: number;
}

export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}

// Filter Types
export interface StockFilters {
  status?: TradeStatus;
  symbol?: string;
  start_date?: string;
  end_date?: string;
  trade_type?: TradeType;
  sector?: string;
}

export interface OptionFilters {
  status?: TradeStatus;
  symbol?: string;
  strategy_type?: string;
  option_type?: OptionType;
  expiration_date?: string;
  start_date?: string;
  end_date?: string;
  trade_direction?: TradeDirection;
}

// Statistics Types
export interface TradingStats {
  total_trades: number;
  open_trades: number;
  closed_trades: number;
  total_profit_loss: number;
  win_rate: number;
  average_win: number;
  average_loss: number;
  largest_win: number;
  largest_loss: number;
  profit_factor: number;
}

// User Types
export interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  access_token?: string;
}

// Health Check Type
export interface HealthCheck {
  status: string;
  version: string;
}
