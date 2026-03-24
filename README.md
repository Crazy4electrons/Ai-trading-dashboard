# TradeMatrix — Trading Dashboard

Real-time trading dashboard with MT5 integration, news feed, AI analysis, and advanced chart overlays.

## Tech Stack
- **Frontend**: React + Vite, lightweight-charts
- **Backend**: Node.js + Express + WebSocket
- **Data**: MetaTrader 5 (Python library), NewsAPI, OpenAI / Anthropic Claude

## Project Structure
```
trading-dashboard/
├── README.md
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── routes/
│   │   ├── ai.js
│   │   ├── mt5.js
│   │   └── news.js
│   ├── services/
│   │   ├── aiService.js
│   │   ├── mt5Service.js
│   │   └── newsService.js
│   └── python/
│       ├── mt5_bridge.py          ← Python MT5 bridge
│       ├── requirements.txt        ← Python dependencies
│       └── README.md              ← Python setup guide
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── TradingChart.jsx        ← Market Profile + Sessions
        │   ├── AccountPanel.jsx
        │   ├── AIAnalysisTab.jsx
        │   ├── Header.jsx
        │   ├── IndicatorPills.jsx
        │   ├── NewsTab.jsx
        │   ├── OrderModal.jsx
        │   ├── SettingsModal.jsx
        │   ├── SignalsTab.jsx
        │   ├── SymbolsList.jsx
        │   ├── TabsSection.jsx
        │   └── Watchlist.jsx
        ├── context/AppContext.jsx
        ├── hooks/useMT5.js, useNews.js
        ├── styles/globals.css
        └── utils/indicators.js, signals.js, symbols.js
```

## Setup

### Prerequisites
- Node.js 18+
- Python 3.8+ (with pip or uv)
- MetaTrader 5 terminal installed and running locally
- NewsAPI key → https://newsapi.org
- OpenAI or Anthropic API key (optional for AI analysis)
- (Optional) uv for faster Python package management → https://astral.sh/blog/uv

### Quick Setup (Automated)

**Windows:**
```bash
setup_python.bat
```

**macOS/Linux:**
```bash
bash setup_python.sh
```

This will check Python and install the MetaTrader5 library automatically.

### Manual Setup

#### 1. Install Python MetaTrader5 Library

**Using uv (recommended - fastest):**
```bash
uv pip install MetaTrader5
```

**Or using pip:**
```bash
pip install MetaTrader5
```

**Or using requirements file:**
```bash
pip install -r backend/python/requirements.txt
# or with uv:
uv pip install -r backend/python/requirements.txt
```

#### 2. Backend
```bash
cd backend
npm install
cp env.example .env
# Edit .env with your MT5 account credentials and API keys
npm run dev
```

#### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`, backend at `http://localhost:3001`

**Python Bridge Location:** `backend/python/`
- See `backend/python/README.md` for troubleshooting

## Environment Variables

| Variable | Description |
|---|---|
| `MT5_ACCOUNT` | Your MetaTrader 5 account number |
| `MT5_PASSWORD` | Your MT5 terminal password |
| `MT5_SERVER` | MT5 server (default: MetaQuotes-Demo) |
| `NEWS_API_KEY` | NewsAPI.org key |
| `OPENAI_API_KEY` | OpenAI key (optional) |
| `ANTHROPIC_API_KEY` | Anthropic Claude key (optional) |
| `PORT` | Backend port (default 3001) |

## MetaTrader 5 Setup

The dashboard connects directly to your local MT5 terminal using the Python MetaTrader5 library.

### Steps:
1. **Install MetaTrader 5** - Download from your broker or MetaQuotes
2. **Start MT5 Terminal** - Keep it running while using the dashboard
3. **Get Account Credentials** - In MT5, go to Tools → Options → Account to find your account number
4. **Enter in Settings** - Go to Settings → Account in the dashboard to enter your MT5 credentials
5. Test the connection with the "Test Connection" button

## Chart Overlay Features

### Market Profile (MP button)
- Left-side volume histogram (30 price buckets)
- Red bar = POC (Point of Control); blue bars = Value Area (70% volume)
- Volume numbers shown inside bars
- POC dashed line extends across entire chart with price label
- Purple dashed vertical line marks the start of the profile period
- Toggle with `MP` button; switch period with `1D`/`1W` amber button

### Market Sessions (SES button)
- Dotted vertical lines at each session open
- Session name + local time shown at top of each line
- Auto-detects Forex sessions (Sydney/Tokyo/London/New York) vs Crypto sessions (8h blocks)
- Toggle with `SES` button

---

## TODO

### High Priority
- [ ] Persist drawings to localStorage
- [ ] Fix Market Profile Y-alignment on price-axis vertical drag
- [ ] Hide session lines on Daily/Weekly timeframes (intraday only)
- [ ] WebSocket reconnect with exponential backoff
- [x] Integrate MetaTrader5 Python library

### Medium Priority
- [ ] EMA/SMA overlay lines on candlestick chart
- [ ] Price + indicator alert system
- [ ] Export chart as PNG
- [ ] Additional themes (light, high-contrast)

### Low Priority
- [ ] Mobile-responsive layout
- [ ] Drag-to-reorder watchlist
- [ ] Sound alerts on signal change
- [ ] News image thumbnails