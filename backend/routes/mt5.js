/**
 * MT5 REST API Routes
 * Communicates with Python FastAPI bridge server via HTTP
 */
import { Router } from 'express';
import { MT5Service } from '../services/mt5Service.js';
import { mt5Logger } from '../utils/logger.js';
import { getTradeHistoryDb } from '../utils/tradeHistoryDb.js';

const router = Router();
let currentAccountId = null; // Track current logged-in account

/**
 * POST /connect
 * Login to MT5 with credentials
 */
router.post('/connect', async (req, res) => {
  try {
    const { account, password, server = 'MetaQuotes-Demo' } = req.body;

    // Validate input
    if (!account || !password) {
      return res.status(400).json({
        error: true,
        message: 'account and password required'
      });
    }

    mt5Logger.mt5Service('Connect', 'Initiating MT5 connection', {
      account,
      server
    });

    const result = await MT5Service.init(account, password, server);

    if (result.connected) {
      mt5Logger.mt5Service('Connect', 'Connection successful', {
        account: result.account_id,
        balance: result.balance
      });

      return res.json({
        connected: true,
        account_id: result.account_id,
        balance: result.balance,
        message: 'Connected to MT5'
      });
    } else {
      currentAccountId = result.account_id; // Track account ID
      
      mt5Logger.mt5Service('Connect', 'Account tracked', {
        account_id: result.account_id
      });
    }

    mt5Logger.warn('Connect', 'Connection failed', result);

    return res.status(503).json({
      connected: false,
      error: result.error || result.message,
      message: 'Failed to connect to MT5'
    });

  } catch (error) {
    mt5Logger.error('Connect', 'Connection error', error);
    res.status(500).json({
      error: error.message,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /status
 * Get current MT5 connection status
 */
router.get('/status', async (req, res) => {
  try {
    if (!MT5Service.isConnected()) {
      return res.json({
        connected: false,
        message: 'MT5 not connected'
      });
    }

    const accountInfo = await MT5Service.getAccountInfo();

    res.json({
      connected: true,
      account_id: accountInfo.account_id,
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      free_margin: accountInfo.free_margin,
      margin_level: accountInfo.margin_level,
      message: 'Connected to MT5'
    });

  } catch (error) {
    mt5Logger.error('Status', 'Status check failed', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /account
 * Get account information
 */
router.get('/account', async (req, res) => {
  try {
    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected' });
    }

    const data = await MT5Service.getAccountInfo();
    res.json(data);

  } catch (error) {
    mt5Logger.error('Account', 'Failed to get account info', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /candles/:symbol
 * Get historical candles
 */
router.get('/candles/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h', count = 100, offset = 0, limit = 1000 } = req.query;

    if (!MT5Service.isConnected()) {
      return res.status(503).json({
        error: 'MT5 not connected',
        candles: []
      });
    }

    let maxCount = parseInt(count) || parseInt(limit);
    maxCount = Math.min(maxCount, 5000);  // Cap at 5000

    const result = await MT5Service.getCandles(symbol, timeframe, maxCount);
    res.json(result);

  } catch (error) {
    mt5Logger.error('Candles', 'Failed to get candles', error);
    res.status(500).json({
      error: error.message,
      candles: []
    });
  }
});

/**
 * GET /price/:symbol
 * Get latest price for symbol
 */
router.get('/price/:symbol', async (req, res) => {
  try {
    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected' });
    }

    const price = await MT5Service.getPrice(req.params.symbol);
    res.json(price);

  } catch (error) {
    mt5Logger.error('Price', 'Failed to get price', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /positions
 * Get all open positions
 */
router.get('/positions', async (req, res) => {
  try {
    // Return current open positions via MT5Service
    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected', positions: [] });
    }

    const result = await MT5Service.getPositions();

    // MT5Service.getPositions returns either { error } or { positions: [...] }
    if (result && result.error) {
      return res.status(500).json({ error: result.error, positions: [] });
    }

    // If the service returned the positions array directly, normalize response
    if (Array.isArray(result)) {
      return res.json(result);
    }

    return res.json(result);
  } catch (error) {
    mt5Logger.error('Positions', 'Failed to get positions', error);
    return res.status(500).json({ error: error.message, positions: [] });
  }
});

/**
 * GET /history
 * Compatibility endpoint: frontend expects `/history` for trade history
 */
router.get('/history', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected', trades: [] });
    }

    const result = await MT5Service.getHistory(null, null, parseInt(days, 10));

    if (result && result.error) {
      return res.status(500).json({ error: result.error, trades: [] });
    }

    return res.json(result);
  } catch (error) {
    mt5Logger.error('History', 'Failed to get history', error);
    return res.status(500).json({ error: error.message, trades: [] });
  }
});

/**
 * POST /order
 * Place a new order
 */
router.post('/order', async (req, res) => {
  try {
    const { symbol, type, volume, stop_loss, take_profit } = req.body;

    if (!symbol || !type || !volume) {
      return res.status(400).json({
        error: 'symbol, type, volume required'
      });
    }

    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected' });
    }

    const result = await MT5Service.placeOrder(symbol, type, parseFloat(volume), stop_loss, take_profit);

    if (result.error) {
      return res.status(400).json(result);
    }

    mt5Logger.mt5Service('Order', 'Order placed', {
      symbol,
      type,
      volume,
      ticket: result.ticket
    });

    res.json(result);

  } catch (error) {
    mt5Logger.error('Order', 'Failed to place order', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /symbols
 * Get list of available trading symbols
 */
router.get('/symbols', async (req, res) => {
  try {
    if (!MT5Service.isConnected()) {
      return res.status(503).json({
        error: 'MT5 not connected',
        symbols: []
      });
    }

    const result = await MT5Service.getSymbols();
    res.json(result);

  } catch (error) {
    mt5Logger.error('Symbols', 'Failed to get symbols', error);
    res.status(500).json({
      error: error.message,
      symbols: []
    });
  }
});

/**
 * GET /symbol/:symbol
 * Get symbol information
 */
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected' });
    }

    const result = await MT5Service.getSymbolInfo(symbol);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    mt5Logger.error('SymbolInfo', 'Failed to get symbol info', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /depth/:symbol
 * Get market depth (order book)
 */
router.get('/depth/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol required' });
    }

    if (!MT5Service.isConnected()) {
      return res.status(503).json({ error: 'MT5 not connected' });
    }

    const result = await MT5Service.getDepth(symbol);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    mt5Logger.error('Depth', 'Failed to get market depth', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /trades/record
 * Record a closed trade (called by Python server)
 * Token-protected endpoint for Python server to report closed trades
 */
router.post('/trades/record', async (req, res) => {
  try {
    const { 
      account_id, 
      symbol, 
      type, 
      volume, 
      entry_price, 
      exit_price, 
      open_time,
      close_time,
      profit_loss, 
      balance, 
      timestamp 
    } = req.body;

    // Validate required fields
    if (!account_id || !symbol || !type || !volume || !entry_price || !exit_price) {
      return res.status(400).json({
        error: true,
        message: 'account_id, symbol, type, volume, entry_price, exit_price required'
      });
    }

    mt5Logger.mt5Service('TradeRecord', 'Saving closed trade', {
      account_id,
      symbol,
      type,
      volume,
      entry_price,
      exit_price,
      profit_loss,
      balance
    });

    // Save trade to database
    const db = getTradeHistoryDb();
    const tradeResult = db.saveTrade({
      account_id,
      symbol,
      type,
      volume,
      open_price: entry_price,
      close_price: exit_price,
      open_time: open_time || Math.floor(Date.now() / 1000),
      close_time: close_time || Math.floor(Date.now() / 1000),
      profit_loss: profit_loss || 0,
      balance: balance || 0
    });

    if (!tradeResult.success) {
      mt5Logger.warn('TradeRecord', 'Failed to save trade', tradeResult.error);
      return res.status(500).json({
        success: false,
        error: tradeResult.error
      });
    }

    // Also save balance snapshot
    db.saveBalanceSnapshot(account_id, {
      balance,
      event: 'trade_close'
    });

    mt5Logger.mt5Service('TradeRecord', 'Trade saved successfully', {
      trade_id: tradeResult.trade_id,
      symbol,
      profit_loss
    });

    res.json({
      success: true,
      trade_id: tradeResult.trade_id,
      message: 'Trade recorded and saved'
    });

  } catch (error) {
    mt5Logger.error('TradeRecord', 'Failed to record trade', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /trades
 * Retrieve trade history for current account
 * Query params: account_id (optional), limit (default 100), offset (default 0)
 */
router.get('/trades', async (req, res) => {
  try {
    const { account_id, limit = 100, offset = 0 } = req.query;

    if (!account_id && !currentAccountId) {
      return res.status(400).json({
        error: true,
        message: 'account_id required or must be connected'
      });
    }

    const accId = parseInt(account_id || currentAccountId);
    const limitNum = Math.min(parseInt(limit) || 100, 1000); // Max 1000
    const offsetNum = parseInt(offset) || 0;

    mt5Logger.mt5Service('GetTrades', 'Retrieving trade history', {
      account_id: accId,
      limit: limitNum,
      offset: offsetNum
    });

    const db = getTradeHistoryDb();
    const result = db.getTradeHistory(accId, limitNum, offsetNum);

    if (!result.success) {
      return res.status(500).json({
        error: true,
        message: result.error
      });
    }

    res.json({
      success: true,
      account_id: accId,
      trades: result.trades,
      total: result.total,
      limit: limitNum,
      offset: offsetNum
    });

  } catch (error) {
    mt5Logger.error('GetTrades', 'Failed to retrieve trades', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /trades/stats
 * Retrieve trade statistics for current account
 * Query params: account_id (optional), days (default 30)
 */
router.get('/trades/stats', async (req, res) => {
  try {
    const { account_id, days = 30 } = req.query;

    if (!account_id && !currentAccountId) {
      return res.status(400).json({
        error: true,
        message: 'account_id required or must be connected'
      });
    }

    const accId = parseInt(account_id || currentAccountId);
    const daysNum = Math.min(parseInt(days) || 30, 365); // Max 365 days

    mt5Logger.mt5Service('GetTradeStats', 'Retrieving trade statistics', {
      account_id: accId,
      days: daysNum
    });

    const db = getTradeHistoryDb();
    const result = db.getTradeStats(accId, daysNum);

    if (!result.success) {
      return res.status(500).json({
        error: true,
        message: result.error
      });
    }

    res.json({
      success: true,
      account_id: accId,
      days: daysNum,
      stats: result.stats
    });

  } catch (error) {
    mt5Logger.error('GetTradeStats', 'Failed to retrieve trade stats', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /balance-history
 * Retrieve balance history for current account
 * Query params: account_id (optional), days (default 30)
 */
router.get('/balance-history', async (req, res) => {
  try {
    const { account_id, days = 30 } = req.query;

    if (!account_id && !currentAccountId) {
      return res.status(400).json({
        error: true,
        message: 'account_id required or must be connected'
      });
    }

    const accId = parseInt(account_id || currentAccountId);
    const daysNum = Math.min(parseInt(days) || 30, 365);

    mt5Logger.mt5Service('GetBalanceHistory', 'Retrieving balance history', {
      account_id: accId,
      days: daysNum
    });

    const db = getTradeHistoryDb();
    const result = db.getBalanceHistory(accId, daysNum);

    if (!result.success) {
      return res.status(500).json({
        error: true,
        message: result.error
      });
    }

    res.json({
      success: true,
      account_id: accId,
      days: daysNum,
      snapshots: result.snapshots
    });

  } catch (error) {
    mt5Logger.error('GetBalanceHistory', 'Failed to retrieve balance history', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /debug/status
 * Debug endpoint to diagnose connection issues (protected)
 */
router.get('/debug/status', async (req, res) => {
  try {
    const isConnected = MT5Service.isConnected();
    
    // Try to get health from Python even if disconnected
    let pythonHealth = null;
    let pythonError = null;
    
    try {
      const healthRes = await fetch('http://127.0.0.1:3002/health', { 
        signal: AbortSignal.timeout(5000)
      });
      if (healthRes.ok) {
        pythonHealth = await healthRes.json();
      }
    } catch (e) {
      pythonError = e.message;
    }

    return res.json({
      timestamp: new Date().toISOString(),
      nodeService: {
        isConnected,
        message: isConnected ? 'MT5 connected' : 'MT5 not connected'
      },
      pythonServer: {
        responding: pythonHealth !== null,
        health: pythonHealth,
        error: pythonError
      },
      endpoints: {
        account: isConnected ? 'ready' : 'blocked (MT5 disconnected)',
        positions: isConnected ? 'ready' : 'blocked (MT5 disconnected)',
        history: isConnected ? 'ready' : 'blocked (MT5 disconnected)',
        candles: isConnected ? 'ready' : 'blocked (MT5 disconnected)',
        symbols: isConnected ? 'ready' : 'blocked (MT5 disconnected)'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;