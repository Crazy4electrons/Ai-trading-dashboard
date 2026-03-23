# Trading Dashboard

A real-time trading dashboard with MT5 integration, news feed, and AI analysis.

## Tech Stack
- **Frontend**: React + Vite, lightweight-charts, MetaApi CDN
- **Backend**: Node.js + Express + WebSocket
- **Data**: MetaApi.cloud (MT5), NewsAPI, OpenAI/Claude

## Project Structure
```
trading-dashboard/
├── backend/          # Express API + WebSocket server
│   ├── routes/       # REST endpoints
│   ├── services/     # MT5, News integrations
│   └── server.js
└── frontend/         # React app
    └── src/
        ├── components/
        ├── context/
        ├── hooks/
        └── utils/
```

## Setup

### Prerequisites
- Node.js 18+
- MetaApi.cloud account → https://metaapi.cloud
- NewsAPI key → https://newsapi.org
- OpenAI or Anthropic API key

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env   # Fill in your keys
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`, backend at `http://localhost:3001`.

## Environment Variables (backend/.env)

| Variable | Description |
|---|---|
| `META_API_TOKEN` | MetaApi.cloud API token |
| `MT5_ACCOUNT_ID` | Your MT5 account ID on MetaApi |
| `NEWS_API_KEY` | NewsAPI.org key |
| `OPENAI_API_KEY` | OpenAI key (for AI analysis) |
| `ANTHROPIC_API_KEY` | Anthropic key (optional alternative) |
| `PORT` | Backend port (default 3001) |

## MetaApi Setup
1. Sign up at https://metaapi.cloud
2. Connect your MT5 broker account
3. Copy the Account ID and API token to `.env`

## Notes
- MT5 uses MetaApi as the bridge (supports all MT5 brokers)
- News sentiment uses basic keyword analysis + AI when key is set
- All API keys are managed via the Settings modal in the UI
