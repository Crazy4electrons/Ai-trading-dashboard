/**
 * API service for HTTP requests
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import { LoginRequest, LoginResponse } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000/api';

class APIService {
  private client: AxiosInstance;
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

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
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Add response interceptor for 401 (unauthorized) errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          console.warn('[API] Received 401 Unauthorized - clearing auth and redirecting to login');
          // Clear token from memory and localStorage
          this.clearToken();
          localStorage.removeItem('access_token');
          
          // Call the onUnauthorized callback if set (defined from App component)
          if (this.onUnauthorized) {
            console.log('[API] Calling onUnauthorized callback');
            this.onUnauthorized();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set callback to handle unauthorized (401) responses
   * This allows the API service to notify the app to redirect to login
   */
  setOnUnauthorized(callback: () => void): void {
    this.onUnauthorized = callback;
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
   * Login with MT5 credentials or admin credentials
   * If server is not provided, attempts admin authentication
   */
  async login(data: Partial<LoginRequest>): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', data);
    this.token = response.data.access_token;
    return response.data;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch (error) {
      // Even if logout endpoint fails (e.g., token invalid), continue with client cleanup
      console.warn('[API] Logout endpoint failed (might be due to invalid token), proceeding with client cleanup:', error);
    } finally {
      // Always clear token from memory, regardless of whether server call succeeded
      this.clearToken();
    }
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
      
      // If watchlist is empty, initialize it with default symbols
      if (!response.data.items || response.data.items.length === 0) {
        console.log('[API] Watchlist is empty, initializing with default symbols...');
        await this.initializeWatchlist();
        // Fetch again after initialization
        const retryResponse = await this.client.get('/watchlist/');
        return retryResponse.data;
      }
      
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching watchlist:', error);
      throw error;
    }
  }

  /**
   * Initialize watchlist with default symbols
   */
  async initializeWatchlist(): Promise<any> {
    console.log('[API] Initializing watchlist with default symbols...');
    try {
      const response = await this.client.post('/watchlist/initialize');
      console.log('[API] Watchlist initialized:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error initializing watchlist:', error);
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

  /**
   * Get cache configuration for all timeframes
   */
  async getCacheConfig(): Promise<any[]> {
    console.log('[API] Fetching cache configuration...');
    try {
      const response = await this.client.get('/admin/config');
      console.log('[API] Cache config received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching cache config:', error);
      throw error;
    }
  }

  /**
   * Update cache configuration for a specific timeframe
   */
  async updateCacheConfig(
    timeframe: number,
    cache_months: number,
    enabled: boolean
  ): Promise<any> {
    console.log(`[API] Updating cache config for ${timeframe}m...`);
    try {
      const response = await this.client.put(`/admin/config/${timeframe}`, {
        cache_months,
        enabled,
      });
      console.log(`[API] Cache config updated for ${timeframe}m`);
      return response.data;
    } catch (error) {
      console.error(`[API] Error updating cache config for ${timeframe}m:`, error);
      throw error;
    }
  }

  /**
   * Get cache status (candle counts, last sync times, etc.)
   */
  async getCacheStatus(): Promise<any> {
    console.log('[API] Fetching cache status...');
    try {
      const response = await this.client.get('/admin/cache-status');
      console.log('[API] Cache status received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching cache status:', error);
      throw error;
    }
  }

  /**
   * Force sync all candle data for enabled timeframes
   */
  async forceSyncNow(timeframe?: number): Promise<any> {
    console.log('[API] Triggering force sync...');
    try {
      const params = timeframe ? { timeframe } : {};
      const response = await this.client.post('/admin/sync-now', {}, { params });
      console.log('[API] Force sync triggered');
      return response.data;
    } catch (error) {
      console.error('[API] Error triggering force sync:', error);
      throw error;
    }
  }

  /**
   * Get list of symbols currently being cached
   */
  async getCachedSymbols(): Promise<string[]> {
    console.log('[API] Fetching cached symbols...');
    try {
      const response = await this.client.get('/admin/symbols');
      console.log('[API] Cached symbols received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching cached symbols:', error);
      throw error;
    }
  }

  /**
   * Get candlestick OHLCV data for a symbol
   */
  async getCandles(
    symbol: string,
    timeframe: string = '1h',
    count: number = 500,
  ): Promise<any> {
    console.log(`[API] Fetching candles for ${symbol}, timeframe=${timeframe}, count=${count}`);
    try {
      const response = await this.client.get(`/candles/${symbol}`, {
        params: { timeframe, count },
      });
      console.log(
        `[API] Candles received: ${symbol} ${timeframe}: ${response.data.candles?.length || 0} candles`,
      );
      return response.data;
    } catch (error) {
      console.error(`[API] Error fetching candles for ${symbol}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // ADMIN: TERMINAL MANAGEMENT
  // ============================================================================

  /**
   * List all active user terminals
   */
  async listTerminals(): Promise<any> {
    console.log('[API] Fetching terminal list...');
    try {
      const response = await this.client.get('/admin/terminals/list');
      console.log('[API] Terminal list received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching terminals:', error);
      throw error;
    }
  }

  /**
   * Get terminal statistics
   */
  async getTerminalStats(): Promise<any> {
    console.log('[API] Fetching terminal stats...');
    try {
      const response = await this.client.get('/admin/terminals/stats');
      console.log('[API] Terminal stats received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching terminal stats:', error);
      throw error;
    }
  }

  /**
   * Cleanup a specific terminal
   */
  async cleanupTerminal(accountId: string): Promise<any> {
    console.log(`[API] Cleaning up terminal for account ${accountId}...`);
    try {
      const response = await this.client.post(`/admin/terminals/${accountId}/cleanup`);
      console.log('[API] Terminal cleanup response:', response.data);
      return response.data;
    } catch (error) {
      console.error(`[API] Error cleaning up terminal:`, error);
      throw error;
    }
  }

  /**
   * Cleanup inactive terminals
   */
  async cleanupInactiveTerminals(maxAgeHours: number = 24): Promise<any> {
    console.log(`[API] Cleaning up inactive terminals (age > ${maxAgeHours} hours)...`);
    try {
      const response = await this.client.post('/admin/terminals/cleanup/inactive', null, {
        params: { max_age_hours: maxAgeHours },
      });
      console.log('[API] Inactive cleanup response:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error cleaning up inactive terminals:', error);
      throw error;
    }
  }

  // ============================================================================
  // ADMIN: DATABASE MANAGEMENT
  // ============================================================================

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    console.log('[API] Fetching database stats...');
    try {
      const response = await this.client.get('/admin/database/stats');
      console.log('[API] Database stats received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching database stats:', error);
      throw error;
    }
  }

  /**
   * Cleanup old database records
   */
  async cleanupDatabase(): Promise<any> {
    console.log('[API] Triggering database cleanup...');
    try {
      const response = await this.client.post('/admin/database/cleanup');
      console.log('[API] Database cleanup response:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error during database cleanup:', error);
      throw error;
    }
  }

  // ============================================================================
  // ADMIN: POLLING STATUS
  // ============================================================================

  /**
   * Get polling service status and retry/backoff information
   */
  async getPollingStatus(): Promise<any> {
    console.log('[API] Fetching polling status...');
    try {
      const response = await this.client.get('/admin/polling/status');
      console.log('[API] Polling status received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching polling status:', error);
      throw error;
    }
  }

  /**
   * Reset a poller's backoff state (force immediate retry)
   */
  async resetPollingBackoff(dataType: string): Promise<any> {
    console.log(`[API] Resetting polling backoff for ${dataType}...`);
    try {
      const response = await this.client.post(`/admin/polling/reset/${dataType}`);
      console.log('[API] Polling reset response:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error resetting polling:', error);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS & METRICS
  // ============================================================================

  /**
   * Get trade statistics
   */
  async getTradeStats(): Promise<any> {
    console.log('[API] Fetching trade statistics...');
    try {
      const response = await this.client.get('/account/trade-stats');
      console.log('[API] Trade stats received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching trade stats:', error);
      throw error;
    }
  }

  /**
   * Get portfolio metrics (balance, equity, margin, positions)
   */
  async getPortfolioMetrics(): Promise<any> {
    console.log('[API] Fetching portfolio metrics...');
    try {
      const response = await this.client.get('/account/portfolio-metrics');
      console.log('[API] Portfolio metrics received:', response.data);
      return response.data;
    } catch (error) {
      console.error('[API] Error fetching portfolio metrics:', error);
      throw error;
    }
  }
}

export default new APIService();
