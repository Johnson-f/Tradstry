/**
 * TypeScript types for Playbook Operations
 * Provides type safety for trading playbook data
 */

import type { Playbook } from './schema';

// Playbook form data type
export interface PlaybookFormData {
  name: string;
  description?: string;
}

// Playbook query filters
export interface PlaybookQuery {
  name?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'created_at' | 'updated_at';
  orderDirection?: 'asc' | 'desc';
}

// Trade type enum for tagging
export type TradeType = 'stock' | 'option';

// Tag trade request
export interface TagTradeRequest {
  tradeId: number;
  tradeType: TradeType;
  setupId: string;
}

// Playbook statistics
export interface PlaybookStats {
  totalPlaybooks: number;
  totalStockTags: number;
  totalOptionTags: number;
  mostUsedPlaybook?: {
    id: string;
    name: string;
    usageCount: number;
  };
}

// Pagination options for playbooks
export interface PlaybookPaginationOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'name' | 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}

// Playbook with usage count
export interface PlaybookWithUsage extends Playbook {
  usageCount: number;
  stockUsageCount: number;
  optionUsageCount: number;
}

// Trade with playbooks
export interface TradeWithPlaybooks {
  tradeId: number;
  tradeType: TradeType;
  playbooks: Playbook[];
}

// Form validation schemas
export interface PlaybookValidation {
  name: string;
  description?: string;
}

// Re-export schema types
export type { 
  Playbook, 
  NewPlaybook,
  StockTradePlaybook,
  NewStockTradePlaybook,
  OptionTradePlaybook,
  NewOptionTradePlaybook
} from './schema';
