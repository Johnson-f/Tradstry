import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';
import type { Option } from '@/lib/drizzle/journal/schema';

export function useOptions(userId: string) {
  const { rep, isInitialized } = useReplicache();

  const options = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan({ prefix: 'option/' })
        .entries()
        .toArray();
      
      return list
        .map(([_, value]) => value as Option)
        .filter(option => option.userId === userId)
        .sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  );

  const createOption = async (option: Omit<Option, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.createOption(option);
  };

  const updateOption = async (id: number, updates: Partial<Option>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.updateOption({ id, updates });
  };

  const deleteOption = async (id: number) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.deleteOption(id);
  };

  return {
    options,
    createOption,
    updateOption,
    deleteOption,
    isInitialized,
  };
}
