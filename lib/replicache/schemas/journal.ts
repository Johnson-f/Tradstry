/**
 * Journal Schema for Browser SQLite using Drizzle ORM
 * Separate tables for stocks and options
 */

// Types for Replicache journal data

// Enum-like constants
export const TradeType = {
  BUY: 'BUY',
  SELL: 'SELL'
} as const;

export const OrderType = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
  STOP_LIMIT: 'STOP_LIMIT'
} as const;

export const TradeDirection = {
  BULLISH: 'Bullish',
  BEARISH: 'Bearish',
  NEUTRAL: 'Neutral'
} as const;

export const OptionType = {
  CALL: 'Call',
  PUT: 'Put'
} as const;

export const Status = {
  OPEN: 'open',
  CLOSED: 'closed'
} as const;

export type TradeTypeEnum = typeof TradeType[keyof typeof TradeType];
export type OrderTypeEnum = typeof OrderType[keyof typeof OrderType];
export type TradeDirectionEnum = typeof TradeDirection[keyof typeof TradeDirection];
export type OptionTypeEnum = typeof OptionType[keyof typeof OptionType];
export type StatusEnum = typeof Status[keyof typeof Status];

// Type inference for inserts and selects
export type Stock = {
  id: number;
  symbol: string;
  tradeType: TradeTypeEnum;
  orderType: OrderTypeEnum;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  commissions: number;
  numberShares: number;
  takeProfit: number | null;
  entryDate: string;
  exitDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewStock = Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>;

export type Option = {
  id: number;
  symbol: string;
  strategyType: string;
  tradeDirection: TradeDirectionEnum;
  numberOfContracts: number;
  optionType: OptionTypeEnum;
  strikePrice: number;
  expirationDate: string;
  entryPrice: number;
  exitPrice: number | null;
  totalPremium: number;
  commissions: number;
  impliedVolatility: number;
  entryDate: string;
  exitDate: string | null;
  status: StatusEnum;
  createdAt: string;
  updatedAt: string;
};

export type NewOption = Omit<Option, 'id' | 'createdAt' | 'updatedAt'>;

// Union type for both trade types
export type Trade = Stock | Option;
export type NewTrade = NewStock | NewOption;
