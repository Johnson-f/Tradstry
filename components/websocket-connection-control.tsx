'use client';

import { useEffect, useRef } from 'react';
import { useWebSocketControl } from '@/lib/websocket/provider';
import { useUserInitialization } from '@/hooks/use-user-initialization';

/**
 * Component that controls when the WebSocket connection should be established.
 * This ensures the user is initialized before connecting to WebSocket.
 */
export function WebSocketConnectionControl() {
  const { isInitialized, isInitializing, error } = useUserInitialization();
  const { enable } = useWebSocketControl();
  const hasEnabled = useRef(false);
  
  // Enable WebSocket after initialization is complete
  useEffect(() => {
    const shouldConnect = !isInitializing && (isInitialized || !!error);
    
    if (shouldConnect && !hasEnabled.current) {
      enable();
      hasEnabled.current = true;
    }
  }, [isInitialized, isInitializing, error, enable]);

  return null;
}
