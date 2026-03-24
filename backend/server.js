/**
 * Trading Dashboard Backend Server
 * Handles MT5 via Python MetaTrader5 library, News API, and AI analysis
 */
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import mt5Routes from './routes/mt5.js';
import newsRoutes from './routes/news.js';
import aiRoutes from './routes/ai.js';
import { MT5Service } from './services/mt5Service.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({ origin: '*' }));
app.use(express.json());

// REST routes
app.use('/api/mt5', mt5Routes);
app.use('/api/news', newsRoutes);
app.use('/api/ai', aiRoutes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// --- WebSocket: stream live MT5 price ticks and candle updates ---
const clients = new Set();
const subscriptions = new Map(); // clientId -> Set of symbols
const candleSubscriptions = new Map(); // clientId -> Set of {symbol:timeframe}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  clients.add(ws);
  subscriptions.set(id, new Set());
  candleSubscriptions.set(id, new Set());

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      
      if (msg.type === 'subscribe') {
        subscriptions.get(id).add(msg.symbol);
        ws.send(JSON.stringify({ type: 'subscribed', symbol: msg.symbol }));
      } else if (msg.type === 'unsubscribe') {
        subscriptions.get(id).delete(msg.symbol);
      } else if (msg.type === 'subscribe_candles') {
        // Subscribe to candle updates for a specific symbol+timeframe
        const key = `${msg.symbol}:${msg.timeframe}`;
        candleSubscriptions.get(id).add(key);
        ws.send(JSON.stringify({ type: 'candles_subscribed', symbol: msg.symbol, timeframe: msg.timeframe }));
      } else if (msg.type === 'unsubscribe_candles') {
        const key = `${msg.symbol}:${msg.timeframe}`;
        candleSubscriptions.get(id).delete(key);
      } else if (msg.type === 'update_settings') {
        // Re-init MT5 with new credentials
        await MT5Service.init(msg.account, msg.password, msg.server);
        ws.send(JSON.stringify({ type: 'settings_updated' }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    subscriptions.delete(id);
    candleSubscriptions.delete(id);
  });
});

// Candle aggregation: convert ticks to candles
const candleAggregators = new Map(); // "symbol:timeframe" -> currentCandle

function getTimeframeMs(timeframe) {
  const units = { m: 60, h: 3600, d: 86400, w: 604800, mn: 2592000 };
  const match = timeframe.match(/^(\d+)([a-z]+)$/);
  if (!match) return 3600000; // default 1h
  const [, num, unit] = match;
  return parseInt(num) * units[unit] * 1000;
}

function getCurrentCandleTime(timestamp, timeframeMs) {
  return Math.floor(timestamp / timeframeMs) * timeframeMs;
}

// Broadcast price ticks to subscribed clients
MT5Service.onTick((symbol, tick) => {
  for (const [id, syms] of subscriptions.entries()) {
    if (syms.has(symbol)) {
      const ws = [...clients].find((c) => c.id === id);
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'tick', symbol, ...tick }));
      }
    }
  }

  // Also aggregate into candles for all subscribed timeframes
  for (const [id, candleKeys] of candleSubscriptions.entries()) {
    for (const key of candleKeys) {
      const [candleSymbol, timeframe] = key.split(':');
      if (candleSymbol === symbol) {
        const timeframeMs = getTimeframeMs(timeframe);
        const candleTime = getCurrentCandleTime(tick.time || Date.now(), timeframeMs);
        const candleKey = `${symbol}:${timeframe}:${candleTime}`;

        // Get or create candle
        let candle = candleAggregators.get(candleKey);
        if (!candle) {
          candle = {
            time: candleTime,
            open: tick.bid,
            high: tick.bid,
            low: tick.bid,
            close: tick.bid,
            volume: 1,
          };
        } else {
          candle.high = Math.max(candle.high, tick.bid);
          candle.low = Math.min(candle.low, tick.bid);
          candle.close = tick.bid;
          candle.volume += 1;
        }

        candleAggregators.set(candleKey, candle);

        // Emit candle update
        MT5Service.emitCandleUpdate(symbol, timeframe, candle);
      }
    }
  }
});

// Broadcast candle updates to subscribed clients
MT5Service.onCandleUpdate?.((symbol, timeframe, candle) => {
  for (const [id, candleKeys] of candleSubscriptions.entries()) {
    const key = `${symbol}:${timeframe}`;
    if (candleKeys.has(key)) {
      const ws = [...clients].find((c) => c.id === id);
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'candle_update', symbol, timeframe, candle }));
      }
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on :${PORT}`));

