import { apiClient } from './api-client';

// AI Chat Service Types
export interface AIChatMessage {
  id: string;
  session_id: string;
  content: string;
  message_type: string;
  role: string;
  created_at: string;
  updated_at?: string;
}

export interface AIChatSession {
  id: string;
  user_id: string;
  title?: string;
  created_at: string;
  updated_at?: string;
  message_count?: number;
}

export interface AIChatMessageCreate {
  session_id?: string;
  content: string;
  message_type: string;
  role: string;
}

export interface AIChatMessageUpdate {
  content?: string;
  message_type?: string;
}

export interface AIChatRequest {
  session_id?: string;
  message: string;
  context_limit?: number;
}

export interface AIChatResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export interface ChatMessageDeleteResponse {
  success: boolean;
  message: string;
}

export class AIChatService {
  private baseUrl = '/ai/chat';

  // Create a new chat message
  async createMessage(messageData: AIChatMessageCreate): Promise<AIChatResponse> {
    return apiClient.post(`${this.baseUrl}/messages`, messageData);
  }

  // Get chat messages with filtering and pagination
  async getMessages(params?: {
    session_id?: string;
    message_type?: string;
    role?: string;
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }): Promise<AIChatMessage[]> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/messages?${queryString}` : `${this.baseUrl}/messages`;
    return apiClient.get(url);
  }

  // Get chat sessions for the user
  async getSessions(params?: {
    limit?: number;
    offset?: number;
  }): Promise<AIChatSession[]> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/sessions?${queryString}` : `${this.baseUrl}/sessions`;
    return apiClient.get(url);
  }

  // Get all messages for a specific session
  async getSessionMessages(sessionId: string, limit?: number): Promise<AIChatMessage[]> {
    const queryParams = new URLSearchParams();
    if (limit !== undefined) {
      queryParams.append('limit', limit.toString());
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/sessions/${sessionId}/messages?${queryString}` : `${this.baseUrl}/sessions/${sessionId}/messages`;
    return apiClient.get(url);
  }

  // Send a message to AI and get a response
  async chatWithAI(request: AIChatRequest): Promise<AIChatResponse> {
    return apiClient.post(`${this.baseUrl}/chat`, request);
  }

  // Update an existing chat message
  async updateMessage(messageId: string, messageData: AIChatMessageUpdate): Promise<AIChatResponse> {
    return apiClient.put(`${this.baseUrl}/messages/${messageId}`, messageData);
  }

  // Delete a chat message
  async deleteMessage(messageId: string): Promise<ChatMessageDeleteResponse> {
    return apiClient.delete(`${this.baseUrl}/messages/${messageId}`);
  }

  // Delete an entire chat session
  async deleteSession(sessionId: string): Promise<AIChatResponse> {
    return apiClient.delete(`${this.baseUrl}/sessions/${sessionId}`);
  }

  // Search chat messages using vector similarity
  async searchMessages(params: {
    query: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
  }): Promise<AIChatMessage[]> {
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
export const aiChatService = new AIChatService();
export default aiChatService;
