# TradeMatrix - Deployment & Setup Guide

## Project Overview

TradeMatrix is a comprehensive trading dashboard and admin system built with:
- **Backend**: Python FastAPI with SQLModel ORM
- **Frontend**: React with TypeScript and Zustand state management
- **Real-time**: WebSocket for live data streaming
- **Database**: SQLite with SQLModel
- **Terminal**: MT5 integration via pywin32

---

## Prerequisites

### Backend Requirements
- Python 3.8+
- MT5 Terminal installed on Windows
- pip package manager

###Frontend Requirements
- Node.js 16+
- npm or yarn package manager

---

## Backend Setup

### 1. Environment Configuration

Create `.env` file in the `backend/` directory:

```env
# MT5 Configuration
MT5_PATH=C:/Program Files/MetaTrader 5/terminal64.exe
MT5_USERNAME=your_mt5_login
MT5_PASSWORD=your_mt5_password

# Database
DATABASE_URL=sqlite:///./tradematrix.db

# JWT
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256

# Server
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO

# Cache
CACHE_WORKER_ENABLED=true
CACHE_SYNC_INTERVAL=3600
```

### 2. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Run Backend

```bash
python main.py
```

Server will start on `http://localhost:8000`

API Documentation: `http://localhost:8000/docs`

---

## Frontend Setup

### 1. Environment Configuration

Create `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000
```

### 2. Install Dependencies

```bash
cd frontend
npm install
```

### 3. Development Server

```bash
npm run dev
```

Application will start on `http://localhost:5173`

### 4. Production Build

```bash
npm run build
npm run preview
```

---

## Docker Deployment (Optional)

### Backend Docker

```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
CMD ["python", "main.py"]
```

Build and run:
```bash
docker build -t tradematrix-backend .
docker run -p 8000:8000 tradematrix-backend
```

### Frontend Docker

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

Build and run:
```bash
docker build -t tradematrix-frontend .
docker run -p 80:80 tradematrix-frontend
```

---

## Architecture Overview

### Backend Structure

```
backend/
├── main.py                 # Application entry point
├── app/
│   ├── __init__.py
│   ├── config.py          # Configuration
│   ├── database.py        # SQLModel setup
│   ├── models.py          # Data models
│   ├── security.py        # JWT authentication
│   ├── api/               # API endpoints
│   │   ├── auth.py        # Authentication
│   │   ├── account.py     # Account/Analytics
│   │   ├── admin.py       # Admin (cache, config)
│   │   ├── terminal_admin.py # Terminal management
│   │   ├── candles.py     # Candlestick data
│   │   ├── symbols.py     # Symbol management
│   │   └── watchlist.py   # Watchlist management
│   └── services/          # Business logic
│       ├── mt5_adapter.py # MT5 integration
│       ├── polling_service.py # Real-time polling
│       ├── websocket_service.py # WebSocket management
│       ├── candle_cache.py # Candle caching
│       └── cache_worker.py # Background sync
└── requirements.txt
```

### Frontend Structure

```
frontend/
├── src/
│   ├── components/        # React components
│   │   ├── AnalyticsPanel.tsx
│   │   ├── Chart.tsx
│   │   ├── Watchlist.tsx
│   │   ├── AccountPanel.tsx
│   │   ├── ErrorBoundary.tsx
│   │   └── LoadingSkeleton.tsx
│   ├── pages/             # Page components
│   │   ├── Dashboard.tsx
│   │   ├── AdminPanel.tsx
│   │   ├── Login.tsx
│   │   └── AdminLogin.tsx
│   ├── services/          # API & WebSocket
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   ├── polling.ts
│   ├── store/            # State management (Zustand)
│   │   └── useStore.ts
│   ├── hooks/            # Custom React hooks
│   │   └── useAdminWebSocket.ts
│   ├── utils/            # Utilities
│   │   ├── performance.ts
│   ├── styles/           # CSS files
│   └── types/            # TypeScript types
└── package.json
```

---

