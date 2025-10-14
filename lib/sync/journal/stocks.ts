import { createBrowserDatabase } from '@/lib/browser-database';
import { getFullUrl, apiConfig } from '@/lib/config/api';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

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
  const db = createBrowserDatabase({ dbName: 'tradistry-journal', enablePersistence: true, initSql: [...INIT_SQL, ...MAP_SQL] });
  await db.init();
  try {
    return await fn(db);
  } finally {
    await db.close().catch(() => {});
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function readLocalStocks(userId: string): Promise<LocalStock[]> {
  return withDb(async (db) => {
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

export async function syncStocksToBackend(userId: string): Promise<SyncResult> {
  const headers = await getAuthHeader();
  const stocks = await readLocalStocks(userId);

  let created = 0;
  let updated = 0;
  let failed = 0;

  // Process sequentially to avoid API flood; can be optimized later
  for (const s of stocks) {
    try {
      const createdRes = await createBackendStock(headers, s);
      if (!createdRes) {
        failed += 1;
        continue;
      }
      created += 1;

      // If local trade has exit fields or other post-create updates, send an update
      const needsUpdate = typeof s.exit_price === 'number' || typeof s.exit_date === 'string';
      if (needsUpdate) {
        const ok = await updateBackendStock(headers, createdRes.id, {
          exit_price: s.exit_price ?? undefined,
          exit_date: s.exit_date ?? undefined,
        });
        if (ok) updated += 1; else failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { created, updated, failed };
}

export async function testStocksSync(userId: string): Promise<void> {
  await syncStocksToBackend(userId);
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
  const pull = await pullStocksFromBackend(userId, { updatedAfter: options?.updatedAfter });
  const push = await syncStocksToBackend(userId);
  return { pull, push };
}

