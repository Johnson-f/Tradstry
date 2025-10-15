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

  const createStock = async (stock: Omit<Stock, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!rep) throw new Error('Replicache not initialized');

    // Data is already in dollars from the form
    // Just pass it through - no conversion needed
    // Send snake_case keys expected by the backend
    const args = {
      symbol: stock.symbol,
      trade_type: stock.tradeType,
      order_type: stock.orderType,
      entry_price: stock.entryPrice,
      exit_price: stock.exitPrice,
      stop_loss: stock.stopLoss,
      commissions: stock.commissions || 0,
      number_shares: stock.numberShares,
      take_profit: stock.takeProfit,
      entry_date: stock.entryDate,
      exit_date: stock.exitDate,
    } as const;

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