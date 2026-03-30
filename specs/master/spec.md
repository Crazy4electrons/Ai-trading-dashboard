# Feature Specification: Real-Time Trading Data & Watchlists

**Feature**: Real-time market data delivery and watchlist management for TradeMatrix trading dashboard  
**Version**: 1.0.0  
**Date**: 2026-03-29  
**Status**: SPECIFICATION  
**Scope**: Full-stack (Backend: FastAPI + MT5; Frontend: React + TradingView Charts)

---

## Executive Summary

Enable traders to receive live market data (quotes, candlesticks, account updates) through WebSocket streaming and manage custom watchlists synchronized across sessions. The feature prioritizes **real-time responsiveness** with sub-100ms API latency and sub-50ms WebSocket updates, enforces **security** through JWT authentication and encrypted MT5 credentials, ensures **integration reliability** via MT5 adapter with exponential backoff retry logic, maintains **data integrity** through atomic transactions and cache consistency, and provides **observability** via structured logging and admin panel diagnostics.

---

## 1. User Scenarios

### Scenario 1: Live Market Data Streaming
**Actor**: Trader (authenticated user)  
**Goal**: View real-time quotes and candlestick data for trading symbols without manual refresh  
**Preconditions**: 
- User is logged in with valid JWT token
- MT5 terminal is connected and subscribed to symbols
- WebSocket connection is established

**Main Flow**:
1. User opens Dashboard and selects a symbol (e.g., EURUSD)
2. System establishes WebSocket subscription for quotes (bid, ask, time) and 1m/5m/15m candlesticks
3. Backend queries MT5 adapter for current data and initializes cache
4. Real-time updates stream via WebSocket at 100ms batching intervals
5. Frontend renders TradingView Lightweight Chart with live data
6. User adds additional symbols; each is subscribed independently

**Alternative Flow (Cache Fallback)**:
1. MT5 connection temporarily unavailable
2. Backend serves cached data from last successful sync
3. WebSocket indicates "stale" status to frontend
4. Frontend displays cached data with visual warning
5. Automatic retry logic reconnects to MT5 within 60s

**Postconditions**:
- Chart displays bid/ask prices updated < 50ms after MT5 feed
- Candlesticks automatically aggregate without user action
- No data loss during WebSocket reconnection

---

### Scenario 2: Watchlist Creation & Synchronization
**Actor**: Trader (authenticated user)  
**Goal**: Create and maintain custom watchlists (e.g., "Morning Pairs", "Pennies") persistent across sessions  
**Preconditions**:
- User is authenticated
- Database is accessible
- Trader has created account instance

**Main Flow**:
1. User clicks "New Watchlist" and names it "Momentum Pairs"
2. User adds symbols via search or paste (EURUSD, GBPUSD, AUDUSD)
3. System validates symbols exist in MT5 and creates watchlist record (atomic transaction)
4. Watchlist appears in sidebar; user can switch between watchlists
5. Selecting watchlist triggers WebSocket subscription to all contained symbols
6. User closes browser; watchlist persists in database
7. Next session: watchlist auto-loads with same symbols subscribed

**Alternative Flow (Symbol Validation)**:
1. User attempts to add invalid symbol (e.g., "FAKE123")
2. Backend queries MT5 adapter; symbol not found
3. System returns validation error to frontend
4. User corrects input; symbol validated and added

**Postconditions**:
- Watchlist record created in database with user_id foreign key
- Watchlist symbols persisted in watchlist_symbols junction table
- WebSocket subscriptions update to include all new symbols
- Next login: watchlist restored with same symbols

---

### Scenario 3: Real-Time Account Updates
**Actor**: Trader (authenticated user)  
**Goal**: Track live account balance, open positions, and trade history as trades execute  
**Preconditions**:
- User is authenticated and logged into MT5 terminal
- Account has active positions or pending trades
- WebSocket is connected

**Main Flow**:
1. User opens Account Panel (account balance, equity, margin stats)
2. Backend cache_worker polls MT5 account info every 100ms
3. Changes detected (e.g., position closed, new trade) trigger WebSocket update to user
4. Frontend updates Account Panel displays (balance, free margin, drawdown %)
5. User executes trade in MT5 terminal
6. Position appears in Account Panel within 50ms
7. User opens position details; trade history shows up-to-date entry/exit stats

