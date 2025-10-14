import type { WriteTransaction } from 'replicache';

export async function createPlaybook(tx: WriteTransaction, playbook: any) {
  console.log('createPlaybook mutator called with args:', playbook);
  const id = Date.now().toString();
  const now = new Date().toISOString();
  
  const newPlaybook = {
    ...playbook,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await tx.put(`playbook/${id}`, newPlaybook);
  return newPlaybook;
}

export async function updatePlaybook(tx: WriteTransaction, { id, updates }: { id: string; updates: any }) {
  console.log('updatePlaybook mutator called with args:', id, updates);
  const existing = await tx.get(`playbook/${id}`);
  if (!existing) throw new Error('Playbook not found');

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await tx.put(`playbook/${id}`, updated);
  return updated;
}

export async function deletePlaybook(tx: WriteTransaction, id: string) {
  console.log('deletePlaybook mutator called with id:', id);
  await tx.del(`playbook/${id}`);
}
