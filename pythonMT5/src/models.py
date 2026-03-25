"""
Pydantic models for MT5 Python server request/response validation
"""
from typing import Optional, List, Any
from pydantic import BaseModel, Field
from datetime import datetime


# ==================== Request Models ====================

class LoginRequest(BaseModel):
    """MT5 login request"""
    account: int = Field(..., description="MT5 account number")
    password: str = Field(..., description="MT5 password")
    server: str = Field(..., description="MT5 server (e.g., MetaQuotes-Demo)")


class OrderRequest(BaseModel):
    """Place order request"""
    symbol: str = Field(..., description="Trading symbol (e.g., EURUSD)")
    order_type: str = Field(..., description="Order type: BUY or SELL")
    volume: float = Field(..., description="Order volume/lot size")
    price: Optional[float] = Field(None, description="Order price (for limit orders)")
    stop_loss: Optional[float] = Field(None, description="Stop loss price")
    take_profit: Optional[float] = Field(None, description="Take profit price")
    comment: Optional[str] = Field(None, description="Order comment")


class CandleRequest(BaseModel):
    """Get candles request"""
    symbol: str = Field(..., description="Trading symbol")
    timeframe: str = Field(default="1h", description="Timeframe (1m, 5m, 15m, 1h, 4h, 1d, etc)")
    count: int = Field(default=100, description="Number of candles to fetch")


# ==================== Response Models ====================

class TickResponse(BaseModel):
    """Real-time tick data"""
    symbol: str
    bid: float
    ask: float
    last: Optional[float] = None
    volume: Optional[int] = None
    time: int  # milliseconds since epoch


class CandleResponse(BaseModel):
    """OHLCV candle data"""
    time: int  # milliseconds since epoch
    open: float
    high: float
    low: float
    close: float
    volume: int


class DepthResponse(BaseModel):
    """Order book depth (bid/ask levels)"""
    symbol: str
    bids: List[tuple] = Field(default_factory=list)  # [(price, volume), ...]
    asks: List[tuple] = Field(default_factory=list)  # [(price, volume), ...]


class AccountInfoResponse(BaseModel):
    """Account information"""
    account_id: int
    balance: float
    equity: float
    free_margin: float
    used_margin: float
    margin_level: Optional[float] = None
    profit_loss: float  # Current P&L for open positions
    currency: str


class PositionResponse(BaseModel):
    """Open position data"""
    ticket: int
    symbol: str
    type: str  # BUY or SELL
    volume: float
    open_price: float
    current_price: float
    profit_loss: float
    profit_loss_percent: float
    open_time: int  # milliseconds
    comment: Optional[str] = None


class OrderResponse(BaseModel):
    """Order response"""
    ticket: int
    symbol: str
    type: str
    volume: float
    price: float
    open_time: int
    status: str


class StatusResponse(BaseModel):
    """MT5 connection status"""
    connected: bool
    account_id: Optional[int] = None
    balance: Optional[float] = None
    error: Optional[str] = None
    message: str


class TradeHistoryResponse(BaseModel):
    """Historical trade"""
    ticket: int
    symbol: str
    type: str  # BUY or SELL
    volume: float
    open_price: float
    close_price: float
    open_time: int
    close_time: int
    profit_loss: float
    comment: Optional[str] = None


class TradeCloseEvent(BaseModel):
    """Trade close event for backend record"""
    symbol: str
    volume: float
    entry_price: float
    exit_price: float
    profit_loss: float
    balance: float
    timestamp: int  # milliseconds


class SymbolInfoResponse(BaseModel):
    """Symbol information"""
    symbol: str
    description: str
    bid: float
    ask: float
    digits: int
    tick_size: float
    min_volume: float
    max_volume: float
    volume_step: float


class GenericErrorResponse(BaseModel):
    """Generic error response"""
    error: bool = True
    message: str
    code: Optional[str] = None