**Postconditions**:
- Account balance reflects latest MT5 state (< 50ms latency)
- Open positions sync bidirectionally
- Trade history accessible with pagination
- Zero data loss on position closure

---

### Scenario 4: WebSocket Disconnection & Graceful Degradation
**Actor**: Trader (authenticated user) + System (background recovery)  
**Goal**: Maintain usability and data integrity when WebSocket drops or MT5 becomes unavailable  
**Preconditions**:
- Real-time stream is active
- Network interruption or MT5 connection failure occurs

**Main Flow**:
1. WebSocket disconnection detected by frontend
2. Frontend UI displays "Connecting..." status badge
3. Backend continues serving cached data to reconnected clients
4. Automatic exponential backoff retry: attempt 1 at 1s, 2 at 2s, 4 at 4s... up to 60s
5. MT5 adapter reconnects; latest quote synced to cache
6. WebSocket re-establishes; frontend receives "connected" status + full data sync
7. Frontend clears "Connecting..." badge and resumes real-time updates

**Postconditions**:
- User never sees broken chart (cached data always available)
- Reconnection transparent to user
- No data corruption or drift on cache/live data mismatch

---

## 2. Acceptance Criteria

### Real-Time Data Delivery
- [ ] **AC1.1**: WebSocket updates deliver quotes within 50ms of MT5 data availability (measured from WebSocket timestamp)
- [ ] **AC1.2**: Candlestick aggregation completes within 100ms for 1m, 5m, 15m timeframes
- [ ] **AC1.3**: API endpoint `/api/quotes/{symbol}` responds within 100ms (p95)
- [ ] **AC1.4**: Multiple concurrent WebSocket clients (100+) handled without degradation
- [ ] **AC1.5**: Quote updates include bid, ask, time, volume fields; candlesticks include O/H/L/C/V

### Watchlist Management
- [ ] **AC2.1**: Create watchlist with up to 100 symbols without error
- [ ] **AC2.2**: Symbol validation rejects invalid symbols; accepts all MT5-registered symbols
- [ ] **AC2.3**: Watchlist persists after logout/login cycle
- [ ] **AC2.4**: Rename/delete watchlist operations complete in < 200ms
- [ ] **AC2.5**: Switching watchlists updates WebSocket subscriptions within 100ms
- [ ] **AC2.6**: Watchlist symbols sync with MT5 symbol master list; missing symbols indicated

### Security & Authentication
- [ ] **AC3.1**: All endpoints require valid JWT token; invalid tokens rejected (401)
- [ ] **AC3.2**: MT5 credentials encrypted at rest using Fernet; never logged or exposed
- [ ] **AC3.3**: User can only access own watchlists and account data (403 for unauthorized access)
- [ ] **AC3.4**: WebSocket connection authenticated on handshake; unauthenticated connections rejected
- [ ] **AC3.5**: HTTPS enforced in production; WebSocket uses WSS

### Data Integrity & Consistency
- [ ] **AC4.1**: Candlestick data immutable after N-1 candle close (where N is current candle)
- [ ] **AC4.2**: Running candle (N) updates atomically; no partial updates visible to frontend
- [ ] **AC4.3**: Database transactions for watchlist updates are atomic (all-or-nothing)
- [ ] **AC4.4**: Quote cache TTL enforced; stale data > 5 minutes triggers MT5 refresh
- [ ] **AC4.5**: Account balance calculated deterministically from trade history; no drift

### Integration Reliability (MT5)
- [ ] **AC5.1**: MT5 connection failures trigger automatic exponential backoff retry (max 60s)
- [ ] **AC5.2**: Failed MT5 operations don't crash backend; error logged + graceful fallback
- [ ] **AC5.3**: Cache syncs asynchronously; UI never blocks on MT5 I/O
- [ ] **AC5.4**: Symbol subscription changes queued and batched to MT5 (max delay 1s)
- [ ] **AC5.5**: Terminal disconnection detected within 5s; users notified via WebSocket

