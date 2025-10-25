// Core Replicache exports
export { ReplicacheProvider, useReplicache } from './provider';
export { REPLICACHE_CONFIG } from './config';
export * from './types';

// Hooks
export { useStocks } from './hooks/use-stocks';
export { useOptions } from './hooks/use-options';
export { useNotes } from './hooks/use-notes';
export { usePlaybooks } from './hooks/use-playbooks';

// Import mutator functions for grouped exports
import { createStock, updateStock, deleteStock } from './mutators/stocks';
import { createOption, updateOption, deleteOption } from './mutators/options';
import { createNote, updateNote, deleteNote } from './mutators/notes';
import { createPlaybook, updatePlaybook, deletePlaybook, tagTrade, untagTrade } from './mutators/playbook';

// Mutators
export { mutators as registerMutators } from './mutators';

// Individual mutator functions
export { createStock, updateStock, deleteStock } from './mutators/stocks';
export { createOption, updateOption, deleteOption } from './mutators/options';
export { createNote, updateNote, deleteNote } from './mutators/notes';
export { createPlaybook, updatePlaybook, deletePlaybook, tagTrade, untagTrade } from './mutators/playbook';

// Grouped mutators for convenience
export const stockMutators = {
  createStock,
  updateStock,
  deleteStock,
};

export const optionMutators = {
  createOption,
  updateOption,
  deleteOption,
};

export const noteMutators = {
  createNote,
  updateNote,
  deleteNote,
};

export const playbookMutators = {
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  tagTrade,
  untagTrade,
};
