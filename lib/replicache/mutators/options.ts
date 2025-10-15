import type { WriteTransaction } from 'replicache';
import type { Option, NewOption } from '@/lib/replicache/schemas/journal';

export async function createOption(tx: WriteTransaction, option: Omit<NewOption, 'id' | 'createdAt' | 'updatedAt'>) {
  // Store locally with a temporary ID
  const tempId = Date.now();
  const newOption: Option = {
    ...option,
    id: tempId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`option/${tempId}`, newOption);
  return newOption;
}

export async function updateOption(tx: WriteTransaction, { id, updates }: { id: number; updates: Partial<Option> }) {
  const existing = await tx.get(`option/${id}`) as Option | undefined;
  if (!existing) throw new Error('Option not found');

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`option/${id}`, updated);
  return updated;
}

export async function deleteOption(tx: WriteTransaction, id: number) {
  await tx.del(`option/${id}`);
}