### Observability & Debugging
- [ ] **AC6.1**: All operations logged with INFO/DEBUG/ERROR levels, contextualized (user_id, account_id, symbol)
- [ ] **AC6.2**: Admin panel displays WebSocket connection count, active subscriptions, cache status
- [ ] **AC6.3**: Performance metrics tracked: API response times, WebSocket latency, MT5 query times
- [ ] **AC6.4**: Cache worker logs state transitions (fetch, hit, stale, refresh)
- [ ] **AC6.5**: WebSocket disconnection/reconnection events logged with reason codes

---

## 3. Functional Requirements

### 3.1 Real-Time Responsiveness (Constitution: NON-NEGOTIABLE)

**REQ-RT1**: **WebSocket Quote Streaming**
- Implement WebSocket endpoint (`/ws/quotes`) that accepts quote subscription message: `{action: "subscribe", symbols: ["EURUSD", "GBPUSD"]}`
- Backend batches quote updates at 100ms intervals to optimize throughput
- Each batch includes: symbol, bid, ask, time, last_volume
- Latency target: < 50ms from MT5 data available to WebSocket delivery
- Support unsubscribe action: `{action: "unsubscribe", symbols: ["EURUSD"]}`

**REQ-RT2**: **Candlestick Aggregation**
- Backend aggregates raw quotes into candlesticks (1m, 5m, 15m timeframes)
- Complete candlesticks (closed) are immutable; running candle updates atomically
- Candlestick fields: symbol, timeframe, open, high, low, close, volume
- Candle closure triggers WebSocket notification to subscribed clients
- Aggregation latency: < 100ms from quote receipt to closed candlestick availability

**REQ-RT3**: **Polling Service Synchronization**
- Background cache_worker polls MT5 terminal every 100ms for subscribed symbols
- Polling hits retry exponential backoff on failure (1s, 2s, 4s... up to 60s max)
- Polling results cached in SQLite with TTL of 5 minutes
- Cache misses trigger immediate MT5 query (not queued)

**REQ-RT4**: **Push vs. Pull Strategy**
- WebSocket (push) primary channel for real-time updates (quotes, candlesticks, account)
- REST API (pull) secondary for historical data and on-demand queries
- Frontend polls API only for non-critical data (e.g., symbol search results)

---

### 3.2 Security & Authentication (Constitution: CRITICAL)

**REQ-SEC1**: **JWT Authentication**
- All API endpoints except `/auth/login` require `Authorization: Bearer <token>` header
- Token payload includes: user_id, role (admin/user), exp (expiration)
- Token refresh endpoint (`/auth/refresh`) extends session without re-login
- Invalid/expired tokens return 401 Unauthorized

**REQ-SEC2**: **WebSocket Authentication**
- WebSocket handshake includes JWT token in query parameter or header
- Backend validates token before accepting subscriptions
- Unauthenticated WebSocket connections receive 403 Forbidden + disconnect
- Token expiration during session: frontend receives 401 message, prompts login

**REQ-SEC3**: **MT5 Credential Encryption**
- MT5 login and password encrypted using Fernet (cryptography library) at rest
- Encryption key stored in environment variable `FERNET_KEY` (never in code)
- Decryption occurs only during MT5 terminal login (in-memory, never logged)
- Sensitive error messages (e.g., "MT5 login failed") don't expose credentials

**REQ-SEC4**: **Role-Based Access Control**
- User cannot access watchlists, account data, or positions belonging to other users (403)
- Admin role required for `/api/admin/*` endpoints (terminal management, cache diagnostics)
- Watchlist sharing: NEEDS CLARIFICATION (if planned, define ownership model)

