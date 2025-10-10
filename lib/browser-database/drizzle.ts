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
      // Create stocks table (matches backend exactly)
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS stocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
          order_type TEXT NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')),
          entry_price REAL NOT NULL,
          exit_price REAL,
          stop_loss REAL NOT NULL,
          commissions REAL NOT NULL DEFAULT 0.00,
          number_shares REAL NOT NULL,
          take_profit REAL,
          entry_date INTEGER NOT NULL,
          exit_date INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          sync_status TEXT DEFAULT 'synced',
          last_sync_at INTEGER DEFAULT (unixepoch())
        )
      `);

      // Create options table (matches backend exactly)
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS options (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          strategy_type TEXT NOT NULL,
          trade_direction TEXT NOT NULL CHECK (trade_direction IN ('Bullish', 'Bearish', 'Neutral')),
          number_of_contracts INTEGER NOT NULL CHECK (number_of_contracts > 0),
          option_type TEXT NOT NULL CHECK (option_type IN ('Call', 'Put')),
          strike_price REAL NOT NULL,
          expiration_date INTEGER NOT NULL,
          entry_price REAL NOT NULL,
          exit_price REAL,
          total_premium REAL NOT NULL,
          commissions REAL NOT NULL DEFAULT 0.00,
          implied_volatility REAL NOT NULL,
          entry_date INTEGER NOT NULL,
          exit_date INTEGER,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          sync_status TEXT DEFAULT 'synced',
          last_sync_at INTEGER DEFAULT (unixepoch())
        )
      `);

      // Create sync metadata table for tracking changes
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
      // Stocks table indexes
      'CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_stocks_entry_date ON stocks(entry_date)',
      'CREATE INDEX IF NOT EXISTS idx_stocks_trade_type ON stocks(trade_type)',
      'CREATE INDEX IF NOT EXISTS idx_stocks_sync_status ON stocks(sync_status)',
      
      // Options table indexes
      'CREATE INDEX IF NOT EXISTS idx_options_symbol ON options(symbol)',
      'CREATE INDEX IF NOT EXISTS idx_options_entry_date ON options(entry_date)',
      'CREATE INDEX IF NOT EXISTS idx_options_expiration_date ON options(expiration_date)',
      'CREATE INDEX IF NOT EXISTS idx_options_status ON options(status)',
      'CREATE INDEX IF NOT EXISTS idx_options_sync_status ON options(sync_status)',
      
      // Sync metadata indexes
      'CREATE INDEX IF NOT EXISTS idx_sync_metadata_table_name ON sync_metadata(table_name)',
      'CREATE INDEX IF NOT EXISTS idx_sync_metadata_pending_changes ON sync_metadata(pending_changes)',
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
