/**
 * Notes Database Module
 * Entry point for all notes-related database operations
 */

// Export schema and types
export * from './schema';
export * from './types';

// Export operations hook
export { useNotesDatabase } from './operations';

// Re-export common types for convenience
export type { 
  Note, 
  NewNote,
  NoteFormData,
  NoteFilters,
  NoteStats,
  NotePaginationOptions,
  NoteContent
} from './types';
