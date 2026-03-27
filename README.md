# TradeMatrix (MT5 Trading Dashboard)

A real-time, AI-powered trading dashboard built with MetaTrader5 Python library, FastAPI backend, and React + TypeScript frontend. Stream live market data, manage watchlists, monitor account performance, and view live charts—all with a professional, responsive UI.

## 🎯 Features

- **Live Trading Data**: Real-time price updates via WebSocket
- **Categorized Watchlist**: Organized by Forex, Crypto, Stocks, Commodities, Indices, ETFs
- **Interactive Charts**: TradingView Lightweight Charts with candlestick visualization and multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d)
- **Account Dashboard**: Live balance, equity, margin, and open positions
- **Secure Authentication**: MT5 credential encryption and JWT tokens
- **Responsive UI**: Dark theme matching professional trading platforms

## 🏗️ Architecture

```
TradeMatrix/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── models.py          # SQLModel database schemas
│   │   ├── config.py          # Configuration and settings
│   │   ├── security.py        # JWT and encryption utilities
│   │   ├── database.py        # Database setup and sessions
│   │   ├── services/
│   │   │   ├── mt5_adapter.py       # MT5 connection and operations
│   │   │   └── websocket_service.py # WebSocket broadcasting
│   │   └── api/
│   │       ├── auth.py        # Login/logout endpoints
│   │       ├── symbols.py     # Symbol search and retrieval
│   │       ├── watchlist.py   # Watchlist management
│   │       └── account.py     # Account info and positions
│   ├── main.py                # FastAPI app entry point
│   ├── pyproject.toml         # Python dependencies
│   └── .env                   # Environment variables
│
├── frontend/                   # React + TypeScript frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx           # MT5 login page
│   │   │   └── Dashboard.tsx       # Main trading dashboard
│   │   ├── components/
│   │   │   ├── Watchlist.tsx       # Categorized symbol watchlist
│   │   │   ├── Chart.tsx           # Price chart with TradingView
│   │   │   └── AccountPanel.tsx    # Account info and positions
│   │   ├── services/
│   │   │   ├── api.ts              # REST API client
│   │   │   └── websocket.ts        # WebSocket client
│   │   ├── store/
│   │   │   └── useStore.ts         # Zustand global state
│   │   ├── styles/
│   │   │   ├── global.css          # Global styles
│   │   │   ├── Login.css
│   │   │   ├── Dashboard.css
│   │   │   ├── Watchlist.css
│   │   │   ├── Chart.css
│   │   │   └── AccountPanel.css
│   │   ├── types/index.ts          # TypeScript interfaces
│   │   ├── App.tsx                 # Main React component
│   │   └── main.tsx                # React entry point
│   ├── index.html             # HTML entry point
│   ├── vite.config.ts         # Vite configuration
│   ├── tsconfig.json          # TypeScript configuration
│   ├── package.json           # Node.js dependencies
│   └── .env.local             # Environment variables
│
└── README.md

```

## 🚀 Quick Start

### Prerequisites

- **Windows** (MT5 Python library requires Windows)
- **MetaTrader 5 terminal** (installed and running)
- **Python 3.13+**
- **Node.js 18+** and **npm** or **yarn**
- **uv** (Python package manager): `pip install uv`

### Backend Setup

1. **Install Python dependencies:**

```bash
cd backend
uv sync
```

2. **Configure environment:**

Edit `backend/.env` to set your preferences (optional):

```env
# Database
DATABASE_URL=sqlite:///./database.db

# JWT
SECRET_KEY=your-secret-key-change-in-production

# MT5
MT5_DEFAULT_SERVER=MetaQuotes-Demo
```

3. **Start the backend server:**

**Option A: Standard HTTP/1.1 (default)**
```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Option B: HTTP/2 + WebSocket (recommended for better performance)**
```bash
cd backend
uv run hypercorn main:app --bind 0.0.0.0:8000 --reload
```

Or use the convenience scripts:
```bash
cd backend
# PowerShell:
./run_http2.ps1
# Or Python:
uv run python run_http2.py
```

**Benefits of HTTP/2:**
- Multiplexing: Multiple concurrent requests over one connection
- Reduced latency for REST API calls (symbols, watchlist, candles)
- WebSocket continues to work normally
- Better performance for high-frequency updates
- Native h2c (HTTP/2 cleartext) support in development

The backend will:
- Initialize SQLite database at `backend/database.db`
- Start FastAPI server on `http://localhost:8000` (or `http://8000` for h2c)
- WebSocket endpoint available at `ws://localhost:8000/ws` (works with both HTTP/1.1 and HTTP/2)

**API Documentation** (Swagger): http://localhost:8000/docs

### Frontend Setup

1. **Install Node.js dependencies:**

```bash
cd frontend
npm install
```

2. **Start development server:**

```bash
npm run dev
```

The frontend will open at `http://localhost:5173` with automatic hot-reload.

### Login

