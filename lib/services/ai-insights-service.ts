import { apiConfig, getFullUrl } from '@/lib/config/api';
import { createClient } from '@/lib/supabase/client';
import type {
  Insight,
  InsightRequest,
  InsightListResponse,
  InsightGenerationTask,
  InsightFilters,
  ApiResponse,
} from '@/lib/types/ai-insights';
import {
  AIInsightsError,
  ValidationError,
  GenerationError,
  POLLING_INTERVAL,
  MAX_POLLING_ATTEMPTS,
} from '@/lib/types/ai-insights';

/**
 * AI Insights Service
 * Handles all API calls to the backend AI insights endpoints
 */
export class AIInsightsService {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  // Helper to safely get endpoint
  private getEndpoint(path: string, ...args: unknown[]): string {
    if (typeof window === 'undefined') {
      return '';
    }
    try {
      const insightsEndpoints = apiConfig.endpoints.endpoints.ai.insights;
      if (!insightsEndpoints) {
        return '';
      }
      
      // Handle nested paths like 'tasks.byId'
      const pathParts = path.split('.');
      let endpoint: unknown = insightsEndpoints;
      
      for (const part of pathParts) {
        if (endpoint && typeof endpoint === 'object' && endpoint !== null) {
          const endpointObj = endpoint as Record<string, unknown>;
          if (part in endpointObj) {
            endpoint = endpointObj[part];
          } else {
            // Fallback to base if path not found
            endpoint = insightsEndpoints.base;
            break;
          }
        } else {
          // Fallback to base if path not found
          endpoint = insightsEndpoints.base;
          break;
        }
      }
      
      // If endpoint is a function, call it with args
      if (typeof endpoint === 'function') {
        endpoint = endpoint(...args) as string;
      }
      
      return getFullUrl((endpoint as string) || insightsEndpoints.base);
    } catch (error) {
      console.error('Error getting endpoint:', error);
      return '';
    }
  }

