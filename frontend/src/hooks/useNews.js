/**
 * useNews — fetches news for the focused symbol with sentiment data
 */
import { useState, useCallback } from 'react';

// Detect API URL from environment or build from window location
const getAPIUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    return `${protocol}//${host}/api/news`;
  }
  return 'http://localhost:3001/api/news';
};

const API = getAPIUrl();

export function useNews(symbol, newsApiKey) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('tm_token');
      const params = newsApiKey ? `?apiKey=${newsApiKey}` : '';
      const res = await fetch(`${API}/${symbol}${params}`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch news`);
      }
      
      const data = await res.json();
      setNews(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('News fetch error:', e);
      setError(e.message);
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, newsApiKey]);

  return { news, loading, error, fetchNews };
}
