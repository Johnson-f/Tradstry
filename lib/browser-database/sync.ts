'use client';

import { createClient } from '@/lib/supabase/client';
import { getDbOperations } from './operations';
import { getBrowserDatabase } from './client';

/**
 * Database Sync Service
 * Handles synchronization between browser database and cloud database via Rust backend
 */
export class SyncService {
  private operations = getDbOperations();
  private browserDb = getBrowserDatabase();
  private isOnline = navigator.onLine;
  private syncInterval: NodeJS.Timeout | null = null;
  private userId: string | null = null;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.startAutoSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.stopAutoSync();
    });
  }

  /**
   * Initialize sync service
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    await this.operations.initialize(userId);
    
    if (this.isOnline) {
      await this.performInitialSync();
      this.startAutoSync();
    }

    console.log('Sync service initialized for user:', userId);
  }

  /**
   * Perform initial full sync when app starts
   */
  private async performInitialSync(): Promise<void> {
    if (!this.userId || !this.isOnline) return;

    try {
      console.log('Starting initial sync...');
      
      // Pull latest data from cloud
      await this.pullFromCloud();
      
      // Push any pending changes
      await this.pushToCloud();
      
      console.log('Initial sync completed');
    } catch (error) {
      console.error('Initial sync failed:', error);
    }
  }

  /**
   * Start automatic sync every 2 minutes
   */
  private startAutoSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(async () => {
      if (this.isOnline && this.userId) {
        await this.performSync();
      }
    }, 2 * 60 * 1000); // 2 minutes

    console.log('Auto-sync started');
  }

  /**
   * Stop automatic sync
   */
  private stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('Auto-sync stopped');
  }

  /**
   * Manually trigger sync
   */
  async manualSync(): Promise<{ success: boolean; error?: string }> {
    if (!this.isOnline) {
      return { success: false, error: 'No internet connection' };
    }

    if (!this.userId) {
      return { success: false, error: 'User not initialized' };
    }

    try {
      await this.performSync();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Perform bidirectional sync
   */
  private async performSync(): Promise<void> {
    try {
      // Push local changes first
      await this.pushToCloud();
      
      // Then pull remote changes
      await this.pullFromCloud();
      
      // Clean up expired data
      await this.operations.cleanupExpiredData();
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }

  /**
   * Push local changes to cloud via Rust backend
   */
  private async pushToCloud(): Promise<void> {
    if (!this.userId) return;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session for sync');
    }

    // Get tables with pending changes
    const pendingTables = await this.operations.getPendingSyncTables();
    
    for (const tableName of pendingTables) {
      try {
        await this.pushTableChanges(tableName, session.access_token);
        await this.operations.markTableSynced(tableName);
      } catch (error) {
        console.error(`Failed to push changes for table ${tableName}:`, error);
        // Continue with other tables
      }
    }
  }

  /**
   * Push changes for specific table to cloud
   */
  private async pushTableChanges(tableName: string, token: string): Promise<void> {
    let pendingRecords: any[] = [];

    // Get pending records based on table type
    switch (tableName) {
      case 'stock_trades':
        pendingRecords = await this.getPendingStockTrades();
        break;
      case 'option_trades':
        pendingRecords = await this.getPendingOptionTrades();
        break;
      default:
        return;
    }

    if (pendingRecords.length === 0) return;

    // Send to Rust backend
    const response = await fetch(`http://localhost:3001/api/sync/${tableName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: pendingRecords }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync ${tableName}: ${response.statusText}`);
    }

    console.log(`Pushed ${pendingRecords.length} changes for ${tableName}`);
  }

  /**
   * Pull latest data from cloud
   */
  private async pullFromCloud(): Promise<void> {
    if (!this.userId) return;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session for sync');
    }

    try {
      // Get last sync timestamp
      const lastSyncAt = await this.getLastSyncTimestamp();
      
      // Pull updated data from cloud
      const response = await fetch(`http://localhost:3001/api/sync/pull?since=${lastSyncAt}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to pull data: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update local database with cloud data
      await this.applyCloudUpdates(data);
      
      console.log('Pulled updates from cloud');
    } catch (error) {
      console.error('Failed to pull from cloud:', error);
      throw error;
    }
  }

  /**
   * Apply cloud updates to local database
   */
  private async applyCloudUpdates(data: any): Promise<void> {
    // Apply stock trades updates
    if (data.stock_trades) {
      for (const trade of data.stock_trades) {
        await this.operations.addStockTrade({
          ...trade,
          syncStatus: 'synced',
        });
      }
    }

    // Apply option trades updates
    if (data.option_trades) {
      for (const trade of data.option_trades) {
        await this.operations.addOptionTrade({
          ...trade,
          syncStatus: 'synced',
        });
      }
    }

    // Apply portfolio updates
    if (data.portfolio_positions) {
      for (const position of data.portfolio_positions) {
        await this.operations.updatePortfolioPosition(position);
      }
    }
  }

  /**
   * Get pending stock trades for sync
   */
  private async getPendingStockTrades(): Promise<any[]> {
    // This would need to be implemented in operations.ts
    // For now, return empty array
    return [];
  }

  /**
   * Get pending option trades for sync
   */
  private async getPendingOptionTrades(): Promise<any[]> {
    // This would need to be implemented in operations.ts
    // For now, return empty array
    return [];
  }

  /**
   * Get last sync timestamp
   */
  private async getLastSyncTimestamp(): Promise<string> {
    // Get from sync metadata table
    // For now, return current time minus 1 day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return oneDayAgo.toISOString();
  }

  /**
   * Check sync status
   */
  getSyncStatus(): { 
    isOnline: boolean; 
    lastSync: Date | null; 
    pendingChanges: number;
  } {
    return {
      isOnline: this.isOnline,
      lastSync: null, // Would get from sync metadata
      pendingChanges: 0, // Would count from operations
    };
  }

  /**
   * Enable offline mode
   */
  enableOfflineMode(): void {
    this.stopAutoSync();
    console.log('Offline mode enabled - all changes will be queued for sync');
  }

  /**
   * Cleanup sync service
   */
  destroy(): void {
    this.stopAutoSync();
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

/**
 * Get or create sync service instance
 */
export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}
