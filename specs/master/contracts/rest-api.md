# REST API Contracts

**Date**: 2026-03-29 | **Feature**: Real-Time Trading Data & Watchlists

This document defines REST endpoint specifications for quote queries, watchlist management, and admin diagnostics.

---

## Authentication

All endpoints require `Authorization: Bearer <JWT_TOKEN>` header.

**Token Validation**: Invalid/expired tokens return 401 Unauthorized. Unauthenticated endpoints return 401.

---

## Quote Endpoints

### GET /api/quotes/{symbol}

**Purpose**: Fetch latest quote for a single symbol (REST fallback for WebSocket)

**Path Parameters**:
- `symbol` (string, required): Symbol name, e.g., "EURUSD"

**Query Parameters**:
- None

**Response (200 OK)**:
```json
{
  "symbol": "EURUSD",
  "bid": 1.08501,
  "ask": 1.08521,
  "bid_volume": 1000000,
  "ask_volume": 950000,
  "time": "2026-03-29T14:30:00.543Z",
  "status": "live",
  "cached": false,
  "cache_age_ms": 0
}
```

**Response (404 Not Found)**:
```json
{
  "error": "Symbol FAKE123 not found",
  "code": "SYMBOL_NOT_FOUND"
}
```

**Response (503 Service Unavailable)**:
```json
{
  "error": "MT5 connection unavailable; serving cached data",
  "status": "stale",
  "cached_data": { ... }
}
```

**Latency Target**: < 100ms (p95) for successful requests

---

### GET /api/quotes/batch

**Purpose**: Fetch quotes for multiple symbols in one request

**Query Parameters**:
- `symbols` (array of strings): Comma-separated symbol names, max 50. E.g., `?symbols=EURUSD,GBPUSD,AUDUSD`

**Response (200 OK)**:
```json
{
  "quotes": [
    {
      "symbol": "EURUSD",
      "bid": 1.08501,
      "ask": 1.08521,
      "time": "2026-03-29T14:30:00.543Z",
      "status": "live"
    },
    {
      "symbol": "GBPUSD",
      "bid": 1.27201,
      "ask": 1.27221,
      "time": "2026-03-29T14:30:00.512Z",
      "status": "live"
    }
  ],
  "timestamp": "2026-03-29T14:30:00.550Z"
}
```

**Error (400 Bad Request)**:
```json
{
  "error": "Requested 150 symbols; max 50 allowed",
  "code": "TOO_MANY_SYMBOLS"
}
```

**Latency Target**: < 100ms (p95) for 50 symbols

---

## Candlestick Endpoints

### GET /api/candlesticks/{symbol}/{timeframe}

**Purpose**: Fetch recent candlesticks for charting

**Path Parameters**:
- `symbol` (string): Symbol name, e.g., "EURUSD"
- `timeframe` (string): One of "1m", "5m", "15m", "1h"

**Query Parameters**:
- `limit` (integer, optional): Number of candles to return, default 100, max 500
- `before` (string, optional): ISO 8601 timestamp; return candles before this time

**Response (200 OK)**:
```json
{
  "symbol": "EURUSD",
  "timeframe": "1m",
  "candles": [
    {
      "open_time": "2026-03-29T14:30:00Z",
      "close_time": "2026-03-29T14:31:00Z",
      "open": 1.08490,
      "high": 1.08551,
      "low": 1.08489,
      "close": 1.08501,
      "volume": 5000000,
      "is_open": false
    },
    {
      "open_time": "2026-03-29T14:31:00Z",
      "close_time": "2026-03-29T14:32:00Z",
      "open": 1.08501,
      "high": 1.08551,
      "low": 1.08500,
      "close": 1.08520,
      "volume": 4500000,
      "is_open": true
    }
  ],
  "count": 2,
  "timestamp": "2026-03-29T14:32:15.123Z"
}
```

**Response (404 Not Found)**:
```json
{
  "error": "Symbol EURUSD / timeframe 2h not found",
  "code": "CANDLE_RANGE_NOT_FOUND"
}
```