1. Open the dashboard at `http://localhost:5173`
2. Enter MT5 credentials:
   - **Server**: `MetaQuotes-Demo` (or your broker's server)
   - **Account Number**: Your MT5 account number
   - **Password**: Your MT5 password
3. Click "→ Login"

## 🔌 WebSocket Real-Time Updates

Once logged in, the frontend connects via WebSocket to receive live updates:

- **Quote updates**: Bid/ask prices for watchlist symbols
- **Account updates**: Balance, equity, margin changes
- **Watchlist changes**: Adding/removing symbols
- **Position updates**: Open trades and P&L

Message batching (every 100-200ms) ensures efficient bandwidth usage.

## ⚡ Performance & Protocols

### HTTP/2 Support
The backend supports both HTTP/1.1 and HTTP/2 protocols:

| Protocol | Server | Benefit | Use Case |
|----------|--------|---------|----------|
| **HTTP/1.1** | Uvicorn | Stable, widely compatible | Default, backward compatible |
| **HTTP/2** | Hypercorn | Multiplexing, lower latency | Better for high-frequency API calls (recommended) |

**To use HTTP/2 with Hypercorn:**
```bash
uv run hypercorn main:app --bind 0.0.0.0:8000 --reload
```

Or use the convenience script:
```bash
./run_http2.ps1  # PowerShell
# or
uv run python run_http2.py  # Python
```

**Verify HTTP/2 is active:**
- Open browser DevTools → Network → Check "Protocol" column
- HTTP/2 requests show `h2` or `h2c`
- WebSocket connections work seamlessly with both protocols

### Real-Time Data Strategy

| Component | Protocol | Latency | Bandwidth |
|-----------|----------|---------|-----------|
| **Quotes, Positions** | WebSocket | < 100ms | Optimized (batched) |
| **REST API** | HTTP/2 (Hypercorn) | 10-50ms | Multiplexed |
| **Charts** | HTTP + REST | 20-100ms | Efficient |

## 📊 Key Endpoints

### Authentication
- `POST /api/auth/login` - Login with MT5 credentials
- `POST /api/auth/logout` - Logout and cleanup

### Symbols
- `GET /api/symbols/all` - Get all symbols grouped by category
- `GET /api/symbols/search?query=EUR` - Search symbols
- `GET /api/symbols/categories` - Get category metadata
- `GET /api/symbols/cache/refresh` - Refresh symbol cache from MT5

### Watchlist
- `GET /api/watchlist/` - Get user's watchlist
- `POST /api/watchlist/add` - Add symbol to watchlist
- `DELETE /api/watchlist/{symbol_name}` - Remove symbol
- `GET /api/watchlist/categories` - Get watchlist grouped by category

### Account
- `GET /api/account/info` - Get account balance, equity, margin
- `GET /api/account/positions` - Get open positions
- `GET /api/account/history` - Get account state history

### Candles
- `GET /api/candles/{symbol}?timeframe=1h&count=100` - Get OHLC candlestick data
  - Timeframes: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`
  - Count: 1-1000 candles (default: 100)
  - Returns: Candlestick data with time, open, high, low, close, volume

### WebSocket
- `WS /ws?token=<jwt_token>` - Connect for real-time updates

## 🔒 Security Features

- **Encrypted Credentials**: MT5 passwords encrypted at rest using `cryptography.Fernet`
- **JWT Tokens**: Short-lived access tokens (default 8 hours)
- **CORS**: Origin whitelist for frontend connections
- **Input Validation**: Pydantic models validate all API inputs

**Note**: For production, update `SECRET_KEY` in `.env` and use environment-specific configurations.

## 🛠️ Development

### Project Structure Rationale

- **Backend**:
  - SQLModel for async ORM with type hints
  - FastAPI for high-performance async HTTP + WebSocket
  - MT5 adapter pattern for clean separation of concerns
  - Per-account WebSocket subscriptions

- **Frontend**:
  - React + TypeScript for type-safe components
  - Zustand for lightweight global state
  - Vite for fast dev experience
  - Dark theme CSS variables for easy customization

### Extending the Project

1. ✅ **Live Chart Data with Real MT5 Data**: Candlestick endpoint implemented and connected to frontend
2. **Add Order Placement**: Implement endpoints in `backend/app/api/` to place buy/sell orders via MT5
3. **User Profiles**: Add database persistence for saved layouts, preferences
4. **Multi-Account**: Support multiple MT5 accounts per user (partially implemented)
5. **Analytics**: Add P&L charts, trading statistics, risk metrics
6. **Advanced Chart Features**: Add indicators (MA, RSI, MACD) using TradingView plugins

## 🧪 Testing & Verification

1. **Symbols Load**: Login and verify watchlist symbols appear in categories
2. **Live Prices**: Watch bid/ask prices update in real-time
3. **Watchlist Add/Remove**: Add symbol to watchlist → verify it appears; remove → verify it disappears
4. **Account Updates**: Place test trade in MT5 terminal → verify balance updates in dashboard within 2 seconds
5. **Chart with Real MT5 Data**: Select symbol from watchlist → chart displays with real candlestick data from MT5
6. **Timeframes**: Click timeframe buttons (1m, 5m, 15m, 1h, 4h, 1d) → chart updates with MT5 data for selected timeframe
7. **Chart Error Handling**: Try symbol that doesn't exist → verify error message displays properly
8. **Reconnect**: Disconnect network → verify "Disconnected" status; reconnect → auto-reconnect succeeds

##Troubleshooting

| Issue | Solution |
|-------|----------|
| "MT5 initialization failed" | Ensure MetaTrader 5 terminal is running and connected |
| "Invalid MT5 credentials" | Double-check server, account number, and password |
| "WebSocket connection failed" | Verify backend is running and `VITE_API_URL` in frontend `.env.local` is correct |
| "CORS error" | Update `CORSMiddleware` in `backend/app/main.py` with your frontend URL |
| "Database locked" | Delete `backend/database.db` and restart backend |

## 📚 Stack Overflow & References

- [FastAPI WebSocket Docs](https://fastapi.tiangolo.com/advanced/websockets/)
- [MetaTrader5 Python Docs](https://www.mql5.com/en/docs/integration/python_metatrader5)
- [SQLModel Docs](https://sqlmodel.tiangolo.com/)
- [React Hooks Docs](https://react.dev/reference/react)
- [Zustand Docs](https://github.com/pmndrs/zustand)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/)

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please fork, create a feature branch, and open a PR.

---

**Happy trading! 📈**
