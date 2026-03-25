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

const API = 'http://localhost:3001/api/mt5';
const INITIAL_CANDLES = 1000;
const SCROLL_BUFFER = 50;

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
      const res = await fetch(`${API}/candles/${symbol}?timeframe=${timeframe}&count=${INITIAL_CANDLES}`);
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setCandles(data);
        oldestTimeRef.current = data[0].time;
        
        const lastCandle = data[data.length - 1];
        setPrice({
          bid: lastCandle.close,
          ask: lastCandle.close,
          time: lastCandle.time,
        });
        setConnected(true);
        console.log(`✅ Loaded ${data.length} candles for ${symbol}/${timeframe}`);
      } else if (data?.error) {
        setError(data.error);
        setConnected(false);
        console.error(`❌ MT5 Error: ${data.error}`);
      }
    } catch (e) {
      setError(e.message);
      setConnected(false);
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Fetch older candles for scroll-back (prepend to existing)
  const fetchOlderCandles = useCallback(async () => {
    if (candles.length === 0 || fetchingOlderRef.current || allFetchedRef.current) return;
    
    fetchingOlderRef.current = true;
    try {
      const firstCandle = candles[0];
      const res = await fetch(
        `${API}/candles/${symbol}?timeframe=${timeframe}&count=200`
      );
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        // Filter to only candles before the first one we have
        const olderCandles = data.filter(c => c.time < firstCandle.time);
        
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

  const fetchAccount = useCallback(async () => {
    try {
      const [accRes, posRes, histRes] = await Promise.all([
        fetch(`${API}/account`),
        fetch(`${API}/positions`),
        fetch(`${API}/history`),
      ]);
      const accData = await accRes.json();
      const posData = await posRes.json();
      const histData = await histRes.json();
      
      setAccount(accData);
      setPositions(Array.isArray(posData) ? posData : []);
      setHistory(Array.isArray(histData) ? histData : []);
    } catch (e) {
      console.error('Account fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchAccount();
    const interval = setInterval(fetchAccount, 10000);
    return () => clearInterval(interval);
  }, [fetchAccount]);

  const placeOrder = useCallback(async (symbol, type, volume) => {
    const res = await fetch(`${API}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, type, volume }),
    });
    return res.json();
  }, []);

  return { account, positions, history, placeOrder };
}
