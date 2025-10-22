import { apiConfig, getFullUrl } from '@/lib/config/api';
import type {
  TradingReport,
  ReportRequest,
  ReportListResponse,
  ReportGenerationTask,
  ReportFilters,
  ApiResponse,
} from '@/lib/types/ai-reports';
import {
  AIReportsError,
  ValidationError,
  GenerationError,
  POLLING_INTERVAL,
  MAX_POLLING_ATTEMPTS,
} from '@/lib/types/ai-reports';

/**
 * AI Reports Service
 * Handles all API calls to the backend AI reports endpoints
 */
export class AIReportsService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getFullUrl(apiConfig.endpoints.ai.reports.base);
  }

  /**
   * Generate report synchronously
   */
  async generateReport(request: ReportRequest): Promise<TradingReport> {
    try {
      this.validateReportRequest(request);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIReportsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'GENERATION_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<TradingReport> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIReportsError(
          result.error || 'Failed to generate report',
          'GENERATION_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIReportsError) {
        throw error;
      }
      throw new AIReportsError(
        `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Generate report asynchronously
   * Returns task ID for polling
   */
  async generateReportAsync(request: ReportRequest): Promise<string> {
    try {
      this.validateReportRequest(request);

      const response = await fetch(getFullUrl(apiConfig.endpoints.ai.reports.generateAsync), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIReportsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'ASYNC_GENERATION_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<{ task_id: string }> = await response.json();
      
      if (!result.success || !result.data?.task_id) {
        throw new AIReportsError(
          result.error || 'Failed to start async report generation',
          'ASYNC_GENERATION_ERROR'
        );
      }

      return result.data.task_id;
    } catch (error) {
      if (error instanceof AIReportsError) {
        throw error;
      }
      throw new AIReportsError(
        `Failed to start async report generation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get user's reports with optional filters
   */
  async getReports(filters: ReportFilters = {}): Promise<ReportListResponse> {
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.time_range) {
        queryParams.append('time_range', filters.time_range);
      }
      if (filters.report_type) {
        queryParams.append('report_type', filters.report_type);
      }
      if (filters.limit) {
        queryParams.append('limit', filters.limit.toString());
      }
      if (filters.offset) {
        queryParams.append('offset', filters.offset.toString());
      }

      const url = `${this.baseUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIReportsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'FETCH_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<ReportListResponse> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIReportsError(
          result.error || 'Failed to fetch reports',
          'FETCH_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIReportsError) {
        throw error;
      }
      throw new AIReportsError(
        `Failed to fetch reports: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get specific report by ID
   */
  async getReport(reportId: string): Promise<TradingReport> {
    try {
      if (!reportId) {
        throw new ValidationError('Report ID is required', 'reportId');
      }

      const url = getFullUrl(apiConfig.endpoints.ai.reports.byId(reportId));
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AIReportsError(
            'Report not found',
            'NOT_FOUND',
            { reportId }
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AIReportsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'FETCH_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<TradingReport> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIReportsError(
          result.error || 'Failed to fetch report',
          'FETCH_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIReportsError) {
        throw error;
      }
      throw new AIReportsError(
        `Failed to fetch report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Get generation task status
   */
  async getGenerationTask(taskId: string): Promise<ReportGenerationTask> {
    try {
      if (!taskId) {
        throw new ValidationError('Task ID is required', 'taskId');
      }

      const url = getFullUrl(apiConfig.endpoints.ai.reports.tasks.byId(taskId));
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AIReportsError(
            'Generation task not found',
            'TASK_NOT_FOUND',
            { taskId }
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AIReportsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'TASK_FETCH_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<ReportGenerationTask> = await response.json();
      
      if (!result.success || !result.data) {
        throw new AIReportsError(
          result.error || 'Failed to fetch generation task',
          'TASK_FETCH_ERROR'
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof AIReportsError) {
        throw error;
      }
      throw new AIReportsError(
        `Failed to fetch generation task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Delete report
   */
  async deleteReport(reportId: string): Promise<void> {
    try {
      if (!reportId) {
        throw new ValidationError('Report ID is required', 'reportId');
      }

      const url = getFullUrl(apiConfig.endpoints.ai.reports.byId(reportId));
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new AIReportsError(
            'Report not found',
            'NOT_FOUND',
            { reportId }
          );
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new AIReportsError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          'DELETE_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const result: ApiResponse<void> = await response.json();
      
      if (!result.success) {
        throw new AIReportsError(
          result.error || 'Failed to delete report',
          'DELETE_ERROR'
        );
      }
    } catch (error) {
      if (error instanceof AIReportsError) {
        throw error;
      }
      throw new AIReportsError(
        `Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    onComplete?: (report: TradingReport) => void,
    onError?: (error: Error) => void,
    onProgress?: (progress: number) => void
  ): Promise<TradingReport> {
    let attempts = 0;
    
    while (attempts < MAX_POLLING_ATTEMPTS) {
      try {
        const task = await this.getGenerationTask(taskId);
        
        // Update progress if callback provided
        onProgress?.(task.progress_percentage);
        
        switch (task.status) {
          case 'completed':
            if (task.result_report_id) {
              const report = await this.getReport(task.result_report_id);
              onComplete?.(report);
              return report;
            } else {
              throw new GenerationError('Task completed but no report ID found', taskId);
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
   * Validate report request
   */
  private validateReportRequest(request: ReportRequest): void {
    if (!request.time_range) {
      throw new ValidationError('Time range is required', 'time_range');
    }
    
    if (!request.report_type) {
      throw new ValidationError('Report type is required', 'report_type');
    }
    
    const validTimeRanges = ['7d', '30d', '90d', '1y', 'ytd', 'custom', 'all_time'];
    if (!validTimeRanges.includes(request.time_range)) {
      throw new ValidationError(`Invalid time range: ${request.time_range}`, 'time_range');
    }
    
    const validReportTypes = [
      'comprehensive',
      'performance',
      'risk',
      'trading',
      'behavioral',
      'market'
    ];
    if (!validReportTypes.includes(request.report_type)) {
      throw new ValidationError(`Invalid report type: ${request.report_type}`, 'report_type');
    }
    
    if (request.sections) {
      const validSections = [
        'summary',
        'analytics',
        'insights',
        'trades',
        'patterns',
        'recommendations',
        'risk_analysis',
        'performance_metrics',
        'behavioral_analysis',
        'market_analysis'
      ];
      
      for (const section of request.sections) {
        if (!validSections.includes(section)) {
          throw new ValidationError(`Invalid report section: ${section}`, 'sections');
        }
      }
    }
  }

  /**
   * Get authentication token
   * This should be implemented based on your auth system
   */
  private getAuthToken(): string {
    // TODO: Implement proper auth token retrieval
    // This could be from localStorage, cookies, or auth context
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new AIReportsError('Authentication token not found', 'AUTH_ERROR');
    }
    return token;
  }
}

// Export singleton instance
export const aiReportsService = new AIReportsService();

