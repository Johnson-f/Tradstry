import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

/**
 * Browser Database Schema using Drizzle ORM
 * This mirrors your cloud database structure for local caching
 */

// Users table (cached user info)
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  avatar: text('avatar'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Stock trades table
export const stockTrades = sqliteTable('stock_trades', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  companyName: text('company_name'),
  action: text('action').notNull(), // 'buy' | 'sell'
  quantity: integer('quantity').notNull(),
  price: real('price').notNull(),
  fees: real('fees').default(0),
  totalCost: real('total_cost').notNull(),
  tradeDate: integer('trade_date', { mode: 'timestamp' }).notNull(),
  notes: text('notes'),
  tags: text('tags'), // JSON string array
  imageUrls: text('image_urls'), // JSON string array
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  syncStatus: text('sync_status').default('synced'), // 'synced' | 'pending' | 'conflict'
});

// Option trades table
export const optionTrades = sqliteTable('option_trades', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  underlyingSymbol: text('underlying_symbol').notNull(),
  optionType: text('option_type').notNull(), // 'call' | 'put'
  action: text('action').notNull(), // 'buy_to_open' | 'sell_to_close' etc.
  contracts: integer('contracts').notNull(),
  strikePrice: real('strike_price').notNull(),
  premium: real('premium').notNull(),
  expirationDate: integer('expiration_date', { mode: 'timestamp' }).notNull(),
  fees: real('fees').default(0),
  totalCost: real('total_cost').notNull(),
  tradeDate: integer('trade_date', { mode: 'timestamp' }).notNull(),
  notes: text('notes'),
  tags: text('tags'), // JSON string array
  imageUrls: text('image_urls'), // JSON string array
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  syncStatus: text('sync_status').default('synced'), // 'synced' | 'pending' | 'conflict'
});

// Portfolio positions (aggregated view)
export const portfolioPositions = sqliteTable('portfolio_positions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  companyName: text('company_name'),
  totalShares: integer('total_shares').notNull(),
  averageCost: real('average_cost').notNull(),
  currentPrice: real('current_price'),
  marketValue: real('market_value'),
  unrealizedPnl: real('unrealized_pnl'),
  realizedPnl: real('realized_pnl'),
  totalPnl: real('total_pnl'),
  percentChange: real('percent_change'),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Trading analytics (cached calculations)
export const tradingAnalytics = sqliteTable('trading_analytics', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  period: text('period').notNull(), // 'daily', 'weekly', 'monthly', 'yearly', 'all_time'
  periodStart: integer('period_start', { mode: 'timestamp' }).notNull(),
  periodEnd: integer('period_end', { mode: 'timestamp' }).notNull(),
  
  // Performance metrics
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  losingTrades: integer('losing_trades').default(0),
  winRate: real('win_rate').default(0),
  
  // P&L metrics
  totalPnl: real('total_pnl').default(0),
  realizedPnl: real('realized_pnl').default(0),
  unrealizedPnl: real('unrealized_pnl').default(0),
  avgWinAmount: real('avg_win_amount').default(0),
  avgLossAmount: real('avg_loss_amount').default(0),
  
  // Portfolio metrics
  portfolioValue: real('portfolio_value').default(0),
  totalInvested: real('total_invested').default(0),
  availableCash: real('available_cash').default(0),
  
  calculatedAt: integer('calculated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// Market data cache
export const marketData = sqliteTable('market_data', {
  symbol: text('symbol').primaryKey(),
  companyName: text('company_name'),
  currentPrice: real('current_price'),
  changeAmount: real('change_amount'),
  changePercent: real('change_percent'),
  dayHigh: real('day_high'),
  dayLow: real('day_low'),
  volume: integer('volume'),
  marketCap: real('market_cap'),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// AI insights cache
export const aiInsights = sqliteTable('ai_insights', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'portfolio_analysis', 'trade_suggestion', 'market_insight'
  title: text('title').notNull(),
  content: text('content').notNull(), // JSON string
  confidence: real('confidence'), // 0-1 confidence score
  relevanceScore: real('relevance_score'), // 0-1 relevance score
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
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
  users,
  stockTrades,
  optionTrades,
  portfolioPositions,
  tradingAnalytics,
  marketData,
  aiInsights,
  syncMetadata,
};

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type StockTrade = typeof stockTrades.$inferSelect;
export type NewStockTrade = typeof stockTrades.$inferInsert;

export type OptionTrade = typeof optionTrades.$inferSelect;
export type NewOptionTrade = typeof optionTrades.$inferInsert;

export type PortfolioPosition = typeof portfolioPositions.$inferSelect;
export type NewPortfolioPosition = typeof portfolioPositions.$inferInsert;

export type TradingAnalytics = typeof tradingAnalytics.$inferSelect;
export type NewTradingAnalytics = typeof tradingAnalytics.$inferInsert;

export type MarketData = typeof marketData.$inferSelect;
export type NewMarketData = typeof marketData.$inferInsert;

export type AiInsight = typeof aiInsights.$inferSelect;
export type NewAiInsight = typeof aiInsights.$inferInsert;

export type SyncMetadata = typeof syncMetadata.$inferSelect;
export type NewSyncMetadata = typeof syncMetadata.$inferInsert;
