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
export { 
  TradeType, 
  OrderType, 
  TradeDirection, 
  OptionType, 
  Status 
} from './schema';

// Re-export common types for convenience
export type { 
  Stock, 
  NewStock,
  Option, 
  NewOption,
  Trade,
  NewTrade,
  TradeFormData,
  TradeFilters,
  TradeStats,
  PaginationOptions
} from './types';
