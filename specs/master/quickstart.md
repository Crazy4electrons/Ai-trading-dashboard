# Quickstart: Real-Time Trading Data & Watchlists

**Date**: 2026-03-29 | **Feature**: Real-Time Trading Data & Watchlists

Quick start guide for local development, testing, and deployment.

---

## Prerequisites

### Backend
- Python 3.13+
- MetaTrader5 terminal installed (Windows)
- SQLite (comes with Python)
- FastAPI installed: `pip install fastapi uvicorn`

### Frontend
- Node.js 16+
- npm or yarn
- React 18+ and TypeScript

### Development Database
- SQLite (local file `tradematrix.db`)

---

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**New dependencies (if not present)**:
```bash
pip install fastapi uvicorn sqlmodel python-jose[cryptography] cryptography aiosqlite
```

### 2. Environment Configuration

Create `.env` file in `backend/` directory:

```env
# MT5 Configuration
MT5_PATH=C:/Program Files/MetaTrader 5/terminal64.exe
MT5_USERNAME=your_mt5_login
MT5_PASSWORD=your_mt5_password

# Database
DATABASE_URL=sqlite:///./tradematrix.db

# JWT
SECRET_KEY=dev_secret_key_change_in_production
ALGORITHM=HS256

# Server
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=DEBUG

# Cache
CACHE_WORKER_ENABLED=true
CACHE_SYNC_INTERVAL=100  # milliseconds
```

### 3. Initialize Database

```bash
python -c "from app.database import create_db_and_tables; create_db_and_tables()"
```

This creates `tradematrix.db` with all schemas.

### 4. Run Backend

```bash
python main.py
```

Or with auto-reload (development):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend available at: `http://localhost:8000`

API Docs: `http://localhost:8000/docs`

---

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

**New dependencies (if not present)**:
```bash
npm install zustand lightweight-charts
```

### 2. Environment Configuration

Create `.env` file in `frontend/` directory:

```env
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Frontend available at: `http://localhost:5173`

Hot reload enabled; changes reflect immediately.

### 4. Build for Production

```bash
npm run build
npm run preview
```

---

## Quick Test: Real-Time Data Flow

### 1. Start Backend + Frontend

Terminal 1:
```bash
cd backend
python main.py
```

Terminal 2:
```bash
cd frontend
npm run dev
```

### 2. Login

Navigate to `http://localhost:5173` and login with MT5 credentials.

### 3. Verify WebSocket Connection

Open browser DevTools (F12) → Network → Filter by "WS" → Observe WebSocket connection to `/ws`.

### 4. Create Watchlist

1. Click "New Watchlist" → Name: "Test Pairs"
2. Add symbols: EURUSD, GBPUSD, AUDUSD
3. Observe backend logs for watchlist creation and symbol subscription

### 5. Subscribe to Quotes

1. Select "Test Pairs" watchlist
2. Chart appears with live quotes in real-time
3. Observe WebSocket tab → Messages tab → quote_batch messages every 100ms

### 6. Test Candlestick Aggregation

1. Switch chart to 1m timeframe
2. Wait 1 minute
3. Observe candlestick_closed event in WebSocket messages after candle closes

### 7. Test MT5 Disconnection

1. Close MT5 terminal
2. Observe chart displays "Stale Data" status in UI
3. Backend logs exponential backoff retry attempts
4. Reconnect MT5 → Chart recovers within 60s

---

## Code Structure for Development

### Backend New Files

Create these new files:

**`backend/app/services/polling_service.py`**
```python
# Polling service for MT5 quote fetching
# Implements exponential backoff retry logic
# Updates quote cache every 100ms
```

**`backend/app/services/candlestick_service.py`**
```python
# Candlestick aggregation from quotes
# Maintains running candle updates
# Detects candle closure and broadcasts
```

**`backend/app/api/quotes.py`**
```python
# Quote GET endpoints
# WebSocket handler for quote streaming
```

**`backend/app/api/watchlist.py`** (extend existing)
```python
# Existing watchlist endpoints (already present)
# Extend with WebSocket subscription management
```

### Frontend New Files

Create these new files:

**`frontend/src/services/quoteService.ts`**
```typescript
// Quote REST API client
// Quote cache management
// Real-time update handling
```

