import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { createClient } from '@/lib/supabase/client';
import { apiConfig, getFullUrl } from '@/lib/config/api';

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  status: number;
}

export interface ApiError {
  message: string;
  status: number;
  details?: any;
}

class ApiClient {
  private axiosInstance: AxiosInstance;
  private supabase = createClient();

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: apiConfig.baseURL,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();

          if (session?.access_token) {
            config.headers.Authorization = `Bearer ${session.access_token}`;
          }
        } catch (error) {
          console.error('Error getting session:', error);
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      async (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized - redirect to login or refresh token
          const { data: { session } } = await this.supabase.auth.getSession();

          if (!session) {
            // Redirect to login page or handle unauthenticated state
            window.location.href = '/login';
            return Promise.reject(error);
          }

          // Try to refresh the session
          try {
            const { data: { session: newSession }, error: refreshError } =
              await this.supabase.auth.refreshSession();

            if (refreshError || !newSession) {
              window.location.href = '/login';
              return Promise.reject(error);
            }

            // Retry the original request with new token
            error.config.headers.Authorization = `Bearer ${newSession.access_token}`;
            return this.axiosInstance.request(error.config);
          } catch (refreshError) {
            window.location.href = '/login';
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Generic request method
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    console.log(`[API] Making request to: ${config.url}`, { method: config.method, data: config.data });
    try {
      const response = await this.axiosInstance.request<T>(config);
      console.log(`[API] Response from ${config.url}:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[API] Error from ${config.url}:`, error.response?.data || error.message);
      const apiError: ApiError = {
        message: error.response?.data?.detail || error.message || 'An error occurred',
        status: error.response?.status || 500,
        details: error.response?.data,
      };
      throw apiError;
    }
  }

  // HTTP methods
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'GET', url: getFullUrl(url) });
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'POST', url: getFullUrl(url), data });
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'PUT', url: getFullUrl(url), data });
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'PATCH', url: getFullUrl(url), data });
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'DELETE', url: getFullUrl(url) });
  }

  // Health check
  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.get(apiConfig.endpoints.health);
  }

  // Get current user info from token
  async getCurrentUser() {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user;
  }

  // Manual token refresh
  async refreshToken() {
    const { data, error } = await this.supabase.auth.refreshSession();
    if (error) throw error;
    return data.session;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default apiClient;
