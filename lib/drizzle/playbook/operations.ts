/**
 * Playbook Operations using Drizzle ORM + Browser SQLite
 * Provides CRUD operations for trading playbooks and trade tagging
 */

import { eq, and, desc, asc, count, sql, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { useCallback } from 'react';
import { useBrowserDatabase } from '@/lib/browser-database';
import { 
  playbookTable, 
  stockTradePlaybookTable,
  optionTradePlaybookTable,
  playbookIndexes,
  stockTradePlaybookIndexes,
  optionTradePlaybookIndexes,
  type Playbook, 
  type NewPlaybook,
  type StockTradePlaybook,
  type OptionTradePlaybook,
  type PlaybookQuery,
  type TagTradeRequest,
  type TradeType,
  type PlaybookWithUsage
} from './schema';

// Helper function to convert snake_case to camelCase
const snakeToCamel = (s: string) => s.replace(/([-_][a-z])/ig, ($1) => {
  return $1.toUpperCase()
    .replace('-', '')
    .replace('_', '');
});

/**
 * Hook for playbook database operations
 */
export function usePlaybookDatabase(userId: string) {
  const { isInitialized, isInitializing, error, execute, query, init } = useBrowserDatabase({
    dbName: 'tradistry-playbook',
    enablePersistence: true,
    initSql: [
      // Create playbook table
      `CREATE TABLE IF NOT EXISTS playbook (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      
      // Create stock_trade_playbook junction table
      `CREATE TABLE IF NOT EXISTS stock_trade_playbook (
        stock_trade_id INTEGER NOT NULL,
        setup_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (stock_trade_id, setup_id),
        FOREIGN KEY (stock_trade_id) REFERENCES stocks(id) ON DELETE CASCADE,
        FOREIGN KEY (setup_id) REFERENCES playbook(id) ON DELETE CASCADE
      )`,
      
      // Create option_trade_playbook junction table
      `CREATE TABLE IF NOT EXISTS option_trade_playbook (
        option_trade_id INTEGER NOT NULL,
        setup_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (option_trade_id, setup_id),
        FOREIGN KEY (option_trade_id) REFERENCES options(id) ON DELETE CASCADE,
        FOREIGN KEY (setup_id) REFERENCES playbook(id) ON DELETE CASCADE
      )`,
      
      // Create playbook indexes
      `CREATE INDEX IF NOT EXISTS idx_playbook_updated_at ON playbook(updated_at)`,
      
      // Create stock trade playbook indexes
      `CREATE INDEX IF NOT EXISTS idx_stock_trade_playbook_stock_trade_id ON stock_trade_playbook(stock_trade_id)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_trade_playbook_setup_id ON stock_trade_playbook(setup_id)`,
      
      // Create option trade playbook indexes
      `CREATE INDEX IF NOT EXISTS idx_option_trade_playbook_option_trade_id ON option_trade_playbook(option_trade_id)`,
      `CREATE INDEX IF NOT EXISTS idx_option_trade_playbook_setup_id ON option_trade_playbook(setup_id)`,
      
      // Create trigger to update the updated_at timestamp on playbook table
      `CREATE TRIGGER IF NOT EXISTS update_playbook_timestamp 
       AFTER UPDATE ON playbook 
       FOR EACH ROW 
       BEGIN 
         UPDATE playbook SET updated_at = datetime('now') WHERE id = NEW.id; 
       END`
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
   * Get playbook by ID
   */
  const getPlaybookById = useCallback(async (id: string): Promise<Playbook | null> => {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }

    const result = await query(
      `SELECT * FROM playbook WHERE id = ?`,
      [id]
    );
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Playbook;
  }, [query, isInitialized]);

  /**
   * Create a new playbook
   */
  const createPlaybook = useCallback(async (playbook: Omit<NewPlaybook, 'id' | 'createdAt' | 'updatedAt'>): Promise<Playbook> => {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    const sql = `
      INSERT INTO playbook (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const params = [
      id,
      playbook.name,
      playbook.description || null,
      now,
      now
    ];

    await execute(sql, params);

    // Return the created playbook by fetching it
    const createdPlaybook = await getPlaybookById(id);
    if (!createdPlaybook) {
      throw new Error('Failed to retrieve created playbook');
    }

    return createdPlaybook;
  }, [execute, isInitialized, getPlaybookById]);

  /**
   * Get all playbooks
   */
  const getAllPlaybooks = useCallback(async (options?: {
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'created_at' | 'updated_at';
    orderDirection?: 'asc' | 'desc';
    name?: string;
  }): Promise<Playbook[]> => {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }

    const { 
      limit = 100, 
      offset = 0, 
      orderBy = 'updated_at', 
      orderDirection = 'desc',
      name
    } = options || {};

    let whereClause = '';
    const params: any[] = [];

    if (name) {
      whereClause = 'WHERE name LIKE ?';
      params.push(`%${name}%`);
    }

    const sql = `
      SELECT * FROM playbook 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    const result = await query(sql, params);
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Playbook;
    });
  }, [query, isInitialized]);

  /**
   * Update an existing playbook
   */
  const updatePlaybook = useCallback(async (id: string, updates: Partial<Omit<NewPlaybook, 'id' | 'createdAt'>>): Promise<Playbook> => {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }

    // Check if playbook exists first
    const existingPlaybook = await getPlaybookById(id);
    if (!existingPlaybook) {
      throw new Error('Playbook not found');
    }

    const updateFields = Object.entries(updates).filter(([_, value]) => value !== undefined);

    if (updateFields.length === 0) {
      // Nothing to update, but let's refetch to be safe
      const playbook = await getPlaybookById(id);
      if (!playbook) {
        throw new Error('Playbook not found after empty update');
      }
      return playbook;
    }

    const setClause = updateFields
      .map(([key]) => `${key} = ?`)
      .join(', ');
    const values = updateFields.map(([_, value]) => value);
    
    const sql = `
      UPDATE playbook 
      SET ${setClause}, updated_at = datetime('now')
      WHERE id = ?
    `;
    
    await execute(sql, [...values, id]);
    
    // Return the updated playbook by fetching it again
    const updatedPlaybook = await getPlaybookById(id);
    if (!updatedPlaybook) {
      throw new Error('Failed to retrieve updated playbook');
    }
    
    return updatedPlaybook;
  }, [execute, isInitialized, getPlaybookById]);

  /**
   * Delete a playbook
   */
  const deletePlaybook = useCallback(async (id: string): Promise<boolean> => {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }

    const result = await execute(
      `DELETE FROM playbook WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }, [execute, isInitialized]);

  /**
   * Tag a stock trade with a playbook setup
   */
  const tagStockTrade = useCallback(async (tradeId: number, setupId: string): Promise<StockTradePlaybook> => {
    const now = new Date().toISOString();
    
    const sql = `
      INSERT INTO stock_trade_playbook (stock_trade_id, setup_id, created_at)
      VALUES (?, ?, ?)
      RETURNING *
    `;
    
    const params = [tradeId, setupId, now];

    const result = await query(sql, params);
    if (result.values.length === 0) {
      throw new Error('Failed to tag stock trade');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as StockTradePlaybook;
  }, [query]);

  /**
   * Tag an option trade with a playbook setup
   */
  const tagOptionTrade = useCallback(async (tradeId: number, setupId: string): Promise<OptionTradePlaybook> => {
    const now = new Date().toISOString();
    
    const sql = `
      INSERT INTO option_trade_playbook (option_trade_id, setup_id, created_at)
      VALUES (?, ?, ?)
      RETURNING *
    `;
    
    const params = [tradeId, setupId, now];

    const result = await query(sql, params);
    if (result.values.length === 0) {
      throw new Error('Failed to tag option trade');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as OptionTradePlaybook;
  }, [query]);

  /**
   * Tag a trade with a playbook setup (generic)
   */
  const tagTrade = useCallback(async (request: TagTradeRequest): Promise<StockTradePlaybook | OptionTradePlaybook> => {
    if (request.tradeType === 'stock') {
      return tagStockTrade(request.tradeId, request.setupId);
    } else {
      return tagOptionTrade(request.tradeId, request.setupId);
    }
  }, [tagStockTrade, tagOptionTrade]);

  /**
   * Remove a playbook tag from a stock trade
   */
  const untagStockTrade = useCallback(async (tradeId: number, setupId: string): Promise<boolean> => {
    const result = await execute(
      `DELETE FROM stock_trade_playbook WHERE stock_trade_id = ? AND setup_id = ?`,
      [tradeId, setupId]
    );
    return result.changes > 0;
  }, [execute]);

  /**
   * Remove a playbook tag from an option trade
   */
  const untagOptionTrade = useCallback(async (tradeId: number, setupId: string): Promise<boolean> => {
    const result = await execute(
      `DELETE FROM option_trade_playbook WHERE option_trade_id = ? AND setup_id = ?`,
      [tradeId, setupId]
    );
    return result.changes > 0;
  }, [execute]);

  /**
   * Remove a playbook tag from a trade (generic)
   */
  const untagTrade = useCallback(async (tradeId: number, setupId: string, tradeType: TradeType): Promise<boolean> => {
    if (tradeType === 'stock') {
      return untagStockTrade(tradeId, setupId);
    } else {
      return untagOptionTrade(tradeId, setupId);
    }
  }, [untagStockTrade, untagOptionTrade]);

  /**
   * Get playbooks associated with a stock trade
   */
  const getPlaybooksForStockTrade = useCallback(async (tradeId: number): Promise<Playbook[]> => {
    const sql = `
      SELECT p.* FROM playbook p
      INNER JOIN stock_trade_playbook stp ON p.id = stp.setup_id
      WHERE stp.stock_trade_id = ?
      ORDER BY stp.created_at DESC
    `;
    
    const result = await query(sql, [tradeId]);
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Playbook;
    });
  }, [query]);

  /**
   * Get playbooks associated with an option trade
   */
  const getPlaybooksForOptionTrade = useCallback(async (tradeId: number): Promise<Playbook[]> => {
    const sql = `
      SELECT p.* FROM playbook p
      INNER JOIN option_trade_playbook otp ON p.id = otp.setup_id
      WHERE otp.option_trade_id = ?
      ORDER BY otp.created_at DESC
    `;
    
    const result = await query(sql, [tradeId]);
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Playbook;
    });
  }, [query]);

  /**
   * Get playbooks associated with a trade (generic)
   */
  const getPlaybooksForTrade = useCallback(async (tradeId: number, tradeType: TradeType): Promise<Playbook[]> => {
    if (tradeType === 'stock') {
      return getPlaybooksForStockTrade(tradeId);
    } else {
      return getPlaybooksForOptionTrade(tradeId);
    }
  }, [getPlaybooksForStockTrade, getPlaybooksForOptionTrade]);

  /**
   * Get stock trades associated with a playbook
   */
  const getStockTradesForPlaybook = useCallback(async (setupId: string): Promise<number[]> => {
    const result = await query(
      `SELECT stock_trade_id FROM stock_trade_playbook WHERE setup_id = ? ORDER BY created_at DESC`,
      [setupId]
    );
    
    return result.values.map(row => row[0] as number);
  }, [query]);

  /**
   * Get option trades associated with a playbook
   */
  const getOptionTradesForPlaybook = useCallback(async (setupId: string): Promise<number[]> => {
    const result = await query(
      `SELECT option_trade_id FROM option_trade_playbook WHERE setup_id = ? ORDER BY created_at DESC`,
      [setupId]
    );
    
    return result.values.map(row => row[0] as number);
  }, [query]);

  /**
   * Get trades associated with a playbook (generic)
   */
  const getTradesForPlaybook = useCallback(async (setupId: string): Promise<{ stockTrades: number[], optionTrades: number[] }> => {
    const [stockTrades, optionTrades] = await Promise.all([
      getStockTradesForPlaybook(setupId),
      getOptionTradesForPlaybook(setupId)
    ]);
    
    return { stockTrades, optionTrades };
  }, [getStockTradesForPlaybook, getOptionTradesForPlaybook]);

  /**
   * Get playbook usage statistics
   */
  const getPlaybookStats = useCallback(async (): Promise<{
    totalPlaybooks: number;
    totalStockTags: number;
    totalOptionTags: number;
    mostUsedPlaybook?: {
      id: string;
      name: string;
      usageCount: number;
    };
  }> => {
    // Get total playbooks count
    const playbooksCountResult = await query(
      `SELECT COUNT(*) as total FROM playbook`,
      []
    );

    // Get total stock tags count
    const stockTagsCountResult = await query(
      `SELECT COUNT(*) as total FROM stock_trade_playbook`,
      []
    );

    // Get total option tags count
    const optionTagsCountResult = await query(
      `SELECT COUNT(*) as total FROM option_trade_playbook`,
      []
    );

    // Get most used playbook
    const mostUsedResult = await query(`
      SELECT p.id, p.name, 
             (COALESCE(stock_count.count, 0) + COALESCE(option_count.count, 0)) as usage_count
      FROM playbook p
      LEFT JOIN (
        SELECT setup_id, COUNT(*) as count 
        FROM stock_trade_playbook 
        GROUP BY setup_id
      ) stock_count ON p.id = stock_count.setup_id
      LEFT JOIN (
        SELECT setup_id, COUNT(*) as count 
        FROM option_trade_playbook 
        GROUP BY setup_id
      ) option_count ON p.id = option_count.setup_id
      ORDER BY usage_count DESC
      LIMIT 1
    `, []);

    const mostUsedPlaybook = mostUsedResult.values.length > 0 ? {
      id: mostUsedResult.values[0][0] as string,
      name: mostUsedResult.values[0][1] as string,
      usageCount: mostUsedResult.values[0][2] as number
    } : undefined;

    return {
      totalPlaybooks: playbooksCountResult.values[0][0] as number,
      totalStockTags: stockTagsCountResult.values[0][0] as number,
      totalOptionTags: optionTagsCountResult.values[0][0] as number,
      mostUsedPlaybook
    };
  }, [query]);

  /**
   * Get playbooks with usage counts
   */
  const getPlaybooksWithUsage = useCallback(async (): Promise<PlaybookWithUsage[]> => {
    const sql = `
      SELECT p.*, 
             COALESCE(stock_count.count, 0) as stock_usage_count,
             COALESCE(option_count.count, 0) as option_usage_count,
             (COALESCE(stock_count.count, 0) + COALESCE(option_count.count, 0)) as usage_count
      FROM playbook p
      LEFT JOIN (
        SELECT setup_id, COUNT(*) as count 
        FROM stock_trade_playbook 
        GROUP BY setup_id
      ) stock_count ON p.id = stock_count.setup_id
      LEFT JOIN (
        SELECT setup_id, COUNT(*) as count 
        FROM option_trade_playbook 
        GROUP BY setup_id
      ) option_count ON p.id = option_count.setup_id
      ORDER BY usage_count DESC, p.updated_at DESC
    `;
    
    const result = await query(sql, []);
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as PlaybookWithUsage;
    });
  }, [query]);

  /**
   * Search playbooks by name
   */
  const searchPlaybooks = useCallback(async (searchTerm: string): Promise<Playbook[]> => {
    const result = await query(
      `SELECT * FROM playbook 
       WHERE name LIKE ? OR description LIKE ?
       ORDER BY updated_at DESC`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );
    
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Playbook;
    });
  }, [query]);

  return {
    // Database state
    isInitialized,
    isInitializing,
    error,
    init,
    
    // Playbook operations
    createPlaybook,
    getAllPlaybooks,
    getPlaybookById,
    updatePlaybook,
    deletePlaybook,
    searchPlaybooks,
    
    // Trade tagging operations
    tagTrade,
    tagStockTrade,
    tagOptionTrade,
    untagTrade,
    untagStockTrade,
    untagOptionTrade,
    
    // Association queries
    getPlaybooksForTrade,
    getPlaybooksForStockTrade,
    getPlaybooksForOptionTrade,
    getTradesForPlaybook,
    getStockTradesForPlaybook,
    getOptionTradesForPlaybook,
    
    // Statistics and analytics
    getPlaybookStats,
    getPlaybooksWithUsage,
    
    // Direct database access for custom queries
    execute,
    query,
  };
}
