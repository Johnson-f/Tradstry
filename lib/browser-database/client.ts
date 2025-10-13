/**
 * Browser SQLite database client using sqlite-wasm
 * Supports both in-memory and persistent (OPFS) storage
 * With IndexedDB fallback for main thread persistence
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type {
  DatabaseClient,
  BrowserDatabaseOptions,
  QueryResult,
  ExecResult,
  QueryCallback,
} from './types';

/**
 * Simple IndexedDB-backed SQLite persistence layer
 * Stores the entire database as a blob in IndexedDB
 */
class IndexedDBSQLitePersistence {
  private dbName: string;
  private readonly IDB_NAME = 'sqlite-persistence';
  private readonly IDB_STORE = 'databases';

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.IDB_NAME, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.IDB_STORE)) {
          db.createObjectStore(this.IDB_STORE);
        }
      };
    });
  }

  async load(): Promise<Uint8Array | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.IDB_STORE], 'readonly');
        const store = transaction.objectStore(this.IDB_STORE);
        const request = store.get(this.dbName);
        
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return null;
    }
  }

  async save(data: Uint8Array): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.IDB_STORE], 'readwrite');
        const store = transaction.objectStore(this.IDB_STORE);
        const request = store.put(data, this.dbName);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      throw error;
    }
  }

  async delete(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.IDB_STORE], 'readwrite');
        const store = transaction.objectStore(this.IDB_STORE);
        const request = store.delete(this.dbName);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      throw error;
    }
  }
}

export class BrowserSQLiteClient implements DatabaseClient {
  private promiser: any = null;
  private dbId: string | null = null;
  private sqlite3: any = null; // Store SQLite3 instance
  private readonly options: Required<BrowserDatabaseOptions>;
  private persistence: IndexedDBSQLitePersistence | null = null;
  private persistenceEnabled = false;
  private autoSaveTimer: any = null;
  public isInitialized = false;

  constructor(options: BrowserDatabaseOptions) {
    this.options = {
      dbName: options.dbName,
      enablePersistence: options.enablePersistence ?? true,
      initSql: options.initSql ?? [],
    };
  }

