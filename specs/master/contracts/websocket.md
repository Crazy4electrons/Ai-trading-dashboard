# WebSocket API Contracts

**Date**: 2026-03-29 | **Feature**: Real-Time Trading Data & Watchlists

This document defines the WebSocket message formats and bidirectional communication protocol.

---

## Connection

### Handshake

**Client connects to**: `ws://localhost:8000/ws?token=<JWT_TOKEN>`

**Server Response on Valid Token**:
```json
{
  "type": "connection_established",
  "user_id": 123,
  "timestamp": "2026-03-29T14:30:00.123Z",
  "connection_id": "conn_abc123"
}
```

**Server Response on Invalid/Expired Token**:
```json
{
  "type": "error",
  "code": 401,
  "message": "Unauthorized: invalid or expired token"
}
```
Connection closes after error.

---

## Message Types

### 1. Subscribe to Quotes

**Purpose**: Start receiving real-time bid/ask updates for symbols

**From Client**:
```json
{
  "type": "subscribe_quotes",
  "symbols": ["EURUSD", "GBPUSD", "AUDUSD"],
  "batch_interval_ms": 100
}
```

**Parameters**:
- `symbols`: Array of symbol strings (max 50)
- `batch_interval_ms`: Optional, default 100. WebSocket batches quotes every N ms.

**From Server** (repeated every 100ms while quotes available):
```json
{
  "type": "quote_batch",
  "data": [
    {
      "symbol": "EURUSD",
      "bid": 1.08501,
      "ask": 1.08521,
      "bid_volume": 1000000,
      "ask_volume": 950000,
      "time": "2026-03-29T14:30:00.543Z",
      "status": "live"
    },
    {
      "symbol": "GBPUSD",
      "bid": 1.27201,
      "ask": 1.27221,
      "bid_volume": 800000,
      "ask_volume": 750000,
      "time": "2026-03-29T14:30:00.512Z",
      "status": "live"
    }
  ],
  "timestamp": "2026-03-29T14:30:00.550Z"
}
```

**Fields**:
- `status`: "live" | "stale" | "disconnected"
  - "live": Current data from MT5 (< 5s old)
  - "stale": Cached data (> 5s old, awaiting MT5 reconnect)
  - "disconnected": MT5 offline; using last known quote (> 60s old)

---

### 2. Unsubscribe from Quotes

**From Client**:
```json
{
  "type": "unsubscribe_quotes",
  "symbols": ["EURUSD"]
}
```

