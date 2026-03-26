/**
 * API service for HTTP requests
 */
import axios, { AxiosInstance } from 'axios';
import { LoginRequest, LoginResponse } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000/api';

class APIService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to requests
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.params = config.params || {};
        config.params.token = this.token;
      }
      return config;
    });
  }

  setToken(token: string): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken(): void {
    this.token = null;
  }

  /**
   * Login with MT5 credentials
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', data);
    this.token = response.data.access_token;
    return response.data;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
    this.clearToken();
  }

  /**
   * Get all symbols grouped by category
   */
  async getSymbols(): Promise<Record<string, any[]>> {
    console.log('[API] Fetching all symbols from /symbols/all...');
    try {
      const response = await this.client.get('/symbols/all');
      console.log('[API] Symbols received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching symbols:', error);
      throw error;
    }
  }

  /**
   * Search symbols
   */
  async searchSymbols(query: string): Promise<any[]> {
    console.log(`[API] Searching symbols with query: "${query}"`);
    try {
      const response = await this.client.get('/symbols/search', {
        params: { query },
      });
      console.log(`[API] Search returned ${response.data.length} results`);
      return response.data;
    } catch (error) {
      console.error('[API] Error searching symbols:', error);
      throw error;
    }
  }

  /**
   * Get symbols categories
   */
  async getSymbolCategories(): Promise<Record<string, number>> {
    console.log('[API] Fetching symbol categories...');
    try {
      const response = await this.client.get('/symbols/categories');
      console.log('[API] Categories received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching categories:', error);
      throw error;
    }
  }

  /**
   * Get user's watchlist
   */
  async getWatchlist(): Promise<any> {
    console.log('[API] Fetching watchlist...');
    try {
      const response = await this.client.get('/watchlist/');
      console.log(`[API] Watchlist received: ${response.data.items?.length || 0} items`);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching watchlist:', error);
      throw error;
    }
  }

  /**
   * Add symbol to watchlist
   */
  async addToWatchlist(symbolName: string): Promise<any> {
    console.log(`[API] Adding symbol "${symbolName}" to watchlist...`);
    try {
      const response = await this.client.post('/watchlist/add', {
        symbol_name: symbolName,
      });
      console.log(`[API] Symbol "${symbolName}" added successfully`);
      return response.data;
    } catch (error) {
      console.error(`[API] Error adding symbol to watchlist:`, error);
      throw error;
    }
  }

  /**
   * Remove symbol from watchlist
   */
  async removeFromWatchlist(symbolName: string): Promise<any> {
    console.log(`[API] Removing symbol "${symbolName}" from watchlist...`);
    try {
      const response = await this.client.delete(`/watchlist/${symbolName}`);
      console.log(`[API] Symbol "${symbolName}" removed successfully`);
      return response.data;
    } catch (error) {
      console.error('[API] Error removing symbol from watchlist:', error);
      throw error;
    }
  }

  /**
   * Get watchlist items grouped by category
   */
  async getWatchlistCategories(): Promise<Record<string, any[]>> {
    const response = await this.client.get('/watchlist/categories');
    return response.data;
  }

  /**
   * Get account info
   */
  async getAccountInfo(): Promise<any> {
    const response = await this.client.get('/account/info');
    return response.data;
  }

  /**
   * Get open positions
   */
  async getPositions(): Promise<any> {
    const response = await this.client.get('/account/positions');
    return response.data;
  }

  /**
   * Get account history
   */
  async getAccountHistory(limit: number = 50): Promise<any> {
    const response = await this.client.get('/account/history', {
      params: { limit },
    });
    return response.data;
  }

  /**
   * Refresh symbols cache
   */
  async refreshSymbolsCache(): Promise<any> {
    const response = await this.client.get('/symbols/cache/refresh');
    return response.data;
  }

  /**
   * Get live quote for a symbol
   */
  async getSymbolQuote(symbolName: string): Promise<any> {
    console.log(`[API] Fetching live quote for ${symbolName}...`);
    try {
      const response = await this.client.get(`/symbols/quote/${symbolName}`);
      console.log(`[API] Quote received: ${symbolName} bid=${response.data.bid}, ask=${response.data.ask}`);
      return response.data;
    } catch (error) {
      console.error(`[API] Error fetching quote for ${symbolName}:`, error);
      throw error;
    }
  }

  /**
   * Get live quotes for multiple symbols (batch)
   */
  async getSymbolQuotesBatch(symbols: string[]): Promise<Record<string, any>> {
    console.log(`[API] Fetching batch quotes for ${symbols.length} symbols...`);
    try {
      const response = await this.client.post('/symbols/quote/batch', {
        symbols: symbols,
      });
      console.log(`[API] Batch quotes received for ${Object.keys(response.data).length} symbols`);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching batch quotes:', error);
      throw error;
    }
  }

  /**
   * Get symbol details (from MT5 if available)
   */
  async getSymbolDetails(symbolName: string): Promise<any> {
    console.log(`[API] Fetching details for ${symbolName}...`);
    try {
      const response = await this.client.get(`/symbols/${symbolName}`);
      console.log(`[API] Symbol details: ${symbolName}`, response.data);
      return response.data;
    } catch (error) {
      console.error(`[API] Error fetching symbol details for ${symbolName}:`, error);
      throw error;
    }
  }
}

export default new APIService();
