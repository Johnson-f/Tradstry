/**
 * Notes Schema for Browser SQLite using Drizzle ORM
 * Trading notes with UUID identification
 */

import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Notes table
export const notesTable = sqliteTable('notes', {
  id: text('id').primaryKey(), // UUID string
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  content: text('content').default(''), // JSON content from editor
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Type inference for inserts and selects
export type Note = typeof notesTable.$inferSelect;
export type NewNote = typeof notesTable.$inferInsert;

// Indexes for better performance
export const notesIndexes = {
  userIdIndex: sql`CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)`,
  createdAtIndex: sql`CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at)`,
  updatedAtIndex: sql`CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at)`,
};