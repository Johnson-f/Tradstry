import { stockMutators } from './stocks';
import { optionMutators } from './options';
import { noteMutators } from './notes';
import { playbookMutators } from './playbook';

export function registerMutators() {
  return {
    ...stockMutators,
    ...optionMutators,
    ...noteMutators,
    ...playbookMutators,
  };
}
