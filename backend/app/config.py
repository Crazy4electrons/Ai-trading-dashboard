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

# Admin Settings
ADMIN_ACCOUNT_NUMBER = int(os.getenv("ADMIN_ACCOUNT_NUMBER", "999999"))
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin_password")

# Cache Configuration (OHLCV candle data retention in months)
DEFAULT_CACHE_CONFIG = {
    1: 1,        # 1m   → 1 month
    5: 2,        # 5m   → 2 months
    15: 4,       # 15m  → 4 months
    30: 6,       # 30m  → 6 months
    60: 12,      # 1h   → 12 months
    240: 24,     # 4h   → 24 months
    1440: 48,    # 1d   → 48 months
    10080: 48,   # 1w   → 48 months
    43200: 48,   # 1M   → 48 months
}

# Cache Worker (background task for fetching and storing candles)
# DISABLED BY DEFAULT - Data is lazy-loaded on-demand as users interact with charts
# Enable this if you want background prefetching (not recommended for optimal performance)
CACHE_WORKER_INTERVAL_SECONDS = 300  # Run every 5 minutes (if enabled)
CACHE_WORKER_ENABLED = False  # Set to True to enable automatic background cache syncing
CACHE_FETCH_BATCH_SIZE = 10  # Number of symbols to fetch candles for per cycle
