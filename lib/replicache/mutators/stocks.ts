import type { WriteTransaction } from 'replicache';
import type { Stock, NewStock } from '@/lib/replicache/schemas/journal';

export async function createStock(
  tx: WriteTransaction,
  args: {
    symbol: string;
    trade_type: Stock['tradeType'];
    order_type: Stock['orderType'];
    entry_price: number; // cents
    exit_price: number | null; // cents
    stop_loss: number; // cents
    commissions: number; // cents
    number_shares: number;
    take_profit: number | null; // cents
    entry_date: string;
    exit_date: string | null;
    user_id: string;
  }
) {
  // Convert cents back to floats for local cache display
  const fromCents = (value: number | null): number | null => {
    if (value === null) return null;
    return value / 100;
  };

  // Store locally with a temporary ID
  const tempId = Date.now();
  const now = new Date().toISOString();
  const newStock: Stock = {
    id: tempId,
    userId: args.user_id,
    symbol: args.symbol,
    tradeType: args.trade_type,
    orderType: args.order_type,
    entryPrice: fromCents(args.entry_price)!,
    exitPrice: fromCents(args.exit_price),
    stopLoss: fromCents(args.stop_loss)!,
    commissions: fromCents(args.commissions) || 0,
    numberShares: args.number_shares,
    takeProfit: fromCents(args.take_profit),
    entryDate: args.entry_date,
    exitDate: args.exit_date,
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