**Latency Target**: < 100ms (p95) for 100 candles

---

## Watchlist Endpoints

### GET /api/watchlists

**Purpose**: List all watchlists for authenticated user

**Query Parameters**:
- None

**Response (200 OK)**:
```json
{
  "watchlists": [
    {
      "id": 5,
      "name": "Morning Pairs",
      "description": "Forex pairs to trade at market open",
      "symbol_count": 3,
      "is_default": true,
      "created_at": "2026-03-20T10:00:00Z",
      "updated_at": "2026-03-29T14:00:00Z"
    },
    {
      "id": 6,
      "name": "Evening Scalps",
      "description": "",
      "symbol_count": 5,
      "is_default": false,
      "created_at": "2026-03-25T15:30:00Z",
      "updated_at": "2026-03-29T13:45:00Z"
    }
  ],
  "count": 2
}
```

**Latency Target**: < 50ms

---

### GET /api/watchlists/{watchlist_id}

**Purpose**: Get detailed watchlist with symbols

**Path Parameters**:
- `watchlist_id` (integer): Watchlist ID

**Response (200 OK)**:
```json
{
  "id": 5,
  "name": "Morning Pairs",
  "description": "Forex pairs to trade at market open",
  "is_default": true,
  "symbols": [
    {
      "symbol_id": 1,
      "symbol": "EURUSD",
      "category": "Forex",
      "order": 0,
      "added_at": "2026-03-20T10:00:00Z"
    },
    {
      "symbol_id": 2,
      "symbol": "GBPUSD",
      "category": "Forex",
      "order": 1,
      "added_at": "2026-03-20T10:05:00Z"
    },
    {
      "symbol_id": 3,
      "symbol": "AUDUSD",
      "category": "Forex",
      "order": 2,
      "added_at": "2026-03-20T10:10:00Z"
    }
  ],
  "symbol_count": 3,
  "created_at": "2026-03-20T10:00:00Z",
  "updated_at": "2026-03-29T14:00:00Z"
}
```

**Response (403 Forbidden)**: User attempts to access another user's watchlist:
```json
{
  "error": "Access denied; watchlist belongs to another user",
  "code": "FORBIDDEN_ACCESS"
}
```

**Response (404 Not Found)**:
```json
{
  "error": "Watchlist 999 not found",
  "code": "WATCHLIST_NOT_FOUND"
}
```

**Latency Target**: < 50ms

---

### POST /api/watchlists

**Purpose**: Create new watchlist

**Request Body**:
```json
{
  "name": "Scalp Setup",
  "description": "Quick 5m scalps on EURUSD",
  "is_default": false
}
```

**Request Validation**:
- `name`: Required, 1-100 characters, unique per user
- `description`: Optional, max 500 characters
- `is_default`: Optional, default false. If true, unset default on other watchlists.

**Response (201 Created)**:
```json
{
  "id": 7,
  "name": "Scalp Setup",
  "description": "Quick 5m scalps on EURUSD",
  "is_default": false,
  "symbols": [],
  "symbol_count": 0,
  "created_at": "2026-03-29T14:30:00Z",
  "updated_at": "2026-03-29T14:30:00Z"
}
```

**Response (400 Bad Request)**:
```json
{
  "error": "Watchlist name 'Morning Pairs' already exists for this user",
  "code": "DUPLICATE_NAME"
}
```

**Latency Target**: < 100ms

---

### PUT /api/watchlists/{watchlist_id}

**Purpose**: Update watchlist metadata (name, description, is_default)

**Path Parameters**:
- `watchlist_id` (integer): Watchlist ID

**Request Body**:
```json
{
  "name": "New Name",
  "description": "Updated description",
  "is_default": true
}
```

**Request Validation**:
- At least one field must be provided
- All fields optional

**Response (200 OK)**:
```json
{
  "id": 5,
  "name": "New Name",
  "description": "Updated description",
  "is_default": true,
  "symbol_count": 3,
  "updated_at": "2026-03-29T14:35:00Z"
}
```

