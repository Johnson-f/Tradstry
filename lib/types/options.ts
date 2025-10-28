export type OptionTradeStatus = 'open' | 'closed';
export type OptionType = 'Call' | 'Put';
export type TradeDirection = 'Bullish' | 'Bearish' | 'Neutral';

export interface OptionTrade {
  id: number;
  symbol: string;
  strategyType: string;
  tradeDirection: TradeDirection;
  numberOfContracts: number;
  optionType: OptionType;
  strikePrice: string; // DECIMAL as string
  expirationDate: string; // ISO
  entryPrice: string; // DECIMAL as string
  exitPrice?: string | null;
  totalPremium: string; // DECIMAL as string
  commissions: string; // DECIMAL as string
  impliedVolatility: string; // DECIMAL as string
  entryDate: string; // ISO
  exitDate?: string | null; // ISO
  status: OptionTradeStatus;
  initialTarget?: string | null;
  profitTarget?: string | null;
  tradeRatings?: number | null; // 1-5 stars
  createdAt: string;
  updatedAt: string;
  reviewed: boolean;
  mistakes?: string | null;
}

export interface CreateOptionRequest {
  symbol: string;
  strategyType: string;
  tradeDirection: TradeDirection;
  numberOfContracts: number;
  optionType: OptionType;
  strikePrice: number;
  expirationDate: string; // ISO
  entryPrice: number;
  totalPremium: number;
  commissions?: number;
  impliedVolatility: number;
  entryDate: string; // ISO
  initialTarget?: number;
  profitTarget?: number;
  tradeRatings?: number; // 1-5 stars
  reviewed?: boolean;
  mistakes?: string;
}

export interface UpdateOptionRequest {
  symbol?: string;
  strategyType?: string;
  tradeDirection?: TradeDirection;
  numberOfContracts?: number;
  optionType?: OptionType;
  strikePrice?: number;
  expirationDate?: string;
  entryPrice?: number;
  exitPrice?: number | null;
  totalPremium?: number;
  commissions?: number;
  impliedVolatility?: number;
  entryDate?: string;
  exitDate?: string | null;
  status?: OptionTradeStatus;
  initialTarget?: number | null;
  profitTarget?: number | null;
  tradeRatings?: number | null; // 1-5 stars
  reviewed?: boolean;
  mistakes?: string | null;
}


