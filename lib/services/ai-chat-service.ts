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
  user_id?: string;
  title?: string;
  created_at: string;
  updated_at?: string;
  message_count?: number;
  first_message?: string;
  last_message?: string;
  first_message_at?: string;
  last_message_at?: string;
  total_usage_count?: number;
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

// Streaming chat response chunk types
export interface ChatStreamChunk {
  type: 'thinking' | 'content' | 'error' | 'done' | 'response_saved' | 'stream_end';
  content?: string;
  message?: string;
  session_id?: string;
  ai_message_id?: string;
  user_message_id?: string;
  metadata?: {
    thinking_time?: number;
    response_time?: number;
    token_count?: number;
  };
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
    const response = await apiClient.get(url);
    
    // Transform backend response to match frontend interface
    return response.map((session: {
      session_id: string;
      message_count: number;
      first_message: string;
      last_message: string;
      first_message_at: string;
      last_message_at: string;
      total_usage_count: number;
    }) => ({
      id: session.session_id,
      title: session.first_message ? session.first_message.substring(0, 50) + '...' : 'Untitled Chat',
      created_at: session.first_message_at,
      updated_at: session.last_message_at,
      message_count: session.message_count,
      first_message: session.first_message,
      last_message: session.last_message,
      first_message_at: session.first_message_at,
      last_message_at: session.last_message_at,
      total_usage_count: session.total_usage_count
    }));
  }

  // Get all messages for a specific session
  async getSessionMessages(sessionId: string, limit?: number): Promise<AIChatMessage[]> {
    const queryParams = new URLSearchParams();
    if (limit !== undefined) {
      queryParams.append('limit', limit.toString());
    }
    const queryString = queryParams.toString();
    const url = queryString ? `${this.baseUrl}/sessions/${sessionId}/messages?${queryString}` : `${this.baseUrl}/sessions/${sessionId}/messages`;
    const response = await apiClient.get(url);
    
    // Transform backend response to match frontend interface
    return response.map((message: {
      id: string;
      session_id: string;
      content: string;
      message_type: string;
      created_at: string;
      updated_at?: string;
    }) => ({
      id: message.id,
      session_id: message.session_id,
      content: message.content,
      message_type: message.message_type,
      role: message.message_type === 'user_question' ? 'user' : 'assistant',
      created_at: message.created_at,
      updated_at: message.updated_at
    }));
  }

  // Send a message to AI and get a response
  async chatWithAI(request: AIChatRequest): Promise<AIChatResponse> {
    return apiClient.post(`${this.baseUrl}/chat`, request);
  }

  // Send a message to AI and get a streaming response
  async chatWithAIStream(
    request: AIChatRequest,
    onChunk: (chunk: ChatStreamChunk) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const authToken = await apiClient.getAuthToken();
    const response = await fetch(`${apiClient.baseURL}${this.baseUrl}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const data = line.slice(6); // Remove 'data: ' prefix
              const chunk: ChatStreamChunk = JSON.parse(data);
              onChunk(chunk);
              
              // Break on stream end or error
              if (chunk.type === 'stream_end' || chunk.type === 'error') {
                return;
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error, 'Line:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
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