## Key Features

### 1. Real-time Dashboard
- Live market data via WebSocket
- Candlestick charts with TradingView charts
- Account information (balance, equity, margin)
- Watchlist management
- Trade statistics and analytics

### 2. Admin Panel
- **Cache Management**: Configure timeframes, force sync
- **Terminal Management**: Monitor MT5 terminals, cleanup
- **Database Admin**: Statistics, cleanup utilities
- **Polling Status**: Real-time poller status and backoff tracking
- **WebSocket Updates**: Real-time status broadcasting

### 3. Authentication
- JWT-based authentication
- Role-based access (admin/user)
- Secure token refresh
- Session management

### 4. Performance Optimization
- WebSocket batching for efficient updates
- Exponential backoff for polling
- Data caching with TTL
- Component memoization
- Lazy loading capabilities

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/logout` - Logout

### Account
- `GET /api/account/info` - Get account information
- `GET /api/account/positions` - Get open positions
- `GET /api/account/history` - Get trade history
- `GET /api/account/trade-stats` - Get trade statistics
- `GET /api/account/portfolio-metrics` - Get portfolio metrics

### Admin
- `GET /api/admin/config` - Get cache configuration
- `PUT /api/admin/config/{timeframe}` - Update cache config
- `GET /api/admin/cache-status` - Get cache status
- `POST /api/admin/sync-now` - Force sync
- `GET /api/admin/polling/status` - Get polling status
- `POST /api/admin/polling/reset/{data_type}` - Reset poller backoff
- `GET /api/admin/database/stats` - Database statistics
- `POST /api/admin/database/cleanup` - Cleanup old records
- `GET /api/admin/terminals` - List terminals
- `POST /api/admin/terminals/cleanup/{account_id}` - Cleanup terminal

### WebSocket
- `WS /ws?token=<jwt>` - WebSocket connection
  - Subscribe: `{"type": "subscribe_watch_quotes"}`
  - Subscribe: `{"type": "subscribe_admin_status"}`
  - Unsubscribe: `{"type": "unsubscribe_watch_quotes"}`

---

## Performance Metrics

### Backend
- **Response Time**: < 100ms for most endpoints
- **WebSocket Batching**: 100ms intervals
- **Polling Interval**: Configurable (default 5-10s)
- **Exponential Backoff**: Max 60s for failing pollers

### Frontend
- **Initial Load**: < 3s
- **Interactive**: < 1.5s (lighthouse)
- **Component Updates**: < 16ms per frame (60 FPS)
- **Memory**: < 50MB average

---

## Troubleshooting

### MT5 Connection Issues
1. Ensure MT5 is running
2. Check MT5 credentials in `.env`
3. Verify terminal path is correct
4. Check firewall settings

### WebSocket Connection Issues
1. Verify backend is running
2. Check token validity
3. Review browser console for errors
4. Check CORS configuration

### Database Issues
1. Check database file permissions
2. Verify database path in `.env`
3. Run migrations if needed
4. Check disk space

### Performance Issues
1. Enable cache worker
2. Adjust polling intervals
3. Check network bandwidth
4. Monitor system resources

---

## Production Checklist

- [ ] Set strong `SECRET_KEY` in backend
- [ ] Enable HTTPS/WSS in production
- [ ] Configure CORS for frontend domain
- [ ] Set up database backups
- [ ] Enable logging to file
- [ ] Configure rate limiting
- [ ] Set up monitoring/alerting
- [ ] Test failover scenarios
- [ ] Document deployment process
- [ ] Set up CI/CD pipeline

---

## Additional Resources

- **MT5 Python Documentation**: https://www.mql5.com/en/docs/integration/python_metatrader5
- **FastAPI**: https://fastapi.tiangolo.com
- **React**: https://react.dev
- **WebSocket**: https://www.rfc-editor.org/rfc/rfc6455

---

## Support & Development

For issues or feature requests, refer to the project documentation or contact the development team.

Last Updated: March 29, 2026
