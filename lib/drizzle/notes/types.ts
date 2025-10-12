/**
 * TypeScript types for Notes Operations
 * Provides type safety for trading notes data
 */

export * from './schema';

// Note form data type
export interface NoteFormData {
  name: string;
  content?: string;
}

// Note filters
export interface NoteFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Note statistics
export interface NoteStats {
  totalNotes: number;
  totalWords: number;
  averageWordsPerNote: number;
  lastUpdated?: string;
}

// Pagination options for notes
export interface NotePaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}

// Note content type for editor
export interface NoteContent {
  type: 'doc';
  content?: any[];
}

// Export types for easy imports in components
export type { 
  Note, 
  NewNote
} from './schema';
