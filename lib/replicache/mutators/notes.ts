import type { WriteTransaction } from 'replicache';

export const noteMutators = {
  async createNote(tx: WriteTransaction, note: any) {
    const id = Date.now().toString();
    const now = new Date().toISOString();
    
    const newNote = {
      ...note,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await tx.put(`note/${id}`, newNote);
    return newNote;
  },

  async updateNote(tx: WriteTransaction, { id, updates }: { id: string; updates: any }) {
    const existing = await tx.get(`note/${id}`);
    if (!existing) throw new Error('Note not found');

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await tx.put(`note/${id}`, updated);
    return updated;
  },

  async deleteNote(tx: WriteTransaction, id: string) {
    await tx.del(`note/${id}`);
  },
};
