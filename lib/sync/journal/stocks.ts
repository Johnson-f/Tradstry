import { createBrowserDatabase } from '@/lib/browser-database';
import { getFullUrl, apiConfig } from '@/lib/config/api';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

// Global database manager to handle persistent connections
class DatabaseManager {
  private static instance: DatabaseManager;
  private db: ReturnType<typeof createBrowserDatabase> | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async getDatabase(): Promise<ReturnType<typeof createBrowserDatabase>> {
    if (this.db && this.db.isInitialized) {
      return this.db;
    }

    if (this.isInitializing && this.initPromise) {
      await this.initPromise;
      return this.db!;
    }

    this.isInitializing = true;
    this.initPromise = this.initializeDatabase();
    await this.initPromise;
    this.isInitializing = false;

    return this.db!;
  }

  private async initializeDatabase(): Promise<void> {
    try {
      console.debug('[DatabaseManager] Initializing database...');
      
      // Try persistent database first
      this.db = createBrowserDatabase({ 
        dbName: 'tradistry-journal', 
        enablePersistence: true, 
        initSql: [...INIT_SQL, ...MAP_SQL] 
      });
      
      await this.db.init();
      console.log('[DatabaseManager] ✅ Persistent database initialized');
      
    } catch (error) {
      console.warn('[DatabaseManager] Persistent database failed, using in-memory fallback:', error);
      
      try {
        // Close failed database
        if (this.db) {
          await this.db.close().catch(() => {});
        }
        
        // Create in-memory fallback
        this.db = createBrowserDatabase({ 
          dbName: `tradistry-memory-${Date.now()}`, 
          enablePersistence: false, 
          initSql: [...INIT_SQL, ...MAP_SQL] 
        });
        
        await this.db.init();
        console.log('[DatabaseManager] ✅ In-memory database initialized');
        
        // Background cleanup
        clearCorruptedDatabase().catch(() => {
          console.warn('[DatabaseManager] Background cleanup failed (non-critical)');
        });
        
      } catch (memoryError) {
        console.error('[DatabaseManager] All database initialization failed:', memoryError);
        throw new Error('Database system unavailable');
      }
    }
  }

  async reset(): Promise<void> {
    if (this.db) {
      await this.db.close().catch(() => {});
      this.db = null;
    }
    this.isInitializing = false;
    this.initPromise = null;
  }
}

// TODO: Implement validation logic, to prevent malicious data from going to the cloud database
type SyncResult = {
  created: number;
  updated: number;
  failed: number;
};

type LocalStock = {
  id: number;
  user_id: string;
  symbol: string;
  trade_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  commissions: number;
  number_shares: number;
  take_profit: number | null;
  entry_date: string; // ISO
  exit_date: string | null; // ISO
  created_at: string; // ISO
  updated_at: string; // ISO
};

type BackendStock = {
  id: number;
};

type BackendStockFull = {
  id: number;
  symbol: string;
  trade_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  commissions: number;
  number_shares: number;
  take_profit: number | null;
  entry_date: string;
  exit_date: string | null;
  created_at: string;
  updated_at: string;
};

const INIT_SQL: string[] = [
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
  `CREATE INDEX IF NOT EXISTS idx_stocks_user_id ON stocks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)`,
  `CREATE INDEX IF NOT EXISTS idx_stocks_entry_date ON stocks(entry_date)`
];

