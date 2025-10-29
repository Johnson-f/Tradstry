'use client';

import { useEffect, useRef } from 'react';
import { useWebSocketControl } from '@/lib/websocket/provider';
import { useInitializationStatus } from '@/contexts/initialization-context';

/**
 * Component that controls when the WebSocket connection should be established.
 * This ensures the user is initialized before connecting to WebSocket.
 */
export function WebSocketConnectionControl() {
  const { isInitialized, isInitializing, error } = useInitializationStatus();
  const { enable } = useWebSocketControl();
  const hasEnabled = useRef(false);
  
  console.log('WebSocketConnectionControl render:', { 
    isInitialized, 
    isInitializing, 
    error: error?.toString(),
    hasEnabled: hasEnabled.current 
  });
  
  // Enable WebSocket only after initialization is complete and successful
  useEffect(() => {
    const shouldConnect = !isInitializing && isInitialized;
    
    console.log('WebSocketConnectionControl effect:', { 
      shouldConnect, 
      hasEnabled: hasEnabled.current,
      isInitializing,
      isInitialized,
      hasError: !!error
    });
    
    if (shouldConnect && !hasEnabled.current) {
      console.log('🚀 Enabling WebSocket connection...');
      hasEnabled.current = true;
      enable();
    }
  }, [isInitialized, isInitializing, error, enable]);

  return null;
}