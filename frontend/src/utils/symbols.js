/**
 * Symbol registry — all tradable instruments by category
 */
export const SYMBOLS = {
  crypto: [
    { symbol: 'BTCUSD', name: 'Bitcoin', base: 'Bitcoin', quote: 'US Dollar' },
    { symbol: 'ETHUSD', name: 'Ethereum', base: 'Ethereum', quote: 'US Dollar' },
    { symbol: 'SOLUSD', name: 'Solana', base: 'Solana', quote: 'US Dollar' },
    { symbol: 'XRPUSD', name: 'Ripple', base: 'XRP', quote: 'US Dollar' },
    { symbol: 'ADAUSD', name: 'Cardano', base: 'Cardano', quote: 'US Dollar' },
    { symbol: 'DOTUSD', name: 'Polkadot', base: 'Polkadot', quote: 'US Dollar' },
    { symbol: 'LTCUSD', name: 'Litecoin', base: 'Litecoin', quote: 'US Dollar' },
    { symbol: 'LINKUSD', name: 'Chainlink', base: 'Chainlink', quote: 'US Dollar' },
    { symbol: 'AVAXUSD', name: 'Avalanche', base: 'Avalanche', quote: 'US Dollar' },
    { symbol: 'MATICUSD', name: 'Polygon', base: 'Polygon', quote: 'US Dollar' },
  ],
  forex: [
    { symbol: 'EURUSD', name: 'Euro / USD', base: 'Euro', quote: 'US Dollar' },
    { symbol: 'GBPUSD', name: 'GBP / USD', base: 'British Pound', quote: 'US Dollar' },
    { symbol: 'USDJPY', name: 'USD / JPY', base: 'US Dollar', quote: 'Japanese Yen' },
    { symbol: 'AUDUSD', name: 'AUD / USD', base: 'Australian Dollar', quote: 'US Dollar' },
    { symbol: 'USDCAD', name: 'USD / CAD', base: 'US Dollar', quote: 'Canadian Dollar' },
    { symbol: 'USDCHF', name: 'USD / CHF', base: 'US Dollar', quote: 'Swiss Franc' },
    { symbol: 'NZDUSD', name: 'NZD / USD', base: 'New Zealand Dollar', quote: 'US Dollar' },
    { symbol: 'EURGBP', name: 'EUR / GBP', base: 'Euro', quote: 'British Pound' },
  ],
  commodities: [
    { symbol: 'XAUUSD', name: 'Gold', base: 'Gold', quote: 'US Dollar' },
    { symbol: 'XAGUSD', name: 'Silver', base: 'Silver', quote: 'US Dollar' },
    { symbol: 'USOIL', name: 'Crude Oil', base: 'WTI Crude Oil', quote: 'US Dollar' },
    { symbol: 'UKOIL', name: 'Brent Oil', base: 'Brent Crude', quote: 'US Dollar' },
    { symbol: 'NATGAS', name: 'Natural Gas', base: 'Natural Gas', quote: 'US Dollar' },
  ],
  stocks: [
    { symbol: 'AAPL', name: 'Apple', base: 'Apple Inc', quote: 'US Dollar' },
    { symbol: 'MSFT', name: 'Microsoft', base: 'Microsoft Corp', quote: 'US Dollar' },
    { symbol: 'TSLA', name: 'Tesla', base: 'Tesla Inc', quote: 'US Dollar' },
    { symbol: 'NVDA', name: 'NVIDIA', base: 'NVIDIA Corp', quote: 'US Dollar' },
    { symbol: 'AMZN', name: 'Amazon', base: 'Amazon.com', quote: 'US Dollar' },
    { symbol: 'GOOGL', name: 'Alphabet', base: 'Alphabet Inc', quote: 'US Dollar' },
    { symbol: 'META', name: 'Meta', base: 'Meta Platforms', quote: 'US Dollar' },
  ],
};

export const ALL_INDICATORS = [
  { id: 'RSI',   label: 'RSI (14)' },
  { id: 'MACD',  label: 'MACD' },
  { id: 'BB',    label: 'Bollinger Bands' },
  { id: 'ATR',   label: 'ATR (14)' },
  { id: 'STOCH', label: 'Stochastic' },
  { id: 'WR',    label: 'Williams %R' },
  { id: 'CCI',   label: 'CCI (20)' },
];

export const TIMEFRAMES = [
  { value: '5m',  label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h',  label: '1H' },
  { value: '4h',  label: '4H' },
  { value: '1d',  label: '1D' },
  { value: '1w',  label: '1W' },
];

/** Find symbol info by symbol string */
export function findSymbol(sym) {
  for (const items of Object.values(SYMBOLS)) {
    const found = items.find((s) => s.symbol === sym);
    if (found) return found;
  }
  return { symbol: sym, name: sym, base: sym, quote: '' };
}

/** Mock price data for demo mode */
export const MOCK_PRICES = {
  BTCUSD: 65240.5, ETHUSD: 3185.2, SOLUSD: 142.8, XRPUSD: 0.612,
  ADAUSD: 0.485, DOTUSD: 7.82, LTCUSD: 84.3, LINKUSD: 14.2,
  EURUSD: 1.0852, GBPUSD: 1.2715, USDJPY: 151.42, AUDUSD: 0.6534,
  XAUUSD: 2052.3, XAGUSD: 23.1, USOIL: 78.45,
  AAPL: 185.6, MSFT: 415.2, TSLA: 172.4, NVDA: 875.3,
};
