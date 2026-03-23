/**
 * AppContext — global state: focused symbol, watchlist, settings, layout
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext(null);

const DEFAULT_SETTINGS = {
  metaApiToken: '',
  mt5AccountId: '',
  newsApiKey: '',
  openaiKey: '',
  anthropicKey: '',
  llmProvider: 'anthropic',
  theme: 'dark',
};

const DEFAULT_WATCHLIST = ['BTCUSD', 'ETHUSD'];
const DEFAULT_FAVORITES = ['BTCUSD', 'ETHUSD', 'XAUUSD'];

export function AppProvider({ children }) {
  const [focusedSymbol, setFocusedSymbol] = useState('BTCUSD');
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
