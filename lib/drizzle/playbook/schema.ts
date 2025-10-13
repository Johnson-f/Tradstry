/**
 * Playbook Schema for Browser SQLite using Drizzle ORM
 * Trading setups and their associations with trades
 */

import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Playbook table for trading setups
export const playbookTable = sqliteTable('playbook', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Stock trade playbook junction table
export const stockTradePlaybookTable = sqliteTable('stock_trade_playbook', {
  stockTradeId: integer('stock_trade_id').notNull(),
  setupId: text('setup_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.stockTradeId, table.setupId] }),
}));

// Option trade playbook junction table
export const optionTradePlaybookTable = sqliteTable('option_trade_playbook', {
  optionTradeId: integer('option_trade_id').notNull(),
  setupId: text('setup_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  pk: primaryKey({ columns: [table.optionTradeId, table.setupId] }),
}));

// Type inference for inserts and selects
export type Playbook = typeof playbookTable.$inferSelect;
export type NewPlaybook = typeof playbookTable.$inferInsert;

export type StockTradePlaybook = typeof stockTradePlaybookTable.$inferSelect;
export type NewStockTradePlaybook = typeof stockTradePlaybookTable.$inferInsert;

export type OptionTradePlaybook = typeof optionTradePlaybookTable.$inferSelect;
export type NewOptionTradePlaybook = typeof optionTradePlaybookTable.$inferInsert;

// Indexes for better performance
export const playbookIndexes = {
  updatedAtIndex: sql`CREATE INDEX IF NOT EXISTS idx_playbook_updated_at ON playbook(updated_at)`,
};

export const stockTradePlaybookIndexes = {
  stockTradeIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_stock_trade_playbook_stock_trade_id ON stock_trade_playbook(stock_trade_id)`,
  setupIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_stock_trade_playbook_setup_id ON stock_trade_playbook(setup_id)`,
};

export const optionTradePlaybookIndexes = {
  optionTradeIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_option_trade_playbook_option_trade_id ON option_trade_playbook(option_trade_id)`,
  setupIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_option_trade_playbook_setup_id ON option_trade_playbook(setup_id)`,
};
