"""
Background cache worker - periodically syncs OHLCV candle data for all symbols/timeframes
"""
import asyncio
import logging
from datetime import datetime
from sqlmodel import Session
from sqlmodel import select

from app.models import CacheConfig, Watchlist, WatchlistItem
from app.services.candle_cache import CandleCacheService
from app.database import engine
from app.config import CACHE_WORKER_INTERVAL_SECONDS, CACHE_WORKER_ENABLED

logger = logging.getLogger(__name__)


class CacheWorker:
    """Background worker for cache synchronization"""
    
    def __init__(self):
        self.running = False
        self.task = None
    
    def get_session(self) -> Session:
        """Get database session"""
        from sqlmodel import Session
        return Session(engine)
    
    def get_symbols_from_watchlists(self, session: Session) -> set:
        """Get all unique symbols from user watchlists"""
        statement = select(WatchlistItem.symbol_id).distinct()
        symbol_ids = session.exec(statement).all()
        
        # Also get symbol names directly
        from app.models import Symbol
        statement = select(Symbol.name)
        symbols = session.exec(statement).all()
        
        return set(symbols) if symbols else set()
    
    async def sync_all_symbols(self, session: Session, cache_service: CandleCacheService) -> dict:
        """Sync candles for all symbols across all enabled timeframes"""
        start_time = datetime.utcnow()
        stats = {
            "start_time": start_time.isoformat(),
            "symbols_processed": 0,
            "timeframes_synced": 0,
            "errors": 0
        }
        
        # Get symbols to cache
        symbols = self.get_symbols_from_watchlists(session)
        if not symbols:
            logger.warning("[CACHE-WORKER] No symbols found in watchlists")
            symbols = {"EURUSD", "GBPUSD", "USDJPY"}  # Default symbols
        
        logger.info(f"[CACHE-WORKER] Starting sync for {len(symbols)} symbols")
        
        # Get enabled timeframes
        configs = cache_service.get_cache_config()
        enabled_timeframes = [c.timeframe for c in configs if c.enabled]
        
        logger.info(f"[CACHE-WORKER] Enabled timeframes: {enabled_timeframes}")
        
        # Sync each symbol for each enabled timeframe
        for symbol in symbols:
            for timeframe in enabled_timeframes:
                try:
                    success = await cache_service.sync_candles_for_symbol(
                        symbol=symbol,
                        timeframe=timeframe,
                        force=False
                    )
                    if success:
                        stats["timeframes_synced"] += 1
                except Exception as e:
                    logger.error(f"[CACHE-WORKER] Error syncing {symbol} ({timeframe}m): {e}")
                    stats["errors"] += 1
                
                # Small delay between requests to avoid overloading MT5
                await asyncio.sleep(0.5)
            
            stats["symbols_processed"] += 1
        
        duration = (datetime.utcnow() - start_time).total_seconds()
        stats["duration_seconds"] = duration
        stats["end_time"] = datetime.utcnow().isoformat()
        
        logger.info(f"[CACHE-WORKER] Sync complete: {stats['timeframes_synced']} timeframes synced, "
                   f"{stats['symbols_processed']} symbols, {stats['errors']} errors, {duration:.1f}s")
        
        return stats
    
    async def run(self):
        """Main worker loop"""
        if not CACHE_WORKER_ENABLED:
            logger.info("[CACHE-WORKER] Cache worker is disabled")
            return
        
        self.running = True
        logger.info(f"[CACHE-WORKER] Starting cache worker (interval: {CACHE_WORKER_INTERVAL_SECONDS}s)")
        
        try:
            while self.running:
                try:
                    session = self.get_session()
                    cache_service = CandleCacheService(session)
                    
                    # Run sync cycle
                    stats = await self.sync_all_symbols(session, cache_service)
                    
                    session.close()
                    
                    # Wait for next cycle
                    logger.debug(f"[CACHE-WORKER] Next sync in {CACHE_WORKER_INTERVAL_SECONDS}s")
                    await asyncio.sleep(CACHE_WORKER_INTERVAL_SECONDS)
                    
                except Exception as e:
                    logger.error(f"[CACHE-WORKER] Unexpected error in sync cycle: {e}", exc_info=True)
                    # Wait a bit before retrying on error
                    await asyncio.sleep(60)
        
        except asyncio.CancelledError:
            logger.info("[CACHE-WORKER] Cache worker cancelled")
            self.running = False
        finally:
            self.running = False
            logger.info("[CACHE-WORKER] Cache worker stopped")
    
    def start(self) -> asyncio.Task:
        """Start the background worker"""
        if self.task and not self.task.done():
            logger.warning("[CACHE-WORKER] Worker already running")
            return self.task
        
        self.task = asyncio.create_task(self.run())
        logger.info("[CACHE-WORKER] Worker task created")
        return self.task
    
    def stop(self):
        """Stop the background worker"""
        if self.task:
            self.task.cancel()
            self.running = False
            logger.info("[CACHE-WORKER] Worker stop requested")


# Global worker instance
cache_worker = CacheWorker()