  /**
   * Generate insights synchronously
   */
  async generateInsights(request: InsightRequest): Promise<Insight> {
    try {
      this.validateInsightRequest(request);

      const token = await this.getAuthToken();
      if (!token) {
        throw new AIInsightsError('Authentication required', 'AUTH_ERROR');
      }

      const response = await fetch(this.getEndpoint('base'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIInsightsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'GENERATION_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<Insight> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIInsightsError(
          result.error || 'Failed to generate insights',
          'GENERATION_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIInsightsError) {
        throw error;
      }
      throw new AIInsightsError(
        `Failed to generate insights: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Generate insights asynchronously
   * Returns task ID for polling
   */
  async generateInsightsAsync(request: InsightRequest): Promise<string> {
    try {
      this.validateInsightRequest(request);

      const token = await this.getAuthToken();
      if (!token) {
        throw new AIInsightsError('Authentication required', 'AUTH_ERROR');
      }

      const response = await fetch(this.getEndpoint('generateAsync'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIInsightsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'ASYNC_GENERATION_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<{ task_id: string }> = await response.json();
      
      if (!result.success || !result.data?.task_id) {
        throw new AIInsightsError(
          result.error || 'Failed to start async insight generation',
          'ASYNC_GENERATION_ERROR'
        );
      }

      return result.data.task_id;
    } catch (error) {
      if (error instanceof AIInsightsError) {
        throw error;
      }
      throw new AIInsightsError(
        `Failed to start async insight generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get user's insights with optional filters
   */
  async getInsights(filters: InsightFilters = {}): Promise<InsightListResponse> {
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.time_range) {
        queryParams.append('time_range', filters.time_range);
      }
      if (filters.insight_type) {
        queryParams.append('insight_type', filters.insight_type);
      }
      if (filters.limit) {
        queryParams.append('limit', filters.limit.toString());
      }
      if (filters.offset) {
        queryParams.append('offset', filters.offset.toString());
      }

      const url = `${this.getEndpoint('base')}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      
      const token = await this.getAuthToken();
      if (!token) {
        throw new AIInsightsError('Authentication required', 'AUTH_ERROR');
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIInsightsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'FETCH_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<InsightListResponse> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIInsightsError(
          result.error || 'Failed to fetch insights',
          'FETCH_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIInsightsError) {
        throw error;
      }
      throw new AIInsightsError(
        `Failed to fetch insights: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get specific insight by ID
   */
  async getInsight(insightId: string): Promise<Insight> {
    try {
      if (!insightId) {
        throw new ValidationError('Insight ID is required', 'insightId');
      }

      const token = await this.getAuthToken();
      if (!token) {
        throw new AIInsightsError('Authentication required', 'AUTH_ERROR');
      }
      
      const response = await fetch(this.getEndpoint('byId', insightId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AIInsightsError(
            'Insight not found',
            'NOT_FOUND',
            { insightId }
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AIInsightsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'FETCH_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<Insight> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIInsightsError(
          result.error || 'Failed to fetch insight',
          'FETCH_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIInsightsError) {
        throw error;
      }
      throw new AIInsightsError(
        `Failed to fetch insight: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get generation task status
   */
  async getGenerationTask(taskId: string): Promise<InsightGenerationTask> {
    try {
      if (!taskId) {
        throw new ValidationError('Task ID is required', 'taskId');
      }

      const token = await this.getAuthToken();
      if (!token) {
        throw new AIInsightsError('Authentication required', 'AUTH_ERROR');
      }
      
      const response = await fetch(this.getEndpoint('tasks.byId', taskId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AIInsightsError(
            'Generation task not found',
            'TASK_NOT_FOUND',
            { taskId }
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AIInsightsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'TASK_FETCH_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<InsightGenerationTask> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIInsightsError(
          result.error || 'Failed to fetch generation task',
          'TASK_FETCH_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIInsightsError) {
        throw error;
      }
      throw new AIInsightsError(
        `Failed to fetch generation task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Delete insight
   */
  async deleteInsight(insightId: string): Promise<void> {
    try {
      if (!insightId) {
        throw new ValidationError('Insight ID is required', 'insightId');
      }

      const token = await this.getAuthToken();
      if (!token) {
        throw new AIInsightsError('Authentication required', 'AUTH_ERROR');
      }
      
      const response = await fetch(this.getEndpoint('byId', insightId), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AIInsightsError(
            'Insight not found',
            'NOT_FOUND',
            { insightId }
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AIInsightsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'DELETE_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<void> = await response.json();
      
      if (!result.success) {
        throw new AIInsightsError(
          result.error || 'Failed to delete insight',
          'DELETE_ERROR'
        );
      }
    } catch (error) {
      if (error instanceof AIInsightsError) {
        throw error;
      }
      throw new AIInsightsError(
        `Failed to delete insight: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Poll task status until completion
   */
  async pollTaskStatus(
    taskId: string,
    onComplete?: (insight: Insight) => void,
    onError?: (error: Error) => void
  ): Promise<Insight> {
    let attempts = 0;
    
    while (attempts < MAX_POLLING_ATTEMPTS) {
      try {
        const task = await this.getGenerationTask(taskId);
        
        switch (task.status) {
          case 'completed':
            if (task.result_insight_id) {
              const insight = await this.getInsight(task.result_insight_id);
              onComplete?.(insight);
              return insight;
            } else {
              throw new GenerationError('Task completed but no insight ID found', taskId);
            }
            
          case 'failed':
            const errorMessage = task.error_message || 'Task failed without error message';
            const error = new GenerationError(errorMessage, taskId);
            onError?.(error);
            throw error;
            
          case 'expired':
            const expiredError = new GenerationError('Task expired', taskId);
            onError?.(expiredError);
            throw expiredError;
            
          case 'pending':
          case 'processing':
            // Continue polling
            break;
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        
      } catch (error) {
        if (error instanceof GenerationError) {
          throw error;
        }
        
        // Network error, retry
        attempts++;
        if (attempts >= MAX_POLLING_ATTEMPTS) {
          const timeoutError = new GenerationError('Task polling timeout', taskId);
          onError?.(timeoutError);
          throw timeoutError;
        }
        
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      }
    }
    
    throw new GenerationError('Maximum polling attempts reached', taskId);
  }

  /**
   * Validate insight request
   */
  private validateInsightRequest(request: InsightRequest): void {
    if (!request.time_range) {
      throw new ValidationError('Time range is required', 'time_range');
    }
    
    if (!request.insight_type) {
      throw new ValidationError('Insight type is required', 'insight_type');
    }
    
    const validTimeRanges = ['7d', '30d', '90d', '1y', 'ytd', 'custom', 'all_time'];
    if (!validTimeRanges.includes(request.time_range)) {
      throw new ValidationError(`Invalid time range: ${request.time_range}`, 'time_range');
    }
    
    const validInsightTypes = [
      'trading_patterns',
      'performance_analysis',
      'risk_assessment',
      'behavioral_analysis',
      'market_analysis',
      'opportunity_detection'
    ];
    if (!validInsightTypes.includes(request.insight_type)) {
      throw new ValidationError(`Invalid insight type: ${request.insight_type}`, 'insight_type');
    }
  }

  /**
   * Get authentication token from Supabase session with refresh capability
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session:', error);
        return null;
      }
      
      if (!session?.access_token) {
        console.log('No authentication token found - user not logged in');
        return null;
      }
      
      // Check if token expires soon (within 5 minutes)
      const tokenExpiry = session.expires_at ? new Date(session.expires_at * 1000) : null;
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      if (tokenExpiry && tokenExpiry < fiveMinutesFromNow) {
        console.log('Token expires soon, refreshing...');
        const { data: { session: refreshedSession }, error: refreshError } = await this.supabase.auth.refreshSession();
        
        if (refreshError) {
          console.error('Error refreshing session:', refreshError);
          return null;
        }
        
        if (refreshedSession?.access_token) {
          console.log('Token refreshed successfully');
          return refreshedSession.access_token;
        }
      }
      
      return session.access_token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }
}

// Export singleton instance
export const aiInsightsService = new AIInsightsService();