# Implementation Plan: Real-Time Trading Data & Watchlists

**Branch**: `master` | **Date**: 2026-03-29 | **Spec**: [specs/master/spec.md](specs/master/spec.md)
**Input**: Feature specification from `specs/master/spec.md`

## Summary

Enable traders to receive live market data (quotes, candlesticks, account updates) through WebSocket streaming and manage custom watchlists synchronized across sessions. The feature implements WebSocket-first architecture with 100ms quote batching and <50ms latency targets, enforces JWT authentication with encrypted MT5 credentials, ensures resilience via exponential backoff retry logic (max 60s), maintains data integrity through atomic transactions and candlestick immutability, and exposes observability via admin panel diagnostics and structured logging. Implementation spans 6 weeks across 5 phases: core streaming (week 1), watchlists (week 2), account sync (week 3), observability (week 4-5), production hardening (week 6).

## Technical Context

**Language/Version**: Python 3.13 (backend), TypeScript 5.x (frontend)

**Primary Dependencies**: 
- Backend: FastAPI 0.95+, Uvicorn/Hypercorn, SQLModel 0.0.8, MetaTrader5 5.0.46, python-jose (JWT), cryptography (Fernet)
- Frontend: React 18+, Zustand (state), TradingView Lightweight Charts, TypeScript, Vite

**Storage**: SQLite with SQLModel ORM; indexes on symbol, timeframe, account_id, user_id for query performance

**Testing**: pytest for backend (unit/integration tests), Vitest for frontend component tests, integration tests for WebSocket messaging and MT5 adapter

**Target Platform**: Web service (backend: Linux/Windows server), Web application (frontend: Chrome/Firefox/Safari)

**Project Type**: Real-time web service + web application (full-stack trading dashboard)

**Performance Goals**: 
- WebSocket latency <50ms (from MT5 data to frontend update)
- API response time <100ms (p95)
- Concurrent WebSocket clients: 100+
- Candlestick aggregation <100ms per timeframe
- DB query responses <50ms

**Constraints**: 
- MT5 connected only on Windows; connection failures trigger graceful degradation
- SQLite single-writer; concurrent writes serialized
- WebSocket message batching 100ms to optimize throughput
- Exponential backoff max 60s to prevent flooding failed MT5
- Candlestick immutability after N-1 candle close

**Scale/Scope**: 
- Single MT5 terminal connection
- Up to 100 symbols per watchlist
- 100+ concurrent WebSocket clients
- 5-minute cache TTL for quotes
- Full-stack feature spanning 8 files (backend) + 4 files (frontend)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Real-Time Responsiveness (NON-NEGOTIABLE) ✅
**Requirement**: WebSocket-first with <100ms API / <50ms WebSocket latency
**Status**: COMPLIANT
- WebSocket endpoint receives quotes at 100ms batching intervals (REQ-RT1)
- Candlestick aggregation completes within 100ms (REQ-RT2, AC1.2)
- API responses targeted <100ms p95 (AC1.3)
- Running candlestick updates atomic, no tearing (AC4.2)

### Principle II: Security & Authentication ✅
**Requirement**: Encrypted MT5 credentials, JWT auth, RBAC, HTTPS/WSS in production
**Status**: COMPLIANT
- JWT token validation on all endpoints (AC3.1, AC3.4)
- MT5 credentials encrypted with Fernet (AC3.2)
- User can only access own resources (AC3.3)
- HTTPS/WSS enforced in production (AC3.5)

### Principle III: Integration Reliability (MT5 First) ✅
**Requirement**: Exponential backoff retry (max 60s), graceful degradation, async cache sync
**Status**: COMPLIANT
- Polling service implements exponential backoff on MT5 failure (REQ-RT3, AC5.1)
- Failed operations don't crash backend; fallback to cache (AC5.2)
- Cache_worker syncs asynchronously; UI never blocks (AC5.3)
- Symbol subscriptions batched to MT5 (AC5.4)
- Disconnection detected within 5s; users notified (AC5.5)

### Principle IV: Data Integrity & Consistency ✅
**Requirement**: Atomic transactions, immutable closed candlesticks, cache TTL, deterministic calculations
**Status**: COMPLIANT
- Candlestick immutability after N-1 close enforced (AC4.1)
- Running candle updates atomic (AC4.2)
- Watchlist transactions atomic (AC4.3)
- Quote cache TTL 5 minutes enforced (AC4.4)
- Account balance calculated deterministically (AC4.5)

