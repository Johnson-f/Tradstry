/**
 * SQLite WASM database types and interfaces
 */

export interface DatabaseConfig {
  dbName: string;
  persistData?: boolean;
  enableOpfs?: boolean;
}

export interface QueryResult {
  columns: string[];
  values: any[][];
  changes?: number;
  lastInsertRowid?: number;
}

export interface ExecResult {
  changes: number;
  lastInsertRowid: number;
}

export interface DatabaseClient {
  isInitialized: boolean;
  init(): Promise<void>;
  execute(sql: string, params?: any[]): Promise<ExecResult>;
  query(sql: string, params?: any[]): Promise<QueryResult>;
  transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<ExecResult[]>;
  close(): Promise<void>;
  export(): Promise<Uint8Array>;
  import(data: Uint8Array): Promise<void>;
}

export interface SqliteWorkerResponse {
  messageId: string;
  dbId?: string;
  error?: {
    message: string;
    stack?: string;
  };
  result?: any;
}

export interface SqliteWorkerMessage {
  messageId: string;
  type: 'open' | 'exec' | 'close' | 'export' | 'config-get';
  args?: {
    filename?: string;
    sql?: string;
    bind?: any[];
    dbId?: string;
  };
}

export interface BrowserDatabaseOptions {
  dbName: string;
  enablePersistence?: boolean;
  initSql?: string[];
}

export type QueryCallback = (result: { row?: any; column?: string; rowNumber?: number }) => void;
