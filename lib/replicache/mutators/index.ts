import * as stocksMutators from './stocks';
import * as optionsMutators from './options';
import * as notesMutators from './notes';
import * as playbookMutators from './playbook';

export const mutators = {
  ...stocksMutators,
  ...optionsMutators,
  ...notesMutators,
  ...playbookMutators,
};
