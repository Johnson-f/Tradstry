/**
 * Journal Operations using Drizzle ORM + Browser SQLite
 * Provides CRUD operations for trading journal
 */

import { eq, and, desc, asc, count, sql, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { useCallback } from 'react';
import { useBrowserDatabase } from '@/lib/browser-database';
import { 
  stocksTable, 
  optionsTable, 
  stocksIndexes, 
  optionsIndexes, 
  type Stock, 
  type NewStock, 
  type Option, 
  type NewOption,
  type Trade,
  type NewTrade
} from './schema';

// Helper function to convert snake_case to camelCase
const snakeToCamel = (s: string) => s.replace(/([-_][a-z])/ig, ($1) => {
  return $1.toUpperCase()
    .replace('-', '')
    .replace('_', '');
});

/**
 * Hook for journal database operations
 */
export function useJournalDatabase(userId: string) {
  const { isInitialized, isInitializing, error, execute, query, init } = useBrowserDatabase({
    dbName: 'tradistry-journal',
    enablePersistence: true,
    initSql: [
      // Create stocks table
      `CREATE TABLE IF NOT EXISTS stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
        order_type TEXT NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')),
        entry_price REAL NOT NULL,
        exit_price REAL,
        stop_loss REAL NOT NULL,
        commissions REAL NOT NULL DEFAULT 0.00,
        number_shares REAL NOT NULL,
        take_profit REAL,
        entry_date TEXT NOT NULL,
        exit_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      
      // Create options table
      `CREATE TABLE IF NOT EXISTS options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        strategy_type TEXT NOT NULL,
        trade_direction TEXT NOT NULL CHECK (trade_direction IN ('Bullish', 'Bearish', 'Neutral')),
        number_of_contracts INTEGER NOT NULL CHECK (number_of_contracts > 0),
        option_type TEXT NOT NULL CHECK (option_type IN ('Call', 'Put')),
        strike_price REAL NOT NULL,
        expiration_date TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        total_premium REAL NOT NULL,
        commissions REAL NOT NULL DEFAULT 0.00,
        implied_volatility REAL NOT NULL,
        entry_date TEXT NOT NULL,
        exit_date TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      
      // Create stocks indexes
      `CREATE INDEX IF NOT EXISTS idx_stocks_user_id ON stocks(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_stocks_entry_date ON stocks(entry_date)`,
      
      // Create options indexes
      `CREATE INDEX IF NOT EXISTS idx_options_user_id ON options(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_options_symbol ON options(symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_options_entry_date ON options(entry_date)`,
      `CREATE INDEX IF NOT EXISTS idx_options_status ON options(status)`
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
   * Insert a new stock trade
   */
  const insertStock = useCallback(async (stock: Omit<NewStock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Stock> => {
    const sql = `
      INSERT INTO stocks (
        user_id, symbol, trade_type, order_type, entry_price, exit_price,
        stop_loss, commissions, number_shares, take_profit, entry_date, exit_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `;
    
    const params = [
      userId,
      stock.symbol,
      stock.tradeType,
      stock.orderType,
      stock.entryPrice,
      stock.exitPrice || null,
      stock.stopLoss,
      stock.commissions || 0.00,
      stock.numberShares,
      stock.takeProfit || null,
      stock.entryDate,
      stock.exitDate || null
    ];

    const result = await query(sql, params);
    if (result.values.length === 0) {
      throw new Error('Failed to insert stock');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Stock;
  }, [userId, query]);

  /**
   * Insert a new option trade
   */
  const insertOption = useCallback(async (option: Omit<NewOption, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Option> => {
    const sql = `
      INSERT INTO options (
        user_id, symbol, strategy_type, trade_direction, number_of_contracts,
        option_type, strike_price, expiration_date, entry_price, exit_price,
        total_premium, commissions, implied_volatility, entry_date, exit_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `;
    
    const params = [
      userId,
      option.symbol,
      option.strategyType,
      option.tradeDirection,
      option.numberOfContracts,
      option.optionType,
      option.strikePrice,
      option.expirationDate,
      option.entryPrice,
      option.exitPrice || null,
      option.totalPremium,
      option.commissions || 0.00,
      option.impliedVolatility,
      option.entryDate,
      option.exitDate || null,
      option.status || 'open'
    ];

    const result = await query(sql, params);
    if (result.values.length === 0) {
      throw new Error('Failed to insert option');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Option;
  }, [userId, query]);

  /**
   * Update an existing stock trade
   */
  const updateStock = useCallback(async (id: number, updates: Partial<Omit<NewStock, 'id' | 'userId' | 'createdAt'>>): Promise<Stock> => {
    // Map camelCase field names to snake_case column names
    const fieldToColumnMap: Record<string, string> = {
      symbol: 'symbol',
      tradeType: 'trade_type',
      orderType: 'order_type',
      entryPrice: 'entry_price',
      exitPrice: 'exit_price',
      stopLoss: 'stop_loss',
      commissions: 'commissions',
      numberShares: 'number_shares',
      takeProfit: 'take_profit',
      entryDate: 'entry_date',
      exitDate: 'exit_date',
    };

    const setClause = Object.keys(updates)
      .map(key => `${fieldToColumnMap[key] || key} = ?`)
      .join(', ');
    const values = Object.values(updates);
    
    const sql = `
      UPDATE stocks 
      SET ${setClause}, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
      RETURNING *
    `;
    
    const result = await query(sql, [...values, id, userId]);
    if (result.values.length === 0) {
      throw new Error('Stock not found or no permission to update');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Stock;
  }, [userId, query]);

  /**
   * Update an existing option trade
   */
  const updateOption = useCallback(async (id: number, updates: Partial<Omit<NewOption, 'id' | 'userId' | 'createdAt'>>): Promise<Option> => {
    // Map camelCase field names to snake_case column names
    const fieldToColumnMap: Record<string, string> = {
      symbol: 'symbol',
      strategyType: 'strategy_type',
      tradeDirection: 'trade_direction',
      numberOfContracts: 'number_of_contracts',
      optionType: 'option_type',
      strikePrice: 'strike_price',
      expirationDate: 'expiration_date',
      entryPrice: 'entry_price',
      exitPrice: 'exit_price',
      totalPremium: 'total_premium',
      commissions: 'commissions',
      impliedVolatility: 'implied_volatility',
      entryDate: 'entry_date',
      exitDate: 'exit_date',
      status: 'status',
    };

    const setClause = Object.keys(updates)
      .map(key => `${fieldToColumnMap[key] || key} = ?`)
      .join(', ');
    const values = Object.values(updates);
    
    const sql = `
      UPDATE options 
      SET ${setClause}, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
      RETURNING *
    `;
    
    const result = await query(sql, [...values, id, userId]);
    if (result.values.length === 0) {
      throw new Error('Option not found or no permission to update');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Option;
  }, [userId, query]);

  /**
   * Close a stock trade (set exit price and date)
   */
  const closeStock = async (id: number, exitPrice: number, exitDate?: string): Promise<Stock> => {
    return updateStock(id, {
      exitPrice,
      exitDate: exitDate || new Date().toISOString()
    });
  };

  /**
   * Close an option trade (set exit price and date)
   */
  const closeOption = async (id: number, exitPrice: number, exitDate?: string): Promise<Option> => {
    return updateOption(id, {
      exitPrice,
      exitDate: exitDate || new Date().toISOString(),
      status: 'closed'
    });
  };

  /**
   * Delete a stock trade
   */
  const deleteStock = useCallback(async (id: number): Promise<boolean> => {
    const result = await execute(
      `DELETE FROM stocks WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return result.changes > 0;
  }, [userId, execute]);

  /**
   * Delete an option trade
   */
  const deleteOption = useCallback(async (id: number): Promise<boolean> => {
    const result = await execute(
      `DELETE FROM options WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return result.changes > 0;
  }, [userId, execute]);

  /**
   * Get all stock trades for the user
   */
  const getAllStocks = useCallback(async (options?: {
    limit?: number;
    offset?: number;
    orderBy?: 'entry_date' | 'symbol' | 'created_at';
    orderDirection?: 'asc' | 'desc';
  }): Promise<Stock[]> => {
    const { 
      limit = 100, 
      offset = 0, 
      orderBy = 'entry_date', 
      orderDirection = 'desc'
    } = options || {};

    const sql = `
      SELECT id, user_id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at FROM stocks 
      WHERE user_id = ?
      ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    const result = await query(sql, [userId, limit, offset]);
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Stock;
    });
  }, [userId, query]);

  /**
   * Get all option trades for the user
   */
  const getAllOptions = useCallback(async (options?: {
    limit?: number;
    offset?: number;
    orderBy?: 'entry_date' | 'symbol' | 'created_at';
    orderDirection?: 'asc' | 'desc';
    status?: 'open' | 'closed';
  }): Promise<Option[]> => {
    const { 
      limit = 100, 
      offset = 0, 
      orderBy = 'entry_date', 
      orderDirection = 'desc',
      status
    } = options || {};

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const sql = `
      SELECT id, user_id, symbol, strategy_type, trade_direction, number_of_contracts, option_type, strike_price, expiration_date, entry_price, exit_price, total_premium, commissions, implied_volatility, entry_date, exit_date, status, created_at, updated_at FROM options 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    const result = await query(sql, params);

    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Option;
    });
  }, [userId, query]);

  /**
   * Get stock trades by symbol
   */
  const getStocksBySymbol = async (symbol: string): Promise<Stock[]> => {
    const result = await query(
      `SELECT id, user_id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at FROM stocks WHERE user_id = ? AND symbol = ? ORDER BY entry_date DESC`,
      [userId, symbol]
    );
    
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Stock;
    });
  };

  /**
   * Get option trades by symbol
   */
  const getOptionsBySymbol = async (symbol: string): Promise<Option[]> => {
    const result = await query(
      `SELECT id, user_id, symbol, strategy_type, trade_direction, number_of_contracts, option_type, strike_price, expiration_date, entry_price, exit_price, total_premium, commissions, implied_volatility, entry_date, exit_date, status, created_at, updated_at FROM options WHERE user_id = ? AND symbol = ? ORDER BY entry_date DESC`,
      [userId, symbol]
    );
    
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Option;
    });
  };

  /**
   * Get single stock trade by ID
   */
  const getStockById = async (id: number): Promise<Stock | null> => {
    const result = await query(
      `SELECT id, user_id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at FROM stocks WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Stock;
  };

  /**
   * Get single option trade by ID
   */
  const getOptionById = async (id: number): Promise<Option | null> => {
    const result = await query(
      `SELECT id, user_id, symbol, strategy_type, trade_direction, number_of_contracts, option_type, strike_price, expiration_date, entry_price, exit_price, total_premium, commissions, implied_volatility, entry_date, exit_date, status, created_at, updated_at FROM options WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Option;
  };

  /**
   * Search stock trades by symbol
   */
  const searchStocks = async (searchTerm: string): Promise<Stock[]> => {
    const result = await query(
      `SELECT id, user_id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at FROM stocks 
       WHERE user_id = ? AND symbol LIKE ?
       ORDER BY entry_date DESC`,
      [userId, `%${searchTerm}%`]
    );
    
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Stock;
    });
  };

  /**
   * Search option trades by symbol or strategy type
   */
  const searchOptions = async (searchTerm: string): Promise<Option[]> => {
    const result = await query(
      `SELECT id, user_id, symbol, strategy_type, trade_direction, number_of_contracts, option_type, strike_price, expiration_date, entry_price, exit_price, total_premium, commissions, implied_volatility, entry_date, exit_date, status, created_at, updated_at FROM options 
       WHERE user_id = ? AND (symbol LIKE ? OR strategy_type LIKE ?)
       ORDER BY entry_date DESC`,
      [userId, `%${searchTerm}%`, `%${searchTerm}%`]
    );
    
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Option;
    });
  };

  /**
   * Get trading statistics
   */
  const getStats = async () => {
    const stocksCountResult = await query(
      `SELECT COUNT(*) as total FROM stocks WHERE user_id = ?`,
      [userId]
    );

    const optionsCountResult = await query(
      `SELECT COUNT(*) as total FROM options WHERE user_id = ?`,
      [userId]
    );

    const openOptionsResult = await query(
      `SELECT COUNT(*) as open FROM options WHERE user_id = ? AND status = 'open'`,
      [userId]
    );

    const closedOptionsResult = await query(
      `SELECT COUNT(*) as closed FROM options WHERE user_id = ? AND status = 'closed'`,
      [userId]
    );

    return {
      totalStocks: stocksCountResult.values[0][0] as number,
      totalOptions: optionsCountResult.values[0][0] as number,
      openOptions: openOptionsResult.values[0][0] as number,
      closedOptions: closedOptionsResult.values[0][0] as number,
      totalTrades: (stocksCountResult.values[0][0] as number) + (optionsCountResult.values[0][0] as number),
    };
  };

  /**
   * Upsert stock trade (insert or update based on unique constraint)
   */
  const upsertStock = async (stock: Omit<NewStock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Stock> => {
    const sql = `
      INSERT INTO stocks (
        user_id, symbol, trade_type, order_type, entry_price, exit_price,
        stop_loss, commissions, number_shares, take_profit, entry_date, exit_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, symbol, trade_type, entry_price, entry_date) DO UPDATE SET
        order_type = excluded.order_type,
        exit_price = excluded.exit_price,
        stop_loss = excluded.stop_loss,
        commissions = excluded.commissions,
        number_shares = excluded.number_shares,
        take_profit = excluded.take_profit,
        exit_date = excluded.exit_date,
        updated_at = datetime('now')
      RETURNING *
    `;
    
    const params = [
      userId,
      stock.symbol,
      stock.tradeType,
      stock.orderType,
      stock.entryPrice,
      stock.exitPrice || null,
      stock.stopLoss,
      stock.commissions || 0.00,
      stock.numberShares,
      stock.takeProfit || null,
      stock.entryDate,
      stock.exitDate || null
    ];

    const result = await query(sql, params);
    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Stock;
  };

  /**
   * Upsert option trade (insert or update based on unique constraint)
   */
  const upsertOption = async (option: Omit<NewOption, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Option> => {
    const sql = `
      INSERT INTO options (
        user_id, symbol, strategy_type, trade_direction, number_of_contracts,
        option_type, strike_price, expiration_date, entry_price, exit_price,
        total_premium, commissions, implied_volatility, entry_date, exit_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, symbol, option_type, strike_price, expiration_date, entry_date) DO UPDATE SET
        strategy_type = excluded.strategy_type,
        trade_direction = excluded.trade_direction,
        number_of_contracts = excluded.number_of_contracts,
        entry_price = excluded.entry_price,
        exit_price = excluded.exit_price,
        total_premium = excluded.total_premium,
        commissions = excluded.commissions,
        implied_volatility = excluded.implied_volatility,
        exit_date = excluded.exit_date,
        status = excluded.status,
        updated_at = datetime('now')
      RETURNING *
    `;
    
    const params = [
      userId,
      option.symbol,
      option.strategyType,
      option.tradeDirection,
      option.numberOfContracts,
      option.optionType,
      option.strikePrice,
      option.expirationDate,
      option.entryPrice,
      option.exitPrice || null,
      option.totalPremium,
      option.commissions || 0.00,
      option.impliedVolatility,
      option.entryDate,
      option.exitDate || null,
      option.status || 'open'
    ];

    const result = await query(sql, params);
    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Option;
  };

  return {
    // Database state
    isInitialized,
    isInitializing,
    error,
    init,
    
    // Stock operations
    insertStock,
    updateStock,
    closeStock,
    deleteStock,
    upsertStock,
    getAllStocks,
    getStocksBySymbol,
    getStockById,
    searchStocks,
    
    // Option operations
    insertOption,
    updateOption,
    closeOption,
    deleteOption,
    upsertOption,
    getAllOptions,
    getOptionsBySymbol,
    getOptionById,
    searchOptions,
    
    // Statistics
    getStats,
    
    // Direct database access for custom queries
    execute,
    query,
  };
}
