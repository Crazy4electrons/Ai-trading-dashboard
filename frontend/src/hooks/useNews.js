/**
 * useNews — fetches news for the focused symbol with sentiment data
 */
import { useState, useCallback } from 'react';

const API = 'http://localhost:3001/api/news';

export function useNews(symbol, newsApiKey) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params = newsApiKey ? `?apiKey=${newsApiKey}` : '';
      const res = await fetch(`${API}/${symbol}${params}`);
      const data = await res.json();
      setNews(data);
    } catch (e) {
      console.error('News fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [symbol, newsApiKey]);

  return { news, loading, fetchNews };
}
