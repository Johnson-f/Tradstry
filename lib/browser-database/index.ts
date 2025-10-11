/**
 * Browser SQLite Database - Export all modules
 */

// Core client
export { BrowserSQLiteClient, createBrowserDatabase } from './client';

// React hooks
export { useBrowserDatabase, useTableStore } from './use-browser-database';
export type { UseBrowserDatabaseOptions, UseBrowserDatabaseReturn } from './use-browser-database';

// Types
export type {
  DatabaseConfig,
  QueryResult,
  ExecResult,
  DatabaseClient,
  SqliteWorkerResponse,
  SqliteWorkerMessage,
  BrowserDatabaseOptions,
  QueryCallback,
} from './types';
