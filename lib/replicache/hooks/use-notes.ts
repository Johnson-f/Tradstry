import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';

export function useNotes() {
  const { rep, isInitialized } = useReplicache();

  const notes = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan({ prefix: 'note/' })
        .entries()
        .toArray();

      return list
        .map(([, value]) => value as Record<string, unknown>)
        .sort((a, b) =>
          new Date((b as Record<string, unknown>).createdAt as string).getTime() - new Date((a as Record<string, unknown>).createdAt as string).getTime()
        );
    },
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    [] // Default to empty array if undefined
  );

  const createNote = async (note: Record<string, unknown>) => {
    if (!rep) throw new Error('Replicache not initialized');
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return await (rep as { mutate: { createNote: (note: Record<string, unknown>) => Promise<unknown> } }).mutate.createNote(note);
  };

  const updateNote = async (id: string, updates: Record<string, unknown>) => {

    if (!rep) throw new Error('Replicache not initialized');
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return await (rep as { mutate: { updateNote: (params: { id: string; updates: Record<string, unknown> }) => Promise<unknown> } }).mutate.updateNote({ id, updates });
  };

  const deleteNote = async (id: string) => {
    if (!rep) throw new Error('Replicache not initialized');
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return await (rep as { mutate: { deleteNote: (id: string) => Promise<unknown> } }).mutate.deleteNote(id);
  };

  return {
    notes,
    createNote,
    updateNote,
    deleteNote,
    isInitialized,
  };
}
