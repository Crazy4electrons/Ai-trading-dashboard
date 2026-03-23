/**
 * MT5 REST API routes
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
  const { timeframe = '1h', count = 200 } = req.query;
  const candles = await MT5Service.getCandles(symbol, timeframe, parseInt(count));
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
  const { from, to } = req.query;
  const history = await MT5Service.getHistory(from ? new Date(from) : null, to ? new Date(to) : null);
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
  const { token, accountId } = req.body;
  const result = await MT5Service.init(token, accountId);
  res.json(result);
});

router.get('/status', (req, res) => {
  res.json({ connected: MT5Service.isConnected() });
});

export default router;