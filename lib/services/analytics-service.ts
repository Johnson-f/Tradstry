import { apiConfig, getFullUrl } from '@/lib/config/api';
import type {
  AnalyticsRequest,
  CoreAnalyticsResponse,
  RiskAnalyticsResponse,
  PerformanceAnalyticsResponse,
  TimeSeriesAnalyticsResponse,
  GroupedAnalyticsResponse,
  ComprehensiveAnalyticsResponse,
} from '@/lib/types/analytics';

/**
 * Analytics Service
 * Handles all analytics API calls to the Rust backend
 */
export class AnalyticsService {
  private baseURL: string;

  constructor() {
    this.baseURL = apiConfig.baseURL + apiConfig.apiPrefix;
  }

  /**
   * Get core analytics (basic trading metrics)
   */
  async getCoreAnalytics(request?: AnalyticsRequest): Promise<CoreAnalyticsResponse> {
    const url = getFullUrl(apiConfig.endpoints.analytics.core);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch core analytics: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get risk metrics analytics
   */
  async getRiskAnalytics(request?: AnalyticsRequest): Promise<RiskAnalyticsResponse> {
    const url = getFullUrl(apiConfig.endpoints.analytics.risk);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch risk analytics: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get performance metrics analytics
   */
  async getPerformanceAnalytics(
    request?: AnalyticsRequest
  ): Promise<PerformanceAnalyticsResponse> {
    const url = getFullUrl(apiConfig.endpoints.analytics.performance);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch performance analytics: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get time series analytics data
   */
  async getTimeSeriesAnalytics(
    request?: AnalyticsRequest
  ): Promise<TimeSeriesAnalyticsResponse> {
    const url = getFullUrl(apiConfig.endpoints.analytics.timeSeries);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch time series analytics: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get grouped analytics (by symbol, strategy, direction, etc.)
   */
  async getGroupedAnalytics(
    request?: AnalyticsRequest
  ): Promise<GroupedAnalyticsResponse> {
    const url = getFullUrl(apiConfig.endpoints.analytics.grouped);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch grouped analytics: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get comprehensive analytics (all metrics combined)
   */
  async getComprehensiveAnalytics(
    request?: AnalyticsRequest
  ): Promise<ComprehensiveAnalyticsResponse> {
    const url = getFullUrl(apiConfig.endpoints.analytics.comprehensive);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch comprehensive analytics: ${response.statusText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Export individual functions for convenience
export const getCoreAnalytics = (request?: AnalyticsRequest) =>
  analyticsService.getCoreAnalytics(request);

export const getRiskAnalytics = (request?: AnalyticsRequest) =>
  analyticsService.getRiskAnalytics(request);

export const getPerformanceAnalytics = (request?: AnalyticsRequest) =>
  analyticsService.getPerformanceAnalytics(request);

export const getTimeSeriesAnalytics = (request?: AnalyticsRequest) =>
  analyticsService.getTimeSeriesAnalytics(request);

export const getGroupedAnalytics = (request?: AnalyticsRequest) =>
  analyticsService.getGroupedAnalytics(request);

export const getComprehensiveAnalytics = (request?: AnalyticsRequest) =>
  analyticsService.getComprehensiveAnalytics(request);

