import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';

export interface UserInitializationRequest {
  email: string;
  user_id: string;
}

export interface UserInitializationResponse {
  success: boolean;
  message?: string;
  user_id?: string;
}

/**
 * Initialize a new user after successful sign-up with retry logic
 * This creates necessary user records in the backend database
 */
export const initializeUser = async (
  email: string,
  userId: string,
  retryCount: number = 3,
  retryDelay: number = 1000
): Promise<UserInitializationResponse> => {
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      console.log(`Attempting user initialization (attempt ${attempt}/${retryCount})`);
      
      const response = await apiClient.post<UserInitializationResponse>(
        apiConfig.endpoints.user.initialize,
        {
          email,
          user_id: userId,
        }
      );

      console.log('User initialization successful:', response);
      return response;
    } catch (error: any) {
      console.error(`User initialization attempt ${attempt} failed:`, error);
      
      // If this is the last attempt, return the error
      if (attempt === retryCount) {
        return {
          success: false,
          message: error.message || 'Failed to initialize user account after multiple attempts',
        };
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }

  // This should never be reached, but TypeScript requires it
  return {
    success: false,
    message: 'Unexpected error during user initialization',
  };
};

/**
 * Check if a user has been properly initialized
 */
export const checkUserInitialization = async (userId: string): Promise<boolean> => {
  try {
    // This would call a backend endpoint to check user initialization status
    // For now, we'll assume the user needs to be initialized if this function is called
    return false;
  } catch (error) {
    console.error('Error checking user initialization:', error);
    return false;
  }
};
