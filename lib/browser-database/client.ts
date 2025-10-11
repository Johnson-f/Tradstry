/**
 * Browser SQLite database client using sqlite-wasm
 * Supports both in-memory and persistent (OPFS) storage
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type {
  DatabaseClient,
  BrowserDatabaseOptions,
  QueryResult,
  ExecResult,
  QueryCallback,
} from './types';

export class BrowserSQLiteClient implements DatabaseClient {
  private promiser: any = null;
  private dbId: string | null = null;
  private readonly options: Required<BrowserDatabaseOptions>;
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
      console.log('Initializing SQLite WASM module...');
      
      // Initialize the SQLite WASM module using the official method
      const sqlite3 = await sqlite3InitModule();
      console.log('SQLite WASM module initialized successfully');
      console.log('SQLite version:', sqlite3.version.libVersion);

      // Create database instance
      let db: any;
      
      if (this.options.enablePersistence && this.isOpfsAvailable()) {
        try {
          // Try to use OPFS for persistence
          console.log('Attempting to create OPFS database...');
          db = new sqlite3.oo1.OpfsDb(this.options.dbName);
          console.log('OPFS database created successfully:', this.options.dbName);
        } catch (opfsError) {
          console.warn('OPFS database creation failed, falling back to in-memory:', opfsError);
          db = new sqlite3.oo1.DB();
          console.log('In-memory database created as fallback');
        }
      } else {
        // Use in-memory database
        console.log('Creating in-memory database...');
        db = new sqlite3.oo1.DB();
        console.log('In-memory database created successfully');
      }

      // Store the database instance and mark as initialized BEFORE running init SQL
      this.promiser = db;
      this.dbId = 'main'; // For compatibility with the existing interface
      this.isInitialized = true;

      // Run initialization SQL if provided
      if (this.options.initSql.length > 0) {
        console.log('Executing initialization SQL...');
        for (const sql of this.options.initSql) {
          try {
            // Execute SQL directly without using this.execute to avoid recursion
            db.exec(sql);
            console.log('Executed SQL:', sql.substring(0, 50) + '...');
          } catch (sqlError) {
            console.error('Failed to execute init SQL:', sql, sqlError);
            throw sqlError;
          }
        }
        console.log('Database initialization SQL executed successfully');
      }

      console.log('Database initialization completed successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      // Reset state on error
      this.isInitialized = false;
      this.promiser = null;
      this.dbId = null;
      throw error;
    }
  }

  /**
   * Execute SQL without returning results (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  async execute(sql: string, params: any[] = []): Promise<ExecResult> {
    this.ensureInitialized();

    try {
      const db = this.promiser;
      
      if (params.length > 0) {
        console.log('Executing with parameters:', { sql, params });
        
        // Use prepared statement approach - this is the correct way
        const stmt = db.prepare(sql);
        
        try {
          // Bind parameters
          stmt.bind(params);
          
          // Execute the statement
          stmt.step();
          
          // Get results - changes() is a method, but we access the result directly
          const changes = db.changes();
          const lastInsertRowid = db.pointer ? 
            this.getLastInsertRowid(db) : 0;
          
          console.log('Execute successful:', { changes, lastInsertRowid });
          
          // Clean up
          stmt.finalize();
          
          return {
            changes,
            lastInsertRowid,
          };
        } catch (stmtError) {
          console.error('Statement execution error:', stmtError);
          // Make sure to finalize even on error
          try {
            stmt.finalize();
          } catch (finalizeError) {
            console.error('Failed to finalize statement:', finalizeError);
          }
          throw stmtError;
        }
      } else {
        // Execute simple SQL without parameters
        db.exec(sql);
        
        return {
          changes: db.changes(),
          lastInsertRowid: this.getLastInsertRowid(db),
        };
      }
    } catch (error) {
      console.error('Failed to execute SQL:', { sql, params, error });
      throw error;
    }
  }

  /**
   * Helper to get lastInsertRowid from the database
   * Using the C API directly since the OO1 API doesn't expose this clearly
   */
  private getLastInsertRowid(db: any): number {
    try {
      // The db.pointer property holds the sqlite3* pointer
      // We need to use the C API to get the last insert rowid
      const sqlite3 = (globalThis as any).sqlite3;
      if (sqlite3 && sqlite3.capi && sqlite3.capi.sqlite3_last_insert_rowid) {
        return sqlite3.capi.sqlite3_last_insert_rowid(db.pointer);
      }
      // Fallback: return 0 if we can't access the C API
      return 0;
    } catch (e) {
      console.warn('Failed to get lastInsertRowid:', e);
      return 0;
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
        // Use prepared statement with parameters
        const stmt = db.prepare(sql);
        
        try {
          // Bind parameters
          stmt.bind(params);
          
          // Get column names
          result.columns = stmt.getColumnNames();
          
          // Execute and collect results
          while (stmt.step()) {
            result.values.push(stmt.get([]));
          }
          
          // Clean up
          stmt.finalize();
        } catch (stmtError) {
          // Make sure to finalize even on error
          try {
            stmt.finalize();
          } catch (finalizeError) {
            console.error('Failed to finalize statement:', finalizeError);
          }
          throw stmtError;
        }
      } else {
        // Execute simple SQL and collect results
        db.exec({
          sql: sql,
          rowMode: 'array',
          callback: (row: any) => {
            result.values.push(row);
          }
        });
        
        // Get column names if we have results
        if (result.values.length > 0) {
          const stmt = db.prepare(sql);
          result.columns = stmt.getColumnNames();
          stmt.finalize();
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to query SQL:', { sql, params, error });
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
      // Begin transaction
      await this.execute('BEGIN TRANSACTION');

      try {
        // Execute all queries
        for (const query of queries) {
          const result = await this.execute(query.sql, query.params || []);
          results.push(result);
        }

        // Commit transaction
        await this.execute('COMMIT');
        
        return results;
      } catch (error) {
        // Rollback on error
        await this.execute('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Export database as Uint8Array
   */
  async export(): Promise<Uint8Array> {
    this.ensureInitialized();

    try {
      const db = this.promiser;
      const sqlite3 = (globalThis as any).sqlite3;
      
      if (sqlite3 && sqlite3.capi && sqlite3.capi.sqlite3_js_db_export) {
        return sqlite3.capi.sqlite3_js_db_export(db.pointer);
      }
      
      // Fallback to OO1 API if available
      if (typeof db.export === 'function') {
        return db.export();
      }
      
      throw new Error('Database export not supported');
    } catch (error) {
      console.error('Failed to export database:', error);
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
      
      // Close current database and create new one with imported data
      db.close();
      
      // Re-initialize with imported data
      const sqlite3 = await sqlite3InitModule();
      const newDb = new sqlite3.oo1.DB();
      
      // Import the data
      const capi = sqlite3.capi;
      if (capi && capi.sqlite3_deserialize) {
        capi.sqlite3_deserialize(newDb.pointer, 'main', data, data.byteLength, data.byteLength, 0);
      } else if (typeof newDb.deserialize === 'function') {
        newDb.deserialize(data);
      } else {
        throw new Error('Database import not supported');
      }
      
      this.promiser = newDb;
      console.log('Database imported successfully');
    } catch (error) {
      console.error('Failed to import database:', error);
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
      const db = this.promiser;
      db.close();

      this.promiser = null;
      this.dbId = null;
      this.isInitialized = false;
      console.log('Database connection closed');
    } catch (error) {
      console.error('Failed to close database:', error);
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