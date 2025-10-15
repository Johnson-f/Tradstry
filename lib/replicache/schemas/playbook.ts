/**
 * Playbook Schema - Types for Replicache
 * Trading setups and strategies
 */

// Types for Replicache playbook data
export type Playbook = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewPlaybook = Omit<Playbook, 'id' | 'createdAt' | 'updatedAt'>;

// Trade-Playbook associations
export type StockTradePlaybook = {
  stockId: number;
  playbookId: string;
  createdAt: string;
};

export type TagTradeRequest = {
  tradeId: number;
  playbookId: string;
};

export type PlaybookStats = {
  playbook: Playbook;
  tradeCount: number;
};

export type PlaybookWithUsage = Playbook & {
  tradeCount: number;
};

export type PlaybookFormData = Omit<Playbook, 'id' | 'createdAt' | 'updatedAt'>;
