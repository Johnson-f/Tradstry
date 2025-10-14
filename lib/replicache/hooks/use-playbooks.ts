import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';

export function usePlaybooks(userId: string) {
  const { rep, isInitialized } = useReplicache();

  const playbooks = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan({ prefix: 'playbook/' })
        .entries()
        .toArray();
      
      return list
        .map(([_, value]) => value as any)
        .filter(playbook => playbook.userId === userId)
        .sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  );

  const createPlaybook = async (playbook: any) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.createPlaybook(playbook);
  };

  const updatePlaybook = async (id: string, updates: any) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.updatePlaybook({ id, updates });
  };

  const deletePlaybook = async (id: string) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.deletePlaybook(id);
  };

  return {
    playbooks,
    createPlaybook,
    updatePlaybook,
    deletePlaybook,
    isInitialized,
  };
}
