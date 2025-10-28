'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useWebSocket } from '@/lib/hooks/use-websocket';
import type { WebSocketConnectionState, WebSocketEventType, WebSocketHandler } from '@/lib/websocket/types';

interface WebSocketContextValue {
  state: WebSocketConnectionState;
  error: Error | null;
  subscribe: (event: WebSocketEventType, handler: WebSocketHandler) => () => void;
  send: (message: unknown) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { state, error, subscribe, send } = useWebSocket();

  const value = useMemo<WebSocketContextValue>(() => ({ state, error, subscribe, send }), [state, error, subscribe, send]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWs() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWs must be used within WebSocketProvider');
  return ctx;
}


