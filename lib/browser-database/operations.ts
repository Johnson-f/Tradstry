'use client';

import { eq, desc, and, gte, lte, sql, count, sum } from 'drizzle-orm';
import { getDrizzleDb } from './drizzle';
import { 
  stockTrades, 
  optionTrades, 
  portfolioPositions, 
  tradingAnalytics,
  marketData,
  aiInsights,
  syncMetadata,
  users,
  type StockTrade,
  type NewStockTrade,
  type OptionTrade,
  type NewOptionTrade,
  type PortfolioPosition,
  type NewPortfolioPosition,
  type MarketData,
  type NewMarketData,
  type AiInsight,
  type NewAiInsight,
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

  // ========== STOCK TRADES ==========

  async getStockTrades(userId: string, limit = 100): Promise<StockTrade[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(stockTrades)
      .where(eq(stockTrades.userId, userId))
      .orderBy(desc(stockTrades.tradeDate))
      .limit(limit);
  }

  async addStockTrade(trade: NewStockTrade): Promise<StockTrade> {
    const db = this.getDb();
    const tradeWithSync = {
      ...trade,
      syncStatus: 'pending' as const,
    };
    
    await db.insert(stockTrades).values(tradeWithSync);
    
    // Mark sync as needed
    await this.markSyncNeeded('stock_trades');
    
    // Return the inserted trade
    const [insertedTrade] = await db
      .select()
      .from(stockTrades)
      .where(eq(stockTrades.id, trade.id!))
      .limit(1);
    
    return insertedTrade;
  }

  async updateStockTrade(id: string, updates: Partial<NewStockTrade>): Promise<StockTrade> {
    const db = this.getDb();
    const updatesWithSync = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'pending' as const,
    };
    
    await db
      .update(stockTrades)
      .set(updatesWithSync)
      .where(eq(stockTrades.id, id));
    
    await this.markSyncNeeded('stock_trades');
    
    const [updatedTrade] = await db
      .select()
      .from(stockTrades)
      .where(eq(stockTrades.id, id))
      .limit(1);
    
    return updatedTrade;
  }

  async deleteStockTrade(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete(stockTrades).where(eq(stockTrades.id, id));
    await this.markSyncNeeded('stock_trades');
  }

  // ========== OPTION TRADES ==========

  async getOptionTrades(userId: string, limit = 100): Promise<OptionTrade[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(optionTrades)
      .where(eq(optionTrades.userId, userId))
      .orderBy(desc(optionTrades.tradeDate))
      .limit(limit);
  }

  async addOptionTrade(trade: NewOptionTrade): Promise<OptionTrade> {
    const db = this.getDb();
    const tradeWithSync = {
      ...trade,
      syncStatus: 'pending' as const,
    };
    
    await db.insert(optionTrades).values(tradeWithSync);
    await this.markSyncNeeded('option_trades');
    
    const [insertedTrade] = await db
      .select()
      .from(optionTrades)
      .where(eq(optionTrades.id, trade.id!))
      .limit(1);
    
    return insertedTrade;
  }

  async updateOptionTrade(id: string, updates: Partial<NewOptionTrade>): Promise<OptionTrade> {
    const db = this.getDb();
    const updatesWithSync = {
      ...updates,
      updatedAt: new Date(),
      syncStatus: 'pending' as const,
    };
    
    await db
      .update(optionTrades)
      .set(updatesWithSync)
      .where(eq(optionTrades.id, id));
    
    await this.markSyncNeeded('option_trades');
    
    const [updatedTrade] = await db
      .select()
      .from(optionTrades)
      .where(eq(optionTrades.id, id))
      .limit(1);
    
    return updatedTrade;
  }

  async deleteOptionTrade(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete(optionTrades).where(eq(optionTrades.id, id));
    await this.markSyncNeeded('option_trades');
  }

  // ========== PORTFOLIO POSITIONS ==========

  async getPortfolioPositions(userId: string): Promise<PortfolioPosition[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(portfolioPositions)
      .where(eq(portfolioPositions.userId, userId))
      .orderBy(desc(portfolioPositions.totalShares));
  }

  async updatePortfolioPosition(position: NewPortfolioPosition): Promise<void> {
    const db = this.getDb();
    await db
      .insert(portfolioPositions)
      .values(position)
      .onConflictDoUpdate({
        target: portfolioPositions.id,
        set: {
          totalShares: position.totalShares,
          averageCost: position.averageCost,
          currentPrice: position.currentPrice,
          marketValue: position.marketValue,
          unrealizedPnl: position.unrealizedPnl,
          totalPnl: position.totalPnl,
          percentChange: position.percentChange,
          lastUpdated: new Date(),
        },
      });
  }

  // ========== MARKET DATA ==========

  async getMarketData(symbols: string[]): Promise<MarketData[]> {
    const db = this.getDb();
    const now = new Date();
    
    return await db
      .select()
      .from(marketData)
      .where(and(
        sql`${marketData.symbol} IN ${symbols}`,
        gte(marketData.expiresAt, now)
      ));
  }

  async cacheMarketData(data: NewMarketData[]): Promise<void> {
    const db = this.getDb();
    
    for (const item of data) {
      await db
        .insert(marketData)
        .values(item)
        .onConflictDoUpdate({
          target: marketData.symbol,
          set: {
            companyName: item.companyName,
            currentPrice: item.currentPrice,
            changeAmount: item.changeAmount,
            changePercent: item.changePercent,
            dayHigh: item.dayHigh,
            dayLow: item.dayLow,
            volume: item.volume,
            marketCap: item.marketCap,
            lastUpdated: new Date(),
            expiresAt: item.expiresAt,
          },
        });
    }
  }

  // ========== AI INSIGHTS ==========

  async getAiInsights(userId: string, limit = 20): Promise<AiInsight[]> {
    const db = this.getDb();
    const now = new Date();
    
    return await db
      .select()
      .from(aiInsights)
      .where(and(
        eq(aiInsights.userId, userId),
        sql`(${aiInsights.expiresAt} IS NULL OR ${aiInsights.expiresAt} > ${now})`
      ))
      .orderBy(desc(aiInsights.createdAt))
      .limit(limit);
  }

  async addAiInsight(insight: NewAiInsight): Promise<AiInsight> {
    const db = this.getDb();
    await db.insert(aiInsights).values(insight);
    
    const [insertedInsight] = await db
      .select()
      .from(aiInsights)
      .where(eq(aiInsights.id, insight.id!))
      .limit(1);
    
    return insertedInsight;
  }

  async markInsightAsRead(id: string): Promise<void> {
    const db = this.getDb();
    await db
      .update(aiInsights)
      .set({ isRead: true })
      .where(eq(aiInsights.id, id));
  }

  // ========== ANALYTICS ==========

  async getTradingStats(userId: string, period?: { start: Date; end: Date }) {
    const db = this.getDb();
    
    let stockQuery = db
      .select({
        totalTrades: count(),
        totalPnl: sum(stockTrades.totalCost),
      })
      .from(stockTrades)
      .where(eq(stockTrades.userId, userId));
    
    if (period) {
      stockQuery = stockQuery.where(and(
        eq(stockTrades.userId, userId),
        gte(stockTrades.tradeDate, period.start),
        lte(stockTrades.tradeDate, period.end)
      )) as any;
    }
    
    const [stockStats] = await stockQuery;
    
    let optionQuery = db
      .select({
        totalTrades: count(),
        totalPnl: sum(optionTrades.totalCost),
      })
      .from(optionTrades)
      .where(eq(optionTrades.userId, userId));
    
    if (period) {
      optionQuery = optionQuery.where(and(
        eq(optionTrades.userId, userId),
        gte(optionTrades.tradeDate, period.start),
        lte(optionTrades.tradeDate, period.end)
      )) as any;
    }
    
    const [optionStats] = await optionQuery;
    
    return {
      totalTrades: (stockStats.totalTrades || 0) + (optionStats.totalTrades || 0),
      totalStockTrades: stockStats.totalTrades || 0,
      totalOptionTrades: optionStats.totalTrades || 0,
      totalPnl: (stockStats.totalPnl || 0) + (optionStats.totalPnl || 0),
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
    const db = this.getDb();
    const now = new Date();
    
    // Clean expired market data
    await db
      .delete(marketData)
      .where(lte(marketData.expiresAt, now));
    
    // Clean expired AI insights
    await db
      .delete(aiInsights)
      .where(and(
        sql`${aiInsights.expiresAt} IS NOT NULL`,
        lte(aiInsights.expiresAt, now)
      ));
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
