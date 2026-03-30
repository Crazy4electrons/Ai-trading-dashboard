# Research Phase: Real-Time Trading Data & Watchlists

**Date**: 2026-03-29 | **Feature**: Real-Time Trading Data & Watchlists | **Status**: COMPLETE

This document resolves all "NEEDS CLARIFICATION" items from the specification through investigation and best practices research.

---

## R1: User Scale & Concurrency

**Question**: How many concurrent users will the system support initially? Should we architect for 10, 100, 1000+ concurrent WebSocket connections?

**Research**: 
- Current MT5 adapter connects to single terminal; bottleneck is MT5, not backend resources
- FastAPI + Uvicorn on single machine can handle 100+ concurrent WebSocket connections with modest CPU/memory
- TradingView Lightweight Charts library supports real-time updates at 100+ symbols without UI lag
- Typical day traders use single MT5 account; multi-account support (FUTURE work)

**Decision**: Design for 100 concurrent WebSocket connections (single MT5 terminal). This is reasonable for:
- Small prop trading firm or individual traders
- Scales to 500+ with load balancer + additional MT5 terminals (future architecture)
- Current infrastructure (Uvicorn on local machine) sufficient

**Rationale**: Simple initial design. Horizontal scaling via multiple backend instances + MT5 proxies is future enhancement.

---

## R2: Mobile Support

**Question**: Will this feature support mobile clients (iOS/Android) or web-only?

**Research**:
- TradingView Lightweight Charts library is web-only (React Native port exists but not maintained)
- MT5 adapter is Windows-only (pywin32 dependency); mobile clients would need proxy service
- MVP scope limited to desktop web traders (typical MT5 users)
- Mobile: future consideration after desktop feature matures

**Decision**: Web-only for MVP (desktop Chrome/Firefox/Safari).

**Rationale**: 
- Aligns with MT5 primary user base (desktop traders)
- Reduces complexity for initial release
- Mobile support adds backend proxy layer + alternate charting library; defer post-MVP

---

## R3: Historical Data Retention

**Question**: How long should candlestick history be retained? (1 day, 1 week, 1 month?)

**Research**:
- SQLite suitable for local storage of 1M+ candlesticks (typical: 250 trading days × 1440 minutes = 360k records for 1m candlesticks)
- TradingView Lightweight Charts typically displays 100-500 visible candles; scrolling loads incremental data
- MT5 terminal stores years of OHLC locally; backend can fetch historical data on-demand
- Performance: querying 1y of 1m candlesticks is <100ms with proper indexing

**Decision**: Retention policy:
- **In-memory cache**: Last 5 minutes of quotes (real-time streaming)
- **SQLite DB**: Last 3 months of candlesticks (1m/5m/15m/1h timeframes)
- **Purge schedule**: Weekly cleanup of records >90 days old
- **On-demand fetch**: User scrolls beyond cached history → backend queries MT5 for older candles

**Rationale**: Balances storage (90 days ≈ 50MB SQLite) with trading use cases (most traders view recent data). On-demand MT5 fetch for historical analysis.

---

## R4: Cache Backend Technology

**Question**: Should we use Redis for distributed caching, or keep SQLite local cache?

**Research**:
- Redis adds complexity: separate service, deployment, memory overhead
- For single MT5 terminal: SQLite local cache is simpler, no network latency
- SQLite in-memory caching + disk persistence sufficient for <100 concurrent clients
- Redis justified if: distributed backend (multiple instances), high cache churn, sub-10ms latency critical

**Decision**: SQLite only (no Redis for MVP).

**Rationale**:
- Single MT5 terminal = single source of truth; no cache coherency issues
- Local SQLite has <5ms query latency; Redis adds network roundtrip cost
- Reduces deployment complexity and operational overhead
- Redis can be added later behind abstraction layer if needed

---

## R5: Admin Panel Scope

**Question**: What admin operations should the admin panel expose? (Cache control, polling status, terminal health, user audit?)

**Research**:
- Constitution Principle V (Observability) requires admin panel diagnostics
- Critical operations: cache sync status, polling backoff state, WebSocket connection count, MT5 connection health
- Optional operations: user audit logs, performance metrics, database cleanup
- Admin panel scope should focus on operational debugging, not full database management

**Decision**: Admin panel exposes (MVP):
- **Cache Status**: Last sync time, next sync scheduled, cache hit/miss ratio
- **Polling Service**: Current backoff level, retry schedule, failed symbol count
- **WebSocket**: Active connection count, subscribed symbol count, broadcast latency (p50/p95/p99)
- **MT5 Connection**: Connected/disconnected status, last quote timestamp, terminal health
- **Manual Actions**: Force cache sync, reset polling backoff, reconnect MT5
- (Future: User audit logs, performance heatmaps, database size analysis)

**Rationale**: Focuses on operational health + manual recovery; avoids scope creep. Audit logging added post-MVP.

---

## R6: Trading Order Execution

**Question**: Should watchlist feature include order placement / modify / cancel capability?

**Research**:
- Current dashboard shows positions (read-only)
- Order execution adds significant complexity: risk management, position sizing, slippage
- MT5 adapter has order execution capability, but security implications (API credentials exposure)
- MVP scope is data streaming + watchlist management; order execution is separate concern

**Decision**: Out of scope for MVP. Read-only positions only.

