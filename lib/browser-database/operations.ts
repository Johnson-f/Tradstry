'use client';

import { eq, desc, and, gte, lte, sql, count, sum } from 'drizzle-orm';
import { getDrizzleDb } from './drizzle';
import { 
  stocks, 
  options, 
  syncMetadata,
  type Stock,
  type NewStock,
  type Option,
  type NewOption,
} from './schema';

/**
 * Browser Database Operations
 * Provides high-level database operations with caching and sync capabilities
 */
export class DatabaseOperations {
  private drizzleDb = getDrizzleDb();
  private initialized = false;

  async initialize(userId: string): Promise<void> {
    if (this.initialized) return;
    await this.drizzleDb.initialize(userId);
    this.initialized = true;
  }

  private getDb() {
    if (!this.initialized) {
      throw new Error('Database operations not initialized. Call initialize() first.');
    }
    return this.drizzleDb.getDb();
  }

  // ========== STOCKS ==========

  async getStocks(limit = 100): Promise<Stock[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(stocks)
      .orderBy(desc(stocks.entryDate))
      .limit(limit);
  }

  async addStock(stock: NewStock): Promise<Stock> {
    const db = this.getDb();
    const stockWithSync = {
      ...stock,
      syncStatus: 'pending' as const,
    };
    
    await db.insert(stocks).values(stockWithSync);
    
    // Mark sync as needed
    await this.markSyncNeeded('stocks');
    
    // Return the inserted stock
    const [insertedStock] = await db
      .select()
      .from(stocks)
      .where(eq(stocks.id, stock.id!))
      .limit(1);
    
    return insertedStock;
  }

  async updateStock(id: number, updates: Partial<NewStock>): Promise<Stock> {
    const db = this.getDb();
    const updatesWithSync = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'pending' as const,
    };
    
    await db
      .update(stocks)
      .set(updatesWithSync)
      .where(eq(stocks.id, id));
    
    await this.markSyncNeeded('stocks');
    
    const [updatedStock] = await db
      .select()
      .from(stocks)
      .where(eq(stocks.id, id))
      .limit(1);
    
    return updatedStock;
  }

  async deleteStock(id: number): Promise<void> {
    const db = this.getDb();
    await db.delete(stocks).where(eq(stocks.id, id));
    await this.markSyncNeeded('stocks');
  }

  async getStocksBySymbol(symbol: string): Promise<Stock[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(stocks)
      .where(eq(stocks.symbol, symbol))
      .orderBy(desc(stocks.entryDate));
  }

  // ========== OPTIONS ==========

  async getOptions(limit = 100): Promise<Option[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(options)
      .orderBy(desc(options.entryDate))
      .limit(limit);
  }

  async addOption(option: NewOption): Promise<Option> {
    const db = this.getDb();
    const optionWithSync = {
      ...option,
      syncStatus: 'pending' as const,
    };
    
    await db.insert(options).values(optionWithSync);
    await this.markSyncNeeded('options');
    
    const [insertedOption] = await db
      .select()
      .from(options)
      .where(eq(options.id, option.id!))
      .limit(1);
    
    return insertedOption;
  }

  async updateOption(id: number, updates: Partial<NewOption>): Promise<Option> {
    const db = this.getDb();
    const updatesWithSync = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'pending' as const,
    };
    
    await db
      .update(options)
      .set(updatesWithSync)
      .where(eq(options.id, id));
    
    await this.markSyncNeeded('options');
    
    const [updatedOption] = await db
      .select()
      .from(options)
      .where(eq(options.id, id))
      .limit(1);
    
    return updatedOption;
  }

  async deleteOption(id: number): Promise<void> {
    const db = this.getDb();
    await db.delete(options).where(eq(options.id, id));
    await this.markSyncNeeded('options');
  }

  async getOptionsBySymbol(symbol: string): Promise<Option[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(options)
      .where(eq(options.symbol, symbol))
      .orderBy(desc(options.entryDate));
  }

  async getOpenOptions(): Promise<Option[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(options)
      .where(eq(options.status, 'open'))
      .orderBy(desc(options.entryDate));
  }


  // ========== ANALYTICS ==========

  async getTradingStats(period?: { start: Date; end: Date }) {
    const db = this.getDb();
    
    let stockQuery = db
      .select({
        totalTrades: count(),
        totalValue: sum(sql`${stocks.entryPrice} * ${stocks.numberShares}`),
      })
      .from(stocks);
    
    if (period) {
      stockQuery = stockQuery.where(and(
        gte(stocks.entryDate, period.start),
        lte(stocks.entryDate, period.end)
      )) as any;
    }
    
    const [stockStats] = await stockQuery;
    
    let optionQuery = db
      .select({
        totalTrades: count(),
        totalPremium: sum(options.totalPremium),
      })
      .from(options);
    
    if (period) {
      optionQuery = optionQuery.where(and(
        gte(options.entryDate, period.start),
        lte(options.entryDate, period.end)
      )) as any;
    }
    
    const [optionStats] = await optionQuery;
    
    return {
      totalTrades: (stockStats.totalTrades || 0) + (optionStats.totalTrades || 0),
      totalStockTrades: stockStats.totalTrades || 0,
      totalOptionTrades: optionStats.totalTrades || 0,
      totalStockValue: stockStats.totalValue || 0,
      totalPremium: optionStats.totalPremium || 0,
    };
  }

  // ========== SYNC MANAGEMENT ==========

  private async markSyncNeeded(tableName: string): Promise<void> {
    const db = this.getDb();
    
    await db
      .insert(syncMetadata)
      .values({
        id: tableName,
        tableName,
        lastSyncAt: new Date(),
        syncVersion: 1,
        pendingChanges: 1,
      })
      .onConflictDoUpdate({
        target: syncMetadata.id,
        set: {
          pendingChanges: sql`${syncMetadata.pendingChanges} + 1`,
          lastSyncAt: new Date(),
        },
      });
  }

  async getPendingSyncTables(): Promise<string[]> {
    const db = this.getDb();
    
    const tables = await db
      .select({ tableName: syncMetadata.tableName })
      .from(syncMetadata)
      .where(sql`${syncMetadata.pendingChanges} > 0`);
    
    return tables.map(t => t.tableName);
  }

  async markTableSynced(tableName: string): Promise<void> {
    const db = this.getDb();
    
    await db
      .update(syncMetadata)
      .set({
        pendingChanges: 0,
        lastSyncAt: new Date(),
      })
      .where(eq(syncMetadata.tableName, tableName));
  }

  // ========== CLEANUP ==========

  async cleanupExpiredData(): Promise<void> {
    // Currently no expiring data in stocks/options tables
    // This method is kept for future use
    console.log('Cleanup completed - no expired data to remove');
  }
}

// Singleton instance
let dbOperationsInstance: DatabaseOperations | null = null;
/**
 * Get or create database operations instance
 */
export function getDbOperations(): DatabaseOperations {
  if (!dbOperationsInstance) {
    dbOperationsInstance = new DatabaseOperations();
  }
  return dbOperationsInstance;
}