  /**
   * Initialize the SQLite WASM module and open database
   */
  async init(): Promise<void> {
    try {
      
      // Initialize the SQLite WASM module using the official method
      this.sqlite3 = await sqlite3InitModule();
      // Make sqlite3 available globally for CAPI access
      (globalThis as any).sqlite3 = this.sqlite3;

      // Create database instance
      let db: any;
      let storageType = 'in-memory';
      
      // Check if we're in a Worker thread
      const isWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
      
      if (this.options.enablePersistence) {
        if (isWorker && this.isOpfsAvailable()) {
          try {
            // Try to use OPFS for persistence (Worker thread only)
            
            // Check if SharedArrayBuffer is available (indicates COOP/COEP headers are set)
            if (typeof SharedArrayBuffer === 'undefined') {
              throw new Error('SharedArrayBuffer not available');
            }
            
            db = new this.sqlite3.oo1.OpfsDb(this.options.dbName, 'c');
            storageType = 'OPFS';
          } catch (opfsError) {
            db = null;
          }
        }
        
        // If OPFS failed or we're in main thread, try IndexedDB
        if (!db) {
          try {
            
            // Create in-memory database first
            db = new this.sqlite3.oo1.DB();
            
            // Set up IndexedDB persistence layer
            this.persistence = new IndexedDBSQLitePersistence(this.options.dbName);
            
            // Try to load existing database from IndexedDB
            const existingData = await this.persistence.load();
            if (existingData && existingData.byteLength > 0) {
              
              try {
                // Close the empty db
                db.close();
                
                // Create a new database
                db = new this.sqlite3.oo1.DB();
                
                // Use the proper WASM allocation method from the cookbook
                const p = this.sqlite3.wasm.allocFromTypedArray(existingData);
                const rc = this.sqlite3.capi.sqlite3_deserialize(
                  db.pointer,
                  'main',
                  p,
                  existingData.byteLength,
                  existingData.byteLength,
                  this.sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
                );
                
                // Check the result
                db.checkRc(rc);
              } catch (deserializeError) {
                // Create a fresh database on error
                if (db && typeof db.close === 'function') {
                  try {
                    db.close();
                  } catch (closeError) {
                  }
                }
                db = new this.sqlite3.oo1.DB();
              }
            } else {
            }
            
            this.persistenceEnabled = true;
            storageType = 'IndexedDB';
          } catch (idbError) {
            if (!db) {
              db = new this.sqlite3.oo1.DB();
            }
            this.persistenceEnabled = false;
          }
        }
      }
      
      // Final fallback to in-memory
      if (!db) {
        db = new this.sqlite3.oo1.DB();
        this.isInitialized = true;
      }

      // Store the database instance and mark as initialized BEFORE running init SQL
      this.promiser = db;
      this.dbId = 'main';
      this.isInitialized = true;
      
      // Log the actual storage being used
      if (storageType === 'in-memory' && !this.persistenceEnabled) {
      } else {
      }

      // Run initialization SQL if provided
      if (this.options.initSql.length > 0) {
        for (const sql of this.options.initSql) {
          try {
            db.exec(sql);
          } catch (sqlError) {
            throw sqlError;
          }
        }
      }

      // Save initial state if using IndexedDB
      if (this.persistenceEnabled && this.persistence) {
        await this.saveToIndexedDB();
        
        // Add event listener to save database before page unload
        if (typeof window !== 'undefined') {
          window.addEventListener('beforeunload', () => {
            // Synchronous save on page unload
            try {
              if (this.persistenceEnabled && this.sqlite3?.capi && this.promiser) {
                const serialized = this.sqlite3.capi.sqlite3_js_db_export(this.promiser.pointer);
                if (serialized && this.persistence) {
                  // Use synchronous IndexedDB operations for beforeunload
                }
              }
            } catch (error) {
            }
          });
        }
      }

    } catch (error) {
      // Reset state on error
      this.isInitialized = false;
      this.promiser = null;
      this.dbId = null;
      throw error;
    }
  }

  /**
   * Save the current database state to IndexedDB
   */
  private async saveToIndexedDB(): Promise<void> {
    if (!this.persistenceEnabled || !this.persistence || !this.promiser || !this.sqlite3) {
      return;
    }

    try {
      if (!this.sqlite3?.capi) {
        return;
      }

      const db = this.promiser;
      const capi = this.sqlite3.capi;
      
      // Serialize the database using the export function
      const serialized = capi.sqlite3_js_db_export(db.pointer);
      
      if (serialized && serialized.byteLength > 0) {
        await this.persistence.save(serialized);
      } else {
      }
    } catch (error) {
    }
  }

  /**
   * Schedule an auto-save (debounced)
   */
  private scheduleAutoSave(): void {
    if (!this.persistenceEnabled || !this.persistence) return;

    // Clear existing timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // Schedule save for 500ms from now (more responsive)
    this.autoSaveTimer = setTimeout(() => {
      this.saveToIndexedDB().catch(error => {
      });
    }, 500);
  }

  /**
   * Execute SQL without returning results (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  async execute(sql: string, params: any[] = []): Promise<ExecResult> {
    this.ensureInitialized();

    try {
      const db = this.promiser;
      
      if (params.length > 0) {
        
        const stmt = db.prepare(sql);
        
        try {
          stmt.bind(params);
          stmt.step();
          
          const changes = db.changes();
          const lastInsertRowid = this.sqlite3?.capi?.sqlite3_last_insert_rowid
            ? this.sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)
            : 0;
          
          
          stmt.finalize();
          
          // Schedule auto-save for IndexedDB persistence
          this.scheduleAutoSave();
          
          return {
            changes,
            lastInsertRowid,
          };
        } catch (stmtError) {
          try {
            stmt.finalize();
          } catch (finalizeError) {
          }
          throw stmtError;
        }
      } else {
        db.exec(sql);
        
        const result = {
          changes: db.changes(),
          lastInsertRowid: this.sqlite3?.capi?.sqlite3_last_insert_rowid
            ? this.sqlite3.capi.sqlite3_last_insert_rowid(db.pointer)
            : 0,
        };
        
        // Schedule auto-save for IndexedDB persistence
        this.scheduleAutoSave();
        
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Query SQL and return results (SELECT)
   */
  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    this.ensureInitialized();

