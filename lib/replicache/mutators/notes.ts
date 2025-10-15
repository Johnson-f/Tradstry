import type { WriteTransaction } from 'replicache';
import type { Note, NewNote } from '@/lib/replicache/schemas/notes';
import { nanoid } from 'nanoid';

export async function createNote(tx: WriteTransaction, note: Omit<NewNote, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = nanoid();
  const now = new Date().toISOString();
  
  const newNote: Note = {
    ...note,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await tx.put(`note/${id}`, newNote);
  return newNote;
}

export async function updateNote(tx: WriteTransaction, { id, updates }: { id: string; updates: Partial<Note> }) {
  const existing = await tx.get(`note/${id}`) as Note | undefined;
  if (!existing) throw new Error('Note not found');

  const updated: Note = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`note/${id}`, updated);
  return updated;
}

export async function deleteNote(tx: WriteTransaction, id: string) {
  await tx.del(`note/${id}`);
}
