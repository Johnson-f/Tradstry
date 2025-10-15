import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';

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
        .map(([_, value]) => value as any)
        .filter(note => note.userId === userId)
        .sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    },
    [] // Default to empty array if undefined
  );

  const createNote = async (note: any) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.createNote(note);
  };

  const updateNote = async (id: string, updates: any) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.updateNote({ id, updates });
  };

  const deleteNote = async (id: string) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.deleteNote(id);
  };

  return {
    notes,
    createNote,
    updateNote,
    deleteNote,
    isInitialized,
  };
}
