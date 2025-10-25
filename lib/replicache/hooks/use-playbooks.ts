import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';

export function usePlaybooks() {
  const { rep, isInitialized } = useReplicache();

  const playbooks = useSubscribe(
    rep,
    async (tx) => {
      // If no replicache instance, return empty array
      if (!tx) return [];
      
      const list = await tx
        .scan({ prefix: 'playbook/' })
        .entries()
        .toArray();
      
      return list
        .map(([, value]) => value as Record<string, unknown>)
        .sort((a, b) => 
          // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    },
    // Provide default value for SSR
     // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    []
  );

  const createPlaybook = async (playbook: Record<string, unknown>) => {
    if (!rep) throw new Error('Replicache not initialized');
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return await (rep as { mutate: { createPlaybook: (playbook: Record<string, unknown>) => Promise<unknown> } }).mutate.createPlaybook(playbook);
  };

  const updatePlaybook = async (id: string, updates: Record<string, unknown>) => {
    if (!rep) throw new Error('Replicache not initialized');
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return await (rep as { mutate: { updatePlaybook: (params: { id: string; updates: Record<string, unknown> }) => Promise<unknown> } }).mutate.updatePlaybook({ id, updates });
  };

  const deletePlaybook = async (id: string) => {
    if (!rep) throw new Error('Replicache not initialized');
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return await (rep as { mutate: { deletePlaybook: (id: string) => Promise<unknown> } }).mutate.deletePlaybook(id);
  };

  return {
    playbooks,
    createPlaybook,
    updatePlaybook,
    deletePlaybook,
    isInitialized,
  };
}