**Rationale**:
- Feature focuses on data streaming + watchlist organization
- Order execution requires separate security review + compliance considerations
- Can be added as separate feature post-MVP
- Reduces implementation complexity and testing scope

---

## R7: Price Alert Notifications

**Question**: Should traders receive alerts (email/SMS/push) when price reaches a level?

**Research**:
- Alerts add complexity: alert storage, rules engine, notification service integration
- WebSocket status page can indicate alert-worthy events (connected/disconnected)
- Email/SMS integration requires 3rd party service + configuration
- MVP scope: visual indication in UI only (no external notifications)

**Decision**: Visual "status" indicator in UI only (connected/disconnected/stale data).

**Rationale**: 
- MVP focuses on data streaming; alert rules engine is separate feature
- WebSocket status + UI indicator sufficient for MVP trader experience
- Email/SMS notifications added post-MVP

---

## R8: Multi-Account Support

**Question**: Should a single user be able to manage multiple MT5 accounts in parallel, or single account per login?

**Research**:
- Current implementation: one MT5 login per backend session
- Multi-account requires:
  - Multiple MT5 terminal instances or account switching within single terminal
  - Database schema changes (account_id as foreign key in all tables)
  - WebSocket subscription changes (per-account symbols)
  - Increased complexity: account isolation, credential storage

**Decision**: Single account per login for MVP.

**Rationale**:
- Typical MT5 user manages one account per terminal instance
- Multi-account architecture can be added incrementally (future feature)
- Simplifies initial implementation + testing
- Database schema already supports multi-account (account_id exists); code doesn't use it yet

---

## R9: Audit Logging

**Question**: How deep should audit logging go? (All API calls, watchlist changes, user logins only?)

**Research**:
- Compliance requirements vary by jurisdiction; MVP assumes internal trading firm
- Minimal audit scope: user login/logout, watchlist create/delete/modify, failed auth attempts
- Detailed audit: all API calls + WebSocket events + MT5 queries (high volume, storage cost)

**Decision**: Minimal audit scope for MVP:
- Login/logout events (user, timestamp, IP)
- Watchlist operations (action, user, watchlist_id, timestamp)
- Failed auth attempts (user, timestamp)
- (Full audit: deferred to post-MVP based on compliance needs)

**Rationale**: Satisfies basic operational audit trail. Compliance audit logs added when regulatory needs are defined.

---

## Technology Stack Verification

### WebSocket Library Selection

**Options Evaluated**:
1. **FastAPI WebSocket** (built-in) - No external dep, good for MVP ✅ SELECTED
2. **Socket.IO** - Richer protocol, fallback transports, more overhead
3. **Channels** (Django) - Not needed; FastAPI native support sufficient

**Decision**: FastAPI WebSocket native handler. Rationale: Built-in, low latency, no extra dependencies.

### Candlestick Aggregation Strategy

**Options Evaluated**:
1. **Client-side aggregation** - Frontend groups quotes into candles
2. **Backend aggregation** ✅ SELECTED - Backend groups quotes; frontend receives candlesticks
3. **MT5 terminal only** - Use MT5's built-in candles (simpler, but remote calls expensive)

**Decision**: Backend aggregation with client-side fallback logic. 
Rationale: Backend batches reduce WebSocket traffic; client-side utility for local calculations.

### Frontend State Management

**Options Evaluated**:
1. **Zustand** ✅ SELECTED - Lightweight, already in use
2. **Redux** - Overkill for this feature's state complexity
3. **Props drilling** - Unscalable for quote updates to multiple components

**Decision**: Zustand + WebSocket hooks. Rationale: Consistent with existing codebase, minimal boilerplate.

---

## Best Practices Applied

### Real-Time Data Streaming
- Quote batching at 100ms intervals (reduces WebSocket traffic 10x vs per-quote)
- Immutable candlesticks post-close (prevent data corruption)
- TTL-based cache expiration (stale data detection)
- Exponential backoff retry on MT5 failure (resilience)

### Security Best Practices
- Fernet encryption for credentials at rest
- JWT token validation on every connection
- No credentials in logs / error responses
- HTTPS/WSS enforcement in production
- User data isolation via foreign key constraints

### Performance Optimization
- Icon indexing on frequently queried columns (symbol, timeframe, user_id)
- Atomic transactions for watchlist operations (data consistency)
- Lazy loading of historical candlesticks (on-demand from MT5)
- Component memoization in React (prevent unnecessary re-renders)

### Observability
- Structured logging with context (user_id, account_id, symbol)
- Admin panel real-time diagnostics
- Error tracking (failed MT5 queries, network issues)
- Performance metrics (API latency, WebSocket latency, cache hit ratio)

---

## Phase 1 Readiness

✅ **All CLARIFICATIONS RESOLVED**
- User scale: 100 concurrent connections
- Mobile support: Web-only for MVP
- Data retention: 90 days + on-demand MT5 fetch
- Cache: SQLite only (no Redis)
- Admin scope: Health monitoring + manual recovery
- Orders: Out of scope
- Alerts: Visual status only
- Multi-account: Single account per login
- Audit: Minimal scope (login, watchlist ops, failed auth)

✅ **TECHNOLOGY CHOICES VERIFIED**
- WebSocket: FastAPI native
- Candlestick aggregation: Backend-driven
- State management: Zustand

✅ **READY FOR PHASE 1 DESIGN**

---

**Next**: Generate data-model.md with entity schemas + validation rules