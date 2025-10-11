/**
 * Journal Schema for Browser SQLite using Drizzle ORM
 * Based on existing database patterns from Database/01_Tables/
 */

import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Enum-like constants to match your PostgreSQL patterns
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

export const AssetType = {
  STOCK: 'STOCK',
  OPTION: 'OPTION'
} as const;

export type TradeTypeEnum = typeof TradeType[keyof typeof TradeType];
export type OrderTypeEnum = typeof OrderType[keyof typeof OrderType];
export type AssetTypeEnum = typeof AssetType[keyof typeof AssetType];

// Main journal table - combines stocks and options for browser storage
export const journalTable = sqliteTable('journal_trades', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  
  // Basic trade information
  symbol: text('symbol').notNull(),
  assetType: text('asset_type').notNull().$type<AssetTypeEnum>(),
  tradeType: text('trade_type').notNull().$type<TradeTypeEnum>(),
  orderType: text('order_type').notNull().$type<OrderTypeEnum>(),
  
  // Price information
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price'),
  stopLoss: real('stop_loss').notNull(),
  takeProfit: real('take_profit'),
  commissions: real('commissions').notNull().default(0.00),
  
  // Position sizing
  numberOfShares: real('number_of_shares').notNull(),
  
  // Options specific fields (nullable for stocks)
  strikePrice: real('strike_price'),
  optionType: text('option_type'), // 'CALL' | 'PUT'
  expirationDate: text('expiration_date'), // ISO string
  premium: real('premium'),
  
  // Dates
  entryDate: text('entry_date').notNull(), // ISO string
  exitDate: text('exit_date'), // ISO string
  
  // Metadata
  status: text('status').notNull().default('open'), // 'open' | 'closed' | 'cancelled'
  notes: text('notes'),
  tags: text('tags'), // JSON string array
  
  // Timestamps
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Type inference for inserts and selects
export type JournalTrade = typeof journalTable.$inferSelect;
export type NewJournalTrade = typeof journalTable.$inferInsert;

// Indexes for better performance
export const journalIndexes = {
  userIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_journal_user_id ON journal_trades(user_id)`,
  symbolIndex: sql`CREATE INDEX IF NOT EXISTS idx_journal_symbol ON journal_trades(symbol)`,
  entryDateIndex: sql`CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_trades(entry_date)`,
  statusIndex: sql`CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_trades(status)`,
  assetTypeIndex: sql`CREATE INDEX IF NOT EXISTS idx_journal_asset_type ON journal_trades(asset_type)`,
};
