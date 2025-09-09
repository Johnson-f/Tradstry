import { apiClient } from './api-client';

// AI Reports Service Types
export interface AIReport {
  id: string;
  user_id: string;
  title: string;
  content: string;
  report_type: string;
  status: string;
  time_range?: string;
  custom_start_date?: string;
  custom_end_date?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface AIReportCreate {
  title: string;
  content?: string;
  report_type: string;
  time_range?: string;
  custom_start_date?: string;
  custom_end_date?: string;
  metadata?: Record<string, any>;
}

export interface AIReportUpdate {
  title?: string;
  content?: string;
  report_type?: string;
  status?: string;
  time_range?: string;
  custom_start_date?: string;
  custom_end_date?: string;
  metadata?: Record<string, any>;
}

export interface AIReportGenerateRequest {
  time_range?: string;
  custom_start_date?: string;
  custom_end_date?: string;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
}

export class AIReportsService {
  private baseUrl = '/ai/reports';

  // Create a new AI report
  async createReport(reportData: AIReportCreate): Promise<{ success: boolean; data: AIReport }> {
    return apiClient.post(`${this.baseUrl}/`, reportData);
  }

  // Get AI reports with filtering and pagination
  async getReports(params?: {
    report_type?: string;
    status?: string;
    date_range_start?: string;
    date_range_end?: string;
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }): Promise<AIReport[]> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/?${queryString}` : `${this.baseUrl}/`;
    return apiClient.get(url);
  }

  // Get a specific AI report by ID
  async getReport(reportId: string): Promise<AIReport> {
    return apiClient.get(`${this.baseUrl}/${reportId}`);
  }

  // Update an existing AI report
  async updateReport(reportId: string, reportData: AIReportUpdate): Promise<{ success: boolean; data: AIReport }> {
    return apiClient.put(`${this.baseUrl}/${reportId}`, reportData);
  }

  // Delete an AI report
  async deleteReport(reportId: string, softDelete?: boolean): Promise<DeleteResponse> {
    const queryParams = new URLSearchParams();
    if (softDelete !== undefined) {
      queryParams.append('soft_delete', softDelete.toString());
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/${reportId}?${queryString}` : `${this.baseUrl}/${reportId}`;
    return apiClient.delete(url);
  }

  // Generate a new AI report using the AI orchestrator
  async generateReport(request: AIReportGenerateRequest): Promise<{ success: boolean; message: string; data: AIReport }> {
    return apiClient.post(`${this.baseUrl}/generate`, request);
  }

  // Get comprehensive trading context for AI processing
  async getTradingContext(params?: {
    time_range?: string;
    custom_start_date?: string;
    custom_end_date?: string;
  }): Promise<{ success: boolean; data: any }> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/context/trading?${queryString}` : `${this.baseUrl}/context/trading`;
    return apiClient.get(url);
  }
}

// Export singleton instance
export const aiReportsService = new AIReportsService();
export default aiReportsService;
