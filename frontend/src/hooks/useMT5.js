/**
 * useMT5 — manages MT5 data: candles, live price, account, positions, history
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:3001/api/mt5';
const WS_URL = 'ws://localhost:3001';

export function useMT5(symbol, timeframe = '1h') {
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  // Fetch candles (2000 for backscroll)
  const fetchCandles = useCallback(async () => {
    try {
      const res = await fetch(`${API}/candles/${symbol}?timeframe=${timeframe}&count=2000`);
      const data = await res.json();
      setCandles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Candles fetch error:', e);
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Fetch initial candle data
  useEffect(() => {
    setLoading(true);
    fetchCandles();
  }, [fetchCandles]);

  // WebSocket for live candle updates
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Subscribe to real-time candle updates for the current timeframe
      ws.send(JSON.stringify({ type: 'subscribe_candles', symbol, timeframe }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        if (msg.type === 'candle_update' && msg.symbol === symbol && msg.timeframe === timeframe) {
          // Update existing candle (incomplete current candle)
          setCandles((prev) => {
            if (!prev.length) return prev;
            const lastIdx = prev.length - 1;
            const lastCandle = prev[lastIdx];
            
            // Check if it's the same candle (same time)
            if (lastCandle.time === msg.candle.time) {
              // Update the existing candle
              const updated = [...prev];
              updated[lastIdx] = msg.candle;
              return updated;
            } else {
              // New candle, add it if it has a different time
              return [...prev, msg.candle];
            }
          });
          
          // Also update price info
          setPrice({
            bid: msg.candle.close,
            ask: msg.candle.close,
            time: msg.candle.time,
          });
        }
        
        if (msg.type === 'tick' && msg.symbol === symbol) {
          // Fallback: update price from tick if no candle updates
          setPrice({ bid: msg.bid, ask: msg.ask, time: msg.time });
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => setConnected(false);

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe_candles', symbol, timeframe }));
        ws.close();
      }
    };
  }, [symbol, timeframe]);

  return { candles, price, loading, connected, refetch: fetchCandles };
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
      // Ensure positions is always an array
      setPositions(Array.isArray(posData) ? posData : []);
      // Ensure history is always an array
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
    const result = await res.json();
    if (!result.error) fetchAccount();
    return result;
  }, [fetchAccount]);

  return { account, positions, history, placeOrder, refetch: fetchAccount };
}