**Response (409 Conflict)**:
```json
{
  "error": "Watchlist name 'Morning Pairs' already exists for this user",
  "code": "DUPLICATE_NAME"
}
```

**Latency Target**: < 150ms

---

### DELETE /api/watchlists/{watchlist_id}

**Purpose**: Delete watchlist and all its symbols

**Path Parameters**:
- `watchlist_id` (integer): Watchlist ID

**Response (204 No Content)**: Success (no body)

**Response (404 Not Found)**:
```json
{
  "error": "Watchlist 999 not found",
  "code": "WATCHLIST_NOT_FOUND"
}
```

**Latency Target**: < 100ms

---

## Watchlist Symbol Management

### POST /api/watchlists/{watchlist_id}/symbols

**Purpose**: Add symbol to watchlist

**Path Parameters**:
- `watchlist_id` (integer): Watchlist ID

**Request Body**:
```json
{
  "symbol": "EURUSD"
}
```

**Request Validation**:
- `symbol`: Required, must exist in MT5 symbol list
- Cannot add duplicate symbol to same watchlist

**Response (201 Created)**:
```json
{
  "symbol_id": 1,
  "symbol": "EURUSD",
  "order": 3,
  "added_at": "2026-03-29T14:30:00Z"
}
```

**Response (400 Bad Request)**:
```json
{
  "error": "Symbol FAKE123 not found in MT5",
  "code": "SYMBOL_NOT_FOUND"
}
```

**Response (409 Conflict)**:
```json
{
  "error": "Symbol EURUSD already exists in this watchlist",
  "code": "DUPLICATE_SYMBOL"
}
```

**Latency Target**: < 150ms

---

### DELETE /api/watchlists/{watchlist_id}/symbols/{symbol}

**Purpose**: Remove symbol from watchlist

**Path Parameters**:
- `watchlist_id` (integer): Watchlist ID
- `symbol` (string): Symbol name, e.g., "EURUSD"

**Response (204 No Content)**: Success

**Response (404 Not Found)**:
```json
{
  "error": "Symbol EURUSD not found in watchlist 5",
  "code": "SYMBOL_NOT_IN_WATCHLIST"
}
```

**Latency Target**: < 100ms

---

## Admin Endpoints

### GET /api/admin/cache-status

**Purpose**: Admin diagnostics for cache health

**Response (200 OK)**:
```json
{
  "quotes_cached": 47,
  "quotes_ttl_remaining_s": [300, 300, 295, 290, ...],
  "candlesticks_stored": 152000,
  "candlesticks_retention_days": 90,
  "last_sync": "2026-03-29T14:30:00.123Z",
  "next_sync": "2026-03-29T14:30:01.000Z",
  "cache_hit_ratio": 0.94,
  "evictions_today": 12
}
```

---

### GET /api/admin/websocket-status

**Purpose**: Admin diagnostics for WebSocket server

**Response (200 OK)**:
```json
{
  "active_connections": 47,
  "active_subscriptions": {
    "quotes": 120,
    "candlesticks": 85,
    "account_updates": 23
  },
  "message_backlog": 0,
  "broadcast_latency_p50_ms": 12,
  "broadcast_latency_p95_ms": 45,
  "broadcast_latency_p99_ms": 98
}
```

---

### POST /api/admin/cache/sync-now

**Purpose**: Force immediate cache sync with MT5

**Response (200 OK)**:
```json
{
  "sync_started": true,
  "estimated_duration_ms": 500,
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": { "optional": "additional context" },
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

---

## Rate Limiting

- Quotes batch: Max 10 requests/second per user
- Watchlist operations: Max 5 requests/second per user
- Rate limit exceeded: 429 Too Many Requests

---

## API Versioning

Current version: **v1** (implicit in `/api/v1/` prefix, not shown for brevity)

---

**Summary**:
- 3 quote endpoints
- 8 watchlist endpoints
- 3 admin endpoints
- **Total: 14 unique endpoints**

---

**Next**: Generate quickstart guide