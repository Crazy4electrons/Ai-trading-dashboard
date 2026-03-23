/**
 * AI Analysis routes
 */
import { Router } from 'express';
import { AIService } from '../services/aiService.js';

const router = Router();

router.post('/analyze', async (req, res) => {
  const { symbol, timeframe, indicators, news, candles, provider, apiKey } = req.body;
  const result = await AIService.analyze({ symbol, timeframe, indicators, news, candles, provider, apiKey });
  res.json(result);
});

export default router;
