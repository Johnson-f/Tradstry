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
  createdAt: string;
  updatedAt: string;
  reviewed: boolean;
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
  reviewed?: boolean;
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
  reviewed?: boolean;
}


