/**
 * Trading Dashboard Backend Server
 * Handles MT5 via MetaApi, News API, and AI analysis
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

// --- WebSocket: stream live MT5 price ticks ---
const clients = new Set();
const subscriptions = new Map(); // clientId -> Set of symbols

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  clients.add(ws);
  subscriptions.set(id, new Set());

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'subscribe') {
        subscriptions.get(id).add(msg.symbol);
        ws.send(JSON.stringify({ type: 'subscribed', symbol: msg.symbol }));
      } else if (msg.type === 'unsubscribe') {
        subscriptions.get(id).delete(msg.symbol);
      } else if (msg.type === 'update_settings') {
        // Re-init MT5 with new credentials
        await MT5Service.init(msg.token, msg.accountId);
        ws.send(JSON.stringify({ type: 'settings_updated' }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    subscriptions.delete(id);
  });
});

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
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on :${PORT}`));