**`frontend/src/services/websocket.ts`** (extend existing)
```typescript
// Extend with quote batch handler
// Candlestick aggregation on client
// Account update streaming
```

**`frontend/src/components/QuoteDisplay.tsx`**
```typescript
// Real-time quote ticker
// Bid/Ask display with color highlighting
```

**`frontend/src/utils/candlestickAggregator.ts`**
```typescript
// Client-side candlestick aggregation utility
// Fallback aggregation if backend unavailable
```

---

## Running Tests

### Backend Unit Tests

```bash
cd backend
pytest tests/unit/ -v
```

### Backend Integration Tests

```bash
pytest tests/integration/ -v
```

### Frontend Component Tests

```bash
cd frontend
npm run test
```

---

## Admin Panel Access

1. Login as admin user
2. Navigate to `/admin`
3. View:
   - Cache Status: Quotes cached, TTL remaining, cache hit ratio
   - Polling Service: Current backoff level, next sync time
   - WebSocket: Active connections, subscriptions, broadcast latency
   - MT5: Connection status, last quote timestamp

### Admin Actions

- **Force Cache Sync**: Click "Sync Now" button
- **Reset Polling Backoff**: Manually trigger MT5 reconnection
- **View Performance Metrics**: Real-time latency graphs

---

## Debugging

### Backend Logs

Enable DEBUG logging in `.env`:
```env
LOG_LEVEL=DEBUG
```

Shows:
- MT5 query times
- Cache hits/misses
- WebSocket subscription changes
- Polling retry attempts

### Frontend DevTools

1. **Network Tab**: Monitor WebSocket messages
2. **Console Tab**: Check for JavaScript errors
3. **Application Tab**: Inspect Zustand state in useStore

### Common Issues

| Issue | Solution |
|-------|----------|
| "MT5 not found" | Verify MT5 is running and logged in |
| WebSocket connects but no quotes | Check MT5 symbol subscription; verify polling service running |
| Quotes stale after 5m | Check MT5 connection; view polling backoff in admin panel |
| Chart not updating | Check WebSocket connection (DevTools); verify Zustand state |
| Candlestick closure delayed | Normal behavior; aggregation happens at 100ms interval after candle close |

---

## Production Deployment

### Environment Variables

Replace dev values:
```env
SECRET_KEY=<generate-secure-key>
ALGORITHM=HS256
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO
DATABASE_URL=postgresql://user:pass@db-host/tradematrix  # Consider PostgreSQL for production
```

### Docker Deployment (Optional)

**Backend Dockerfile**:
```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend Dockerfile**:
```dockerfile
FROM node:16-alpine as builder
WORKDIR /app
COPY frontend/package*.json .
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Security Checklist

- [ ] Enable HTTPS (SSL cert)
- [ ] Enable WebSocket Secure (WSS)
- [ ] Use strong JWT secret key
- [ ] Store MT5 credentials in secret manager (not .env)
- [ ] Enable rate limiting on API endpoints
- [ ] Set up monitoring and alerting
- [ ] Enable audit logging for compliance
- [ ] Test graceful degradation (MT5 offline)

---

## Performance Tuning

### Quote Update Batching

Adjust in `.env`:
```env
BATCH_INTERVAL_MS=100  # Increase to 200ms for slower networks
```

### Cache TTL

Adjust in `candlestick_service.py`:
```python
CACHE_TTL_MINUTES = 5  # Increase to 10 for longer retention
```

### Database Indexes

Add missing indexes if queries slow:
```sql
CREATE INDEX ix_candlestick_symbol_timeframe_time 
  ON candlestick(symbol_id, timeframe, open_time DESC);
```

### WebSocket Connections

For 100+ concurrent users, consider:
- Load balancing backend instances
- Shared cache (Redis) across instances
- Connection pooling to MT5

---

## Next Steps

1. **Create backend services**: Implement `polling_service.py`, `candlestick_service.py`
2. **Create backend API**: Implement quote endpoints and WebSocket handler
3. **Create frontend components**: QuoteDisplay, update Chart and Watchlist
4. **Integration tests**: Test full WebSocket message flow
5. **Manual testing**: Verify with live MT5 terminal
6. **Deploy**: Follow production deployment checklist

---

**Feature Status**: Ready for implementation (see tasks.md for task breakdown)