import React, { useEffect, useCallback } from 'react';
import { WebSocketClient } from '../services/websocket';

interface AdminUpdate {
  type: 'admin_update' | 'admin_batch';
  update_type?: string;
  data?: any;
  updates?: any[];
  timestamp: string;
}

export function useAdminWebSocket(
  token: string | null,
  isAdmin: boolean,
  onCacheUpdate?: (data: any) => void,
  onTerminalUpdate?: (data: any) => void,
  onPollingUpdate?: (data: any) => void,
  onDatabaseUpdate?: (data: any) => void
) {
  const wsClientRef = React.useRef<WebSocketClient | null>(null);
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle incoming admin updates
  const handleAdminMessage = useCallback((message: AdminUpdate) => {
    if (message.type === 'admin_update') {
      const updateType = message.update_type;
      const data = message.data;

      switch (updateType) {
        case 'cache_status':
          console.log('[ADMIN WS] Cache status update:', data);
          onCacheUpdate?.(data);
          break;
        case 'terminal_status':
          console.log('[ADMIN WS] Terminal status update:', data);
          onTerminalUpdate?.(data);
          break;
        case 'polling_status':
          console.log('[ADMIN WS] Polling status update:', data);
          onPollingUpdate?.(data);
          break;
        case 'database_stats':
          console.log('[ADMIN WS] Database stats update:', data);
          onDatabaseUpdate?.(data);
          break;
        default:
          console.log('[ADMIN WS] Unknown update type:', updateType);
      }
    } else if (message.type === 'admin_batch') {
      console.log('[ADMIN WS] Batch update with', message.updates?.length, 'items');
      // Process batch updates
      message.updates?.forEach((update: any) => {
        handleAdminMessage({
          type: 'admin_update',
          update_type: update.update_type,
          data: update.data,
          timestamp: update.timestamp || message.timestamp,
        });
      });
    }
  }, [onCacheUpdate, onTerminalUpdate, onPollingUpdate, onDatabaseUpdate]);

  // Initialize WebSocket connection and subscribe to admin updates
  useEffect(() => {
    if (!token || !isAdmin) {
      console.log('[ADMIN WS] Not connecting: token=', !!token, 'isAdmin=', isAdmin);
      return;
    }

    const initializeWebSocket = async () => {
      try {
        console.log('[ADMIN WS] Initializing WebSocket connection...');
        const wsClient = new WebSocketClient(token);
        wsClientRef.current = wsClient;

        await wsClient.connect();
        console.log('[ADMIN WS] Connected, subscribing to admin_status...');

        // Subscribe to admin updates
        wsClient.subscribe('admin_update', handleAdminMessage);
        wsClient.subscribe('admin_batch', handleAdminMessage);

        // Send subscription command
        await wsClient.send({
          type: 'subscribe_admin_status',
        });

        console.log('[ADMIN WS] Subscribed to admin_status updates');
      } catch (error) {
        console.error('[ADMIN WS] Error initializing WebSocket:', error);
        // Retry in 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          initializeWebSocket();
        }, 5000);
      }
    };

    initializeWebSocket();

    return () => {
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsClientRef.current) {
        try {
          wsClientRef.current.send({ type: 'unsubscribe_admin_status' });
          wsClientRef.current.disconnect();
        } catch (error) {
          console.error('[ADMIN WS] Error during cleanup:', error);
        }
      }
    };
  }, [token, isAdmin, handleAdminMessage]);

  return {
    isConnected: wsClientRef.current?.isConnected() || false,
  };
}
