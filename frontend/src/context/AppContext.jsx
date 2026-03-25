/**
 * AppContext — global state: focused symbol, watchlist, settings, layout
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext(null);

const DEFAULT_SETTINGS = {
  newsApiKey: '',
  openaiKey: '',
  anthropicKey: '',
  llmProvider: 'anthropic',
  theme: 'dark',
  autoConnect: true, // Auto-connect on app load
};

const DEFAULT_WATCHLIST = ['BTCUSD', 'ETHUSD'];
const DEFAULT_FAVORITES = ['BTCUSD', 'ETHUSD', 'XAUUSD'];

export function AppProvider({ children }) {
  const [focusedSymbol, setFocusedSymbol] = useState(() => {
    try {
      const saved = localStorage.getItem('tm_focusedSymbol');
      return saved || 'BTCUSD';
    } catch {
      return 'BTCUSD';
    }
  });
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [favorites, setFavorites] = useState(DEFAULT_FAVORITES);
  const [settings, setSettings] = useState(() => {
    try {
      const s = localStorage.getItem('tm_settings');
      return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [showSymbols, setShowSymbols] = useState(true);
  const [showAccounts, setShowAccounts] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState(['RSI', 'MACD', 'BB', 'ATR']);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendError, setBackendError] = useState(null);

  // Check backend connectivity on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const protocol = window.location.protocol;
        const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
        const healthUrl = `${protocol}//${host}/health`;
        
        const res = await fetch(healthUrl, { 
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        
        if (res.ok) {
          setBackendConnected(true);
          setBackendError(null);
        } else {
          setBackendConnected(false);
          setBackendError('Backend returned an error');
        }
      } catch (e) {
        setBackendConnected(false);
        setBackendError(`Cannot reach backend: ${e.message}`);
        console.error('Backend health check failed:', e);
      }
    };
    
    checkBackend();
    // Recheck every 30 seconds
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, []);

  // Persist focused symbol to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('tm_focusedSymbol', focusedSymbol);
  }, [focusedSymbol]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('tm_settings', JSON.stringify(settings));
  }, [settings]);

  const saveSettings = useCallback((updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const addToWatchlist = useCallback((symbol) => {
    setWatchlist((prev) => prev.includes(symbol) ? prev : [...prev, symbol]);
  }, []);

  const removeFromWatchlist = useCallback((symbol) => {
    setWatchlist((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const toggleFavorite = useCallback((symbol) => {
    setFavorites((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  }, []);

  const addIndicator = useCallback((indicator) => {
    setActiveIndicators((prev) => prev.includes(indicator) ? prev : [...prev, indicator]);
  }, []);

  const removeIndicator = useCallback((indicator) => {
    setActiveIndicators((prev) => prev.filter((i) => i !== indicator));
  }, []);

  return (
    <AppContext.Provider value={{
      focusedSymbol, setFocusedSymbol,
      watchlist, addToWatchlist, removeFromWatchlist,
      favorites, toggleFavorite,
      settings, saveSettings,
      showSymbols, setShowSymbols,
      showAccounts, setShowAccounts,
      settingsOpen, setSettingsOpen,
      activeIndicators, addIndicator, removeIndicator,
      backendConnected, backendError,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
