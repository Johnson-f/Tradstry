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
    // Query functions
    refetchSessions,
    refetchMessages,
    searchMessages,
    // Utility
    setCurrentSession,
  };
}
