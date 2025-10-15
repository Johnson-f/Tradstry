import type { WriteTransaction } from 'replicache';
import type { Stock, NewStock } from '@/lib/replicache/schemas/journal';

export async function createStock(tx: WriteTransaction, stock: Omit<NewStock, 'id' | 'createdAt' | 'updatedAt'>) {
  // The backend will handle ID generation and timestamps
  // We just pass the data through
  // The mutation name and args will be sent to the backend
  const mutationArgs = {
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
  };

  // Store locally with a temporary ID
  const tempId = Date.now();
  const newStock: Stock = {
    ...stock,
    id: tempId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`stock/${tempId}`, newStock);
  return newStock;
}

export async function updateStock(tx: WriteTransaction, { id, updates }: { id: number; updates: Partial<Stock> }) {
  const existing = await tx.get(`stock/${id}`) as Stock | undefined;
  if (!existing) throw new Error('Stock not found');

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`stock/${id}`, updated);
  return updated;
}

export async function deleteStock(tx: WriteTransaction, id: number) {
  await tx.del(`stock/${id}`);
}
