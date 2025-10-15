import type { WriteTransaction } from 'replicache';
import type { Playbook, NewPlaybook } from '@/lib/replicache/schemas/playbook';
import { nanoid } from 'nanoid';

export async function createPlaybook(tx: WriteTransaction, playbook: Omit<NewPlaybook, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = nanoid();
  const now = new Date().toISOString();
  
  const newPlaybook: Playbook = {
    ...playbook,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await tx.put(`playbook/${id}`, newPlaybook);
  return newPlaybook;
}

export async function updatePlaybook(tx: WriteTransaction, { id, updates }: { id: string; updates: Partial<Playbook> }) {
  const existing = await tx.get(`playbook/${id}`) as Playbook | undefined;
  if (!existing) throw new Error('Playbook not found');

  const updated: Playbook = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`playbook/${id}`, updated);
  return updated;
}

export async function deletePlaybook(tx: WriteTransaction, id: string) {
  await tx.del(`playbook/${id}`);
}

export async function tagTrade(tx: WriteTransaction, { tradeId, tradeType, setupId }: { tradeId: number; tradeType: 'stock' | 'option'; setupId: string }) {
  // Store the association locally
  const associationKey = `${tradeType}_trade_playbook/${tradeId}_${setupId}`;
  const association = {
    tradeId,
    tradeType,
    setupId,
    createdAt: new Date().toISOString(),
  };
  
  await tx.put(associationKey, association);
  return association;
}

export async function untagTrade(tx: WriteTransaction, { tradeId, tradeType, setupId }: { tradeId: number; tradeType: 'stock' | 'option'; setupId: string }) {
  // Remove the association locally
  const associationKey = `${tradeType}_trade_playbook/${tradeId}_${setupId}`;
  await tx.del(associationKey);
}
