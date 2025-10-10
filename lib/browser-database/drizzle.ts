'use client';

import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';
import { getBrowserDatabase } from './client';

/**
 * Drizzle ORM Database Instance
 * Provides type-safe database operations on the browser SQLite database
 */
export class DrizzleDatabase {
  private db: ReturnType<typeof drizzle> | null = null;
  private initialized = false;

  /**
   * Initialize Drizzle with libsql client
   */
  async initialize(userId: string): Promise<void> {
    if (this.initialized) return;

    const browserDb = getBrowserDatabase();
    
    // Try to setup cloud sync first, fallback to local-only
    try {
      const config = await browserDb.setupCloudSync(userId);
      await browserDb.initialize(config);
    } catch (error) {
      console.warn('Cloud sync setup failed, using local database:', error);
      await browserDb.initialize({ userId });
    }

    // Create Drizzle instance
    const client = browserDb.getClient();
    this.db = drizzle(client, { schema });

    // Initialize database schema
    await this.initializeSchema();
    
    this.initialized = true;
    console.log('Drizzle database initialized successfully');
  }

  /**
   * Get the Drizzle database instance
   */
  getDb() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Initialize database schema and tables
   */
  private async initializeSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Create all tables if they don't exist
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          first_name TEXT,
          last_name TEXT,
          avatar TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          last_sync_at INTEGER DEFAULT (unixepoch())
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS stock_trades (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          company_name TEXT,
          action TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          price REAL NOT NULL,
          fees REAL DEFAULT 0,
          total_cost REAL NOT NULL,
          trade_date INTEGER NOT NULL,
          notes TEXT,
          tags TEXT,
          image_urls TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          last_sync_at INTEGER DEFAULT (unixepoch()),
          sync_status TEXT DEFAULT 'synced'
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS option_trades (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          underlying_symbol TEXT NOT NULL,
          option_type TEXT NOT NULL,
          action TEXT NOT NULL,
          contracts INTEGER NOT NULL,
          strike_price REAL NOT NULL,
          premium REAL NOT NULL,
          expiration_date INTEGER NOT NULL,
          fees REAL DEFAULT 0,
          total_cost REAL NOT NULL,
          trade_date INTEGER NOT NULL,
          notes TEXT,
          tags TEXT,
          image_urls TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          last_sync_at INTEGER DEFAULT (unixepoch()),
          sync_status TEXT DEFAULT 'synced'
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS portfolio_positions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          company_name TEXT,
          total_shares INTEGER NOT NULL,
          average_cost REAL NOT NULL,
          current_price REAL,
          market_value REAL,
          unrealized_pnl REAL,
          realized_pnl REAL,
          total_pnl REAL,
          percent_change REAL,
          last_updated INTEGER DEFAULT (unixepoch()),
          last_sync_at INTEGER DEFAULT (unixepoch())
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS trading_analytics (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          period TEXT NOT NULL,
          period_start INTEGER NOT NULL,
          period_end INTEGER NOT NULL,
          total_trades INTEGER DEFAULT 0,
          winning_trades INTEGER DEFAULT 0,
          losing_trades INTEGER DEFAULT 0,
          win_rate REAL DEFAULT 0,
          total_pnl REAL DEFAULT 0,
          realized_pnl REAL DEFAULT 0,
          unrealized_pnl REAL DEFAULT 0,
          avg_win_amount REAL DEFAULT 0,
          avg_loss_amount REAL DEFAULT 0,
          portfolio_value REAL DEFAULT 0,
          total_invested REAL DEFAULT 0,
          available_cash REAL DEFAULT 0,
          calculated_at INTEGER DEFAULT (unixepoch()),
          last_sync_at INTEGER DEFAULT (unixepoch())
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS market_data (
          symbol TEXT PRIMARY KEY,
          company_name TEXT,
          current_price REAL,
          change_amount REAL,
          change_percent REAL,
          day_high REAL,
          day_low REAL,
          volume INTEGER,
          market_cap REAL,
          last_updated INTEGER DEFAULT (unixepoch()),
          expires_at INTEGER NOT NULL
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS ai_insights (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          confidence REAL,
          relevance_score REAL,
          is_read INTEGER DEFAULT 0,
          expires_at INTEGER,
          created_at INTEGER DEFAULT (unixepoch()),
          last_sync_at INTEGER DEFAULT (unixepoch())
        )
      `);

      await this.db.run(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          id TEXT PRIMARY KEY,
          table_name TEXT NOT NULL,
          last_sync_at INTEGER DEFAULT (unixepoch()),
          sync_version INTEGER DEFAULT 1,
          pending_changes INTEGER DEFAULT 0,
          last_error TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        )
      `);

      // Create indexes for better performance
      await this.createIndexes();

      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Create database indexes for better query performance
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) return;

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_stock_trades_user_id ON stock_trades(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_stock_trades_symbol ON stock_trades(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_stock_trades_trade_date ON stock_trades(trade_date)',
      'CREATE INDEX IF NOT EXISTS idx_stock_trades_sync_status ON stock_trades(sync_status)',
      
      'CREATE INDEX IF NOT EXISTS idx_option_trades_user_id ON option_trades(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_option_trades_symbol ON option_trades(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_option_trades_trade_date ON option_trades(trade_date)',
      'CREATE INDEX IF NOT EXISTS idx_option_trades_sync_status ON option_trades(sync_status)',
      
      'CREATE INDEX IF NOT EXISTS idx_portfolio_positions_user_id ON portfolio_positions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_portfolio_positions_symbol ON portfolio_positions(symbol)',
      
      'CREATE INDEX IF NOT EXISTS idx_trading_analytics_user_id ON trading_analytics(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_trading_analytics_period ON trading_analytics(period)',
      
      'CREATE INDEX IF NOT EXISTS idx_market_data_expires_at ON market_data(expires_at)',
      
      'CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id ON ai_insights(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(type)',
      'CREATE INDEX IF NOT EXISTS idx_ai_insights_is_read ON ai_insights(is_read)',
    ];

    for (const indexSql of indexes) {
      try {
        await this.db.run(indexSql);
      } catch (error) {
        console.warn('Failed to create index:', indexSql, error);
      }
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      const browserDb = getBrowserDatabase();
      await browserDb.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

// Singleton instance
let drizzleDbInstance: DrizzleDatabase | null = null;

/**
 * Get or create the Drizzle database instance
 */
export function getDrizzleDb(): DrizzleDatabase {
  if (!drizzleDbInstance) {
    drizzleDbInstance = new DrizzleDatabase();
  }
  return drizzleDbInstance;
}
