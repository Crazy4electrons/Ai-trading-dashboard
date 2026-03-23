/**
 * MT5Service — wraps MetaApi.cloud SDK for MT5 connectivity
 * Provides account info, candles, ticks, and order management
 */
import pkg from 'metaapi.cloud-sdk';
const MetaApi = pkg.default || pkg;

let api = null;
let account = null;
let connection = null;
let tickCallbacks = [];

export const MT5Service = {
  /** Initialize MetaApi with token + accountId */
  async init(token, accountId) {
    try {
      token = token || process.env.META_API_TOKEN;
      accountId = accountId || process.env.MT5_ACCOUNT_ID;
      if (!token || !accountId) return { error: 'Missing MetaApi credentials' };

      api = new MetaApi(token);
      account = await api.metatraderAccountApi.getAccount(accountId);

      if (!['DEPLOYING', 'DEPLOYED'].includes(account.state)) {
        await account.deploy();
      }
      await account.waitConnected();

      connection = account.getRPCConnection();
      await connection.connect();
      await connection.waitSynchronized({ timeoutInSeconds: 30 });

      return { success: true };
    } catch (e) {
      console.error('MT5 init error:', e.message);
      return { error: e.message };
    }
  },

  /** Get account summary */
  async getAccountInfo() {
    if (!connection) return getMockAccountInfo();
    try {
      return await connection.getAccountInformation();
    } catch (e) {
      return getMockAccountInfo();
    }
  },

  /** Get OHLCV candles */
  async getCandles(symbol, timeframe = '1h', count = 200) {
    if (!connection) return getMockCandles(symbol, count);
    try {
      const candles = await connection.getHistoricalCandles(symbol, timeframe, new Date(), count);
      return candles.map((c) => ({
        time: Math.floor(new Date(c.time).getTime() / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.tickVolume,
      }));
    } catch (e) {
      return getMockCandles(symbol, count);
    }
  },

  /** Get current price */
  async getPrice(symbol) {
    if (!connection) return getMockPrice(symbol);
    try {
      const price = await connection.getSymbolPrice(symbol);
      return { bid: price.bid, ask: price.ask, time: price.time };
    } catch (e) {
      return getMockPrice(symbol);
    }
  },

  /** Get open positions */
  async getPositions() {
    if (!connection) return [];
    try {
      return await connection.getPositions();
    } catch (e) {
      return [];
    }
  },

  /** Get order history */
  async getHistory(from, to) {
    if (!connection) return [];
    try {
      const startTime = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endTime = to || new Date();
      const result = await connection.getHistoryOrdersByTimeRange(startTime, endTime);
      return result.historyOrders || [];
    } catch (e) {
      return [];
    }
  },

  /** Place a market order */
  async placeOrder(symbol, type, volume) {
    if (!connection) return { error: 'Not connected — demo mode' };
    try {
      const result = type === 'buy'
        ? await connection.createMarketBuyOrder(symbol, volume)
        : await connection.createMarketSellOrder(symbol, volume);
      return result;
    } catch (e) {
      return { error: e.message };
    }
  },

  /** Register tick callback */
  onTick(cb) {
    tickCallbacks.push(cb);
  },

  isConnected() {
    return !!connection;
  },
};

// --- Mock data for demo / disconnected state ---

function getMockAccountInfo() {
  return {
    broker: 'Demo Broker',
    currency: 'USD',
    server: 'Demo-Server',
    balance: 10000,
    equity: 10250,
    margin: 500,
    freeMargin: 9750,
    leverage: 100,
    name: 'Demo Account',
    login: '12345678',
  };
}

function getMockPrice(symbol) {
  const base = { BTCUSD: 65000, ETHUSD: 3200, EURUSD: 1.085, XAUUSD: 2050, AAPL: 185, default: 100 };
  const price = base[symbol] || base.default;
  const spread = price * 0.0002;
  return { bid: price, ask: price + spread, time: new Date().toISOString() };
}

export function getMockCandles(symbol, count = 200) {
  const base = { BTCUSD: 65000, ETHUSD: 3200, EURUSD: 1.085, XAUUSD: 2050, AAPL: 185, default: 100 };
  const startPrice = base[symbol] || base.default;
  const candles = [];
  let price = startPrice;
  const now = Math.floor(Date.now() / 1000);
  const interval = 3600;

  for (let i = count - 1; i >= 0; i--) {
    const change = (Math.random() - 0.48) * price * 0.015;
    const open = price;
    price += change;
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    candles.push({
      time: now - i * interval,
      open: +open.toFixed(5),
      high: +high.toFixed(5),
      low: +low.toFixed(5),
      close: +close.toFixed(5),
      volume: Math.floor(Math.random() * 1000) + 100,
    });
  }
  return candles;
}

// Auto-init on startup (non-blocking)
MT5Service.init().catch(() => {});