**From Server** (acknowledgement):
```json
{
  "type": "unsubscribe_ack",
  "symbols": ["EURUSD"],
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

---

### 3. Subscribe to Candlesticks

**Purpose**: Receive updates when candlesticks close OR at running candle updates

**From Client**:
```json
{
  "type": "subscribe_candlesticks",
  "subscriptions": [
    {
      "symbol": "EURUSD",
      "timeframes": ["1m", "5m"]
    },
    {
      "symbol": "GBPUSD",
      "timeframes": ["1m", "5m", "15m"]
    }
  ]
}
```

**From Server** (on candlestick close):
```json
{
  "type": "candlestick_closed",
  "data": {
    "symbol": "EURUSD",
    "timeframe": "1m",
    "open_time": "2026-03-29T14:30:00Z",
    "close_time": "2026-03-29T14:31:00Z",
    "open": 1.08490,
    "high": 1.08551,
    "low": 1.08489,
    "close": 1.08501,
    "volume": 5000000,
    "is_open": false
  },
  "timestamp": "2026-03-29T14:31:00.123Z"
}
```

**From Server** (optional running candle updates, every 100ms-1s):
```json
{
  "type": "candlestick_update",
  "data": {
    "symbol": "EURUSD",
    "timeframe": "1m",
    "open_time": "2026-03-29T14:31:00Z",
    "close_time": "2026-03-29T14:32:00Z",
    "open": 1.08501,
    "high": 1.08551,
    "low": 1.08501,
    "close": 1.08521,
    "volume": 2500000,
    "is_open": true
  },
  "timestamp": "2026-03-29T14:31:30.123Z"
}
```

---

### 4. Subscribe to Account Updates

**Purpose**: Receive real-time account balance, margin, positions

**From Client**:
```json
{
  "type": "subscribe_account",
  "account_id": 12345
}
```

**From Server** (every 100ms or on change):
```json
{
  "type": "account_update",
  "data": {
    "account_id": 12345,
    "balance": 50000.00,
    "equity": 49500.00,
    "free_margin": 25000.00,
    "margin_level": 198.00,
    "open_positions": 3,
    "open_pnl": -500.00
  },
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

---

### 5. Subscribe to Watchlist Changes

**Purpose**: Notify when watchlist is created/updated/deleted by user or other clients

**From Client**:
```json
{
  "type": "subscribe_watchlist_changes"
}
```

**From Server** (on watchlist modification):
```json
{
  "type": "watchlist_changed",
  "data": {
    "watchlist_id": 5,
    "user_id": 123,
    "action": "symbol_added",
    "details": {
      "symbol": "EURUSD",
      "symbol_id": 42,
      "order": 3
    }
  },
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

**action values**:
- "symbol_added": New symbol added to watchlist
- "symbol_removed": Symbol removed from watchlist
- "symbol_reordered": Symbol display order changed
- "watchlist_created": New watchlist created
- "watchlist_renamed": Watchlist name changed
- "watchlist_deleted": Watchlist deleted

---

### 6. Status & Health

**From Server** (on connection change):
```json
{
  "type": "system_status",
  "data": {
    "mt5_connected": true,
    "cache_status": "healthy",
    "websocket_connections": 47,
    "active_subscriptions": 120,
    "polling_backoff_level": 0,
    "last_mt5_sync": "2026-03-29T14:30:00.123Z"
  },
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

**Conditions triggering status update**:
- MT5 connection changes (connected ↔ disconnected)
- Cache status changes (healthy ↔ stale ↔ error)
- Polling backoff level changes
- New connection joins/leaves

---

### 7. Error Handling

**From Server** (on message error):
```json
{
  "type": "error",
  "code": 400,
  "message": "Invalid symbol: FAKE123 not found in MT5",
  "reference_id": "msg_12345"
}
```

**Common Error Codes**:
- 400: Bad request (invalid symbols, missing fields)
- 401: Unauthorized (token expired)
- 403: Forbidden (accessing other user's watchlist)
- 404: Not found (symbol/watchlist doesn't exist)
- 429: Rate limited (too many subscriptions)
- 500: Server error (MT5 connection failed, DB error)

---

### 8. Heartbeat / Ping-Pong

**From Server** (every 30 seconds):
```json
{
  "type": "ping",
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

**From Client** (response):
```json
{
  "type": "pong",
  "timestamp": "2026-03-29T14:30:00.123Z"
}
```

If client doesn't respond with pong within 10s, server closes connection (dead client detection).

---

## Message Flow Example

```
CLIENT                                  SERVER
├─ connect (ws://...?token=xyz)        
│                                       ├─ validate token
│                                       └─ send connection_established
├─ subscribe_quotes EURUSD,GBPUSD      
│                                       ├─ validate symbols
│                                       ├─ fetch from MT5
│                                       └─ queue for batching
│ (100ms batching interval)
│                                       └─ broadcast quote_batch
│                                       └─ broadcast quote_batch
│                                       └─ broadcast quote_batch
├─ subscribe_candlesticks EURUSD 1m,5m
│                                       ├─ validate symbols + timeframes
│                                       └─ fetch running candle from DB
│ (candle closes at 14:31:00)
│                                       └─ broadcast candlestick_closed
│ (1 minute passes)
├─ unsubscribe_quotes EURUSD           
│                                       ├─ remove from subscriptions
│                                       └─ send unsubscribe_ack
│ (30 second intervals)
│                                       └─ broadcast ping
├─ respond pong
│
├─ close connection
│                                       └─ cleanup subscriptions
```

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Quote latency | < 50ms | From MT5 to WebSocket delivery |
| Candlestick close notification | < 100ms | Candle registered → message sent |
| Message delivery | Guaranteed | TCP guarantees; retries on reconnect |
| Batch interval | 100ms | Configurable per subscription |
| Connection establish | < 500ms | Token validation + subscription setup |
| Error response | < 100ms | Invalid requests rejected quickly |

---

## Backward Compatibility

Current version: **v1**

Future versions will be managed via:
1. New message types (old clients ignore unknown types)
2. Optional fields (clients add fields as needed)
3. Major breaking changes: version prefix in message type (e.g., "quote_batch_v2")

---

**Next**: REST API contracts