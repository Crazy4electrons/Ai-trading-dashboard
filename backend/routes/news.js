/**
 * News API routes
 */
import { Router } from 'express';
import { NewsService } from '../services/newsService.js';

const router = Router();

router.get('/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { apiKey } = req.query;
  const news = await NewsService.getNews(symbol, apiKey);
  res.json(news);
});

export default router;
