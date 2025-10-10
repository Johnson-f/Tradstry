import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Browser Database Schema using Drizzle ORM
 * Mirrors your exact backend database structure
 */

// Stocks table (matches backend exactly)
export const stocks = sqliteTable('stocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  tradeType: text('trade_type').notNull(), // 'BUY' | 'SELL'
  orderType: text('order_type').notNull(), // 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price'),
  stopLoss: real('stop_loss').notNull(),
  commissions: real('commissions').notNull().default(0.00),
  numberShares: real('number_shares').notNull(),
  takeProfit: real('take_profit'),
  entryDate: integer('entry_date', { mode: 'timestamp' }).notNull(),
  exitDate: integer('exit_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  // Sync tracking fields
  syncStatus: text('sync_status').default('synced'), // 'synced' | 'pending' | 'conflict'
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Options table (matches backend exactly)
export const options = sqliteTable('options', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  strategyType: text('strategy_type').notNull(),
  tradeDirection: text('trade_direction').notNull(), // 'Bullish' | 'Bearish' | 'Neutral'
  numberOfContracts: integer('number_of_contracts').notNull(),
  optionType: text('option_type').notNull(), // 'Call' | 'Put'
  strikePrice: real('strike_price').notNull(),
  expirationDate: integer('expiration_date', { mode: 'timestamp' }).notNull(),
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price'),
  totalPremium: real('total_premium').notNull(),
  commissions: real('commissions').notNull().default(0.00),
  impliedVolatility: real('implied_volatility').notNull(),
  entryDate: integer('entry_date', { mode: 'timestamp' }).notNull(),
  exitDate: integer('exit_date', { mode: 'timestamp' }),
  status: text('status').notNull().default('open'), // 'open' | 'closed'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  // Sync tracking fields
  syncStatus: text('sync_status').default('synced'), // 'synced' | 'pending' | 'conflict'
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Sync metadata for tracking changes
export const syncMetadata = sqliteTable('sync_metadata', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  syncVersion: integer('sync_version').default(1),
  pendingChanges: integer('pending_changes').default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Export all tables for use in queries
export const schema = {
  stocks,
  options,
  syncMetadata,
};

export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;

export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;

export type SyncMetadata = typeof syncMetadata.$inferSelect;
export type NewSyncMetadata = typeof syncMetadata.$inferInsert;
