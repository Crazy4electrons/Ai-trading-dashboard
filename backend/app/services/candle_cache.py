"""
Candle Cache Service - persistent OHLCV data storage and retrieval with background sync
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from sqlmodel import Session, select

from app.models import Candle, CacheConfig
from app.services.mt5_adapter import mt5_manager
from app.config import DEFAULT_CACHE_CONFIG

logger = logging.getLogger(__name__)


class CandleCacheService:
    """Service for managing cached OHLCV candle data in database"""
    
    def __init__(self, session: Session):
        self.session = session
        self._initialize_cache_config()
    
    def _initialize_cache_config(self):
        """Ensure all cache configurations exist in database"""
        for timeframe, months in DEFAULT_CACHE_CONFIG.items():
            statement = select(CacheConfig).where(CacheConfig.timeframe == timeframe)
            existing = self.session.exec(statement).first()
            
            if not existing:
                config = CacheConfig(
                    timeframe=timeframe,
                    cache_months=months,
                    enabled=True,
                    last_sync_time=None
                )
                self.session.add(config)
        
        self.session.commit()
        logger.info("[CACHE] Cache configuration initialized")
    
    def get_cache_config(self, timeframe: Optional[int] = None):
        """Get cache configuration(s)"""
        if timeframe is None:
            statement = select(CacheConfig).order_by(CacheConfig.timeframe)
            return self.session.exec(statement).all()
        else:
            statement = select(CacheConfig).where(CacheConfig.timeframe == timeframe)
            return self.session.exec(statement).first()
    
    def update_cache_config(self, timeframe: int, cache_months: int, enabled: bool) -> CacheConfig:
        """Update cache configuration for a timeframe"""
        config = self.get_cache_config(timeframe)
        if not config:
            raise ValueError(f"Cache config not found for timeframe {timeframe}")
        
        config.cache_months = cache_months
        config.enabled = enabled
        config.updated_at = datetime.utcnow()
        self.session.add(config)
        self.session.commit()
        
        logger.info(f"[CACHE] Updated config for {timeframe}m: cache_months={cache_months}, enabled={enabled}")
        return config
    
    async def calculate_cache_date_range(self, timeframe: int) -> Tuple[datetime, datetime]:
        """Calculate date range to fetch based on cache config"""
        config = self.get_cache_config(timeframe)
        if not config:
            raise ValueError(f"No cache config for timeframe {timeframe}")
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=config.cache_months * 30)
        
        return start_date, end_date
    
    def upsert_candles(self, symbol: str, timeframe: int, candles: List[dict]) -> int:
        """Insert or update candles in database"""
        if not candles:
            return 0
        
        count = 0
        for candle_data in candles:
            timestamp_int = int(candle_data['time'])
            statement = select(Candle).where(
                (Candle.symbol == symbol) &
                (Candle.timeframe == timeframe) &
                (Candle.timestamp == timestamp_int)
            )
            existing = self.session.exec(statement).first()
            
            if existing:
                existing.close = candle_data['close']
                self.session.add(existing)
            else:
                candle = Candle(
                    symbol=symbol,
                    timeframe=timeframe,
                    timestamp=timestamp_int,
                    open=candle_data['open'],
                    high=candle_data['high'],
                    low=candle_data['low'],
                    close=candle_data['close'],
                    tick_volume=candle_data.get('tick_volume', 0),
                    volume=candle_data.get('volume', 0),
                    spread=candle_data.get('spread', 0)
                )
                self.session.add(candle)
            count += 1
        
        self.session.commit()
        logger.info(f"[CACHE] Upserted {count} candles for {symbol} ({timeframe}m)")
        return count
    
    def get_cached_candles(self, symbol: str, timeframe: int, 
                          start_time: Optional[int] = None, 
                          end_time: Optional[int] = None) -> List[Candle]:
        """Get cached candles from database"""
        statement = select(Candle).where(
            (Candle.symbol == symbol) &
            (Candle.timeframe == timeframe)
        )
        
        if start_time:
            statement = statement.where(Candle.timestamp >= start_time)
        if end_time:
            statement = statement.where(Candle.timestamp <= end_time)
        
        statement = statement.order_by(Candle.timestamp)
        return self.session.exec(statement).all()
    
    def get_cache_status(self) -> dict:
        """Get cache status across all timeframes"""
        configs = self.get_cache_config()
        status = {
            "last_updated": datetime.utcnow().isoformat(),
            "timeframes": []
        }
        
        for config in configs:
            statement = select(Candle).where(Candle.timeframe == config.timeframe)
            count = len(self.session.exec(statement).all())
            
            status["timeframes"].append({
                "timeframe": config.timeframe,
                "cache_months": config.cache_months,
                "enabled": config.enabled,
                "last_sync_time": config.last_sync_time.isoformat() if config.last_sync_time else None,
                "candle_count": count
            })
        
        return status
    
    async def sync_candles_for_symbol(self, symbol: str, timeframe: int, force: bool = False) -> bool:
        """Fetch and cache candles for symbol/timeframe"""
        config = self.get_cache_config(timeframe)
        if not config or not config.enabled:
            logger.debug(f"[CACHE] Caching disabled for {timeframe}m")
            return False
        
        if not force and config.last_sync_time:
            if datetime.utcnow() - config.last_sync_time < timedelta(hours=1):
                logger.debug(f"[CACHE] Skipping {symbol} {timeframe}m (recently synced)")
                return True
        
        try:
            start_date, end_date = await self.calculate_cache_date_range(timeframe)
            logger.info(f"[CACHE] Syncing {symbol} ({timeframe}m)")
            
            candles = await mt5_manager.get_rates(
                symbol=symbol,
                timeframe=timeframe,
                count=5000
            )
            
            if candles:
                self.upsert_candles(symbol, timeframe, candles)
                config.last_sync_time = datetime.utcnow()
                self.session.add(config)
                self.session.commit()
                logger.info(f"[CACHE] Synced {len(candles)} candles for {symbol} ({timeframe}m)")
                return True
            else:
                logger.warning(f"[CACHE] No candles fetched for {symbol} ({timeframe}m)")
                return False
                
        except Exception as e:
            logger.error(f"[CACHE] Error syncing {symbol} ({timeframe}m): {e}", exc_info=True)
            return False


# Keep backward-compatible global instance for existing code
class CandleCache:
    """Backward compatibility wrapper for in-memory cache"""
    def __init__(self):
        self.cache = {}
        self.cache_hits = 0
        self.cache_misses = 0
    
    def get_cached_candles(self, symbol: str, timeframe: str, count: int, from_time=None):
        return None
    
    def store_candles(self, symbol: str, timeframe: str, candles: List, is_append: bool = False):
        pass
    
    def get_cache_stats(self):
        return {"total_symbols": 0, "cache_hits": 0, "cache_misses": 0}


# Global instance for backward compatibility
candle_cache = CandleCache()