### Principle V: Observability & Debugging ✅
**Requirement**: Structured logging, admin panel exposure, performance metrics
**Status**: COMPLIANT
- Structured logging with INFO/DEBUG/ERROR + context (AC6.1)
- Admin panel displays connections, subscriptions, cache status (AC6.2)
- Performance metrics tracked: latencies + query times (AC6.3)
- Cache worker logs state transitions (AC6.4)
- WebSocket events logged with reason codes (AC6.5)

**GATE RESULT**: ✅ PASS — All core principles satisfied; no violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/master/
├── spec.md              # Feature specification (completed in speckit.specify phase)
├── plan.md              # This file (speckit.plan output - PHASE 1 & 2 in progress)
├── research.md          # Phase 0 output (research agent findings)
├── data-model.md        # Phase 1 output (entities and schemas)
├── quickstart.md        # Phase 1 output (local dev setup guide)
├── contracts/           # Phase 1 output
│   ├── websocket.md     # WebSocket message contracts
│   └── rest-api.md      # REST API endpoint contracts
└── tasks.md             # Phase 2 output (speckit.tasks command output)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/
│   │   ├── quotes.py            # Quote endpoints & WebSocket handler (NEW)
│   │   ├── watchlist.py         # Watchlist CRUD endpoints (EXTEND)
│   │   └── symbols.py           # Symbol search/info endpoints (EXTEND)
│   ├── services/
│   │   ├── websocket_service.py # WebSocket connection manager (EXTEND)
│   │   ├── polling_service.py   # Quote polling from MT5 (NEW)
│   │   ├── candlestick_service.py # Candlestick aggregation (NEW)
│   │   ├── watchlist_service.py # Watchlist business logic (EXTEND)
│   │   └── mt5_adapter.py       # MT5 connection (EXTEND)
│   └── models.py                # SQLModel schemas (EXTEND: Quote, Candlestick, Watchlist)
├── tests/
│   ├── unit/
│   │   ├── test_candlestick_service.py
│   │   └── test_watchlist_service.py
│   └── integration/
│       ├── test_websocket_quotes.py
│       └── test_mt5_polling.py
└── pyproject.toml               # Dependencies (EXTEND: add if needed)

frontend/
├── src/
│   ├── components/
│   │   ├── Chart.tsx            # TradingView chart with live updates (EXTEND)
│   │   ├── Watchlist.tsx        # Watchlist UI + symbol management (EXTEND)
│   │   └── QuoteDisplay.tsx     # Quote ticker display (NEW)
│   ├── pages/
│   │   └── Dashboard.tsx        # Dashboard page layout (EXTEND)
│   ├── services/
│   │   ├── websocket.ts         # WebSocket client + handlers (EXTEND)
│   │   ├── quoteService.ts      # Quote data service (NEW)
│   │   └── watchlistService.ts  # Watchlist API client (EXTEND)
│   ├── store/
│   │   └── useStore.ts          # Zustand state: quotes, watchlists (EXTEND)
│   ├── types/
│   │   └── index.ts             # Quote, Candlestick, Watchlist types (EXTEND)
│   └── utils/
│       └── candlestickAggregator.ts # Client-side candlestick logic (NEW)
└── tests/
    ├── Chart.test.tsx
    └── Watchlist.test.tsx
