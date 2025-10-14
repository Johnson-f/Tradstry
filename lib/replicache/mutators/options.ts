import type { WriteTransaction } from 'replicache';
import type { Option, NewOption } from '@/lib/drizzle/journal/schema';

export const optionMutators = {
  async createOption(tx: WriteTransaction, option: Omit<NewOption, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = Date.now(); // Or use proper ID generation
    const now = new Date().toISOString();
    
    const newOption: Option = {
      ...option,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await tx.put(`option/${id}`, newOption);
    return newOption;
  },

  async updateOption(tx: WriteTransaction, { id, updates }: { id: number; updates: Partial<Option> }) {
    const existing = await tx.get(`option/${id}`);
    if (!existing) throw new Error('Option not found');

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await tx.put(`option/${id}`, updated);
    return updated;
  },

  async deleteOption(tx: WriteTransaction, id: number) {
    await tx.del(`option/${id}`);
  },
};
