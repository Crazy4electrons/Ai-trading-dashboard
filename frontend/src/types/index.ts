/**
 * TypeScript type definitions for the application
 */

export interface LoginRequest {
  server?: string;  // Optional - if not provided, tries admin login
  account_number: number;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  account_id: string;
  account_number: number;
  role?: string;  // "admin" or "user"
}

export interface Symbol {
  name: string;
  category: string;
  description?: string;
  bid: number;
  ask: number;
  digits: number;
}

export interface WatchlistItem {
  symbol: Symbol;
  added_at: string;
}

export interface AccountInfo {
  account: number;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  margin_level: number;
  account_type?: string;
}

export interface Position {
  ticket: number;
  symbol: string;
  type: "BUY" | "SELL";
  volume: number;
  open_price: number;
  current_price: number;
  profit_loss: number;
  opened_time: number;
}

export interface Quote {
  time: number;
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  volume?: number;
  spread?: number;
}

export interface WebSocketMessage {
  type: "quote" | "account" | "watchlist" | "order" | "batch";
  timestamp: string;
  data?: any;
  messages?: any[];
}

export interface AuthState {
  accessToken: string | null;
  accountId: string | null;
  accountNumber: number | null;
  server: string | null;
  role: string | null;
  isAuthenticated: boolean;
}

export interface TradingState {
  symbols: Map<string, Symbol>;
  watchlist: WatchlistItem[];
  accountInfo: AccountInfo | null;
  positions: Position[];
  selectedSymbol: string | null;
  quotes: Map<string, Quote>;
  candles: Map<string, Candle[]>;
  history: any[];  // <: incoming historical updates from account-history stream
}

export interface UIState {
  isLoading: boolean;
  error: string | null;
  wsConnected: boolean;
  expandedCategories: Set<string>;
}
