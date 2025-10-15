import type { WriteTransaction } from 'replicache';
import type { Stock } from '@/lib/replicache/schemas/journal';

export async function createStock(
  tx: WriteTransaction,
  args: {
    symbol: string;
    tradeType: Stock['tradeType'];
    orderType: Stock['orderType'];
    entryPrice: number; // dollars
    exitPrice: number | null; // dollars
    stopLoss: number; // dollars
    commissions: number; // dollars
    numberShares: number;
    takeProfit: number | null; // dollars
    entryDate: string;
    exitDate: string | null;
    user_id?: string; // Optional - will be set by server
  }
) {
  // Store locally with a temporary ID
  const tempId = Date.now();
  const now = new Date().toISOString();
  
  // Note: userId will be set properly when the server responds with the actual record
  const newStock: Stock = {
    id: tempId,
    userId: '', // Will be set from server response
    symbol: args.symbol,
    tradeType: args.tradeType,
    orderType: args.orderType,
    entryPrice: args.entryPrice,
    exitPrice: args.exitPrice,
    stopLoss: args.stopLoss,
    commissions: args.commissions || 0,
    numberShares: args.numberShares,
    takeProfit: args.takeProfit,
    entryDate: args.entryDate,
    exitDate: args.exitDate,
    createdAt: now,
    updatedAt: now,
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