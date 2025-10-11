/**
 * Journal Operations using Drizzle ORM + Browser SQLite
 * Provides CRUD operations for trading journal
 */

import { eq, and, desc, asc, count, sql, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { useBrowserDatabase } from '@/lib/browser-database';
import { journalTable, journalIndexes, type JournalTrade, type NewJournalTrade } from './schema';

/**
 * Hook for journal database operations
 */
export function useJournalDatabase(userId: string) {
  const { isInitialized, isInitializing, error, execute, query, init } = useBrowserDatabase({
    dbName: 'tradistry-journal',
    enablePersistence: true,
    initSql: [
      // Create main table
      `CREATE TABLE IF NOT EXISTS journal_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        trade_type TEXT NOT NULL,
        order_type TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        stop_loss REAL NOT NULL,
        take_profit REAL,
        commissions REAL NOT NULL DEFAULT 0.00,
        number_of_shares REAL NOT NULL,
        strike_price REAL,
        option_type TEXT,
        expiration_date TEXT,
        premium REAL,
        entry_date TEXT NOT NULL,
        exit_date TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        notes TEXT,
        tags TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      
      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_journal_user_id ON journal_trades(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_journal_symbol ON journal_trades(symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_trades(entry_date)`,
      `CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_trades(status)`,
      `CREATE INDEX IF NOT EXISTS idx_journal_asset_type ON journal_trades(asset_type)`,
      
      // Create unique constraint for preventing duplicates
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_unique_position 
       ON journal_trades(user_id, symbol, asset_type, trade_type, entry_price, entry_date)`
    ],
    autoInit: true
  });

  // Create Drizzle instance with SQLite proxy
  const db = drizzle(async (sql, params, method) => {
    try {
      if (method === 'run') {
        const result = await execute(sql, params);
        return { rows: [], meta: {} };
      } else {
        const result = await query(sql, params);
        return { rows: result.values.map(row => 
          result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {})
        )};
      }
    } catch (error) {
      throw error;
    }
  });

  /**
   * Insert a new journal trade
   */
  const insertTrade = async (trade: Omit<NewJournalTrade, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalTrade> => {
    const tradeWithUser = { ...trade, userId };
    
    const sql = `
      INSERT INTO journal_trades (
        user_id, symbol, asset_type, trade_type, order_type,
        entry_price, exit_price, stop_loss, take_profit, commissions,
        number_of_shares, strike_price, option_type, expiration_date,
        premium, entry_date, exit_date, status, notes, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `;
    
    const params = [
      tradeWithUser.userId,
      tradeWithUser.symbol,
      tradeWithUser.assetType,
      tradeWithUser.tradeType,
      tradeWithUser.orderType,
      tradeWithUser.entryPrice,
      tradeWithUser.exitPrice || null,
      tradeWithUser.stopLoss,
      tradeWithUser.takeProfit || null,
      tradeWithUser.commissions || 0.00,
      tradeWithUser.numberOfShares,
      tradeWithUser.strikePrice || null,
      tradeWithUser.optionType || null,
      tradeWithUser.expirationDate || null,
      tradeWithUser.premium || null,
      tradeWithUser.entryDate,
      tradeWithUser.exitDate || null,
      tradeWithUser.status || 'open',
      tradeWithUser.notes || null,
      tradeWithUser.tags || null
    ];

    const result = await query(sql, params);
    if (result.values.length === 0) {
      throw new Error('Failed to insert trade');
    }

    // Convert array result to object
    const row = result.values[0];
    return result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {}) as JournalTrade;
  };

  /**
   * Update an existing trade
   */
  const updateTrade = async (id: number, updates: Partial<Omit<NewJournalTrade, 'id' | 'userId' | 'createdAt'>>): Promise<JournalTrade> => {
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    const sql = `
      UPDATE journal_trades 
      SET ${setClause}, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
      RETURNING *
    `;
    
    const result = await query(sql, [...values, id, userId]);
    if (result.values.length === 0) {
      throw new Error('Trade not found or no permission to update');
    }

    const row = result.values[0];
    return result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {}) as JournalTrade;
  };

  /**
   * Close a trade (set exit price and date)
   */
  const closeTrade = async (id: number, exitPrice: number, exitDate?: string): Promise<JournalTrade> => {
    return updateTrade(id, {
      exitPrice,
      exitDate: exitDate || new Date().toISOString(),
      status: 'closed'
    });
  };

  /**
   * Delete a trade
   */
  const deleteTrade = async (id: number): Promise<boolean> => {
    const result = await execute(
      `DELETE FROM journal_trades WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return result.changes > 0;
  };

  /**
   * Get all trades for the user
   */
  const getAllTrades = async (options?: {
    limit?: number;
    offset?: number;
    orderBy?: 'entryDate' | 'symbol' | 'createdAt';
    orderDirection?: 'asc' | 'desc';
    status?: 'open' | 'closed' | 'cancelled';
    assetType?: 'STOCK' | 'OPTION';
  }): Promise<JournalTrade[]> => {
    const { 
      limit = 100, 
      offset = 0, 
      orderBy = 'entryDate', 
      orderDirection = 'desc',
      status,
      assetType
    } = options || {};

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (assetType) {
      whereClause += ' AND asset_type = ?';
      params.push(assetType);
    }

    const sql = `
      SELECT * FROM journal_trades 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    const result = await query(sql, params);
    return result.values.map(row => 
      result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {})
    ) as JournalTrade[];
  };

  /**
   * Get trades by symbol
   */
  const getTradesBySymbol = async (symbol: string): Promise<JournalTrade[]> => {
    const result = await query(
      `SELECT * FROM journal_trades WHERE user_id = ? AND symbol = ? ORDER BY entry_date DESC`,
      [userId, symbol]
    );
    
    return result.values.map(row => 
      result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {})
    ) as JournalTrade[];
  };

  /**
   * Get single trade by ID
   */
  const getTradeById = async (id: number): Promise<JournalTrade | null> => {
    const result = await query(
      `SELECT * FROM journal_trades WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    return result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {}) as JournalTrade;
  };

  /**
   * Search trades by symbol or notes
   */
  const searchTrades = async (searchTerm: string): Promise<JournalTrade[]> => {
    const result = await query(
      `SELECT * FROM journal_trades 
       WHERE user_id = ? AND (symbol LIKE ? OR notes LIKE ?)
       ORDER BY entry_date DESC`,
      [userId, `%${searchTerm}%`, `%${searchTerm}%`]
    );
    
    return result.values.map(row => 
      result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {})
    ) as JournalTrade[];
  };

  /**
   * Get trading statistics
   */
  const getStats = async () => {
    const totalTradesResult = await query(
      `SELECT COUNT(*) as total FROM journal_trades WHERE user_id = ?`,
      [userId]
    );

    const openTradesResult = await query(
      `SELECT COUNT(*) as open FROM journal_trades WHERE user_id = ? AND status = 'open'`,
      [userId]
    );

    const closedTradesResult = await query(
      `SELECT COUNT(*) as closed FROM journal_trades WHERE user_id = ? AND status = 'closed'`,
      [userId]
    );

    return {
      totalTrades: totalTradesResult.values[0][0] as number,
      openTrades: openTradesResult.values[0][0] as number,
      closedTrades: closedTradesResult.values[0][0] as number,
    };
  };

  /**
   * Upsert trade (insert or update based on unique constraint)
   */
  const upsertTrade = async (trade: Omit<NewJournalTrade, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalTrade> => {
    const tradeWithUser = { ...trade, userId };
    
    const sql = `
      INSERT INTO journal_trades (
        user_id, symbol, asset_type, trade_type, order_type,
        entry_price, exit_price, stop_loss, take_profit, commissions,
        number_of_shares, strike_price, option_type, expiration_date,
        premium, entry_date, exit_date, status, notes, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, symbol, asset_type, trade_type, entry_price, entry_date) DO UPDATE SET
        order_type = excluded.order_type,
        exit_price = excluded.exit_price,
        stop_loss = excluded.stop_loss,
        take_profit = excluded.take_profit,
        commissions = excluded.commissions,
        number_of_shares = excluded.number_of_shares,
        strike_price = excluded.strike_price,
        option_type = excluded.option_type,
        expiration_date = excluded.expiration_date,
        premium = excluded.premium,
        exit_date = excluded.exit_date,
        status = excluded.status,
        notes = excluded.notes,
        tags = excluded.tags,
        updated_at = datetime('now')
      RETURNING *
    `;
    
    const params = [
      tradeWithUser.userId,
      tradeWithUser.symbol,
      tradeWithUser.assetType,
      tradeWithUser.tradeType,
      tradeWithUser.orderType,
      tradeWithUser.entryPrice,
      tradeWithUser.exitPrice || null,
      tradeWithUser.stopLoss,
      tradeWithUser.takeProfit || null,
      tradeWithUser.commissions || 0.00,
      tradeWithUser.numberOfShares,
      tradeWithUser.strikePrice || null,
      tradeWithUser.optionType || null,
      tradeWithUser.expirationDate || null,
      tradeWithUser.premium || null,
      tradeWithUser.entryDate,
      tradeWithUser.exitDate || null,
      tradeWithUser.status || 'open',
      tradeWithUser.notes || null,
      tradeWithUser.tags || null
    ];

    const result = await query(sql, params);
    const row = result.values[0];
    return result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {}) as JournalTrade;
  };

  return {
    // Database state
    isInitialized,
    isInitializing,
    error,
    init,
    
    // CRUD operations
    insertTrade,
    updateTrade,
    closeTrade,
    deleteTrade,
    upsertTrade,
    
    // Query operations
    getAllTrades,
    getTradesBySymbol,
    getTradeById,
    searchTrades,
    getStats,
    
    // Direct database access for custom queries
    execute,
    query,
  };
}
