/**
 * Test configuration and utilities for Dashboard Project
 */

// Mock data generators
export const mockCacheConfig = () => [{
  timeframe: 1,
  cache_months: 3,
  enabled: true,
  last_sync_time: new Date().toISOString(),
}];

export const mockTerminalStats = () => ({
  total_terminals: 5,
  running_terminals: 4,
  offline_terminals: 1,
  error_terminals: 0,
  total_size_mb: 1250.5,
});

export const mockTradeStats = () => ({
  total_trades: 150,
  winning_trades: 95,
  losing_trades: 55,
  win_rate: 63.33,
  total_pnl: 5250.75,
  avg_win: 85.50,
  avg_loss: 45.25,
  profit_factor: 1.89,
});

export const mockPortfolioMetrics = () => ({
  account_balance: 10000.0,
  account_equity: 10500.0,
  used_margin: 2000.0,
  free_margin: 8500.0,
  margin_level: 525.0,
  positions_count: 2,
  open_orders_count: 1,
});

export const mockPollingStatus = () => [
  {
    data_type: "quotes",
    is_active: true,
    is_failing: false,
    retry_count: 0,
    base_interval: 5,
    current_interval: 5,
    last_error: null,
    last_success_time: new Date().toISOString(),
    last_failure_time: null,
  },
  {
    data_type: "positions",
    is_active: true,
    is_failing: false,
    retry_count: 0,
    base_interval: 10,
    current_interval: 10,
    last_error: null,
    last_success_time: new Date().toISOString(),
    last_failure_time: null,
  },
];

// Mock API responses (generic factory)
export const createMockAPI = () => {
  const mockFn = (defaultValue: any) => ({
    fn: () => Promise.resolve(defaultValue),
    mockResolvedValue: (value: any) => ({ fn: () => Promise.resolve(value) }),
  });

  return {
    getCacheConfig: mockFn(mockCacheConfig()),
    getCacheStatus: mockFn({
      last_updated: new Date().toISOString(),
      timeframes: [],
    }),
    getTerminalStats: mockFn(mockTerminalStats()),
    getTradeStats: mockFn(mockTradeStats()),
    getPortfolioMetrics: mockFn(mockPortfolioMetrics()),
    getPollingStatus: mockFn(mockPollingStatus()),
    login: mockFn({
      access_token: 'mock-token',
      account_number: 123456,
      account_id: 'mock-account-id',
    }),
    logout: mockFn({}),
  };
};

// Mock store
export const createMockStore = (overrides = {}) => ({
  isAuthenticated: true,
  accessToken: 'mock-token',
  accountNumber: 123456,
  accountId: 'mock-account-id',
  server: 'ICMarkets-Live',
  ...overrides,
});
