/**
 * Global state store using Zustand
 */
import { create } from 'zustand';
import { AuthState, TradingState, UIState, AccountInfo, Symbol, Position } from '../types';

interface Store extends AuthState, TradingState, UIState {
  // Auth actions
  setAuth: (token: string, accountId: string, accountNumber: number, server: string) => void;
  clearAuth: () => void;

  // Trading data actions
  setSymbols: (symbols: Map<string, Symbol>) => void;
  addSymbol: (symbol: Symbol) => void;
  
  setWatchlist: (items: any[]) => void;
  addToWatchlist: (item: any) => void;
  removeFromWatchlist: (symbolName: string) => void;

  setAccountInfo: (info: AccountInfo | null) => void;
  setPositions: (positions: Position[]) => void;
  setSelectedSymbol: (symbol: string | null) => void;

  updateQuote: (symbolName: string, quote: any) => void;
  updateCandles: (symbolName: string, candles: any[]) => void;

  // UI actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWSConnected: (connected: boolean) => void;
  toggleCategoryExpanded: (category: string) => void;
  setExpandedCategories: (categories: Set<string>) => void;
}

export const useStore = create<Store>((set) => ({
  // Auth state
  accessToken: null,
  accountId: null,
  accountNumber: null,
  server: null,
  isAuthenticated: false,

  // Trading state
  symbols: new Map(),
  watchlist: [],
  accountInfo: null,
  positions: [],
  selectedSymbol: null,
  quotes: new Map(),
  candles: new Map(),
  history: [],

  // UI state
  isLoading: false,
  error: null,
  wsConnected: false,
  expandedCategories: new Set(['Forex']), // Default to Forex expanded

  // Auth actions
  setAuth: (token, accountId, accountNumber, server) =>
    set({
      accessToken: token,
      accountId,
      accountNumber,
      server,
      isAuthenticated: true,
      error: null,
    }),

  clearAuth: () =>
    set({
      accessToken: null,
      accountId: null,
      accountNumber: null,
      server: null,
      isAuthenticated: false,
      watchlist: [],
      accountInfo: null,
      positions: [],
      selectedSymbol: null,
    }),

  // Trading data actions
  setSymbols: (symbols) => set({ symbols }),
  
  addSymbol: (symbol) =>
    set((state) => {
      const newSymbols = new Map(state.symbols);
      newSymbols.set(symbol.name, symbol);
      return { symbols: newSymbols };
    }),

  setWatchlist: (items) => set({ watchlist: items }),

  addToWatchlist: (item) =>
    set((state) => ({
      watchlist: [...state.watchlist, item],
    })),

  removeFromWatchlist: (symbolName) =>
    set((state) => ({
      watchlist: state.watchlist.filter((item) => item.symbol.name !== symbolName),
    })),

  setAccountInfo: (info) => set({ accountInfo: info }),
  
  setPositions: (positions) => set({ positions }),
  
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  updateQuote: (symbolName, quote) =>
    set((state) => {
      const newQuotes = new Map(state.quotes);
      newQuotes.set(symbolName, quote);
      return { quotes: newQuotes };
    }),

  updateCandles: (symbolName, candles) =>
    set((state) => {
      const newCandles = new Map(state.candles);
      newCandles.set(symbolName, candles);
      return { candles: newCandles };
    }),

  // UI actions
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
  
  setWSConnected: (connected) => set({ wsConnected: connected }),

  toggleCategoryExpanded: (category) =>
    set((state) => {
      const newCategories = new Set(state.expandedCategories);
      if (newCategories.has(category)) {
        newCategories.delete(category);
      } else {
        newCategories.add(category);
      }
      // Persist to localStorage
      localStorage.setItem('expandedCategories', JSON.stringify(Array.from(newCategories)));
      return { expandedCategories: newCategories };
    }),

  setExpandedCategories: (categories) => set({ expandedCategories: categories }),
}));

// Load persisted expanded categories from localStorage
const loadExpandedCategories = () => {
  try {
    const stored = localStorage.getItem('expandedCategories');
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Error loading expanded categories:', e);
  }
  return new Set(['Forex']); // Default
};

// Load persisted selected symbol from localStorage
const loadSelectedSymbol = () => {
  try {
    const stored = localStorage.getItem('selectedSymbol');
    if (stored) {
      console.log('[STORE] Restoring selected symbol from localStorage:', stored);
      return stored;
    }
  } catch (e) {
    console.error('Error loading selected symbol:', e);
  }
  return null;
};

// Initialize with persisted state
useStore.setState({ 
  expandedCategories: loadExpandedCategories() as Set<string>,
  selectedSymbol: loadSelectedSymbol(),
});

// Subscribe to selectedSymbol changes and persist to localStorage
useStore.subscribe((state) => {
  const selectedSymbol = state.selectedSymbol;
  if (selectedSymbol) {
    console.log('[STORE] Saving selected symbol to localStorage:', selectedSymbol);
    localStorage.setItem('selectedSymbol', selectedSymbol);
  } else {
    localStorage.removeItem('selectedSymbol');
  }
});
