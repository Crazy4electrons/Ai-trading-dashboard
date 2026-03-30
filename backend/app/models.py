"""
SQLModel database models for TradeMatrix
"""
from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
import uuid


class User(SQLModel, table=True):
    """User account model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    mt_accounts: List["MTAccount"] = Relationship(back_populates="user")
    watchlists: List["Watchlist"] = Relationship(back_populates="user")


class MTAccount(SQLModel, table=True):
    """MetaTrader5 account credentials"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="user.id")
    server: str
    account_number: int
    password_encrypted: str  # Encrypted password
    currency: str = "USD"
    account_type: str = "DEMO"  # DEMO or REAL
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    
    user: User = Relationship(back_populates="mt_accounts")
    account_states: List["AccountState"] = Relationship(back_populates="mt_account")
    trades: List["Trade"] = Relationship(back_populates="mt_account")
    watchlist: Optional["Watchlist"] = Relationship(back_populates="mt_account")


class Symbol(SQLModel, table=True):
    """Available trading symbols"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str = Field(unique=True, index=True)
    category: str = Field(index=True)  # Forex, Crypto, Stocks, Commodities, Indices, ETFs
    description: Optional[str] = None
    digits: int = 4  # Decimal places
    point: float = 0.0001  # Minimum price move
    bid: float = 0.0
    ask: float = 0.0
    last_update: datetime = Field(default_factory=datetime.utcnow)
    
    quotes: List["Quote"] = Relationship(back_populates="symbol")
    watchlist_items: List["WatchlistItem"] = Relationship(back_populates="symbol")


class Watchlist(SQLModel, table=True):
    """User's watchlist"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    mt_account_id: str = Field(foreign_key="mtaccount.id", index=True)
    name: str = "My Watchlist"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    user: User = Relationship(back_populates="watchlists")
    mt_account: MTAccount = Relationship(back_populates="watchlist")
    items: List["WatchlistItem"] = Relationship(back_populates="watchlist", cascade_delete=True)


class WatchlistItem(SQLModel, table=True):
    """Individual symbol in a watchlist"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    watchlist_id: str = Field(foreign_key="watchlist.id", index=True)
    symbol_id: str = Field(foreign_key="symbol.id", index=True)
    added_at: datetime = Field(default_factory=datetime.utcnow)
    
    watchlist: Watchlist = Relationship(back_populates="items")
    symbol: Symbol = Relationship(back_populates="watchlist_items")


class Quote(SQLModel, table=True):
    """Historical price quotes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    symbol_id: str = Field(foreign_key="symbol.id", index=True)
    bid: float
    ask: float
    spread: float
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    
    symbol: Symbol = Relationship(back_populates="quotes")


class Trade(SQLModel, table=True):
    """Historical trades"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    mt_account_id: str = Field(foreign_key="mtaccount.id", index=True)
    symbol: str = Field(index=True)
    volume: float
    entry_price: float
    current_price: float = 0.0
    profit_loss: float = 0.0
    opened_at: datetime = Field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    status: str = "open"  # open or closed
    
    mt_account: MTAccount = Relationship(back_populates="trades")


class AccountState(SQLModel, table=True):
    """Account balance/equity snapshots"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    mt_account_id: str = Field(foreign_key="mtaccount.id", index=True)
    balance: float
    equity: float
    margin: float
    free_margin: float
    margin_level: float
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    
    mt_account: MTAccount = Relationship(back_populates="account_states")


class Candle(SQLModel, table=True):
    """OHLCV candle data for all symbols and timeframes"""
    __tablename__ = "candle"
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    symbol: str = Field(index=True)  # Symbol name (e.g., "EURUSD")
    timeframe: int = Field(index=True)  # Timeframe in minutes (1, 5, 15, 30, 60, 240, 1440, 10080, 43200)
    timestamp: int = Field(index=True)  # Unix timestamp (seconds), composite index with symbol+timeframe
    open: float
    high: float
    low: float
    close: float
    tick_volume: int
    volume: int
    spread: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Composite unique index: (symbol, timeframe, timestamp)
    # Note: SQLModel doesn't support composite unique constraints directly,
    # but the service layer will enforce uniqueness on upsert


class CacheConfig(SQLModel, table=True):
    """Configuration for candle data cache ranges by timeframe"""
    __tablename__ = "cache_config"
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    timeframe: int = Field(unique=True, index=True)  # Minutes: 1, 5, 15, 30, 60, 240, 1440, 10080, 43200
    cache_months: int  # How many months of candle data to maintain (e.g., 1m→1, 1h→12)
    enabled: bool = True  # Enable/disable caching for this timeframe
    last_sync_time: Optional[datetime] = None  # When cache was last updated
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Admin(SQLModel, table=True):
    """Admin account for cache management"""
    __tablename__ = "admin"
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    account_number: int = Field(unique=True, index=True)  # Admin MT5 account number
    password_encrypted: str  # Encrypted password
    email: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TerminalProcess(SQLModel, table=True):
    """Tracks per-user MT5 terminal processes for multi-user support"""
    __tablename__ = "terminal_process"
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    account_id: str = Field(foreign_key="mtaccount.id", index=True)  # FK to MTAccount
    user_id: str = Field(foreign_key="user.id", index=True)  # FK to User
    terminal_path: str  # Full path to user's terminal folder (e.g. C:/MT5_UserTerminals/12345)
    process_id: int  # Windows process ID (PID)
    is_running: bool = True  # Currently running status
    login_status: str = "initializing"  # offline, initializing, logging_in, connected, error
    started_at: datetime = Field(default_factory=datetime.utcnow)
    last_ping: datetime = Field(default_factory=datetime.utcnow)  # Last activity time
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
