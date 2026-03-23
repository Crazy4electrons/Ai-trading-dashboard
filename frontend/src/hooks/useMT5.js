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

  const fetchCandles = useCallback(async () => {
    try {
      const res = await fetch(`${API}/candles/${symbol}?timeframe=${timeframe}&count=200`);
      const data = await res.json();
      setCandles(data);
    } catch (e) {
      console.error('Candles fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Fetch initial candle data
  useEffect(() => {
    setLoading(true);
    fetchCandles();
  }, [fetchCandles]);

  // WebSocket for live ticks
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'tick' && msg.symbol === symbol) {
        setPrice({ bid: msg.bid, ask: msg.ask, time: msg.time });
        // Update last candle's close with live price
        setCandles((prev) => {
          if (!prev.length) return prev;
          const last = { ...prev[prev.length - 1], close: msg.bid };
          return [...prev.slice(0, -1), last];
        });
      }
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => setConnected(false);

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        ws.close();
      }
    };
  }, [symbol]);

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
      setAccount(await accRes.json());
      setPositions(await posRes.json());
      setHistory(await histRes.json());
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