```

**Structure Decision**: Web application pattern (backend + frontend). 
- **Backend**: FastAPI services handle MT5 polling, WebSocket broadcasting, candlestick aggregation, watchlist persistence
- **Frontend**: React components consume WebSocket Real-time + REST API; Zustand manages local quote/watchlist state
- **Shared**: TypeScript types define Quote, Candlestick, Watchlist contracts across full stack
- **New dirs**: `services/candlestick_service.py`, `services/polling_service.py` (backend); `utils/candlestickAggregator.ts`, `services/quoteService.ts` (frontend)

## Complexity Tracking

✅ NO constitutional violations. Feature fully compliant with all 5 core principles (Real-Time Responsiveness, Security, MT5 Reliability, Data Integrity, Observability). No justification required.

---

## Phase 1 Design Completion

### Artifacts Generated

| Artifact | Status | Location |
|----------|--------|----------|
| Feature Specification | ✅ Complete | `specs/master/spec.md` |
| Research Phase | ✅ Complete | `specs/master/research.md` |
| Data Model | ✅ Complete | `specs/master/data-model.md` |
| WebSocket Contracts | ✅ Complete | `specs/master/contracts/websocket.md` |
| REST API Contracts | ✅ Complete | `specs/master/contracts/rest-api.md` |
| Quickstart Guide | ✅ Complete | `specs/master/quickstart.md` |
| Agent Context | ✅ Complete | `.github/agents/copilot-instructions.md` |

### Constitutional Re-Check (Post-Design)

*GATE: Must pass after Phase 1 design completion*

#### Principle I: Real-Time Responsiveness ✅
- WebSocket architecture confirmed: 100ms batching, <50ms latency targets (REQ-RT1, REQ-RT2)
- Candlestick aggregation <100ms (data-model.md State Transitions)
- API response latencies <100ms p95 (contracts/rest-api.md performance targets)
- **RESULT**: PASS

#### Principle II: Security & Authentication ✅
- JWT validation + RBAC confirmed (contracts/rest-api.md authentication)
- MT5 credential encryption (Fernet) specified (data-model.md SQLModel v5)
- HTTPS/WSS requirements in production deployment (quickstart.md production section)
- User data isolation (contracts/rest-api.md 403 Forbidden responses)
- **RESULT**: PASS

#### Principle III: Integration Reliability (MT5 First) ✅
- Exponential backoff retry (max 60s) confirmed (data-model.md Quote Fetch Failure state transitions)
- Graceful degradation + cache fallback specified (spec.md Scenario 1 alternative flow)
- Async cache worker (non-blocking) confirmed (data-model.md State Transitions)
- Error handling strategy documented (data-model.md Watchlist/Candlestick rules)
- **RESULT**: PASS

#### Principle IV: Data Integrity & Consistency ✅
- Atomic transactions for watchlist operations (data-model.md Watchlist Rules)
- Candlestick immutability post-close enforced (data-model.md Immutability Rule)
- Cache TTL 5 minutes specified (research.md R3 retention policy)
- Deterministic account balance calculation (spec.md FR-005)
- **RESULT**: PASS

#### Principle V: Observability & Debugging ✅
- Structured logging with context (data-model.md LoginAudit table + quickstart.md DEBUG logging)
- Admin panel diagnostics (contracts/rest-api.md admin endpoints: cache-status, websocket-status)
- Performance metrics tracked (contracts/rest-api.md broadcast_latency_p50/p95/p99)
- Web Socket subscription logging (quickstart.md debugging section)
- **RESULT**: PASS

**GATE RESULT**: ✅ PASS — All principles satisfied post-design; no violations

---

## Implementation Readiness

### Preconditions for Task Generation

1. ✅ Feature specification exists and agreed
2. ✅ Data model entities finalized and validated
3. ✅ API contracts defined (REST + WebSocket)
4. ✅ Constitution compliance verified
5. ✅ Technology stack agreed (FastAPI, React, SQLite)
6. ✅ Performance targets documented
7. ✅ Quickstart guide provides dev setup path

### Next Steps

**Phase 2** (Task Generation): Run `/speckit.tasks` to generate `tasks.md` with:
- Dependency-ordered task breakdown per user story
- Task assignments to frontend/backend/shared
- Estimated effort per task
- Integration test requirements
- Deployment checklist

---

## Document Summary

This implementation plan establishes the complete design for real-time trading data delivery and watchlist management for TradeMatrix. All Constitutional principles are satisfied without modification. The design is ready for task breakdown and implementation.

- **Specification**: Clear user scenarios, acceptance criteria, functional requirements
- **Research**: All clarifications resolved; technology choices verified
- **Data Model**: 6 entities (Watchlist, WatchlistSymbol, Quote, Candlestick, SymbolInfo, LoginAudit) with state transitions
- **Contracts**: 8 WebSocket message types + 14 REST endpoints with latency targets
- **Quickstart**: Local dev setup, testing procedures, debugging guide, production checklist

**Total design effort**: 1 day | **Implementation effort**: 6 weeks (5 phases)
