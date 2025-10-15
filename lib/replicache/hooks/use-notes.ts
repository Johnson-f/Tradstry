import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';
import type { Note } from '../schemas/notes';

export function useNotes(userId: string) {
  const { rep, isInitialized } = useReplicache();

  const notes = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan({ prefix: 'note/' })
        .entries()
        .toArray();
      
      return list
        .map(([_, value]) => value as Note)
        .sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    },
    [] // Default to empty array if undefined
  );

  const createNote = async (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.createNote(note);
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.updateNote({ id, updates });
  };

  const deleteNote = async (id: string) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.deleteNote(id);
  };

  return {
    notes: notes || [],
    createNote,
    updateNote,
    deleteNote,
    isInitialized,
  };
}
