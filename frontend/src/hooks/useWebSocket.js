/**
 * useWebSocket — Centralized WebSocket connection management
 * Handles MT5 live data subscriptions with auto-reconnect and exponential backoff
 */
import { useEffect, useRef, useCallback } from 'react';

// Detect WebSocket URL from environment or build from window location
const getWSUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // In development, backend is at localhost:3001
  // In production, use same protocol and host as frontend
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    return `${protocol}//${host}/api/mt5/ws`;
  }
  return 'ws://localhost:3001/api/mt5/ws';
};

const WS_URL = getWSUrl();

// Exponential backoff: start at 1s, max 30s
const getBackoffDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000);

export function useWebSocket() {
  const wsRef = useRef(null);
  const attemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const subscriptionsRef = useRef({
    ticks: new Set(),
    candles: new Set(),
    depth: new Set(),
  });
  const callbacksRef = useRef({
    onTick: [],
    onCandleUpdate: [],
    onDepth: [],
    onConnect: [],
    onDisconnect: [],
    onError: [],
  });

  // Helper to safely send WebSocket messages with state check
  const safeSend = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(msg));
      } catch (e) {
        console.error('[WS] Error sending message:', e);
      }
    }
  }, []);

  // Establish WebSocket connection
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    console.log(`[WS] Connecting to ${WS_URL}...`);
    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected');
        attemptsRef.current = 0; // Reset backoff counter

        // Re-subscribe to previous subscriptions with safe send
        subscriptionsRef.current.ticks.forEach((symbol) => {
          safeSend({ type: 'subscribe', symbol });
        });

        subscriptionsRef.current.candles.forEach((key) => {
          const [symbol, timeframe] = key.split(':');
          safeSend({ type: 'subscribe_candles', symbol, timeframe });
        });

        subscriptionsRef.current.depth.forEach((symbol) => {
          safeSend({ type: 'subscribe_depth', symbol });
        });

        // Emit connect callbacks
        callbacksRef.current.onConnect.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.error('[WS] Error in onConnect callback:', e);
          }
        });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'tick') {
            callbacksRef.current.onTick.forEach((cb) => {
              try {
                cb(msg);
              } catch (e) {
                console.error('[WS] Error in onTick callback:', e);
              }
            });
          } else if (msg.type === 'candle_update') {
            callbacksRef.current.onCandleUpdate.forEach((cb) => {
              try {
                cb(msg);
              } catch (e) {
                console.error('[WS] Error in onCandleUpdate callback:', e);
              }
            });
          } else if (msg.type === 'depth') {
            callbacksRef.current.onDepth.forEach((cb) => {
              try {
                cb(msg);
              } catch (e) {
                console.error('[WS] Error in onDepth callback:', e);
              }
            });
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
        callbacksRef.current.onError.forEach((cb) => {
          try {
            cb(error);
          } catch (e) {
            console.error('[WS] Error in onError callback:', e);
          }
        });
      };

      wsRef.current.onclose = () => {
        console.log('[WS] Disconnected');
        wsRef.current = null;

        // Emit disconnect callbacks
        callbacksRef.current.onDisconnect.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.error('[WS] Error in onDisconnect callback:', e);
          }
        });

        // Exponential backoff reconnection
        const delay = getBackoffDelay(attemptsRef.current);
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${attemptsRef.current + 1})`);
        attemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      const delay = getBackoffDelay(attemptsRef.current);
      attemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    }
  }, []);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Subscribe to price ticks
  const subscribeTick = useCallback((symbol) => {
    subscriptionsRef.current.ticks.add(symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }, []);

  // Unsubscribe from price ticks
  const unsubscribeTick = useCallback((symbol) => {
    subscriptionsRef.current.ticks.delete(symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    }
  }, []);

  // Subscribe to candle updates
  const subscribeCandles = useCallback((symbol, timeframe) => {
    const key = `${symbol}:${timeframe}`;
    subscriptionsRef.current.candles.add(key);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe_candles', symbol, timeframe }));
    }
  }, []);

  // Unsubscribe from candle updates
  const unsubscribeCandles = useCallback((symbol, timeframe) => {
    const key = `${symbol}:${timeframe}`;
    subscriptionsRef.current.candles.delete(key);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe_candles', symbol, timeframe }));
    }
  }, []);

  // Subscribe to depth updates
  const subscribeDepth = useCallback((symbol) => {
    subscriptionsRef.current.depth.add(symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe_depth', symbol }));
    }
  }, []);

  // Unsubscribe from depth updates
  const unsubscribeDepth = useCallback((symbol) => {
    subscriptionsRef.current.depth.delete(symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe_depth', symbol }));
    }
  }, []);

  // Register callbacks
  const on = useCallback((event, callback) => {
    if (callbacksRef.current[event]) {
      callbacksRef.current[event].push(callback);
      return () => {
        const idx = callbacksRef.current[event].indexOf(callback);
        if (idx !== -1) callbacksRef.current[event].splice(idx, 1);
      };
    }
  }, []);

  // Get connection status
  const isConnected = useCallback(() => wsRef.current?.readyState === WebSocket.OPEN, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    subscribeTick,
    unsubscribeTick,
    subscribeCandles,
    unsubscribeCandles,
    subscribeDepth,
    unsubscribeDepth,
    on,
  };
}
