/**
 * Journal Database Module
 * Entry point for all journal-related database operations
 */

// Export schema and types
export * from './schema';
export * from './types';

// Export operations hook
export { useJournalDatabase } from './operations';

// Export utility functions
export { TradeType, OrderType, AssetType } from './schema';

// Re-export common types for convenience
export type { 
  JournalTrade, 
  NewJournalTrade,
  TradeFormData,
  TradeFilters,
  TradeStats,
  PaginationOptions
} from './types';
