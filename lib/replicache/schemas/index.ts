// Re-export all schemas from their respective files
// Re-export all schema types for Replicache
export * from './journal';
export * from './notes'; 
export * from './playbook';

// Add any additional FormData types that components might need
export type StockFormData = Omit<import('./journal').Stock, 'id' | 'createdAt' | 'updatedAt'>;
export type OptionFormData = Omit<import('./journal').Option, 'id' | 'createdAt' | 'updatedAt'>;
