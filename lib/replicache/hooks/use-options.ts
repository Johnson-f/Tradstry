import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';
import type { Option } from '@/lib/replicache/schemas/journal';

export function useOptions() {
  const { rep, isInitialized } = useReplicache();

  const options = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan({ prefix: 'option/' })
        .entries()
        .toArray();
      
      return list
        .map(([, value]) => value as Option)
        .sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  );

  const createOption = async (option: Omit<Option, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as { mutate: { createOption: (option: Omit<Option, 'id' | 'createdAt' | 'updatedAt'>) => Promise<unknown> } }).mutate.createOption(option);
  };

  const updateOption = async (id: number, updates: Partial<Option>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as { mutate: { updateOption: (params: { id: number; updates: Partial<Option> }) => Promise<unknown> } }).mutate.updateOption({ id, updates });
  };

  const deleteOption = async (id: number) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as { mutate: { deleteOption: (id: number) => Promise<unknown> } }).mutate.deleteOption(id);
  };

  return {
    options,
    createOption,
    updateOption,
    deleteOption,
    isInitialized,
  };
}
