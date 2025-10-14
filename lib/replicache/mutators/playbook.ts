import type { WriteTransaction } from 'replicache';

export const playbookMutators = {
  async createPlaybook(tx: WriteTransaction, playbook: any) {
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
  },

  async updatePlaybook(tx: WriteTransaction, { id, updates }: { id: string; updates: any }) {
    const existing = await tx.get(`playbook/${id}`);
    if (!existing) throw new Error('Playbook not found');

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await tx.put(`playbook/${id}`, updated);
    return updated;
  },

  async deletePlaybook(tx: WriteTransaction, id: string) {
    await tx.del(`playbook/${id}`);
  },
};