**REQ-SEC5**: **HTTPS/WSS Enforcement**
- Production deployment: all HTTP traffic redirected to HTTPS (301)
- WebSocket connections use WS (dev/test) or WSS (prod)
- Certificate management: NEEDS CLARIFICATION (self-signed, Let's Encrypt, CA-signed)

---

### 3.3 Integration Reliability (MT5 First)

**REQ-IR1**: **MT5 Adapter Resilience**
- All MT5 operations (login, get_symbol_info, get_rates, get_positions) wrapped in try-catch
- Connection failures trigger automatic retry with exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s (capped)
- After 60s max backoff, service logs ERROR and notifies admin panel; retries continue indefinitely
- Temporary failures don't propagate to frontend; cached data served instead

**REQ-IR2**: **Graceful Degradation**
- MT5 unavailable: backend returns cached quote/candle data with "stale" timestamp indicator
- Frontend renders chart with visual indicator (e.g., gray overlay, "Cached Data" label)
- User can still interact with watchlists, account panel (reads only); no modifications
- Once MT5 reconnects, data re-syncs transparently; "stale" indicator cleared

**REQ-IR3**: **Connection State Management**
- Terminal maintains state: CONNECTED, CONNECTING, DISCONNECTED, ERROR
- State transitions logged with timestamp and reason (e.g., "socket timeout", "auth failure")
- Admin panel displays current state; users notified of disconnected state via WebSocket status message
- Terminal auto-reconnect attempts continue in background even if user session active

**REQ-IR4**: **Symbol Subscription Queueing**
- WebSocket subscription requests (add/remove symbols) queued by backend
- Queue batched and sent to MT5 adapter every 1s or when queue size > 10
- Batching reduces MT5 adapter stress; latency remains acceptable for users

---

### 3.4 Data Integrity & Consistency

**REQ-DI1**: **Atomic Watchlist Operations**
- Watchlist CRUD operations (Create, Read, Update, Delete) wrapped in database transactions
- Watchlist + watchlist_symbols records created/updated atomically
- Partial updates never exposed; rollback on any constraint violation (e.g., duplicate symbol)

**REQ-DI2**: **Candlestick Immutability**
- Closed candlesticks (older than 1 minute) never updated after initial write
- Running candle (current minute) updates atomically: entire O/H/L/C/V record modified together
- Frontend never sees half-written candlesticks (e.g., close updated but high still old)

**REQ-DI3**: **Cache Consistency**
- Quote cache TTL: 5 minutes
- Stale entries detected and refreshed on next read or periodic background sync
- Cache key: `{symbol}:{timeframe}` (e.g., `EURUSD:1m`)
- No manual cache invalidation; TTL-based expiration automated

**REQ-DI4**: **Account Balance Determinism**
- Account balance calculated from authoritative trade history
- No separate balance record; derived from closed trades + open positions
- Recalculation on every account refresh ensures consistency
- Division of labor: cache_worker (schedule), MT5 adapter (query), models (calculation)

**REQ-DI5**: **Race Condition Prevention**
- Database uses pessimistic locking (SELECT FOR UPDATE) for watchlist operations
- Polling service uses per-symbol locks to prevent concurrent MT5 queries
- WebSocket updates use atomic Redis operations or database transactions (NEEDS CLARIFICATION: Redis planned?)

---

### 3.5 Observability & Debugging

**REQ-OBS1**: **Structured Logging**
- All operations log with format: `{timestamp, level, service, user_id, account_id, symbol, message, error_code}`
- Levels: DEBUG (detailed flow), INFO (state transitions), ERROR (failures)
- No sensitive data in logs (credentials, tokens, full account balances)
- Log aggregation/search available in admin panel (NEEDS CLARIFICATION: ELK, Datadog, etc.)

**REQ-OBS2**: **Admin Panel Diagnostics**
- Admin panel endpoint (`/api/admin/status`) returns:
  - WebSocket connection count
  - Active symbol subscriptions
  - Cache hit rate (%)
  - MT5 terminal state + last poll timestamp
  - Polling backoff state (attempt count, next retry time)
- Real-time updates via admin WebSocket subscription

**REQ-OBS3**: **Performance Metrics**
- Metrics tracked per operation type:
  - API response times (histogram: p50, p95, p99)
  - WebSocket message latency (from receipt to publishing)
  - MT5 adapter query times
  - Cache hit/miss counts
- Metrics exposed via `/metrics` endpoint (Prometheus format) for monitoring

**REQ-OBS4**: **WebSocket Event Logging**
- Log on connection: `user_id, IP, symbols subscribed`
- Log on disconnection: reason (normal close, timeout, auth failure, network error)
- Log on resubscription: trigger (reconnect, watchlist switch, manual)

**REQ-OBS5**: **State Transition Logging**
- Cache worker: log every fetch → hit/miss → stale check → refresh cycle
- Polling service: log backoff state changes (attempt count, delay)
- Terminal connection: log CONNECTING → CONNECTED/DISCONNECTED transitions

---

## 4. Key Entities

### 4.1 Database Models (SQLModel)

#### **Watchlist**
```
id: int (primary key)
user_id: int (foreign key → user)
name: str (max 100 chars)
description: str (optional, max 500 chars)
created_at: datetime
updated_at: datetime
created_by: str (username, audit trail)
```

#### **WatchlistSymbol** (junction table)
```
id: int (primary key)
watchlist_id: int (foreign key → watchlist)
symbol: str (e.g., "EURUSD")
order_index: int (sort order)
added_at: datetime
```

#### **Quote** (cache)
```
id: int (primary key)
symbol: str (unique within timeframe context)
bid: float
ask: float
last_volume: int
time: datetime (MT5 server time)
cached_at: datetime
ttl_expires_at: datetime (computed: cached_at + 5 min)
```

#### **Candlestick** (cache)
```
id: int (primary key)
symbol: str
timeframe: str (1m, 5m, 15m)
open: float
high: float
low: float
close: float
volume: int
open_time: datetime (candle start)
close_time: datetime (candle end)
is_running: bool (true if current, false if closed)
cached_at: datetime
ttl_expires_at: datetime
```

#### **SymbolInfo** (metadata)
```
id: int (primary key)
symbol: str (unique)
description: str (e.g., "Euro vs US Dollar")
bid: float (latest)
ask: float (latest)
digits: int (decimal places)
point: float (min price movement)
spread: int (pips)
last_updated: datetime
```

#### **Account** (reference)
```
id: int (primary key)
user_id: int (foreign key → user)
account_number: int (MT5 account ID)
balance: float (derived from trades)
equity: float (balance + open P&L)
free_margin: float
margin_level: float
last_synced: datetime
```

#### **Position** (reference)
```
id: int (primary key)
account_id: int (foreign key → account)
ticket: int (MT5 position ID)
symbol: str
type: str (BUY/SELL)
volume: float
entry_price: float
current_price: float
profit_loss: float
opened_at: datetime
last_updated: datetime
```

---

### 4.2 API Contracts

#### **WebSocket Messages**

**Client → Server (Quote Subscription)**
```json
{
  "action": "subscribe",
  "symbols": ["EURUSD", "GBPUSD"]
}
```

**Server → Client (Quote Update)**
```json
{
  "type": "quote_update",
  "data": {
    "symbol": "EURUSD",
    "bid": 1.0847,
    "ask": 1.0849,
    "time": "2026-03-29T15:30:45.123Z",
    "volume": 5000
  }
}
```

**Server → Client (Candlestick Update)**
```json
{
  "type": "candlestick_update",
  "data": {
    "symbol": "EURUSD",
    "timeframe": "5m",
    "open": 1.0840,
    "high": 1.0852,
    "low": 1.0838,
    "close": 1.0847,
    "volume": 150000,
    "open_time": "2026-03-29T15:30:00Z",
    "close_time": "2026-03-29T15:35:00Z",
    "is_running": false
  }
}
```

**Server → Client (Account Update)**
```json
{
  "type": "account_update",
  "data": {
    "balance": 50000.00,
    "equity": 51250.50,
    "free_margin": 45000.00,
    "margin_level": 1000.5,
    "timestamp": "2026-03-29T15:30:45.123Z"
  }
}
```

**Server → Client (Connection Status)**
```json
{
  "type": "connection_status",
  "status": "connected",
  "message": "WebSocket established",
  "mt5_terminal_state": "CONNECTED"
}
```

#### **REST API Endpoints**

| Method | Endpoint | Description | Auth | Response Time Target |
|--------|----------|-------------|------|----------------------|
| POST | `/auth/login` | Authenticate user | - | < 500ms |
| POST | `/auth/refresh` | Refresh JWT token | JWT | < 100ms |
| GET | `/api/symbols` | List all MT5 symbols | JWT | < 200ms |
| GET | `/api/quotes/{symbol}` | Get latest quote | JWT | < 100ms |
| GET | `/api/candlesticks/{symbol}` | Get 1m/5m/15m candlesticks (limit 100) | JWT | < 200ms |
| GET | `/api/account/balance` | Get account balance + equity | JWT | < 100ms |
| GET | `/api/account/positions` | Get open positions | JWT | < 200ms |
| POST | `/api/watchlists` | Create watchlist | JWT | < 200ms |
| GET | `/api/watchlists` | List user's watchlists | JWT | < 100ms |
| GET | `/api/watchlists/{id}` | Get watchlist + symbols | JWT | < 100ms |
| PUT | `/api/watchlists/{id}` | Update watchlist (name/desc) | JWT | < 200ms |
| DELETE | `/api/watchlists/{id}` | Delete watchlist | JWT | < 200ms |
| POST | `/api/watchlists/{id}/symbols` | Add symbols to watchlist | JWT | < 200ms |
| DELETE | `/api/watchlists/{id}/symbols/{symbol}` | Remove symbol from watchlist | JWT | < 200ms |
| GET | `/api/admin/status` | Get system diagnostics (admin only) | JWT + Admin | < 100ms |
| GET | `/metrics` | Prometheus metrics | - | < 100ms |

---

## 5. Unclear Areas Requiring Clarification

### NEEDS CLARIFICATION: Scale & Capacity

- [ ] **User Count**: How many concurrent users supported? (Current design assumes < 1000)
- [ ] **Symbol Coverage**: How many symbols should backend cache? (All MT5 symbols or subset?)
- [ ] **Watchlist Limits**: Max symbols per watchlist? Max watchlists per user?
- [ ] **Historical Data**: Should customers retrieve candlesticks beyond last 5 minutes? (Design currently cached only)
- [ ] **Data Retention**: How long to retain historical quotes/candlesticks in database? (Archive/purge policy)

### NEEDS CLARIFICATION: Trading Functionality Scope

- [ ] **Order Placement**: Should this feature include placing trades, or read-only dashboard only?
- [ ] **Alerts**: Should users receive notifications for price targets, position milestones?
- [ ] **Drawing Tools**: Should TradingView chart include drawing tools (trendlines, support/resistance)?

### NEEDS CLARIFICATION: Platform & Deployment

- [ ] **Mobile Support**: Should frontend support iOS/Android native apps, or web-only?
- [ ] **Offline Mode**: Should dashboard cache data locally for offline viewing?
- [ ] **Multi-Tenancy**: Single account per user, or support multiple MT5 accounts?
- [ ] **Audit Trail**: How deep should audit logging go? (Every read, or only writes?)

### NEEDS CLARIFICATION: Redis/External Cache

- [ ] **Distributed Caching**: Should use Redis for quote/candle cache instead of SQLite?
- [ ] **Session Store**: Should JWT tokens stored in Redis for invalidation/logout?
- [ ] **Rate Limiting**: Apply rate limits to API endpoints? (If yes, Redis-backed needed)

### NEEDS CLARIFICATION: Error Handling & Fallback

- [ ] **Partial Data**: If MT5 returns partial symbol list, return error or gracefully degrade?
- [ ] **Stale Threshold**: How old can cached data be before marked as "stale"? (Currently 5 min, configurable?)
- [ ] **Watchlist Sync Failures**: If add-to-watchlist fails mid-operation, show error or retry?

### NEEDS CLARIFICATION: Admin Panel Features

- [ ] **Terminal Control**: Should admin have ability to forcefully reconnect terminal, or read-only?
- [ ] **User Management**: Should admin manage user accounts, reset passwords, disable users?
- [ ] **Cache Management**: Should admin have manual cache invalidation/refresh controls?

### NEEDS CLARIFICATION: Performance Tuning

- [ ] **Batching Strategy**: 100ms batching interval configurable or fixed?
- [ ] **Symbol Subscription Limits**: Max symbols per WebSocket client? (NEEDS CLARIFICATION: auto-unsubscribe old symbols?)
- [ ] **Polling Frequency**: Should polling interval vary by symbol importance/volume?

### NEEDS CLARIFICATION: Data Model Decisions

- [ ] **Candlestick Storage**: Store candlesticks in database (disk) or only in-memory cache?
- [ ] **Quote History**: Keep running history of quotes (disk), or only latest (cache)?
- [ ] **Position History**: Archive closed positions or delete after N days?

---

## 6. Technical Design Decisions

### 6.1 Architecture Pattern: Cache-Aside with Real-Time Push

**Decision**: Use WebSocket push (primary) + REST pull (secondary) + background polling.

**Rationale**:
- Real-time responsiveness (Const. I) requires push for latency < 50ms
- Polling service (cache worker) decouples MT5 queries from request path
- Cache-aside pattern (query on demand, refresh on stale) balances memory vs. freshness
- REST API fallback for clients unable to maintain WebSocket (e.g., external integrations)

---

### 6.2 Database: SQLite with TTL-based Cache Expiration

**Decision**: Use SQLite for watchlist persistence and cache storage; implement TTL via `ttl_expires_at` column + background cleanup job.

**Rationale**:
- SQLite sufficient for single-account or small multi-account setups
- Foreign keys enforce data integrity (watchlist → user)
- TTL column allows selective re-queries without full cache purge
- Background job runs every 5 minutes; removes expired entries
- Redis alternative: NEEDS CLARIFICATION (complexity tradeoff)

---

### 6.3 MT5 Adapter: Exponential Backoff with State Machine

**Decision**: MT5 adapter maintains connection state; failed operations trigger retry with exponential backoff capped at 60s.

**Rationale**:
- Terminal connections often temporary (socket timeout, MT5 restart); exponential backoff avoids hammering server
- 60s cap balances recovery time vs. responsiveness goal
- State machine (CONNECTED/CONNECTING/DISCONNECTED) simplifies error handling
- Decouples MT5 glitches from frontend; cached data always available

---

### 6.4 Watchlist Synchronization: Local Database + WebSocket Invalidation

**Decision**: Watchlist changes written to database; WebSocket notifies client to refresh; client re-subscribes to new symbols.

**Rationale**:
- Database is source of truth (survives disconnects)
- WebSocket avoids polling for manual watchlist edits
- Client re-subscription ensures symbol updates without server-side subscribe tracking
- Scales better than server tracking all client subscriptions

---

### 6.5 Candlestick Aggregation: Backend (not Frontend)

**Decision**: Backend aggregates quotes into candlesticks; frontend consumes candlestick stream.

**Rationale**:
- Ensures all clients see identical candlesticks (no clock skew, aggregation variance)
- Reduces frontend compute burden
- Immutable closed candlesticks prevent errors from incomplete aggregation
- Running candle updates maintain data freshness

---

## 7. Acceptance Testing Strategy

### Unit Tests
- models.py: Validate candlestick aggregation, account balance calculation (NEEDS CLARIFICATION: pytest fixtures)
- security.py: Validate JWT token creation/validation, Fernet encryption/decryption
- services/: Validate MT5 adapter retry logic, cache worker state transitions

### Integration Tests
- API endpoints: Test authentication, response times, error handling
- WebSocket: Test subscription/unsubscription, message ordering, disconnection recovery
- Database: Test watchlist CRUD atomicity, foreign key constraints
- MT5 integration: Test with demo terminal (simulate connect/disconnect, quote updates)

### Performance Tests
- Load test WebSocket with 100+ concurrent clients; verify < 50ms update latency
- Load test API with 1000 req/s; verify p95 < 100ms
- Memory profiling: Verify cache doesn't grow unbounded

### Manual Testing Checklist
- [ ] Open 2 browser windows; verify watchlist sync across windows
- [ ] Disconnect MT5 terminal; verify UI shows "Cached Data", auto-reconnects
- [ ] Add 50 symbols to watchlist; verify WebSocket subscriptions update within 1s
- [ ] Export quote data; verify 15-minute history completeness

---

## 8. Success Metrics & KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| WebSocket Update Latency (p95) | < 50ms | Backend time-series logs |
| API Response Time (p95) | < 100ms | Prometheus histograms |
| Cache Hit Rate | > 90% | cache_worker logs |
| MT5 Connection Uptime | > 99.5% | state transition logs |
| Watchlist Creation Time | < 200ms | API response time log |
| Symbol Subscription Delay | < 100ms | WebSocket event timestamps |
| Admin Panel Diagnostics Accuracy | 100% | Manual verification vs. logs |
| User Session Duration (avg) | > 30 min | user session logs (NEEDS CLARIFICATION: track?) |

---

## 9. Dependencies & Prerequisites

### Backend
- FastAPI 0.95+ (REST + WebSocket)
- SQLModel (ORM)
- pywin32 (MT5 terminal access)
- cryptography (Fernet encryption)
- pytest (testing)

### Frontend
- React 18+
- TypeScript 4.9+
- Zustand (state management)
- TradingView Lightweight Charts
- axios/fetch (HTTP client)
- ws (WebSocket client)

### Runtime
- Python 3.11+ (backend)
- Node 18+ (frontend build)
- SQLite 3.36+ (database)
- MT5 Terminal (demo or live account)

### Infrastructure
- HTTPS/SSL certificate (production)
- DNS for domain (production)
- Monitoring (Prometheus/Datadog/NEEDS CLARIFICATION)

---

## 10. Implementation Roadmap

### Phase 1: Core Real-Time Streaming (Week 1-2)
1. WebSocket endpoint setup (FastAPI) + client connection
2. Quote streaming logic (batching at 100ms)
3. Candlestick aggregation (1m, 5m, 15m)
4. MT5 adapter polling service (100ms interval)
5. Integration tests + load testing (WebSocket latency)

### Phase 2: Watchlist Persistence (Week 2-3)
1. Watchlist + WatchlistSymbol schema (SQLModel)
2. Watchlist CRUD API endpoints + tests
3. WebSocket subscription sync on watchlist changes
4. Frontend Watchlist component (create, rename, delete)
5. Frontend symbol search + add-to-watchlist flow

### Phase 3: Account Synchronization (Week 3-4)
1. Account + Position models
2. Account balance/equity calculation
3. Account polling service (separate from quotes)
4. Account panel WebSocket updates
5. Account panel frontend component

### Phase 4: Observability & Admin Tools (Week 4-5)
1. Structured logging (all services)
2. Admin panel backend endpoints (`/api/admin/status`)
3. Admin panel frontend dashboard
4. Prometheus metrics export
5. Performance testing + tuning

### Phase 5: Production Hardening (Week 5-6)
1. Security audit (credentials, tokens, HTTPS)
2. Error handling edge cases (disconnection recovery, partial data)
3. Database backup/recovery procedure
4. Deployment guide + Docker setup
5. Load testing (100+ concurrent users)

---

## 11. Out of Scope (for this feature)

- Trading alert notifications (email, SMS, push)
- Drawing tools on charts (trendlines, annotations)
- Order placement or trade execution
- Mobile native applications
- Third-party data providers (only MT5)
- Historical data persistence beyond 5-minute cache
- Multi-broker support (MT5 only)
- Backtesting or strategy analysis
- Social/copy trading features

---

## 12. Related Documents

- Constitution: `.specify/memory/constitution.md`
- Deployment Guide: `DEPLOYMENT_GUIDE.md`
- Architecture: `backend/README.md`, `frontend/README.md`
- Project Structure: Workspace root `/specs/master/`, `/backend/`, `/frontend/`

---

## Approval & Sign-Off

**Specification Version**: 1.0.0  
**Created**: 2026-03-29  
**Status**: READY FOR REVIEW  
**Next Step**: Architecture design & Phase 1 implementation planning

**Clarifications Needed Before Approval**:
- User concurrency scale (target)
- Mobile support requirements
- Historical data retention policy
- Admin panel control surface scope
- Redis vs. SQLite for distributed cache decision
