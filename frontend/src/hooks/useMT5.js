/**
 * useMT5 — Institutional-grade live data management
 * - Load 1000 candles initially from real MT5 data via REST
 * - Live updates via WebSocket (candles, ticks, depth)
 * - Scroll-back fetches and prepends older data seamlessly
 * - NO mock data - only real MT5 data
 * - Smooth live updates without disruption
 * - When user scrolls near start, auto-fetch older candles
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket.js';

// Detect API URL from environment or build from window location
const getAPIUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // In development, backend is at localhost:3001
  // In production, use same protocol and host as frontend
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    return `${protocol}//${host}/api/mt5`;
  }
  return 'http://localhost:3001/api/mt5';
};

const API = getAPIUrl();
const INITIAL_CANDLES = 1000;
const SCROLL_BUFFER = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export function useMT5(symbol, timeframe = '1h') {
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(null);
  const [depth, setDepth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const ws = useWebSocket();
  const fetchingOlderRef = useRef(false);
  const allFetchedRef = useRef(false);
  const oldestTimeRef = useRef(null);
  const cleanupRef = useRef([]); // Store cleanup functions for subscriptions

  // Initial load: fetch 1000 recent candles via REST (fast, reliable)
  const fetchRecentCandles = useCallback(async () => {
    try {
      setError(null);
      
      // Get auth token
      const token = localStorage.getItem('tm_token');
      
      // Retry logic with exponential backoff
      let lastError = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const headers = {
            'Authorization': token ? `Bearer ${token}` : '',
          };
          
          const res = await fetch(`${API}/candles/${symbol}?timeframe=${timeframe}&count=${INITIAL_CANDLES}`, {
            headers,
            signal: AbortSignal.timeout(10000),
          });
          
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          
          const data = await res.json();
          console.log('[useMT5] Response:', { status: res.status, candlesCount: data?.candles?.length, error: data?.error });
          
          if (data?.candles && Array.isArray(data.candles) && data.candles.length > 0) {
            setCandles(data.candles);
            oldestTimeRef.current = data.candles[0].time;
            
            const lastCandle = data.candles[data.candles.length - 1];
            setPrice({
              bid: lastCandle.close,
              ask: lastCandle.close,
              time: lastCandle.time,
            });
            setConnected(true);
            console.log(`✅ Loaded ${data.candles.length} candles for ${symbol}/${timeframe}`);
            return; // Success - exit retry loop
          } else if (data?.error) {
            setError(data.error);
            setConnected(false);
            console.error(`❌ MT5 Error: ${data.error}`);
            return; // Don't retry on application errors
          }
        } catch (e) {
          lastError = e;
          console.warn(`Fetch attempt ${attempt + 1} failed: ${e.message}`);
          
          if (attempt < MAX_RETRIES - 1) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt)));
          }
        }
      }
      
      // All retries failed
      if (lastError) {
        setError(lastError.message);
        setConnected(false);
        console.error('Failed to load candles after all retries:', lastError);
      }
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Fetch older candles for scroll-back (prepend to existing)
  const fetchOlderCandles = useCallback(async () => {
    if (candles.length === 0 || fetchingOlderRef.current || allFetchedRef.current) return;
    
    fetchingOlderRef.current = true;
    try {
      const token = localStorage.getItem('tm_token');
      const firstCandle = candles[0];
      const res = await fetch(
        `${API}/candles/${symbol}?timeframe=${timeframe}&count=200`,
        {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
          },
        }
      );
      const data = await res.json();
      
      if (data?.candles && Array.isArray(data.candles) && data.candles.length > 0) {
        // Filter to only candles before the first one we have
        const olderCandles = data.candles.filter(c => c.time < firstCandle.time);
        
        if (olderCandles.length > 0) {
          // Prepend older candles (they're already sorted)
          setCandles(prev => {
            const merged = [...olderCandles, ...prev];
            // Allow to grow beyond 1000 for institutional-grade experience
            return merged.length > 2000 ? merged.slice(-2000) : merged;
          });
          oldestTimeRef.current = olderCandles[0].time;
          console.log(`📥 Prepended ${olderCandles.length} older candles (total: ${candles.length + olderCandles.length})`);
        } else {
          // No older candles available
          allFetchedRef.current = true;
          console.log(`⛔ Reached start of available history`);
        }
      }
    } catch (e) {
      console.error('Fetch older error:', e);
    } finally {
      fetchingOlderRef.current = false;
    }
  }, [candles, symbol, timeframe]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchRecentCandles();
  }, [fetchRecentCandles]);

  // WebSocket setup: connect, subscribe, handle live updates
  useEffect(() => {
    // Connect WebSocket if not already connected
    if (!ws.isConnected()) {
      ws.connect();
    }

    // Handle connection established
    const unsubConnect = ws.on('onConnect', () => {
      console.log(`[useMT5] WebSocket connected for ${symbol}/${timeframe}`);
      // Subscribe to live candle data
      ws.subscribeCandles(symbol, timeframe);
      ws.subscribeTick(symbol);
      ws.subscribeDepth(symbol);
    });

    // Handle disconnection
    const unsubDisconnect = ws.on('onDisconnect', () => {
      console.log(`[useMT5] WebSocket disconnected`);
    });

    // Handle candle updates from WebSocket
    const unsubCandles = ws.on('onCandleUpdate', (msg) => {
      if (msg.symbol === symbol && msg.timeframe === timeframe) {
        setCandles(prev => {
          if (prev.length === 0) return [msg.candle];

          const lastIdx = prev.length - 1;
          const lastCandle = prev[lastIdx];

          // Same time = update incomplete candle
          if (msg.candle.time === lastCandle.time) {
            const updated = [...prev];
            updated[lastIdx] = msg.candle;
            return updated;
          }
          // Newer time = new candle
          else if (msg.candle.time > lastCandle.time) {
            return [...prev, msg.candle];
          }

          return prev;
        });
      }
    });

    // Handle price tick updates
    const unsubTicks = ws.on('onTick', (msg) => {
      if (msg.symbol === symbol) {
        setPrice({
          bid: msg.bid,
          ask: msg.ask,
          time: msg.time,
        });
      }
    });

    // Handle depth updates
    const unsubDepth = ws.on('onDepth', (msg) => {
      if (msg.symbol === symbol) {
        setDepth({
          bids: msg.bids,
          asks: msg.asks,
          timestamp: msg.timestamp,
        });
      }
    });

    cleanupRef.current = [
      unsubConnect,
      unsubDisconnect,
      unsubCandles,
      unsubTicks,
      unsubDepth,
    ];

    // Cleanup on unmount or when symbol/timeframe changes
    return () => {
      cleanupRef.current.forEach((unsub) => {
        try {
          if (typeof unsub === 'function') unsub();
        } catch (e) {
          console.error('[useMT5] Cleanup error:', e);
        }
      });
      ws.unsubscribeCandles(symbol, timeframe);
      ws.unsubscribeTick(symbol);
      ws.unsubscribeDepth(symbol);
    };
  }, [ws, symbol, timeframe]);

  return {
    candles,
    price,
    depth,
    loading,
    connected,
    error,
    refetch: fetchRecentCandles,
    fetchOlderCandles,
    scrollBuffer: SCROLL_BUFFER,
    allFetched: allFetchedRef.current,
  };
}

export function useAccount() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Throttled polling: avoid concurrent fetches and backoff on errors
  const inFlightRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pollIntervalRef = useRef(10000); // default 10s
  const consecutiveErrorsRef = useRef(0);

  const clearPollTimer = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const scheduleNextPoll = () => {
    clearPollTimer();
    pollTimerRef.current = setTimeout(() => {
      fetchAccount();
    }, pollIntervalRef.current);
  };

  const fetchAccount = useCallback(async () => {
    // If a fetch is already in-flight, return the same promise to deduplicate
    if (inFlightRef.current) return inFlightRef.current;

    setLoading(true);
    setError(null);

    inFlightRef.current = (async () => {
      try {
        const token = localStorage.getItem('tm_token');
        const headers = {
          'Authorization': token ? `Bearer ${token}` : '',
        };

        const [accRes, posRes, histRes] = await Promise.all([
          fetch(`${API}/account`, { headers, signal: AbortSignal.timeout(8000) }),
          fetch(`${API}/positions`, { headers, signal: AbortSignal.timeout(8000) }),
          fetch(`${API}/history`, { headers, signal: AbortSignal.timeout(8000) }),
        ]);

        // If any response is not ok, parse body for message if possible
        const ok = accRes.ok && posRes.ok && histRes.ok;
        const accData = await (accRes.ok ? accRes.json() : accRes.text().then(t => ({ error: t })));
        const posData = await (posRes.ok ? posRes.json() : posRes.text().then(t => ({ error: t })));
        const histData = await (histRes.ok ? histRes.json() : histRes.text().then(t => ({ error: t })));

        if (!ok) {
          const msg = accData?.error || posData?.error || histData?.error || 'Failed to fetch account data';
          throw new Error(msg);
        }

        setAccount(accData);
        setPositions(Array.isArray(posData) ? posData : []);
        setHistory(Array.isArray(histData) ? histData : []);

        // Success => reset backoff
        consecutiveErrorsRef.current = 0;
        pollIntervalRef.current = 10000;
      } catch (e) {
        console.error('Account fetch error:', e);
        setError(e?.message || String(e));

        // Increase backoff on repeated errors
        consecutiveErrorsRef.current += 1;
        const backoff = Math.min(60000, 10000 * Math.pow(2, consecutiveErrorsRef.current - 1));
        pollIntervalRef.current = backoff;
      } finally {
        setLoading(false);
        inFlightRef.current = null;

        // Schedule next poll respecting current interval/backoff
        scheduleNextPoll();
      }
    })();

    return inFlightRef.current;
  }, []);

  useEffect(() => {
    // Start polling
    fetchAccount();
    return () => {
      clearPollTimer();
    };
  }, [fetchAccount]);

  const placeOrder = useCallback(async (symbol, type, volume) => {
    try {
      const token = localStorage.getItem('tm_token');
      const res = await fetch(`${API}/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ symbol, type, volume }),
        signal: AbortSignal.timeout(10000),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = body?.error || body?.message || `HTTP ${res.status}`;
        const err = new Error(`Order failed: ${msg}`);
        err.status = res.status;
        throw err;
      }

      // If server returns an application-level error field, throw it
      if (body && body.error) {
        const err = new Error(`Order failed: ${body.error}`);
        throw err;
      }

      // Refresh account data after successful order
      fetchAccount();

      return body;
    } catch (e) {
      console.error('Order placement error:', e);
      throw e;
    }
  }, [fetchAccount]);

  return { account, positions, history, loading, error, fetchAccount, placeOrder };
}
