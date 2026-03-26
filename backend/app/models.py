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