const MAP_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS stock_backend_map (
    backend_id INTEGER PRIMARY KEY,
    local_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_backend_map_local_id ON stock_backend_map(local_id)`
];

async function withDb<T>(fn: (db: ReturnType<typeof createBrowserDatabase>) => Promise<T>): Promise<T> {
  const dbManager = DatabaseManager.getInstance();
  
  try {
    const db = await dbManager.getDatabase();
    return await fn(db);
  } catch (error) {
    console.error('[StocksSync] Database operation failed:', error);
    
    // If database operation fails, try to reset and retry once
    try {
      console.log('[StocksSync] Attempting database reset and retry...');
      await dbManager.reset();
      const freshDb = await dbManager.getDatabase();
      return await fn(freshDb);
    } catch (retryError) {
      console.error('[StocksSync] Database retry failed:', retryError);
      throw new Error('Database is unavailable. Please refresh the page.');
    }
  }
}

async function clearCorruptedDatabase(): Promise<void> {
  console.log('[StocksSync] Starting database cleanup...');
  
  try {
    // First, clear related localStorage immediately (this always works)
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.includes('tradistry') || key.includes('journal') || key.startsWith('journal.')
    );
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[StocksSync] Cleared localStorage key: ${key}`);
    });
    
    // Try to delete IndexedDB with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`[StocksSync] Attempt ${attempts}/${maxAttempts} to clear IndexedDB...`);
      
      try {
        await deleteIndexedDBWithRetry('sqlite-persistence');
        console.log('[StocksSync] Successfully cleared corrupted IndexedDB');
        return; // Success!
      } catch (error) {
        if (attempts === maxAttempts) {
          console.warn('[StocksSync] IndexedDB deletion failed, but localStorage cleared');
          // Don't throw error - localStorage clearing might be enough
          return;
        }
        
        console.log(`[StocksSync] Attempt ${attempts} failed, retrying in 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
  } catch (error) {
    console.error('[StocksSync] Database cleanup failed:', error);
    // Don't throw - we can continue with just localStorage clearing
  }
}

async function deleteIndexedDBWithRetry(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(dbName);
    
    let timeoutId = setTimeout(() => {
      reject(new Error('Database deletion timeout'));
    }, 5000); // 5 second timeout
    
    deleteRequest.onsuccess = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    
    deleteRequest.onerror = () => {
      clearTimeout(timeoutId);
      reject(deleteRequest.error || new Error('Database deletion failed'));
    };
    
    deleteRequest.onblocked = () => {
      clearTimeout(timeoutId);
      console.warn('[StocksSync] Database deletion blocked - other connections may be open');
      reject(new Error('Database deletion blocked - close other tabs and try again'));
    };
  });
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function readLocalStocks(userId: string): Promise<LocalStock[]> {
  try {
    return await withDb(async (db) => {
      const result = await db.query(
        `SELECT id, user_id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at FROM stocks WHERE user_id = ? ORDER BY entry_date DESC`,
        [userId]
      );
      const columns = result.columns;
      return result.values.map((row) => {
        const obj: Record<string, any> = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj as LocalStock;
      });
    });
  } catch (error) {
    console.error('[StocksSync] Failed to read local stocks:', error);
    // If database is corrupted, return empty array to prevent crash
    if (error instanceof Error && (
      error.message.includes('SQLITE_FULL') || 
      error.message.includes('corrupted') ||
      error.message.includes('database or disk is full')
    )) {
      console.warn('[StocksSync] Database issue detected, returning empty results');
      return [];
    }
    throw error;
  }
}

async function createBackendStock(headers: Record<string, string>, stock: LocalStock): Promise<BackendStock | null> {
  const url = getFullUrl(apiConfig.endpoints.stocks.base);
  const body = {
    symbol: stock.symbol,
    trade_type: stock.trade_type,
    order_type: stock.order_type,
    entry_price: stock.entry_price,
    stop_loss: stock.stop_loss,
    commissions: stock.commissions ?? 0,
    number_shares: stock.number_shares,
    take_profit: stock.take_profit,
    entry_date: stock.entry_date,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const created = json?.data;
  return created ? ({ id: created.id as number }) : null;
}

async function updateBackendStock(headers: Record<string, string>, backendId: number, updates: Partial<LocalStock>): Promise<boolean> {
  const url = getFullUrl(apiConfig.endpoints.stocks.byId(backendId));
  const payload: Record<string, any> = {};
  if (typeof updates.symbol !== 'undefined') payload.symbol = updates.symbol;
  if (typeof updates.trade_type !== 'undefined') payload.trade_type = updates.trade_type;
  if (typeof updates.order_type !== 'undefined') payload.order_type = updates.order_type;
  if (typeof updates.entry_price !== 'undefined') payload.entry_price = updates.entry_price;
  if (typeof updates.exit_price !== 'undefined') payload.exit_price = updates.exit_price;
  if (typeof updates.stop_loss !== 'undefined') payload.stop_loss = updates.stop_loss;
  if (typeof updates.commissions !== 'undefined') payload.commissions = updates.commissions;
  if (typeof updates.number_shares !== 'undefined') payload.number_shares = updates.number_shares;
  if (typeof updates.take_profit !== 'undefined') payload.take_profit = updates.take_profit;
  if (typeof updates.entry_date !== 'undefined') payload.entry_date = updates.entry_date;
  if (typeof updates.exit_date !== 'undefined') payload.exit_date = updates.exit_date;

  if (Object.keys(payload).length === 0) return true;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

async function getExistingMapping(localId: number): Promise<{ backendId: number; updatedAt: string } | null> {
  return withDb(async (db) => {
    const result = await db.query(
      `SELECT backend_id, updated_at FROM stock_backend_map WHERE local_id = ?`,
      [localId]
    );
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    return {
      backendId: row[0] as number,
      updatedAt: row[1] as string,
    };
  });
}

async function getUnsyncedLocalStocks(userId: string): Promise<LocalStock[]> {
  return withDb(async (db) => {
    const result = await db.query(`
      SELECT s.id, s.user_id, s.symbol, s.trade_type, s.order_type, s.entry_price, s.exit_price, 
             s.stop_loss, s.commissions, s.number_shares, s.take_profit, s.entry_date, s.exit_date, 
             s.created_at, s.updated_at 
      FROM stocks s 
      LEFT JOIN stock_backend_map m ON s.id = m.local_id 
      WHERE s.user_id = ? AND m.local_id IS NULL
      ORDER BY s.created_at DESC
    `, [userId]);
    
    const columns = result.columns;
    return result.values.map((row) => {
      const obj: Record<string, any> = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj as LocalStock;
    });
  });
}

async function createMappingEntry(localId: number, backendId: number, updatedAt: string): Promise<void> {
  return withDb(async (db) => {
    await db.execute(
      `INSERT OR REPLACE INTO stock_backend_map (backend_id, local_id, updated_at) VALUES (?, ?, ?)`,
      [backendId, localId, updatedAt]
    );
  });
}

async function updateMappingEntry(localId: number, updatedAt: string): Promise<void> {
  return withDb(async (db) => {
    await db.execute(
      `UPDATE stock_backend_map SET updated_at = ? WHERE local_id = ?`,
      [updatedAt, localId]
    );
  });
}

export async function syncStocksToBackend(userId: string): Promise<SyncResult> {
  console.debug('[StocksSync] Starting push sync to backend');
  
  const headers = await getAuthHeader();
  const stocks = await readLocalStocks(userId);
  const unsyncedStocks = await getUnsyncedLocalStocks(userId);
  
  console.debug(`[StocksSync] Found ${stocks.length} local stocks total, ${unsyncedStocks.length} never synced`);
  
  if (unsyncedStocks.length > 0) {
    console.info(`[StocksSync] 🔄 Prioritizing ${unsyncedStocks.length} unsynced local stocks to prevent data loss`);
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  // Process sequentially to avoid API flood; can be optimized later
  for (const s of stocks) {
    try {
      console.debug(`[StocksSync] Processing stock ${s.id}: ${s.symbol}`);
      
      // Check if this stock is already mapped to a backend record
      const existingMapping = await getExistingMapping(s.id);
      
      if (existingMapping) {
        // Stock already exists on backend, check if we need to update it
        const localUpdatedAt = new Date(s.updated_at);
        const mappedUpdatedAt = new Date(existingMapping.updatedAt);
        
        if (localUpdatedAt > mappedUpdatedAt) {
          console.debug(`[StocksSync] Updating existing backend stock ${existingMapping.backendId}`);
          
          // Update the backend record
          const updateData: Partial<LocalStock> = {
            symbol: s.symbol,
            trade_type: s.trade_type,
            order_type: s.order_type,
            entry_price: s.entry_price,
            exit_price: s.exit_price,
            stop_loss: s.stop_loss,
            commissions: s.commissions,
            number_shares: s.number_shares,
            take_profit: s.take_profit,
            entry_date: s.entry_date,
            exit_date: s.exit_date,
          };
          
          const updateSuccess = await updateBackendStock(headers, existingMapping.backendId, updateData);
          
          if (updateSuccess) {
            await updateMappingEntry(s.id, s.updated_at);
            updated += 1;
            console.debug(`[StocksSync] Successfully updated backend stock ${existingMapping.backendId}`);
          } else {
            console.error(`[StocksSync] Failed to update backend stock ${existingMapping.backendId}`);
            failed += 1;
          }
        } else {
          console.debug(`[StocksSync] Stock ${s.id} is up to date, skipping`);
        }
      } else {
        // Stock doesn't exist on backend, create it
        console.debug(`[StocksSync] Creating new backend stock for local ${s.id}`);
        
        const createdRes = await createBackendStock(headers, s);
        
        if (!createdRes) {
          console.error(`[StocksSync] Failed to create backend stock for local ${s.id}`);
          failed += 1;
          continue;
        }
        
        console.debug(`[StocksSync] Successfully created backend stock ${createdRes.id} for local ${s.id}`);
        
        // Create mapping entry
        await createMappingEntry(s.id, createdRes.id, s.updated_at);
        created += 1;

        // If local trade has exit fields, send an update
        const needsUpdate = typeof s.exit_price === 'number' || typeof s.exit_date === 'string';
        if (needsUpdate) {
          console.debug(`[StocksSync] Stock ${createdRes.id} needs exit data update`);
          
          const ok = await updateBackendStock(headers, createdRes.id, {
            exit_price: s.exit_price ?? undefined,
            exit_date: s.exit_date ?? undefined,
          });
          
          if (ok) {
            console.debug(`[StocksSync] Successfully updated exit data for stock ${createdRes.id}`);
            // Update the mapping with current timestamp since we just updated
            await updateMappingEntry(s.id, new Date().toISOString());
          } else {
            console.error(`[StocksSync] Failed to update exit data for stock ${createdRes.id}`);
            failed += 1;
          }
        }
      }
    } catch (error) {
      console.error(`[StocksSync] Error processing stock ${s.id}:`, error);
      failed += 1;
    }
  }

  console.debug(`[StocksSync] Push sync complete - Created: ${created}, Updated: ${updated}, Failed: ${failed}`);
  return { created, updated, failed };
}

export async function testStocksSync(userId: string): Promise<void> {
  await syncStocksToBackend(userId);
}

// Debug function to help diagnose sync issues
// Export function for other components to get database instance
export async function getJournalDatabase(): Promise<ReturnType<typeof createBrowserDatabase>> {
  const dbManager = DatabaseManager.getInstance();
  return await dbManager.getDatabase();
}

// Export function to reset database (for manual recovery)
export async function resetJournalDatabase(): Promise<void> {
  const dbManager = DatabaseManager.getInstance();
  await dbManager.reset();
}

export async function debugSyncState(userId: string): Promise<void> {
  console.group('🔍 Sync State Debug');
  
  try {
    const allStocks = await readLocalStocks(userId);
    const unsyncedStocks = await getUnsyncedLocalStocks(userId);
    
    console.log(`📊 Total local stocks: ${allStocks.length}`);
    console.log(`🔄 Unsynced stocks: ${unsyncedStocks.length}`);
    console.log(`✅ Synced stocks: ${allStocks.length - unsyncedStocks.length}`);
    
    if (unsyncedStocks.length > 0) {
      console.log('🚨 Unsynced stocks (these should be pushed first):');
      unsyncedStocks.forEach(stock => {
        console.log(`  - ID ${stock.id}: ${stock.symbol} (created: ${stock.created_at})`);
      });
    }
    
    // Check mapping table integrity
    return withDb(async (db) => {
      const mappings = await db.query('SELECT COUNT(*) as count FROM stock_backend_map');
      const mappingCount = mappings.values[0]?.[0] as number || 0;
      console.log(`🗺️ Total mappings: ${mappingCount}`);
      
      if (mappingCount !== (allStocks.length - unsyncedStocks.length)) {
        console.warn('⚠️ Mapping count mismatch - some synced stocks may not have proper mappings');
      }
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    console.groupEnd();
  }
}

function buildStocksUrl(params?: { updated_after?: string; limit?: number; offset?: number }): string {
  const base = getFullUrl(apiConfig.endpoints.stocks.base);
  const search = new URLSearchParams();
  if (params?.updated_after) search.set('updated_after', params.updated_after);
  if (typeof params?.limit === 'number') search.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') search.set('offset', String(params.offset));
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function pullStocksFromBackend(userId: string, options?: { updatedAfter?: string }): Promise<{ pulled: number; inserted: number; merged: number; skipped: number; }> {
  const headers = await getAuthHeader();
  const url = buildStocksUrl({ updated_after: options?.updatedAfter });

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error('[StocksSync] Pull failed', { status: res.status, url });
    return { pulled: 0, inserted: 0, merged: 0, skipped: 0 };
  }
  const json = await res.json();
  const data: BackendStockFull[] = json?.data || json?.stocks || [];

  return withDb(async (db) => {
    let inserted = 0;
    let merged = 0;
    let skipped = 0;
    
    // SAFETY CHECK: Log any unmapped local data to help debug data loss
    const unmappedCheck = await db.query(`
      SELECT COUNT(*) as count FROM stocks s 
      LEFT JOIN stock_backend_map m ON s.id = m.local_id 
      WHERE s.user_id = ? AND m.local_id IS NULL
    `, [userId]);
    
    const unmappedCount = unmappedCheck.values[0]?.[0] as number || 0;
    if (unmappedCount > 0) {
      console.warn(`[StocksSync] Found ${unmappedCount} local stocks not yet synced to backend - these will be protected from overwrite`);
    }

    for (const s of data) {
      const map = await db.query(`SELECT local_id, updated_at FROM stock_backend_map WHERE backend_id = ?`, [s.id]);
      if (map.values.length === 0) {
        const insert = await db.query(
          `INSERT INTO stocks (
            user_id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            userId,
            s.symbol,
            s.trade_type,
            s.order_type,
            s.entry_price,
            s.exit_price,
            s.stop_loss,
            s.commissions ?? 0,
            s.number_shares,
            s.take_profit,
            s.entry_date,
            s.exit_date,
            s.created_at,
            s.updated_at,
          ]
        );
        const localId = insert.values[0]?.[0] as number;
        await db.execute(`INSERT OR REPLACE INTO stock_backend_map (backend_id, local_id, updated_at) VALUES (?, ?, ?)`, [s.id, localId, s.updated_at]);
        inserted += 1;
        continue;
      }

      const localId = map.values[0][0] as number;
      const mappedUpdatedAt = map.values[0][1] as string;
      if (new Date(s.updated_at).getTime() <= new Date(mappedUpdatedAt).getTime()) {
        skipped += 1;
        continue;
      }

      await db.execute(
        `UPDATE stocks SET 
          symbol = ?, trade_type = ?, order_type = ?, entry_price = ?, exit_price = ?, stop_loss = ?, commissions = ?, number_shares = ?, take_profit = ?, entry_date = ?, exit_date = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
        [
          s.symbol,
          s.trade_type,
          s.order_type,
          s.entry_price,
          s.exit_price,
          s.stop_loss,
          s.commissions ?? 0,
          s.number_shares,
          s.take_profit,
          s.entry_date,
          s.exit_date,
          s.updated_at,
          localId,
          userId,
        ]
      );
      await db.execute(`UPDATE stock_backend_map SET updated_at = ? WHERE backend_id = ?`, [s.updated_at, s.id]);
      merged += 1;
    }

    return { pulled: data.length, inserted, merged, skipped };
  });
}

export async function syncStocks(userId: string, options?: { updatedAfter?: string }): Promise<{ pull: { pulled: number; inserted: number; merged: number; skipped: number; }, push: SyncResult }> {
  console.debug('[StocksSync] Starting bidirectional sync');
  
  try {
    // CRITICAL FIX: Push local changes FIRST to prevent data loss
    console.debug('[StocksSync] Phase 1: Pushing local changes to backend (prevents data loss)');
    const push = await syncStocksToBackend(userId);
    console.debug('[StocksSync] Push complete:', push);
    
    // Only pull after we've secured local data on backend
    console.debug('[StocksSync] Phase 2: Pulling updates from backend');
    const pull = await pullStocksFromBackend(userId, { updatedAfter: options?.updatedAfter });
    console.debug('[StocksSync] Pull complete:', pull);
    
    console.debug('[StocksSync] Bidirectional sync complete');
    return { pull, push };
  } catch (error) {
    console.error('[StocksSync] Bidirectional sync failed:', error);
    
    // Provide helpful error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('SQLITE_FULL') || error.message.includes('database or disk is full')) {
        console.error('💾 Database Error: SQLite database corruption/full - auto-repair attempted');
        console.error('🔄 Solution: Refresh the page, the database should be reset automatically');
      } else if (error.message.includes('Not authenticated')) {
        console.error('🔐 Authentication Error: Please log in again');
      } else if (error.message.includes('Network') || error.message.includes('fetch')) {
        console.error('🌐 Network Error: Check your internet connection and try again');
      }
    }
    
    throw error;
  }
}

