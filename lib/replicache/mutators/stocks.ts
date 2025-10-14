import type { WriteTransaction } from 'replicache';
import type { Stock, NewStock } from '@/lib/drizzle/journal/schema';

export const stockMutators = {
  async createStock(tx: WriteTransaction, stock: Omit<NewStock, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = Date.now(); // Or use proper ID generation
    const now = new Date().toISOString();
    
    const newStock: Stock = {
      ...stock,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await tx.put(`stock/${id}`, newStock);
    return newStock;
  },

  async updateStock(tx: WriteTransaction, { id, updates }: { id: number; updates: Partial<Stock> }) {
    const existing = await tx.get(`stock/${id}`);
    if (!existing) throw new Error('Stock not found');

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await tx.put(`stock/${id}`, updated);
    return updated;
  },

  async deleteStock(tx: WriteTransaction, id: number) {
    await tx.del(`stock/${id}`);
  },
};
