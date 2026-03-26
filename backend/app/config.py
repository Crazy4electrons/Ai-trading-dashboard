"""
Configuration and environment settings for TradeMatrix backend
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")

# JWT Settings
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# MT5 Defaults
MT5_DEFAULT_SERVER = os.getenv("MT5_DEFAULT_SERVER", "MetaQuotes-Demo")
MT5_TIMEFRAME_MAP = {
    "1m": 1,      # TIMEFRAME_M1
    "5m": 5,      # TIMEFRAME_M5
    "15m": 15,    # TIMEFRAME_M15
    "1h": 60,     # TIMEFRAME_H1
    "4h": 240,    # TIMEFRAME_H4
    "1d": 1440,   # TIMEFRAME_D1
}

# WebSocket Settings
WS_BATCH_INTERVAL_MS = 100  # Batch updates every 100ms
WS_MAX_CONNECTIONS = 100

# Symbol Categories
SYMBOL_CATEGORIES = ["Forex", "Crypto", "Stocks", "Commodities", "Indices", "ETFs"]

# Encryption
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", None)  # Will be generated if not provided
