/**
 * AI Summary Service - API client for AI trading analysis endpoints
 */

import { apiClient } from './api-client';
import { apiConfig } from '../config/api';
import type {
  AnalysisRequest,
  AnalysisResponse,
  ChatRequest,
  ChatResponse,
  QuickInsightsResponse,
  AIServiceStatus,
  ResetChatResponse,
  AIReportResponse,
  AIReportStats,
  SimilarReportsRequest,
  ReportSearchRequest,
  ChatHistoryItem,
  SimilarChatResponse,
  ChatStats,
  DeleteChatResponse,
  HealthCheckResponse,
} from '../types/ai-summary';

export class AISummaryService {
  /**
   * Generate complete AI trading analysis report
   */
  async generateAnalysis(request: AnalysisRequest): Promise<AnalysisResponse> {
    return apiClient.post<AnalysisResponse>(
      apiConfig.endpoints.aiSummary.generate,
      request
    );
  }

  /**
   * Chat with AI about trading analysis
   */
  async chatWithAI(request: ChatRequest): Promise<ChatResponse> {
    return apiClient.post<ChatResponse>(
      apiConfig.endpoints.aiSummary.chat,
      request
    );
  }

  /**
   * Get quick trading insights without full report generation
   */
  async getQuickInsights(timeRange: string = '7d'): Promise<QuickInsightsResponse> {
    return apiClient.get<QuickInsightsResponse>(
      `${apiConfig.endpoints.aiSummary.quickInsights}?time_range=${timeRange}`
    );
  }

  /**
   * Get AI service status and model information
   */
  async getStatus(): Promise<AIServiceStatus> {
    return apiClient.get<AIServiceStatus>(apiConfig.endpoints.aiSummary.status);
  }

  /**
   * Reset chat conversation context
   */
  async resetChatContext(): Promise<ResetChatResponse> {
    return apiClient.delete<ResetChatResponse>(apiConfig.endpoints.aiSummary.resetChat);
  }

  // Report Management Methods

  /**
   * Get user's AI reports with filtering and pagination
   */
  async getReports(params?: ReportSearchRequest): Promise<AIReportResponse[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.time_period) queryParams.append('time_period', params.time_period);
    if (params?.start_date) queryParams.append('start_date', params.start_date);
    if (params?.end_date) queryParams.append('end_date', params.end_date);
    if (params?.tags?.length) {
      params.tags.forEach(tag => queryParams.append('tags', tag));
    }
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.order_by) queryParams.append('order_by', params.order_by);
    if (params?.order_direction) queryParams.append('order_direction', params.order_direction);

    const url = queryParams.toString() 
      ? `${apiConfig.endpoints.aiSummary.reports.base}?${queryParams.toString()}`
      : apiConfig.endpoints.aiSummary.reports.base;

    return apiClient.get<AIReportResponse[]>(url);
  }

  /**
   * Get full AI report by ID
   */
  async getReportById(reportId: string): Promise<AIReportResponse> {
    return apiClient.get<AIReportResponse>(
      apiConfig.endpoints.aiSummary.reports.byId(reportId)
    );
  }

  /**
   * Find similar reports using vector similarity search
   */
  async searchSimilarReports(request: SimilarReportsRequest): Promise<AIReportResponse[]> {
    return apiClient.post<AIReportResponse[]>(
      apiConfig.endpoints.aiSummary.reports.searchSimilar,
      request
    );
  }

  /**
   * Get AI report statistics for dashboard
   */
  async getReportStats(daysBack: number = 30): Promise<AIReportStats> {
    return apiClient.get<AIReportStats>(
      `${apiConfig.endpoints.aiSummary.reports.stats}?days_back=${daysBack}`
    );
  }

  // Chat History Methods

  /**
   * Get user's chat Q&A history from vector database
   */
  async getChatHistory(limit: number = 20, offset: number = 0): Promise<ChatHistoryItem[]> {
    return apiClient.get<ChatHistoryItem[]>(
      `${apiConfig.endpoints.aiSummary.chat.history}?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Search for similar chat questions using vector similarity
   */
  async searchSimilarChatQuestions(request: SimilarReportsRequest): Promise<SimilarChatResponse> {
    return apiClient.post<SimilarChatResponse>(
      apiConfig.endpoints.aiSummary.chat.searchSimilar,
      request
    );
  }

  /**
   * Get chat Q&A statistics for learning insights
   */
  async getChatStats(daysBack: number = 30): Promise<ChatStats> {
    return apiClient.get<ChatStats>(
      `${apiConfig.endpoints.aiSummary.chat.stats}?days_back=${daysBack}`
    );
  }

  /**
   * Delete a specific chat Q&A pair
   */
  async deleteChatQAPair(qaId: string): Promise<DeleteChatResponse> {
    return apiClient.delete<DeleteChatResponse>(
      apiConfig.endpoints.aiSummary.chat.deleteQA(qaId)
    );
  }

  /**
   * Health check for AI summary service
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return apiClient.get<HealthCheckResponse>(apiConfig.endpoints.aiSummary.health);
  }

  // Dynamic Routing Methods

  /**
   * Chat with AI using versioned dynamic routing
   */
  async chatWithAIDynamic(request: ChatRequest, version: string = 'v1'): Promise<ChatResponse> {
    return apiClient.post<ChatResponse>(
      apiConfig.endpoints.aiDynamic.versioned.chat(version),
      request
    );
  }

  /**
   * Generate analysis using versioned dynamic routing
   */
  async generateAnalysisDynamic(request: AnalysisRequest, version: string = 'v1'): Promise<AnalysisResponse> {
    return apiClient.post<AnalysisResponse>(
      apiConfig.endpoints.aiDynamic.versioned.generate(version),
      request
    );
  }

  /**
   * Call service-based dynamic routing
   */
  async callServiceDynamic(serviceType: string, action?: string, payload?: any): Promise<any> {
    const endpoint = action 
      ? apiConfig.endpoints.aiDynamic.service.action(serviceType, action)
      : apiConfig.endpoints.aiDynamic.service.base(serviceType);
    
    return apiClient.post<any>(endpoint, payload || {});
  }

  /**
   * Access feature-controlled endpoints
   */
  async accessFeature(featureName: string): Promise<any> {
    return apiClient.get<any>(apiConfig.endpoints.aiDynamic.features.base(featureName));
  }

  /**
   * Call wildcard dynamic routing
   */
  async callDynamicPath(path: string, method: 'GET' | 'POST' = 'GET', payload?: any): Promise<any> {
    const endpoint = apiConfig.endpoints.aiDynamic.dynamic(path);
    
    if (method === 'POST') {
      return apiClient.post<any>(endpoint, payload || {});
    }
    return apiClient.get<any>(endpoint);
  }
}

// Export singleton instance
export const aiSummaryService = new AISummaryService();
