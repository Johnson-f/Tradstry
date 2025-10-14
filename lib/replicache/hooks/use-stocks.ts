import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';
import type { Stock } from '@/lib/drizzle/journal/schema';

export function useStocks(userId: string) {
  const { rep, isInitialized } = useReplicache();

  const stocks = useSubscribe(
    rep,
    async (tx) => {
      const list = await tx
        .scan({ prefix: 'stock/' })
        .entries()
        .toArray();
      
      return list
        .map(([_, value]) => value as Stock)
        .filter(stock => stock.userId === userId)
        .sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  );

  const createStock = async (stock: Omit<Stock, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.createStock(stock);
  };

  const updateStock = async (id: number, updates: Partial<Stock>) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.updateStock({ id, updates });
  };

  const deleteStock = async (id: number) => {
    if (!rep) throw new Error('Replicache not initialized');
    return await (rep as any).mutate.deleteStock(id);
  };

  return {
    stocks,
    createStock,
    updateStock,
    deleteStock,
    isInitialized,
  };
}
