/**
 * Trading Dashboard Backend Server
 * Handles MT5 via Python FastAPI bridge, News API, and AI analysis
 * Provides WebSocket for frontend clients and internal Python server communication
 * Includes JWT authentication for secure client-server communication
 */
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import mt5Routes from './routes/mt5.js';
import newsRoutes from './routes/news.js';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import { authMiddleware } from './utils/authToken.js';
import { wsLogger } from './utils/logger.js';

const app = express();
const server = createServer(app);

// Two WebSocket servers: one for frontend clients, one for Python server
const wss = new WebSocketServer({ noServer: true });
const pythonWss = new WebSocketServer({ noServer: true });

app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logger: log incoming requests for debugging (sanitize sensitive fields)
app.use((req, res, next) => {
  try {
    const sanitizeBody = (body) => {
      if (!body || typeof body !== 'object') return body;
      const copy = JSON.parse(JSON.stringify(body));
      if (copy.password) copy.password = '***';
      if (copy.token) copy.token = '***';
      return copy;
    };

    wsLogger.debug('IncomingRequest', `${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      body: req.method === 'POST' ? sanitizeBody(req.body) : undefined,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
    });
  } catch (e) {
    // Ignore logging errors
  }
  next();
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Health check (public)
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Protected routes (require authentication token)
app.use('/api/mt5', authMiddleware, mt5Routes);
app.use('/api/news', authMiddleware, newsRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);

// ==================== Frontend WebSocket Clients ====================
const frontendClients = new Set();
const subscriptions = new Map(); // clientId -> Set of symbols
const candleSubscriptions = new Map(); // clientId -> Set of {symbol:timeframe}
const depthSubscriptions = new Map(); // clientId -> Set of symbols

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2);
  ws.id = id;
  frontendClients.add(ws);
  subscriptions.set(id, new Set());
  candleSubscriptions.set(id, new Set());
  depthSubscriptions.set(id, new Set());

  wsLogger.websocket('Frontend Connected', `Client ${id}`);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      
      if (msg.type === 'subscribe') {
        subscriptions.get(id).add(msg.symbol);
        ws.send(JSON.stringify({ type: 'subscribed', symbol: msg.symbol }));
        wsLogger.debug('Subscribe', `${id} subscribed to ${msg.symbol}`);
      } else if (msg.type === 'unsubscribe') {
        subscriptions.get(id).delete(msg.symbol);
        wsLogger.debug('Unsubscribe', `${id} unsubscribed from ${msg.symbol}`);
      } else if (msg.type === 'subscribe_candles') {
        const key = `${msg.symbol}:${msg.timeframe}`;
        candleSubscriptions.get(id).add(key);
        ws.send(JSON.stringify({ type: 'candles_subscribed', symbol: msg.symbol,  timeframe: msg.timeframe }));
      } else if (msg.type === 'unsubscribe_candles') {
        const key = `${msg.symbol}:${msg.timeframe}`;
        candleSubscriptions.get(id).delete(key);
      } else if (msg.type === 'subscribe_depth') {
        depthSubscriptions.get(id).add(msg.symbol);
        ws.send(JSON.stringify({ type: 'depth_subscribed', symbol: msg.symbol }));
      } else if (msg.type === 'unsubscribe_depth') {
        depthSubscriptions.get(id).delete(msg.symbol);
      }
    } catch (e) {
      wsLogger.error('MessageHandler', 'Error handling client message', e);
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  });

  ws.on('close', () => {
    frontendClients.delete(ws);
    subscriptions.delete(id);
    candleSubscriptions.delete(id);
    depthSubscriptions.delete(id);
    wsLogger.websocket('Frontend Disconnected', `Client ${id}`);
  });

  ws.on('error', (error) => {
    wsLogger.error('ClientError', 'Frontend client error', error);
  });
});

// ==================== Internal Python Server WebSocket ====================
let pythonServerConnection = null;
const pythonValidationToken = process.env.PYTHON_MT5_TOKEN_SECRET || 'default_token';

pythonWss.on('connection', (ws, request) => {
  // Validate token - check both lowercase and original case from request headers
  const token = request.headers?.['x-api-token'] || ws.headers?.['x-api-token'];
  if (token !== pythonValidationToken) {
    wsLogger.warn('PythonAuth', `Unauthorized Python server connection attempt. Token received: ${token ? 'yes' : 'no'}, Expected: ${pythonValidationToken.substring(0, 10)}...`);
    ws.close(1008, 'Unauthorized');
    return;
  }

  pythonServerConnection = ws;
  wsLogger.websocket('PythonConnected', 'Python MT5 server connected');

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw);
      wsLogger.debug('PythonMessage', `Received ${message.type}`, message);

      // Relay different message types to appropriate subscribers
      if (message.type === 'tick') {
        relayTickToClients(message);
      } else if (message.type === 'candle') {
        relayCandleToClients(message);
      } else if (message.type === 'depth') {
        relayDepthToClients(message);
      } else if (message.type === 'trade_close') {
        relayTradeCloseToClients(message);
      } else if (message.type === 'status') {
        wsLogger.websocket('PythonStatus', `MT5 status: ${message.connected ? 'connected' : 'disconnected'}`);
      }
    } catch (error) {
      wsLogger.error('PythonMessageHandler', 'Failed to handle Python message', error);
    }
  });

  ws.on('close', () => {
    pythonServerConnection = null;
    wsLogger.websocket('PythonDisconnected', 'Python MT5 server disconnected');
  });

  ws.on('error', (error) => {
    wsLogger.error('PythonError', 'Python server connection error', error);
  });
});

/**
 * Relay tick from Python to subscribed frontend clients
 */
function relayTickToClients(tickMessage) {
  const { symbol, bid, ask, time } = tickMessage;

  for (const [id, syms] of subscriptions.entries()) {
    if (syms.has(symbol)) {
      const ws = [...frontendClients].find((c) => c.id === id);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'tick',
          symbol,
          bid,
          ask,
          time
        }));
      }
    }
  }
}

/**
 * Relay candle from Python to subscribed frontend clients
 */
function relayCandleToClients(candleMessage) {
  const { symbol, timeframe, candle } = candleMessage;
  const key = `${symbol}:${timeframe}`;

  for (const [id, candleKeys] of candleSubscriptions.entries()) {
    if (candleKeys.has(key)) {
      const ws = [...frontendClients].find((c) => c.id === id);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'candle_update',
          symbol,
          timeframe,
          candle
        }));
      }
    }
  }
}

/**
 * Relay depth from Python to subscribed frontend clients
 */
function relayDepthToClients(depthMessage) {
  const { symbol, bids, asks } = depthMessage;

  for (const [id, syms] of depthSubscriptions.entries()) {
    if (syms.has(symbol)) {
      const ws = [...frontendClients].find((c) => c.id === id);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'depth',
          symbol,
          bids,
          asks
        }));
      }
    }
  }
}

/**
 * Relay trade close event from Python to all frontend clients
 */
function relayTradeCloseToClients(tradeMessage) {
  const message = {
    type: 'trade_close',
    symbol: tradeMessage.symbol,
    volume: tradeMessage.volume,
    entry_price: tradeMessage.entry_price,
    exit_price: tradeMessage.exit_price,
    profit_loss: tradeMessage.profit_loss,
    balance: tradeMessage.balance,
    timestamp: tradeMessage.timestamp
  };

  wsLogger.websocket('TradeClose', `${tradeMessage.symbol} P&L: ${tradeMessage.profit_loss}`);

  // Broadcast to all connected frontend clients
  for (const ws of frontendClients) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }
}

/**
 * HTTP upgrade handler for WebSocket connections
 */
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;

  if (pathname === '/api/mt5/ws-internal') {
    // Internal Python server connection
    pythonWss.handleUpgrade(request, socket, head, (ws) => {
      ws.headers = request.headers;
      pythonWss.emit('connection', ws, request);
    });
  } else {
    // Default frontend WebSocket connection
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws);
    });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Frontend WebSocket: ws://localhost:${PORT}/`);
  console.log(`🐍 Internal Python WS: ws://localhost:${PORT}/api/mt5/ws-internal`);
});

