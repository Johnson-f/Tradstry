/**
 * Playbook Service Integration
 * Bridges the existing setup system with the new playbook database
 */

import { usePlaybookDatabase } from '@/lib/drizzle/playbook';
import type { 
  Playbook, 
  NewPlaybook, 
  PlaybookFormData,
  TagTradeRequest,
  PlaybookStats,
  PlaybookWithUsage
} from '@/lib/drizzle/playbook';
import { setupsService } from '@/lib/services/setups-service';
import type { SetupInDB, SetupCreate, SetupUpdate, SetupCategory } from '@/lib/types/setups';

/**
 * Migrate existing setups to playbooks
 * This method helps transition from the old setup system to the new playbook system
 */
export async function migrateSetupsToPlaybooks(
  createPlaybook: (data: PlaybookFormData) => Promise<Playbook>
): Promise<Playbook[]> {
  try {
    // Get all existing setups
    const existingSetups = await setupsService.getSetups();
    const migratedPlaybooks: Playbook[] = [];

    for (const setup of existingSetups) {
      try {
        // Convert setup to playbook format
        const playbookData: PlaybookFormData = {
          name: setup.name,
          description: setup.description || undefined
        };

        // Create playbook
        const playbook = await createPlaybook(playbookData);
        migratedPlaybooks.push(playbook);

        console.log(`Migrated setup "${setup.name}" to playbook "${playbook.id}"`);
      } catch (error) {
        console.error(`Failed to migrate setup "${setup.name}":`, error);
      }
    }

    return migratedPlaybooks;
  } catch (error) {
    console.error('Error migrating setups to playbooks:', error);
    throw error;
  }
}

/**
 * Convert old setup format to new playbook format
 */
export function convertSetupToPlaybook(setup: SetupInDB): PlaybookFormData {
  return {
    name: setup.name,
    description: setup.description || undefined
  };
}

/**
 * Convert playbook to setup format (for backward compatibility)
 */
export function convertPlaybookToSetup(playbook: Playbook, userId: string): Partial<SetupInDB> {
  return {
    id: parseInt(playbook.id), // This is a hack since playbook uses string IDs
    name: playbook.name,
    description: playbook.description || '',
    category: 'Other' as SetupCategory, // Default category
    is_active: true,
    tags: [],
    setup_conditions: {},
    user_id: userId,
    created_at: playbook.createdAt,
    updated_at: playbook.updatedAt
  };
}

/**
 * Hook for using the playbook service
 */
export function usePlaybookService(userId: string) {
  const playbookDb = usePlaybookDatabase(userId);

  // Migration function that uses the database operations
  const migrateSetupsToPlaybooksHandler = async (): Promise<Playbook[]> => {
    return migrateSetupsToPlaybooks(playbookDb.createPlaybook);
  };

  return {
    // Direct database operations
    ...playbookDb,
    // Migration utilities
    migrateSetupsToPlaybooks: migrateSetupsToPlaybooksHandler,
    convertSetupToPlaybook,
    convertPlaybookToSetup: (playbook: Playbook) => convertPlaybookToSetup(playbook, userId),
  };
}

/**
 * Utility functions for playbook management
 */
export const playbookUtils = {
  /**
   * Generate a unique playbook name if the name already exists
   */
  generateUniqueName: async (
    baseName: string, 
    searchPlaybooks: (searchTerm: string) => Promise<Playbook[]>
  ): Promise<string> => {
    let name = baseName;
    let counter = 1;

    try {
      while (true) {
        const existingPlaybooks = await searchPlaybooks(name);
        if (existingPlaybooks.length === 0) {
          break;
        }
        name = `${baseName} (${counter})`;
        counter++;
      }
    } catch (error) {
      console.warn('Error checking for existing playbook names, using base name:', error);
      return baseName;
    }

    return name;
  },

  /**
   * Validate playbook data
   */
  validatePlaybookData: (data: PlaybookFormData): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Playbook name is required');
    }

    if (data.name && data.name.length > 100) {
      errors.push('Playbook name must be less than 100 characters');
    }

    if (data.description && data.description.length > 500) {
      errors.push('Description must be less than 500 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Format playbook for display
   */
  formatPlaybookForDisplay: (playbook: Playbook): {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    createdAtFormatted: string;
    updatedAtFormatted: string;
  } => {
    return {
      id: playbook.id,
      name: playbook.name,
      description: playbook.description || 'No description',
      createdAt: playbook.createdAt,
      updatedAt: playbook.updatedAt,
      createdAtFormatted: new Date(playbook.createdAt).toLocaleDateString(),
      updatedAtFormatted: new Date(playbook.updatedAt).toLocaleDateString()
    };
  }
};