    try {
      const db = this.promiser;
      const result: QueryResult = {
        columns: [],
        values: [],
      };

      if (params.length > 0) {
        const stmt = db.prepare(sql);
        
        try {
          stmt.bind(params);
          result.columns = stmt.getColumnNames();
          
          while (stmt.step()) {
            result.values.push(stmt.get([]));
          }
          
          stmt.finalize();
        } catch (stmtError) {
          try {
            stmt.finalize();
          } catch (finalizeError) {
          }
          throw stmtError;
        }
      } else {
        db.exec({
          sql: sql,
          rowMode: 'array',
          callback: (row: any) => {
            result.values.push(row);
          }
        });
        
        if (result.values.length > 0) {
          const stmt = db.prepare(sql);
          result.columns = stmt.getColumnNames();
          stmt.finalize();
        }
      }

      // Schedule auto-save for IndexedDB persistence
      this.scheduleAutoSave();

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute multiple SQL statements in a transaction
   */
  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<ExecResult[]> {
    this.ensureInitialized();

    const results: ExecResult[] = [];

    try {
      await this.execute('BEGIN TRANSACTION');

      try {
        for (const query of queries) {
          const result = await this.execute(query.sql, query.params || []);
          results.push(result);
        }

        await this.execute('COMMIT');
        
        return results;
      } catch (error) {
        await this.execute('ROLLBACK');
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Export database as Uint8Array
   */
  async export(): Promise<Uint8Array> {
    this.ensureInitialized();

    try {
      if (!this.sqlite3?.capi) {
        throw new Error('SQLite CAPI not available');
      }

      const db = this.promiser;
      return this.sqlite3.capi.sqlite3_js_db_export(db.pointer);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Import database from Uint8Array
   */
  async import(data: Uint8Array): Promise<void> {
    this.ensureInitialized();

    try {
      const db = this.promiser;
      db.close();
      
      const sqlite3 = await sqlite3InitModule();
      const newDb = new sqlite3.oo1.DB();
      
      const capi = sqlite3.capi;
      const rc = capi.sqlite3_deserialize(
        newDb.pointer,
        'main',
        data,
        data.byteLength,
        data.byteLength,
        capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE
      );
      
      if (rc !== 0) {
        throw new Error(`Failed to import database: ${rc}`);
      }
      
      this.promiser = newDb;
      
      // Save to IndexedDB if persistence is enabled
      if (this.persistenceEnabled) {
        await this.saveToIndexedDB();
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (!this.isInitialized || !this.promiser) {
      return;
    }

    try {
      // Clear auto-save timer
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }

      // Final save to IndexedDB
      if (this.persistenceEnabled && this.persistence) {
        try {
          await this.saveToIndexedDB();
        } catch (error) {
        }
      }

      const db = this.promiser;
      if (db && typeof db.close === 'function') {
        db.close();
      }

      this.promiser = null;
      this.dbId = null;
      this.sqlite3 = null;
      this.isInitialized = false;
      this.persistence = null;
      this.persistenceEnabled = false;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if the browser supports OPFS
   */
  static isOpfsSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    );
  }

  /**
   * Instance method to check OPFS availability
   */
  private isOpfsAvailable(): boolean {
    return BrowserSQLiteClient.isOpfsSupported();
  }

  /**
   * Ensure the database is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.dbId) {
      throw new Error('Database not initialized. Call init() first.');
    }
  }
}

/**
 * Create a new browser SQLite database client
 */
export function createBrowserDatabase(options: BrowserDatabaseOptions): BrowserSQLiteClient {
  return new BrowserSQLiteClient(options);
}