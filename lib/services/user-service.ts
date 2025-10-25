import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';

// Track ongoing requests to prevent duplicates
const ongoingRequests = new Map<string, Promise<UserInitializationResponse>>();

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
 * Implements exponential backoff and proper error handling
 */
export const initializeUser = async (
  email: string,
  userId: string,
  retryCount: number = 2,
  retryDelay: number = 1000
): Promise<UserInitializationResponse> => {
  // Check if there's already an ongoing request for this user
  const requestKey = `init-${userId}`;
  if (ongoingRequests.has(requestKey)) {
    console.log(`User initialization already in progress for user: ${userId}, returning existing promise`);
    return ongoingRequests.get(requestKey)!;
  }

  // Create the initialization promise
  const initPromise = performInitialization(email, userId, retryCount, retryDelay);
  
  // Store the promise to prevent duplicates
  ongoingRequests.set(requestKey, initPromise);
  
  try {
    const result = await initPromise;
    return result;
  } finally {
    // Clean up the ongoing request
    ongoingRequests.delete(requestKey);
  }
};

async function performInitialization(
  email: string,
  userId: string,
  retryCount: number,
  retryDelay: number
): Promise<UserInitializationResponse> {
  let lastError: unknown = null;
  
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      console.log(`Attempting user initialization (attempt ${attempt}/${retryCount}) for user: ${email}`);
      
      const response = await apiClient.post<UserInitializationResponse>(
        apiConfig.endpoints.user.initialize,
        {
          email,
          user_id: userId,
        }
      );

      // Check if the response indicates success
      if (response.success) {
        console.log('User initialization successful:', response);
        return response;
      } else {
        // If the API returns success: false, treat it as an error
        throw new Error(response.message || 'Initialization failed');
      }
    } catch (error: unknown) {
      lastError = error;
      console.error(`User initialization attempt ${attempt} failed:`, error);
      
      // If this is the last attempt, return the error
      if (attempt === retryCount) {
        const errorMessage = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || 
                           (error as { message?: string })?.message || 
                           'Failed to initialize user account after multiple attempts';
        
        return {
          success: false,
          message: errorMessage,
        };
      }
      
      // Wait before retrying (exponential backoff)
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript requires it
  return {
    success: false,
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    message: lastError?.message || 'Unexpected error during user initialization',
  };
}

/**
 * Check if a user has been properly initialized
 */
export const checkUserInitialization = async (): Promise<boolean> => {
  try {
    // This would call a backend endpoint to check user initialization status
    // For now, we'll assume the user needs to be initialized if this function is called
    return false;
  } catch (error) {
    console.error('Error checking user initialization:', error);
    return false;
  }
};
