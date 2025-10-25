'use client';

/**
 * Notes Schema for Browser SQLite using Drizzle ORM
 * Trading notes with UUID identification
 */

// Types for Replicache notes data

export type Note = {
  id: string;
  name: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewNote = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;
