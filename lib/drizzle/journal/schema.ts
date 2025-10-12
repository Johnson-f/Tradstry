/**
 * Journal Schema for Browser SQLite using Drizzle ORM
 * Separate tables for stocks and options
 */

import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

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

// Stocks table
export const stocksTable = sqliteTable('stocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  tradeType: text('trade_type').notNull().$type<TradeTypeEnum>(),
  orderType: text('order_type').notNull().$type<OrderTypeEnum>(),
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price'),
  stopLoss: real('stop_loss').notNull(),
  commissions: real('commissions').notNull().default(0.00),
  numberShares: real('number_shares').notNull(),
  takeProfit: real('take_profit'),
  entryDate: text('entry_date').notNull(),
  exitDate: text('exit_date'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Options table
export const optionsTable = sqliteTable('options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  strategyType: text('strategy_type').notNull(),
  tradeDirection: text('trade_direction').notNull().$type<TradeDirectionEnum>(),
  numberOfContracts: integer('number_of_contracts').notNull(),
  optionType: text('option_type').notNull().$type<OptionTypeEnum>(),
  strikePrice: real('strike_price').notNull(),
  expirationDate: text('expiration_date').notNull(),
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price'),
  totalPremium: real('total_premium').notNull(),
  commissions: real('commissions').notNull().default(0.00),
  impliedVolatility: real('implied_volatility').notNull(),
  entryDate: text('entry_date').notNull(),
  exitDate: text('exit_date'),
  status: text('status').notNull().default('open').$type<StatusEnum>(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Type inference for inserts and selects
export type Stock = typeof stocksTable.$inferSelect;
export type NewStock = typeof stocksTable.$inferInsert;
export type Option = typeof optionsTable.$inferSelect;
export type NewOption = typeof optionsTable.$inferInsert;

// Union type for both trade types
export type Trade = Stock | Option;
export type NewTrade = NewStock | NewOption;

// Indexes for better performance
export const stocksIndexes = {
  userIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_stocks_user_id ON stocks(user_id)`,
  symbolIndex: sql`CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)`,
  entryDateIndex: sql`CREATE INDEX IF NOT EXISTS idx_stocks_entry_date ON stocks(entry_date)`,
};

export const optionsIndexes = {
  userIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_options_user_id ON options(user_id)`,
  symbolIndex: sql`CREATE INDEX IF NOT EXISTS idx_options_symbol ON options(symbol)`,
  entryDateIndex: sql`CREATE INDEX IF NOT EXISTS idx_options_entry_date ON options(entry_date)`,
  statusIndex: sql`CREATE INDEX IF NOT EXISTS idx_options_status ON options(status)`,
};
