import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiChatService } from "@/lib/services/ai-chat-service";
import type {
  AIChatMessage,
  AIChatSession,
  AIChatMessageCreate,
  AIChatMessageUpdate,
  AIChatRequest,
  AIChatResponse,
  ChatMessageDeleteResponse,
  ChatStreamChunk,
} from "@/lib/services/ai-chat-service";

// Query keys for TanStack Query
export const aiChatKeys = {
  all: ["ai-chat"] as const,
  sessions: () => [...aiChatKeys.all, "sessions"] as const,
  sessionsList: (params?: { limit?: number; offset?: number }) =>
    [...aiChatKeys.sessions(), "list", params] as const,
  session: (id: string) => [...aiChatKeys.sessions(), id] as const,
  sessionMessages: (sessionId: string, limit?: number) =>
    [...aiChatKeys.session(sessionId), "messages", limit] as const,
  messages: () => [...aiChatKeys.all, "messages"] as const,
  messageSearch: (params: {
    query: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => [...aiChatKeys.messages(), "search", params] as const,
} as const;

interface UseAIChatState {
  currentSession: AIChatSession | null;
  isChatting: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingError: string | null;
}

interface UseAIChatReturn extends UseAIChatState {
  // Query states
  sessions: AIChatSession[];
  sessionsLoading: boolean;
  sessionsError: Error | null;

  messages: AIChatMessage[];
  messagesLoading: boolean;
  messagesError: Error | null;

  searchResults: AIChatMessage[];
  searchLoading: boolean;
  searchError: Error | null;

  // Mutations
  createMessage: {
    mutate: (messageData: AIChatMessageCreate) => void;
    mutateAsync: (messageData: AIChatMessageCreate) => Promise<AIChatResponse>;
    isPending: boolean;
    error: Error | null;
  };

  updateMessage: {
    mutate: (variables: {
      messageId: string;
      messageData: AIChatMessageUpdate;
    }) => void;
    mutateAsync: (variables: {
      messageId: string;
      messageData: AIChatMessageUpdate;
    }) => Promise<AIChatResponse>;
    isPending: boolean;
    error: Error | null;
  };

  deleteMessage: {
    mutate: (messageId: string) => void;
    mutateAsync: (messageId: string) => Promise<ChatMessageDeleteResponse>;
    isPending: boolean;
    error: Error | null;
  };

  deleteSession: {
    mutate: (sessionId: string) => void;
    mutateAsync: (sessionId: string) => Promise<AIChatResponse>;
    isPending: boolean;
    error: Error | null;
  };

  chatWithAI: {
    mutate: (request: AIChatRequest) => void;
    mutateAsync: (request: AIChatRequest) => Promise<AIChatResponse>;
    isPending: boolean;
    error: Error | null;
  };

  // Streaming functionality
  chatWithAIStream: (
    request: AIChatRequest,
    onChunk?: (chunk: ChatStreamChunk) => void
  ) => Promise<void>;
  cancelStream: () => void;

  // Query functions
  refetchSessions: () => void;
  refetchMessages: () => void;
  searchMessages: (params: {
    query: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => void;

  // Utility
  setCurrentSession: (session: AIChatSession | null) => void;
}

interface UseAIChatParams {
  sessionId?: string;
  sessionsParams?: { limit?: number; offset?: number };
  messagesLimit?: number;
}

export function useAIChat(params: UseAIChatParams = {}): UseAIChatReturn {
  const { sessionId, sessionsParams, messagesLimit } = params;
  const queryClient = useQueryClient();

  const [localState, setLocalState] = useState<UseAIChatState>({
    currentSession: null,
    isChatting: false,
    isStreaming: false,
    streamingContent: '',
    streamingError: null,
  });

  const setCurrentSession = useCallback((session: AIChatSession | null) => {
    setLocalState((prev) => ({ ...prev, currentSession: session }));
  }, []);

  // Queries
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: aiChatKeys.sessionsList(sessionsParams),
    queryFn: () => aiChatService.getSessions(sessionsParams),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: messages = [],
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: aiChatKeys.sessionMessages(sessionId || "", messagesLimit),
    queryFn: () =>
      sessionId
        ? aiChatService.getSessionMessages(sessionId, messagesLimit)
        : Promise.resolve([]),
    enabled: !!sessionId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const [searchParams, setSearchParams] = useState<{
    query: string;
    session_id?: string;
    limit?: number;
    similarity_threshold?: number;
  } | null>(null);

  const {
    data: searchResults = [],
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: aiChatKeys.messageSearch(searchParams!),
    queryFn: () => aiChatService.searchMessages(searchParams!),
    enabled: !!searchParams,
    staleTime: 1 * 60 * 1000, // 1 minute
  });

  // Mutations
  const createMessageMutation = useMutation({
    mutationFn: (messageData: AIChatMessageCreate) =>
      aiChatService.createMessage(messageData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiChatKeys.messages() });
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: aiChatKeys.sessionMessages(sessionId, messagesLimit),
        });
      }
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      messageData,
    }: {
      messageId: string;
      messageData: AIChatMessageUpdate;
    }) => aiChatService.updateMessage(messageId, messageData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiChatKeys.messages() });
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: aiChatKeys.sessionMessages(sessionId, messagesLimit),
        });
      }
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => aiChatService.deleteMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiChatKeys.messages() });
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: aiChatKeys.sessionMessages(sessionId, messagesLimit),
        });
      }
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => aiChatService.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiChatKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: aiChatKeys.messages() });
    },
  });

  const chatWithAIMutation = useMutation({
    mutationFn: (request: AIChatRequest) => {
      setLocalState((prev) => ({ ...prev, isChatting: true }));
      return aiChatService.chatWithAI(request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiChatKeys.messages() });
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: aiChatKeys.sessionMessages(sessionId, messagesLimit),
        });
      }
    },
    onSettled: () => {
      setLocalState((prev) => ({ ...prev, isChatting: false }));
    },
  });

  const searchMessages = useCallback(
    (params: {
      query: string;
      session_id?: string;
      limit?: number;
      similarity_threshold?: number;
    }) => {
      setSearchParams(params);
    },
    [],
  );

  // Streaming functionality
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const chatWithAIStream = useCallback(
    async (
      request: AIChatRequest,
      onChunk?: (chunk: ChatStreamChunk) => void
    ): Promise<void> => {
      // Cancel any existing stream
      if (abortController) {
        abortController.abort();
      }

      const newController = new AbortController();
      setAbortController(newController);

      setLocalState((prev) => ({
        ...prev,
        isStreaming: true,
        streamingContent: '',
        streamingError: null,
        isChatting: true,
      }));

      try {
        await aiChatService.chatWithAIStream(
          request,
          (chunk: ChatStreamChunk) => {
            // Update streaming content based on chunk type
            if (chunk.type === 'content' && chunk.content) {
              setLocalState((prev) => ({
                ...prev,
                streamingContent: prev.streamingContent + chunk.content,
              }));
            } else if (chunk.type === 'error') {
              setLocalState((prev) => ({
                ...prev,
                streamingError: chunk.message || 'Streaming error occurred',
              }));
            }

            // Call custom onChunk handler if provided
            if (onChunk) {
              onChunk(chunk);
            }

            // End streaming on completion
            if (chunk.type === 'done' || chunk.type === 'response_saved' || chunk.type === 'stream_end') {
              setLocalState((prev) => ({
                ...prev,
                isStreaming: false,
                isChatting: false,
              }));

              // Invalidate queries to refresh messages
              queryClient.invalidateQueries({ queryKey: aiChatKeys.messages() });
              if (sessionId) {
                queryClient.invalidateQueries({
                  queryKey: aiChatKeys.sessionMessages(sessionId, messagesLimit),
                });
              }
              queryClient.invalidateQueries({ queryKey: aiChatKeys.sessions() });
            }
          },
          newController.signal
        );
      } catch (error: any) {
        if (error.name === 'AbortError') {
          // Stream was cancelled, don't show error
          console.log('Stream cancelled');
        } else {
          setLocalState((prev) => ({
            ...prev,
            streamingError: error.message || 'Failed to stream response',
            isStreaming: false,
            isChatting: false,
          }));
        }
      } finally {
        setAbortController(null);
      }
    },
    [abortController, sessionId, messagesLimit, queryClient]
  );

  const cancelStream = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setLocalState((prev) => ({
        ...prev,
        isStreaming: false,
        isChatting: false,
        streamingContent: '',
      }));
    }
  }, [abortController]);

  return {
    ...localState,
    // Query states
    sessions,
    sessionsLoading,
    sessionsError,
    messages,
    messagesLoading,
    messagesError,
    searchResults,
    searchLoading,
    searchError,
    // Mutations
    createMessage: {
      mutate: createMessageMutation.mutate,
      mutateAsync: createMessageMutation.mutateAsync,
      isPending: createMessageMutation.isPending,
      error: createMessageMutation.error,
    },
    updateMessage: {
      mutate: updateMessageMutation.mutate,
      mutateAsync: updateMessageMutation.mutateAsync,
      isPending: updateMessageMutation.isPending,
      error: updateMessageMutation.error,
    },
    deleteMessage: {
      mutate: deleteMessageMutation.mutate,
      mutateAsync: deleteMessageMutation.mutateAsync,
      isPending: deleteMessageMutation.isPending,
      error: deleteMessageMutation.error,
    },
    deleteSession: {
      mutate: deleteSessionMutation.mutate,
      mutateAsync: deleteSessionMutation.mutateAsync,
      isPending: deleteSessionMutation.isPending,
      error: deleteSessionMutation.error,
    },
    chatWithAI: {
      mutate: chatWithAIMutation.mutate,
      mutateAsync: chatWithAIMutation.mutateAsync,
      isPending: chatWithAIMutation.isPending,
      error: chatWithAIMutation.error,
    },
    // Streaming functionality
    chatWithAIStream,
    cancelStream,
    // Query functions
    refetchSessions,
    refetchMessages,
    searchMessages,
    // Utility
    setCurrentSession,
  };
}
