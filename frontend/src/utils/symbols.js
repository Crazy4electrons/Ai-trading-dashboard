/**
 * Symbol registry — all tradable instruments by category
 */
export const SYMBOLS = {
  crypto: [
    // Major
    { symbol: 'BTCUSD', name: 'Bitcoin', base: 'Bitcoin', quote: 'US Dollar' },
    { symbol: 'ETHUSD', name: 'Ethereum', base: 'Ethereum', quote: 'US Dollar' },
    // Large Cap
    { symbol: 'BNBUSD', name: 'Binance Coin', base: 'BNB', quote: 'US Dollar' },
    { symbol: 'XRPUSD', name: 'Ripple', base: 'XRP', quote: 'US Dollar' },
    { symbol: 'ADAUSD', name: 'Cardano', base: 'Cardano', quote: 'US Dollar' },
    { symbol: 'SOLUSD', name: 'Solana', base: 'Solana', quote: 'US Dollar' },
    { symbol: 'DOGEUSD', name: 'Dogecoin', base: 'Doge', quote: 'US Dollar' },
    // Mid Cap
    { symbol: 'LTCUSD', name: 'Litecoin', base: 'Litecoin', quote: 'US Dollar' },
    { symbol: 'BCHUSD', name: 'Bitcoin Cash', base: 'BCH', quote: 'US Dollar' },
    { symbol: 'LINKUSD', name: 'Chainlink', base: 'Chainlink', quote: 'US Dollar' },
    { symbol: 'AVAXUSD', name: 'Avalanche', base: 'Avalanche', quote: 'US Dollar' },
    { symbol: 'MATICUSD', name: 'Polygon', base: 'Polygon', quote: 'US Dollar' },
    { symbol: 'DOTUSD', name: 'Polkadot', base: 'Polkadot', quote: 'US Dollar' },
    { symbol: 'ATOMUSD', name: 'Cosmos', base: 'Atom', quote: 'US Dollar' },
    { symbol: 'FTMUSD', name: 'Fantom', base: 'FTM', quote: 'US Dollar' },
    { symbol: 'UNIUSD', name: 'Uniswap', base: 'UNI', quote: 'US Dollar' },
    { symbol: 'AAVEUSD', name: 'Aave', base: 'Aave', quote: 'US Dollar' },
  ],
  forex: [
    // Majors
    { symbol: 'EURUSD', name: 'Euro / USD', base: 'Euro', quote: 'US Dollar' },
    { symbol: 'GBPUSD', name: 'GBP / USD', base: 'British Pound', quote: 'US Dollar' },
    { symbol: 'USDJPY', name: 'USD / JPY', base: 'US Dollar', quote: 'Japanese Yen' },
    { symbol: 'AUDUSD', name: 'AUD / USD', base: 'Australian Dollar', quote: 'US Dollar' },
    { symbol: 'USDCAD', name: 'USD / CAD', base: 'US Dollar', quote: 'Canadian Dollar' },
    { symbol: 'USDCHF', name: 'USD / CHF', base: 'US Dollar', quote: 'Swiss Franc' },
    { symbol: 'NZDUSD', name: 'NZD / USD', base: 'New Zealand Dollar', quote: 'US Dollar' },
    // Crosses
    { symbol: 'EURGBP', name: 'EUR / GBP', base: 'Euro', quote: 'British Pound' },
    { symbol: 'EURJPY', name: 'EUR / JPY', base: 'Euro', quote: 'Japanese Yen' },
    { symbol: 'GBPJPY', name: 'GBP / JPY', base: 'British Pound', quote: 'Japanese Yen' },
    { symbol: 'AUDJPY', name: 'AUD / JPY', base: 'Australian Dollar', quote: 'Japanese Yen' },
    { symbol: 'CADJPY', name: 'CAD / JPY', base: 'Canadian Dollar', quote: 'Japanese Yen' },
    { symbol: 'NZDJPY', name: 'NZD / JPY', base: 'New Zealand Dollar', quote: 'Japanese Yen' },
    { symbol: 'EURCHF', name: 'EUR / CHF', base: 'Euro', quote: 'Swiss Franc' },
    { symbol: 'GBPCHF', name: 'GBP / CHF', base: 'British Pound', quote: 'Swiss Franc' },
    // Exotic
    { symbol: 'USDSEK', name: 'USD / SEK', base: 'US Dollar', quote: 'Swedish Krona' },
    { symbol: 'USDNOK', name: 'USD / NOK', base: 'US Dollar', quote: 'Norwegian Krone' },
    { symbol: 'USDZAR', name: 'USD / ZAR', base: 'US Dollar', quote: 'South African Rand' },
    { symbol: 'USDMXN', name: 'USD / MXN', base: 'US Dollar', quote: 'Mexican Peso' },
    { symbol: 'USDSGD', name: 'USD / SGD', base: 'US Dollar', quote: 'Singapore Dollar' },
  ],
  commodities: [
    // Precious Metals
    { symbol: 'XAUUSD', name: 'Gold', base: 'Gold', quote: 'US Dollar' },
    { symbol: 'XAGUSD', name: 'Silver', base: 'Silver', quote: 'US Dollar' },
    { symbol: 'XPDUSD', name: 'Palladium', base: 'Palladium', quote: 'US Dollar' },
    { symbol: 'XPTUSD', name: 'Platinum', base: 'Platinum', quote: 'US Dollar' },
    // Energy
    { symbol: 'USOIL', name: 'Crude Oil WTI', base: 'WTI Crude Oil', quote: 'US Dollar' },
    { symbol: 'UKOIL', name: 'Brent Crude', base: 'Brent Crude', quote: 'US Dollar' },
    { symbol: 'NATGAS', name: 'Natural Gas', base: 'Natural Gas', quote: 'US Dollar' },
    // Agricultural
    { symbol: 'CORN', name: 'Corn', base: 'Corn', quote: 'US Dollar' },
    { symbol: 'WHEAT', name: 'Wheat', base: 'Wheat', quote: 'US Dollar' },
    { symbol: 'SOYBEAN', name: 'Soybeans', base: 'Soybeans', quote: 'US Dollar' },
    { symbol: 'SUGAR', name: 'Sugar', base: 'Sugar', quote: 'US Dollar' },
    { symbol: 'COCOA', name: 'Cocoa', base: 'Cocoa', quote: 'US Dollar' },
    { symbol: 'COFFEE', name: 'Coffee', base: 'Coffee', quote: 'US Dollar' },
    // Other
    { symbol: 'COPPER', name: 'Copper', base: 'Copper', quote: 'US Dollar' },
  ],
  stocks: [
    // Tech Giants
    { symbol: 'AAPL', name: 'Apple', base: 'Apple Inc', quote: 'US Dollar' },
    { symbol: 'MSFT', name: 'Microsoft', base: 'Microsoft Corp', quote: 'US Dollar' },
    { symbol: 'GOOGL', name: 'Alphabet', base: 'Alphabet Inc', quote: 'US Dollar' },
    { symbol: 'AMZN', name: 'Amazon', base: 'Amazon.com', quote: 'US Dollar' },
    { symbol: 'META', name: 'Meta', base: 'Meta Platforms', quote: 'US Dollar' },
    { symbol: 'TSLA', name: 'Tesla', base: 'Tesla Inc', quote: 'US Dollar' },
    { symbol: 'NVDA', name: 'NVIDIA', base: 'NVIDIA Corp', quote: 'US Dollar' },
    { symbol: 'NFLX', name: 'Netflix', base: 'Netflix Inc', quote: 'US Dollar' },
    { symbol: 'AVGO', name: 'Broadcom', base: 'Broadcom Inc', quote: 'US Dollar' },
    { symbol: 'ASML', name: 'ASML', base: 'ASML Holding', quote: 'US Dollar' },
    // Finance & Banking
    { symbol: 'JPM', name: 'JP Morgan', base: 'JP Morgan Chase', quote: 'US Dollar' },
    { symbol: 'BAC', name: 'Bank of America', base: 'BofA', quote: 'US Dollar' },
    { symbol: 'WFC', name: 'Wells Fargo', base: 'Wells Fargo', quote: 'US Dollar' },
    { symbol: 'GS', name: 'Goldman Sachs', base: 'Goldman Sachs', quote: 'US Dollar' },
    { symbol: 'MS', name: 'Morgan Stanley', base: 'Morgan Stanley', quote: 'US Dollar' },
    // Energy
    { symbol: 'XOM', name: 'ExxonMobil', base: 'ExxonMobil', quote: 'US Dollar' },
    { symbol: 'CVX', name: 'Chevron', base: 'Chevron Corp', quote: 'US Dollar' },
    { symbol: 'COP', name: 'ConocoPhillips', base: 'ConocoPhillips', quote: 'US Dollar' },
    // Healthcare
    { symbol: 'PFE', name: 'Pfizer', base: 'Pfizer Inc', quote: 'US Dollar' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', base: 'J&J', quote: 'US Dollar' },
    { symbol: 'UNH', name: 'UnitedHealth', base: 'UnitedHealth Group', quote: 'US Dollar' },
    { symbol: 'ABBV', name: 'AbbVie', base: 'AbbVie Inc', quote: 'US Dollar' },
    { symbol: 'MRK', name: 'Merck', base: 'Merck & Co', quote: 'US Dollar' },
    // Consumer
    { symbol: 'WMT', name: 'Walmart', base: 'Walmart Inc', quote: 'US Dollar' },
    { symbol: 'KO', name: 'Coca-Cola', base: 'Coca-Cola Co', quote: 'US Dollar' },
    { symbol: 'PEP', name: 'PepsiCo', base: 'PepsiCo Inc', quote: 'US Dollar' },
    { symbol: 'MCD', name: "McDonald's", base: "McDonald's Corp", quote: 'US Dollar' },
    { symbol: 'NKE', name: 'Nike', base: 'Nike Inc', quote: 'US Dollar' },
    // Industrial
    { symbol: 'BA', name: 'Boeing', base: 'Boeing Co', quote: 'US Dollar' },
    { symbol: 'CAT', name: 'Caterpillar', base: 'Caterpillar Inc', quote: 'US Dollar' },
    { symbol: 'MMM', name: '3M', base: '3M Company', quote: 'US Dollar' },
    // Index ETFs
    { symbol: 'SPY', name: 'S&P 500 ETF', base: 'SPY', quote: 'US Dollar' },
    { symbol: 'QQQ', name: 'Nasdaq ETF', base: 'QQQ', quote: 'US Dollar' },
    { symbol: 'IWM', name: 'Russell 2000 ETF', base: 'IWM', quote: 'US Dollar' },
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

/** Format price with appropriate decimal places based on symbol type */
export function formatPrice(price, symbol = '') {
  if (price === null || price === undefined) return '-.--';
  
  const normalizedSymbol = String(symbol).toUpperCase();
  
  // Forex: 5 decimals (JPY crosses might use 3, but 5 is standard)
  const forexSymbols = Object.values(SYMBOLS.forex || []).map(s => s.symbol);
  const isForex = forexSymbols.includes(normalizedSymbol);
  
  // Crypto: Use server precision, cap at 8 decimals
  const cryptoSymbols = Object.values(SYMBOLS.crypto || []).map(s => s.symbol);
  const isCrypto = cryptoSymbols.includes(normalizedSymbol);
  
  // Stocks/Indices: 2 decimals
  const stocksSymbols = Object.values(SYMBOLS.stocks || []).map(s => s.symbol);
  const isStock = stocksSymbols.includes(normalizedSymbol);
  
  if (isForex) {
    return parseFloat(price).toFixed(5);
  } else if (isCrypto) {
    // Show natural precision for crypto (2-8 decimals based on price)
    if (price >= 100) return parseFloat(price).toFixed(2);
    if (price >= 10) return parseFloat(price).toFixed(3);
    if (price >= 1) return parseFloat(price).toFixed(4);
    return parseFloat(price).toFixed(5);
  } else if (isStock) {
    return parseFloat(price).toFixed(2);
  }
  
  // Default: 5 decimals (forex-style for unknown)
  return parseFloat(price).toFixed(5);
}
