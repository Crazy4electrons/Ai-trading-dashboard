# Data Model: Real-Time Trading Data & Watchlists

**Date**: 2026-03-29 | **Feature**: Real-Time Trading Data & Watchlists | **Status**: COMPLETE

This document defines the data model entities, validation rules, and state transitions for real-time quotes, candlesticks, and watchlist management.

---

## Entity Relationship Diagram

```
User (existing model)
  ├── 1:N → Watchlist
  ├── 1:N → Account (future)
  └── 1:N → LoginAudit (new)

Watchlist (new)
  └── 1:N → WatchlistSymbol (new)
       └── N:1 → SymbolInfo

SymbolInfo (extend)
  ├── 1:N → Quote (new)
  └── 1:N → Candlestick (new)

Quote (new - in-memory, temporary)
  └── TTL: 5 minutes

Candlestick (new - persistent)
  ├── timeframe: 1m, 5m, 15m, 1h (derived from quotes)
  └── TTL: NULL (persistent, but marked with status)

LoginAudit (new)
  └── user_id (FK), action, timestamp, ip_address
```

---

## Core Entities

### 1. Watchlist (NEW)

**Purpose**: User-owned collection of symbols for organization and quick access

**Schema**:
```python
from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional

class Watchlist(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    name: str = Field(max_length=100, index=True)  # e.g., "Morning Pairs", "Pennies"
    description: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_default: bool = Field(default=False)  # Default watchlist on login
    
    # Relationships
    symbols: list["WatchlistSymbol"] = Relationship(back_populates="watchlist", cascade_delete=True)
```

**Validation Rules**:
- `name`: Required, 1-100 characters, unique per user (user_id + name)
- `description`: Optional, max 500 characters
- `is_default`: Only one default per user (enforced at service layer)
- `symbols`: 1-100 symbols per watchlist (soft limit)

**State Machine**:
```
CREATE → ACTIVE → [UPDATE | DELETE] → (DELETED | ACTIVE)
```

---

### 2. WatchlistSymbol (NEW)

**Purpose**: Junction table linking watchlist to symbols with ordering

**Schema**:
```python
class WatchlistSymbol(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    watchlist_id: int = Field(foreign_key="watchlist.id", index=True)
    symbol_id: int = Field(foreign_key="symbolinfo.id", index=True)
    order: int = Field(default=0)  # Display order (0=first, 1=second, etc.)
    added_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    watchlist: Watchlist = Relationship(back_populates="symbols")
    symbol: SymbolInfo = Relationship()
    
    # Unique constraint: (watchlist_id, symbol_id)
```

**Validation Rules**:
- `watchlist_id`: Must reference valid watchlist
- `symbol_id`: Must reference valid symbol (validated before insert)
- `order`: Integer ≥ 0 (automatically set on insert)
- No duplicate symbols in same watchlist (unique constraint)

**Cascade Behavior**: Deleting watchlist deletes all WatchlistSymbol records (cascade_delete=True)

---

### 3. Quote (NEW - Runtime/in-memory)

**Purpose**: Latest real-time bid/ask data for a symbol (NOT permanently stored)

**Schema (in-memory, not SQLite)**:
```python
from pydantic import BaseModel
from datetime import datetime

class Quote(BaseModel):
    symbol: str
    bid: float
    ask: float
    bid_volume: int = 0
    ask_volume: int = 0
    time: datetime
    last_update: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_schema_extra = {
            "example": {
                "symbol": "EURUSD",
                "bid": 1.0850,
                "ask": 1.0852,
                "bid_volume": 1000000,
                "ask_volume": 900000,
                "time": "2026-03-29T14:30:00Z"
            }
        }
```

**Validation Rules**:
- `symbol`: Must match registered MT5 symbol
- `bid`: Float > 0, bid < ask
- `ask`: Float > 0, ask > bid
- `time`: UTC timestamp, not in future
- `bid_volume` / `ask_volume`: Non-negative integers

**Storage & TTL**:
- Stored in Python dict / Redis cache (NO SQLite)
- TTL: 5 minutes
- Expired quotes trigger MT5 refresh
- WebSocket broadcasts latest quote to subscribed clients

**State Transitions**:
```
FETCH from MT5 → CACHE (5m TTL) → BROADCAST via WebSocket
                              ↓
                         (if no update 5m)
                              ↓
                           EXPIRE → STALE
```

