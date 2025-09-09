import { apiClient } from './api-client';

// AI Insights Service Types
export interface AIInsight {
  id: string;
  user_id: string;
  content: string;
  insight_type: string;
  priority: string;
  actionable: boolean;
  tags?: string[];
  confidence_score?: number;
  expires_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface AIInsightCreate {
  content: string;
  insight_type: string;
  priority?: string;
  actionable?: boolean;
  tags?: string[];
  confidence_score?: number;
  expires_at?: string;
}

export interface AIInsightUpdate {
  content?: string;
  insight_type?: string;
  priority?: string;
  actionable?: boolean;
  tags?: string[];
  confidence_score?: number;
  expires_at?: string;
}

export interface AIInsightGenerateRequest {
  insight_types?: string[];
  time_range?: string;
  min_confidence?: number;
}

export interface InsightDeleteResponse {
  success: boolean;
  message: string;
}

export interface InsightExpireResponse {
  success: boolean;
  message: string;
}

export interface PriorityInsightsResponse extends AIInsight {
  priority_score?: number;
}

export interface ActionableInsightsResponse extends AIInsight {
  action_items?: string[];
}

export class AIInsightsService {
  private baseUrl = '/ai/insights';

  // Create a new AI insight
  async createInsight(insightData: AIInsightCreate): Promise<{ success: boolean; data: AIInsight }> {
    return apiClient.post(`${this.baseUrl}/`, insightData);
  }

  // Get AI insights with filtering and pagination
  async getInsights(params?: {
    insight_type?: string;
    priority?: string;
    actionable?: boolean;
    tags?: string[];
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }): Promise<AIInsight[]> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach(item => queryParams.append(key, item));
          } else {
            queryParams.append(key, value.toString());
          }
        }
      });
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/?${queryString}` : `${this.baseUrl}/`;
    return apiClient.get(url);
  }

  // Get high-priority insights
  async getPriorityInsights(limit?: number): Promise<PriorityInsightsResponse[]> {
    const queryParams = new URLSearchParams();
    if (limit !== undefined) {
      queryParams.append('limit', limit.toString());
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/priority?${queryString}` : `${this.baseUrl}/priority`;
    return apiClient.get(url);
  }

  // Get actionable insights
  async getActionableInsights(limit?: number): Promise<ActionableInsightsResponse[]> {
    const queryParams = new URLSearchParams();
    if (limit !== undefined) {
      queryParams.append('limit', limit.toString());
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/actionable?${queryString}` : `${this.baseUrl}/actionable`;
    return apiClient.get(url);
  }

  // Get a specific AI insight by ID
  async getInsight(insightId: string): Promise<AIInsight> {
    return apiClient.get(`${this.baseUrl}/${insightId}`);
  }

  // Update an existing AI insight
  async updateInsight(insightId: string, insightData: AIInsightUpdate): Promise<{ success: boolean; data: AIInsight }> {
    return apiClient.put(`${this.baseUrl}/${insightId}`, insightData);
  }

  // Delete an AI insight
  async deleteInsight(insightId: string, softDelete?: boolean): Promise<InsightDeleteResponse> {
    const queryParams = new URLSearchParams();
    if (softDelete !== undefined) {
      queryParams.append('soft_delete', softDelete.toString());
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/${insightId}?${queryString}` : `${this.baseUrl}/${insightId}`;
    return apiClient.delete(url);
  }

  // Expire an AI insight
  async expireInsight(insightId: string): Promise<InsightExpireResponse> {
    return apiClient.post(`${this.baseUrl}/${insightId}/expire`);
  }

  // Generate AI insights using the AI orchestrator
  async generateInsights(request: AIInsightGenerateRequest): Promise<{ success: boolean; message: string; data: AIInsight[] }> {
    return apiClient.post(`${this.baseUrl}/generate`, request);
  }

  // Search insights using vector similarity
  async searchInsights(params: {
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  }): Promise<AIInsight[]> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });
    const url = `${this.baseUrl}/search?${queryParams.toString()}`;
    return apiClient.get(url);
  }
}

// Export singleton instance
export const aiInsightsService = new AIInsightsService();
export default aiInsightsService;
