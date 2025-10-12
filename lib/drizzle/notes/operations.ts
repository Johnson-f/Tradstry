/**
 * Notes Operations using Drizzle ORM + Browser SQLite
 * Provides CRUD operations for trading notes
 */

import { eq, and, desc, asc, count, sql, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { useCallback } from 'react';
import { useBrowserDatabase } from '@/lib/browser-database';
import { 
  notesTable, 
  notesIndexes, 
  type Note, 
  type NewNote
} from './schema';

// Helper function to convert snake_case to camelCase
const snakeToCamel = (s: string) => s.replace(/([-_][a-z])/ig, ($1) => {
  return $1.toUpperCase()
    .replace('-', '')
    .replace('_', '');
});

// Helper function to generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Hook for notes database operations
 */
export function useNotesDatabase(userId: string) {
  const { isInitialized, isInitializing, error, execute, query, init } = useBrowserDatabase({
    dbName: 'tradistry-notes',
    enablePersistence: true,
    initSql: [
      // Create notes table
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      
      // Create notes indexes
      `CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at)`
    ],
    autoInit: true
  });

  // Create Drizzle instance with SQLite proxy
  const db = drizzle(async (sql, params, method) => {
    try {
      if (method === 'run') {
        const result = await execute(sql, params);
        return { rows: [], meta: {} };
      } else {
        const result = await query(sql, params);
        return { rows: result.values.map(row => 
          result.columns.reduce((obj, col, idx) => ({ ...obj, [col]: row[idx] }), {})
        )};
      }
    } catch (error) {
      throw error;
    }
  });

  /**
   * Insert a new note
   */
  const insertNote = useCallback(async (note: Omit<NewNote, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Note> => {
    const id = generateUUID();
    
    if (!userId) {
      throw new Error("User ID is required but not provided");
    }
    
    const sql = `
      INSERT INTO notes (id, user_id, name, content)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `;
    
    const params = [
      id,
      userId,
      note.name,
      note.content || ''
    ];

    const result = await query(sql, params);
    if (result.values.length === 0) {
      throw new Error('Failed to insert note');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Note;
  }, [userId, query]);

  /**
   * Update an existing note
   */
  const updateNote = useCallback(async (id: string, updates: Partial<Omit<NewNote, 'id' | 'userId' | 'createdAt'>>): Promise<Note> => {
    // Map camelCase field names to snake_case column names
    const fieldToColumnMap: Record<string, string> = {
      name: 'name',
      content: 'content',
    };

    const setClause = Object.keys(updates)
      .map(key => `${fieldToColumnMap[key] || key} = ?`)
      .join(', ');
    const values = Object.values(updates);
    
    const sql = `
      UPDATE notes 
      SET ${setClause}, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
      RETURNING *
    `;
    
    const result = await query(sql, [...values, id, userId]);
    if (result.values.length === 0) {
      throw new Error('Note not found or no permission to update');
    }

    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Note;
  }, [userId, query]);

  /**
   * Delete a note
   */
  const deleteNote = useCallback(async (id: string): Promise<boolean> => {
    const result = await execute(
      `DELETE FROM notes WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    return result.changes > 0;
  }, [userId, execute]);

  /**
   * Get all notes for the user
   */
  const getAllNotes = useCallback(async (options?: {
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'created_at' | 'updated_at';
    orderDirection?: 'asc' | 'desc';
    search?: string;
  }): Promise<Note[]> => {
    const { 
      limit = 100, 
      offset = 0, 
      orderBy = 'updated_at', 
      orderDirection = 'desc',
      search
    } = options || {};

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (search) {
      whereClause += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    const sql = `
      SELECT * FROM notes 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    const result = await query(sql, params);
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Note;
    });
  }, [userId, query]);

  /**
   * Get single note by ID
   */
  const getNoteById = async (id: string): Promise<Note | null> => {
    const result = await query(
      `SELECT * FROM notes WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    
    if (result.values.length === 0) return null;
    
    const row = result.values[0];
    const obj: Record<string, any> = {};
    result.columns.forEach((col, idx) => {
      obj[snakeToCamel(col)] = row[idx];
    });
    return obj as Note;
  };

  /**
   * Search notes by name
   */
  const searchNotes = async (searchTerm: string): Promise<Note[]> => {
    const result = await query(
      `SELECT * FROM notes 
       WHERE user_id = ? AND name LIKE ?
       ORDER BY updated_at DESC`,
      [userId, `%${searchTerm}%`]
    );
    
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[snakeToCamel(col)] = row[idx];
      });
      return obj as Note;
    });
  };

  /**
   * Get notes statistics
   */
  const getStats = async () => {
    const countResult = await query(
      `SELECT COUNT(*) as total FROM notes WHERE user_id = ?`,
      [userId]
    );

    const wordsResult = await query(
      `SELECT SUM(LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) + 1) as total_words 
       FROM notes WHERE user_id = ? AND content IS NOT NULL AND content != ''`,
      [userId]
    );

    const lastUpdatedResult = await query(
      `SELECT MAX(updated_at) as last_updated FROM notes WHERE user_id = ?`,
      [userId]
    );

    const totalNotes = countResult.values[0][0] as number;
    const totalWords = wordsResult.values[0][0] as number || 0;
    const averageWordsPerNote = totalNotes > 0 ? Math.round(totalWords / totalNotes) : 0;
    const lastUpdated = lastUpdatedResult.values[0][0] as string || null;

    return {
      totalNotes,
      totalWords,
      averageWordsPerNote,
      lastUpdated,
    };
  };

  /**
   * Duplicate a note
   */
  const duplicateNote = async (id: string): Promise<Note> => {
    const originalNote = await getNoteById(id);
    if (!originalNote) {
      throw new Error('Note not found');
    }

    return insertNote({
      name: `${originalNote.name} (Copy)`,
      content: originalNote.content || ''
    });
  };

  return {
    // Database state
    isInitialized,
    isInitializing,
    error,
    init,
    
    // Note operations
    insertNote,
    updateNote,
    deleteNote,
    getAllNotes,
    getNoteById,
    searchNotes,
    duplicateNote,
    
    // Statistics
    getStats,
    
    // Direct database access for custom queries
    execute,
    query,
  };
}
