/**
 * React hook for browser SQLite database operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserSQLiteClient, createBrowserDatabase } from './client';
import type { BrowserDatabaseOptions, QueryResult, ExecResult } from './types';

export interface UseBrowserDatabaseOptions extends BrowserDatabaseOptions {
  autoInit?: boolean;
}

export interface UseBrowserDatabaseReturn {
  // Database instance
  db: BrowserSQLiteClient | null;
  
  // Status
  isInitialized: boolean;
  isInitializing: boolean;
  error: Error | null;
  
  // Methods
  init: () => Promise<void>;
  execute: (sql: string, params?: any[]) => Promise<ExecResult>;
  query: (sql: string, params?: any[]) => Promise<QueryResult>;
  transaction: (queries: Array<{ sql: string; params?: any[] }>) => Promise<ExecResult[]>;
  close: () => Promise<void>;
  exportDb: () => Promise<Uint8Array>;
  importDb: (data: Uint8Array) => Promise<void>;
  
  // Utilities
  isOpfsSupported: boolean;
}

/**
 * Hook for managing browser SQLite database operations
 */
export function useBrowserDatabase(options: UseBrowserDatabaseOptions): UseBrowserDatabaseReturn {
  const [db, setDb] = useState<BrowserSQLiteClient | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const dbRef = useRef<BrowserSQLiteClient | null>(null);
  const isOpfsSupported = BrowserSQLiteClient.isOpfsSupported();

  // Initialize database
  const init = useCallback(async () => {
    if (isInitializing || isInitialized) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      const dbInstance = createBrowserDatabase(options);
      await dbInstance.init();
      
      dbRef.current = dbInstance;
      setDb(dbInstance);
      setIsInitialized(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to initialize database');
      setError(error);
      console.error('Database initialization failed:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [options, isInitializing, isInitialized]);

  // Execute SQL without results
  const execute = useCallback(async (sql: string, params?: any[]): Promise<ExecResult> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized');
    }

    try {
      setError(null);
      return await dbRef.current.execute(sql, params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('SQL execution failed');
      setError(error);
      throw error;
    }
  }, []);

  // Query SQL with results
  const query = useCallback(async (sql: string, params?: any[]): Promise<QueryResult> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized');
    }

    try {
      setError(null);
      return await dbRef.current.query(sql, params);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('SQL query failed');
      setError(error);
      throw error;
    }
  }, []);

  // Execute transaction
  const transaction = useCallback(async (
    queries: Array<{ sql: string; params?: any[] }>
  ): Promise<ExecResult[]> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized');
    }

    try {
      setError(null);
      return await dbRef.current.transaction(queries);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Transaction failed');
      setError(error);
      throw error;
    }
  }, []);

  // Close database
  const close = useCallback(async () => {
    if (dbRef.current) {
      try {
        await dbRef.current.close();
        dbRef.current = null;
        setDb(null);
        setIsInitialized(false);
        setError(null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to close database');
        setError(error);
        throw error;
      }
    }
  }, []);

  // Export database
  const exportDb = useCallback(async (): Promise<Uint8Array> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized');
    }

    try {
      setError(null);
      return await dbRef.current.export();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Database export failed');
      setError(error);
      throw error;
    }
  }, []);

  // Import database
  const importDb = useCallback(async (data: Uint8Array): Promise<void> => {
    if (!dbRef.current) {
      throw new Error('Database not initialized');
    }

    try {
      setError(null);
      await dbRef.current.import(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Database import failed');
      setError(error);
      throw error;
    }
  }, []);

  // Auto-initialize if requested
  useEffect(() => {
    if (options.autoInit !== false && !isInitialized && !isInitializing) {
      init();
    }
  }, [init, options.autoInit, isInitialized, isInitializing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dbRef.current) {
        dbRef.current.close().catch(console.error);
      }
    };
  }, []);

  return {
    db,
    isInitialized,
    isInitializing,
    error,
    init,
    execute,
    query,
    transaction,
    close,
    exportDb,
    importDb,
    isOpfsSupported,
  };
}

/**
 * Hook for creating and managing a simple table-based data store
 */
export function useTableStore<T extends Record<string, any>>(
  tableName: string,
  schema: string,
  dbOptions?: Omit<UseBrowserDatabaseOptions, 'initSql'>
) {
  const { isInitialized, execute, query, error, isInitializing } = useBrowserDatabase({
    ...dbOptions,
    dbName: dbOptions?.dbName || 'app-store',
    initSql: [schema],
  });

  const insert = useCallback(async (data: Partial<T>): Promise<number> => {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await execute(sql, values);
    return result.lastInsertRowid;
  }, [tableName, execute]);

  const update = useCallback(async (id: number, data: Partial<T>): Promise<number> => {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
    const result = await execute(sql, [...values, id]);
    return result.changes;
  }, [tableName, execute]);

  const remove = useCallback(async (id: number): Promise<number> => {
    const sql = `DELETE FROM ${tableName} WHERE id = ?`;
    const result = await execute(sql, [id]);
    return result.changes;
  }, [tableName, execute]);

  const findById = useCallback(async (id: number): Promise<T | null> => {
    const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
    const result = await query(sql, [id]);
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    return result.columns.reduce((obj, col, index) => {
      obj[col as keyof T] = row[index];
      return obj;
    }, {} as T);
  }, [tableName, query]);

  const findAll = useCallback(async (where?: string, params?: any[]): Promise<T[]> => {
    const sql = where 
      ? `SELECT * FROM ${tableName} WHERE ${where}`
      : `SELECT * FROM ${tableName}`;
    
    const result = await query(sql, params);
    
    return result.values.map(row => 
      result.columns.reduce((obj, col, index) => {
        obj[col as keyof T] = row[index];
        return obj;
      }, {} as T)
    );
  }, [tableName, query]);

  const count = useCallback(async (where?: string, params?: any[]): Promise<number> => {
    const sql = where 
      ? `SELECT COUNT(*) as count FROM ${tableName} WHERE ${where}`
      : `SELECT COUNT(*) as count FROM ${tableName}`;
    
    const result = await query(sql, params);
    return result.values[0]?.[0] || 0;
  }, [tableName, query]);

  return {
    isInitialized,
    isInitializing,
    error,
    insert,
    update,
    remove,
    findById,
    findAll,
    count,
  };
}
