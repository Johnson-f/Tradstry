'use client';

import { createClient } from '@libsql/client';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

export interface BrowserDatabaseConfig {
  userId: string;
  remoteUrl?: string;
  authToken?: string;
}

/**
 * LibSQL Browser Database Client
 * Manages local SQLite database with optional cloud sync
 */
export class BrowserDatabaseClient {
  private client: ReturnType<typeof createClient> | null = null;
  private config: BrowserDatabaseConfig | null = null;

  /**
   * Initialize the browser database
   */
  async initialize(config: BrowserDatabaseConfig): Promise<void> {
    this.config = config;
    
    try {
      // Create local browser database
      const dbName = `tradistry_${config.userId.replace(/-/g, '_')}`;
      
      if (config.remoteUrl && config.authToken) {
        // Create client with cloud sync capability
        this.client = createClient({
          url: `file:${dbName}.db`,
          syncUrl: config.remoteUrl,
          authToken: config.authToken,
          syncInterval: 60000, // Sync every minute
        });
      } else {
        // Create local-only client
        this.client = createClient({
          url: `file:${dbName}.db`,
        });
      }

      console.log(`Browser database initialized: ${dbName}`);
    } catch (error) {
      console.error('Failed to initialize browser database:', error);
      throw error;
    }
  }

  /**
   * Get the libsql client instance
   */
  getClient() {
    if (!this.client) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Execute a SQL query
   */
  async execute(sql: string, params?: any[]) {
    const client = this.getClient();
    return await client.execute({
      sql,
      args: params || [],
    });
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const client = this.getClient();
    return await client.transaction(fn);
  }

  /**
   * Manually trigger sync with cloud database
   */
  async sync(): Promise<void> {
    if (!this.client) {
      throw new Error('Database not initialized');
    }

    try {
      if ('sync' in this.client) {
        await (this.client as any).sync();
        console.log('Database synced successfully');
      } else {
        console.warn('Sync not available - using local database only');
      }
    } catch (error) {
      console.error('Failed to sync database:', error);
      throw error;
    }
  }

  /**
   * Get cloud database credentials from backend
   */
  async setupCloudSync(userId: string): Promise<BrowserDatabaseConfig> {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session');
    }

    try {
      // Call your Rust backend to get user database info
      const response = await fetch(`http://localhost:3001/api/user/database-info/${userId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get database info: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        userId,
        remoteUrl: data.db_url,
        authToken: data.db_token,
      };
    } catch (error) {
      console.error('Failed to setup cloud sync:', error);
      // Return local-only config as fallback
      return { userId };
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.config = null;
    }
  }
}

// Singleton instance
let browserDbInstance: BrowserDatabaseClient | null = null;

/**
 * Get or create the browser database instance
 */
export function getBrowserDatabase(): BrowserDatabaseClient {
  if (!browserDbInstance) {
    browserDbInstance = new BrowserDatabaseClient();
  }
  return browserDbInstance;
}
