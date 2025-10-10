/**
 * Browser Database - Main Entry Point
 * 
 * This module provides a complete browser-based SQLite database solution using:
 * - @libsql/client for SQLite database operations
 * - Drizzle ORM for type-safe database queries
 * - Automatic sync with cloud database via Rust backend
 * - Offline-first architecture with conflict resolution
 */

// Core exports
export { BrowserDatabaseClient, getBrowserDatabase } from './client';
export { DrizzleDatabase, getDrizzleDb } from './drizzle';
export { DatabaseOperations, getDbOperations } from './operations';
export { SyncService, getSyncService } from './sync';

// Schema and types
export * from './schema';

// Re-export for convenience
export type { BrowserDatabaseConfig } from './client';
