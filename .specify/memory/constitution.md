# TradeMatrix Constitution

## Core Principles

### I. Real-Time Responsiveness (NON-NEGOTIABLE)
WebSocket-first architecture for live market data delivery. All critical quotes, positions, and account updates MUST flow through WebSocket with automatic batching (100ms intervals) to optimize throughput. Polling is secondary fallback only. Latency targets: < 100ms for API responses, < 50ms for WebSocket updates. Every feature must consider real-time implications before implementation.

### II. Security & Authentication
MT5 credentials MUST be encrypted at rest using Fernet (cryptography library). JWT tokens enforce role-based access (admin/user). No sensitive data in logs or error messages. All API endpoints require authentication; admin operations require elevated privileges. Token refresh mechanism prevents credential replay. HTTPS required in production.

### III. Integration Reliability (MT5 First)
MT5 adapter is the system's critical path. All MT5 operations MUST include retry logic with exponential backoff (max 60s). Connection failures trigger automatic cleanup and reconnection. Cache worker syncs asynchronously; UI never blocks on MT5 I/O. Error handling is defensive: graceful degradation, fallback to cached data, never crash the dashboard.

### IV. Data Integrity & Consistency
SQLModel ORM enforces schema validation. All database operations use atomic transactions. Candlestick cache includes TTL-based expiration. Symbol watchlist sync respects MT5 as source of truth. Account stats calculated deterministically from trade history. No data race conditions allowed in multi-threaded services.

### V. Observability & Debugging
Structured logging required (INFO/DEBUG/ERROR levels, contextualized with user/account). Admin panel exposes cache status, polling backoff state, terminal health, database stats. WebSocket subscriptions include real-time status updates. Performance metrics tracked (response times, WebSocket latency). All services log state transitions for troubleshooting.

## Architecture & Technology Stack

**Backend**: FastAPI + Uvicorn/Hypercorn; SQLModel ORM with SQLite; pywin32 for MT5 terminal integration; cryptography for credential security

**Frontend**: React 18+ with TypeScript; Zustand for state management; TradingView Lightweight Charts; WebSocket client for real-time updates

**Database**: SQLite with SQLModel schemas; indexes on frequently queried fields (symbol, timeframe, account_id); cache with TTL

**Deployment**: Docker containerization for backend/frontend; environment-based configuration (.env files); CI/CD gates before production

## Development Workflow

**Feature Development**: Start with API contract + types. Implement backend service with comprehensive error handling. Connect frontend UI with WebSocket subscription. Test with real MT5 simulator account. Admin panel integration for debugging.

**Testing Strategy**: Unit tests for business logic and utilities. Integration tests for WebSocket messaging, MT5 adapter connectivity, database operations. Manual testing against MT5 simulator before production deployment.

**Code Review Standards**: Security audit mandatory (credential handling, authentication). Performance review for latency-sensitive paths. WebSocket message contracts verified. MT5 error scenarios covered.

## Governance

This constitution supersedes all other practices. All features, performance optimizations, and integrations MUST satisfy the Core Principles. Amendments require documented justification, backward compatibility analysis, and approval. Non-compliance is blocking for merge/deployment.

**Compliance Checks**:
- Security review for authentication/encryption changes
- Performance benchmarks for any WebSocket/API modification
- Integration testing for MT5 adapter changes
- Admin panel observability for new services

**Development Guidance**: See DEPLOYMENT_GUIDE.md for setup, local development prerequisites, architecture details, and troubleshooting procedures.

**Version**: 1.0.0 | **Ratified**: 2026-03-29 | **Last Amended**: 2026-03-29