---

### 4. Candlestick (NEW - Persistent)

**Purpose**: Aggregated OHLCV data for a symbol/timeframe, updated in real-time until close

**Schema**:
```python
class Candlestick(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol_id: int = Field(foreign_key="symbolinfo.id", index=True)
    timeframe: str = Field(index=True)  # "1m" | "5m" | "15m" | "1h"
    open_time: datetime = Field(index=True)  # Candle start (e.g., 14:30:00 for 1m at 14:30)
    close_time: datetime = Field(index=True)  # Candle end (open_time + timeframe duration)
    
    open: float
    high: float
    low: float
    close: float
    volume: int
    
    is_open: bool = Field(default=True)  # True = running candle, False = closed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Composite index for fast queries
    __table_args__ = (
        Index("ix_symbol_timeframe_time", "symbol_id", "timeframe", "open_time"),
    )
```

**Validation Rules**:
- `symbol_id`: Must reference valid symbol
- `timeframe`: Must be in ("1m", "5m", "15m", "1h")
- `open_time`: UTC timestamp, aligned to timeframe boundary (e.g., 14:30:00, not 14:30:45)
- `close_time`: open_time + timeframe_duration
- OHLC: low ≤ open, close ≤ high; low ≤ close
- `volume`: Non-negative integer
- `is_open`: Running candle updatable; closed candle immutable (enforced at service layer)

**Immutability Rule (Constitution Principle IV)**:
- Once `is_open` transitions to False (candle closes), ALL fields (open, high, low, close, volume) are immutable
- Attempting to update closed candle raises ValueError
- Running candle (`is_open=True`) can be updated atomically per quote

**State Machine**:
```
OPEN (updating) → [New quote arrives] → UPDATE high/low/close/volume
     ↓
[Time advances to close_time] → CLOSE (is_open=False)
     ↓
IMMUTABLE (no updates allowed)
```

---

### 5. SymbolInfo (EXTEND existing)

**Current Fields** (assumption from DEPLOYMENT_GUIDE):
```python
class SymbolInfo(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(unique=True, index=True)  # "EURUSD"
    description: str = Field(default="")
    # ... other fields
```

**New Fields for This Feature**:
```python
class SymbolInfo(SQLModel, table=True):
    # ... existing fields ...
    
    # New fields
    category: str = Field(default="Forex")  # Forex | Crypto | Stocks | etc.
    subscription_count: int = Field(default=0)  # Number of active WebSocket subscribers
    last_quote_time: Optional[datetime] = Field(default=None)  # Last MT5 data fetch
    is_tradeable: bool = Field(default=True)  # Available for trading
```

**Relationships**:
```python
    quotes: list[Quote] = Relationship(back_populates="symbol")  # In-memory refs only
    candlesticks: list[Candlestick] = Relationship(back_populates="symbol")
    watchlist_symbols: list[WatchlistSymbol] = Relationship()
```

---

### 6. LoginAudit (NEW - Minimal Audit Trail)

**Purpose**: Track user login/logout for operational audit and security

**Schema**:
```python
class LoginAudit(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    action: str  # "login" | "logout" | "failed_auth"
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    ip_address: Optional[str] = Field(default=None)
    reason: Optional[str] = Field(default=None)  # E.g., "Invalid credentials"
```

**Retention Policy**: Keep 90 days of login events; older records pruned weekly

---

## WebSocket Message Contracts

### Quote Subscription

**From Client**:
```json
{
  "type": "subscribe_quotes",
  "symbols": ["EURUSD", "GBPUSD"],
  "timeframes": ["1m", "5m"]
}
```

**From Server** (broadcast every 100ms to subscribed clients):
```json
{
  "type": "quote_update",
  "data": [
    {
      "symbol": "EURUSD",
      "bid": 1.0850,
      "ask": 1.0852,
      "time": "2026-03-29T14:30:00.123Z"
    }
  ]
}
```

### Candlestick Update

**From Server** (on candle close):
```json
{
  "type": "candlestick_closed",
  "data": {
    "symbol": "EURUSD",
    "timeframe": "1m",
    "open_time": "2026-03-29T14:30:00Z",
    "close_time": "2026-03-29T14:31:00Z",
    "open": 1.0848,
    "high": 1.0855,
    "low": 1.0847,
    "close": 1.0852,
    "volume": 5000000
  }
}
```

