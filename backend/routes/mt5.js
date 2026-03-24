/**
 * MT5 REST API routes
 * Uses Python MetaTrader5 library via subprocess bridge
 */
import { Router } from 'express';
import { MT5Service, getMockCandles } from '../services/mt5Service.js';

const router = Router();

router.get('/account', async (req, res) => {
  const data = await MT5Service.getAccountInfo();
  res.json(data);
});

router.get('/candles/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = '1h', count = 2000 } = req.query;
  // Cap at 5000 candles max to avoid memory issues
  const maxCount = Math.min(parseInt(count), 5000);
  
  // Try to get real candles from MT5
  const candles = await MT5Service.getCandles(symbol, timeframe, maxCount);
  
  // If MT5 not connected or error, use mock candles for demo mode
  if (candles.error || !Array.isArray(candles)) {
    const mockCandles = getMockCandles(symbol, timeframe, maxCount);
    return res.json(mockCandles);
  }
  
  res.json(candles);
});

router.get('/price/:symbol', async (req, res) => {
  const price = await MT5Service.getPrice(req.params.symbol);
  res.json(price);
});

router.get('/positions', async (req, res) => {
  const positions = await MT5Service.getPositions();
  res.json(positions);
});

router.get('/history', async (req, res) => {
  const { days = 30 } = req.query;
  const history = await MT5Service.getHistory(null, null, parseInt(days));
  res.json(history);
});

router.post('/order', async (req, res) => {
  const { symbol, type, volume } = req.body;
  if (!symbol || !type || !volume) {
    return res.status(400).json({ error: 'symbol, type, volume required' });
  }
  const result = await MT5Service.placeOrder(symbol, type, parseFloat(volume));
  res.json(result);
});

router.post('/connect', async (req, res) => {
  const { account, password, server } = req.body;
  const result = await MT5Service.init(account, password, server);
  res.json(result);
});

router.get('/status', (req, res) => {
  res.json({ connected: MT5Service.isConnected() });
});

export default router;