import { useState, useCallback } from 'react';
import { aiChatService } from '@/lib/services/ai-chat-service';
import type {
  AIChatMessage,
  AIChatSession,
  AIChatMessageCreate,
  AIChatMessageUpdate,
  AIChatRequest,
  AIChatResponse,
  ChatMessageDeleteResponse
} from '@/lib/services/ai-chat-service';

interface UseAIChatState {
  messages: AIChatMessage[];
  sessions: AIChatSession[];
  currentSession: AIChatSession | null;
  loading: boolean;
  error: string | null;
  isChatting: boolean;
}

interface UseAIChatActions {
  // Message operations
  createMessage: (messageData: AIChatMessageCreate) => Promise<AIChatResponse>;
  updateMessage: (messageId: string, messageData: AIChatMessageUpdate) => Promise<AIChatResponse>;
  deleteMessage: (messageId: string) => Promise<ChatMessageDeleteResponse>;

  // Session operations
  getSessions: (params?: { limit?: number; offset?: number }) => Promise<void>;
  getSessionMessages: (sessionId: string, limit?: number) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<AIChatResponse>;

  // Chat operations
  chatWithAI: (request: AIChatRequest) => Promise<AIChatResponse>;
  searchMessages: (params: {
    query: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => Promise<void>;

  // Utility
  clearError: () => void;
  setCurrentSession: (session: AIChatSession | null) => void;
}

type UseAIChatReturn = UseAIChatState & UseAIChatActions;

export function useAIChat(): UseAIChatReturn {
  const [state, setState] = useState<UseAIChatState>({
    messages: [],
    sessions: [],
    currentSession: null,
    loading: false,
    error: null,
    isChatting: false,
  });

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, loading: false, isChatting: false }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setChatting = useCallback((isChatting: boolean) => {
    setState(prev => ({ ...prev, isChatting }));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  const setCurrentSession = useCallback((session: AIChatSession | null) => {
    setState(prev => ({ ...prev, currentSession: session }));
  }, []);

  // Message operations
  const createMessage = useCallback(async (messageData: AIChatMessageCreate): Promise<AIChatResponse> => {
    setLoading(true);
    try {
      const result = await aiChatService.createMessage(messageData);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create message';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const updateMessage = useCallback(async (messageId: string, messageData: AIChatMessageUpdate): Promise<AIChatResponse> => {
    setLoading(true);
    try {
      const result = await aiChatService.updateMessage(messageId, messageData);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to update message';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const deleteMessage = useCallback(async (messageId: string): Promise<ChatMessageDeleteResponse> => {
    setLoading(true);
    try {
      const result = await aiChatService.deleteMessage(messageId);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete message';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  // Session operations
  const getSessions = useCallback(async (params?: { limit?: number; offset?: number }): Promise<void> => {
    setLoading(true);
    try {
      const sessions = await aiChatService.getSessions(params);
      setState(prev => ({ ...prev, sessions, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load sessions';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getSessionMessages = useCallback(async (sessionId: string, limit?: number): Promise<void> => {
    setLoading(true);
    try {
      const messages = await aiChatService.getSessionMessages(sessionId, limit);
      setState(prev => ({ ...prev, messages, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load session messages';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const deleteSession = useCallback(async (sessionId: string): Promise<AIChatResponse> => {
    setLoading(true);
    try {
      const result = await aiChatService.deleteSession(sessionId);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete session';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  // Chat operations
  const chatWithAI = useCallback(async (request: AIChatRequest): Promise<AIChatResponse> => {
    setChatting(true);
    try {
      const result = await aiChatService.chatWithAI(request);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to chat with AI';
      setError(errorMessage);
      throw err;
    } finally {
      setChatting(false);
    }
  }, [setChatting, setError]);

  const searchMessages = useCallback(async (params: {
    query: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
  }): Promise<void> => {
    setLoading(true);
    try {
      const messages = await aiChatService.searchMessages(params);
      setState(prev => ({ ...prev, messages, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to search messages';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  return {
    ...state,
    createMessage,
    updateMessage,
    deleteMessage,
    getSessions,
    getSessionMessages,
    deleteSession,
    chatWithAI,
    searchMessages,
    clearError,
    setCurrentSession,
  };
}