### Watchlist Changed

**From Server** (broadcast when watchlist is updated):
```json
{
  "type": "watchlist_changed",
  "data": {
    "watchlist_id": 5,
    "action": "symbol_added",  // "symbol_added" | "symbol_removed" | "renamed"
    "symbol": "EURUSD",
    "timestamp": "2026-03-29T14:30:00.123Z"
  }
}
```

---

## State Transitions & Error Handling

### Quote Fetch Failure
```
FETCH Quote from MT5
  ├─ SUCCESS → CACHE (5m TTL) → BROADCAST
  └─ FAILURE
      ├─ Retry with exponential backoff (1s, 2s, 4s... 60s max)
      ├─ Return STALE cached quote to client
      └─ Log error with user_id, symbol, retry_count
```

### Candlestick Aggregation
```
Quote received
  ├─ Check if running candle exists for (symbol, timeframe)
  ├─ YES → Update running candle atomically (high, low, close, volume)
  └─ NO → Create new running candle from quote
         ├─ Check if previous candle needs closing
         └─ If previous close time < quote time
             ├─ Set is_open=False on previous candle (IMMUTABLE)
             └─ Broadcast candlestick_closed event
```

### Watchlist Symbol Addition
```
User adds symbol to watchlist
  ├─ Validate symbol exists in MT5 (query SymbolInfo)
  ├─ Check no duplicate in watchlist_symbols
  ├─ Insert WatchlistSymbol record (atomic transaction)
  ├─ ON SUCCESS
  │   ├─ Increment subscription_count on SymbolInfo
  │   ├─ Subscribe WebSocket to symbol quotes/candlesticks
  │   └─ Broadcast watchlist_changed event
  └─ ON FAILURE
      ├─ Log error
      └─ Return validation error to client (400)
```

---

## Database Indexing Strategy

**Primary Indexes** (for query performance):
```sql
-- Candlestick queries (critical path)
CREATE INDEX ix_candlestick_symbol_timeframe_time 
  ON candlestick(symbol_id, timeframe, open_time DESC);

-- Watchlist queries
CREATE INDEX ix_watchlist_user_id ON watchlist(user_id);
CREATE INDEX ix_watchlist_symbol_symbol_id ON watchlist_symbol(symbol_id);

-- Audit log queries
CREATE INDEX ix_login_audit_user_timestamp ON login_audit(user_id, timestamp DESC);
```

**Expected Query Patterns**:
- `SELECT * FROM candlestick WHERE symbol_id=? AND timeframe=? ORDER BY open_time DESC LIMIT 500` → Fetch last 500 candles (< 50ms)
- `SELECT * FROM watchlist WHERE user_id=? ORDER BY created_at` → List watchlists (< 10ms)
- `SELECT * FROM watchlist_symbol WHERE watchlist_id=?` → Watchlist symbols (< 5ms)

---

## Validation & Business Rules

### Watchlist Rules
- Max 100 symbols per watchlist
- Unique (user_id, watchlist_name)
- Only one default watchlist per user
- Cascade delete WatchlistSymbol records when watchlist deleted

### Candlestick Rules
- Immutable after is_open=False (enforced in candlestick_service.py)
- Running candle updates atomic (single database transaction)
- Gap detection: if quote time > expected next candle open, insert missing open candle
- Timeframe boundary aligned: open_time must match boundary (e.g., 14:30:00 for 1m, 14:30:00 for 5m)

### Quote Rules
- bid < ask (validated on insertion)
- time must be UTC, not in future
- TTL expiration: quotes older than 5 minutes auto-expired (not stored in DB)

---

## Future Extensions

These are NOT part of MVP but data model is designed for forward compatibility:

1. **Multi-Account Support**: Add `account_id` to Candlestick, Quote, WatchlistSymbol; user has 1:N accounts
2. **Alert System**: New table `PriceAlert(symbol, target_price, action_on_trigger, enabled)`
3. **Trade History**: New table `Trade(account_id, symbol, entry_price, exit_price, pnl, duration)`
4. **Performance Analytics**: New table `TradeStats(user_id, symbol, win_rate, avg_winner, avg_loser, sharpe_ratio)`

---

**Next**: Generate API contracts + quickstart guide