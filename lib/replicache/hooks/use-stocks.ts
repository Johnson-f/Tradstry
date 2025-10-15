import { useSubscribe } from 'replicache-react';
import { useReplicache } from '../provider';
import type { Stock } from '@/lib/replicache/schemas/journal';

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
    const toCents = (value: number | null | undefined): number | null => {
      if (value === null || value === undefined) return null;
      return Math.round(value * 100);
    };

    const args = {
      symbol: stock.symbol,
      trade_type: stock.tradeType,
      order_type: stock.orderType,
      entry_price: toCents(stock.entryPrice)!,
      exit_price: toCents(stock.exitPrice),
      stop_loss: toCents(stock.stopLoss)!,
      commissions: toCents(stock.commissions || 0)!,
      number_shares: stock.numberShares,
      take_profit: toCents(stock.takeProfit),
      entry_date: stock.entryDate,
      exit_date: stock.exitDate,
      user_id: userId,
    };

    return await (rep as any).mutate.createStock(args);
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
