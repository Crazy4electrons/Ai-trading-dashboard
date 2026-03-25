/**
 * useSymbols — Fetch available trading symbols from backend
 * - Retries with exponential backoff
 * - Falls back to hardcoded SYMBOLS if API fails
 */
import { useState, useEffect } from 'react';
import { SYMBOLS } from '../utils/symbols.js';

const getAPIUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    return `${protocol}//${host}/api/mt5`;
  }
  return 'http://localhost:3001/api/mt5';
};

const API = getAPIUrl();
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export function useSymbols() {
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSymbols = async () => {
      const token = localStorage.getItem('tm_token');
      let lastError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const res = await fetch(`${API}/symbols`, {
            headers: {
              'Authorization': token ? `Bearer ${token}` : '',
            },
            signal: AbortSignal.timeout(5000),
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const data = await res.json();
          const symbolsList = Array.isArray(data) ? data : data?.symbols || [];

          if (symbolsList.length > 0) {
            console.log(`✅ Loaded ${symbolsList.length} symbols from backend`);
            setSymbols(symbolsList);
            setError(null);
            setLoading(false);
            return;
          }
        } catch (e) {
          lastError = e;
          console.warn(`Symbol fetch attempt ${attempt + 1} failed: ${e.message}`);
          
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => 
              setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt))
            );
          }
        }
      }

      // All retries failed - use fallback
      console.warn('Failed to fetch symbols, using fallback list');
      const flattenedSymbols = Object.values(SYMBOLS).flat();
      setSymbols(flattenedSymbols);
      setError(lastError?.message || 'Using fallback symbol list');
      setLoading(false);
    };

    fetchSymbols();
  }, []);

  return { symbols, loading, error };
}
