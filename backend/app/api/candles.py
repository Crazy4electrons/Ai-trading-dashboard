"""
Candles API - provides OHLC data for charting with caching and prefetching
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session
from typing import List, Dict, Optional, Any
from datetime import datetime
from ..database import get_session
from ..security import verify_token
from ..services.mt5_adapter import mt5_manager
from ..services.candle_cache import candle_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/candles", tags=["candles"])

# Map timeframe strings to MT5 format
TIMEFRAME_MAP = {
    "1m": 1,      # M1
    "5m": 5,      # M5
    "15m": 15,    # M15
    "1h": 60,     # H1
    "4h": 240,    # H4
    "1d": 1440,   # D1
}


async def prefetch_candles_background(symbol: str, timeframe: str, start_from: int = 0):
    """
    Background task to prefetch additional candle data
    """
    try:
        logger.info(f"[PREFETCH] Starting background prefetch for {symbol}:{timeframe} from segment {start_from}")

        # Check if already prefetching
        if candle_cache.is_prefetch_in_progress(symbol, timeframe, start_from):
            logger.debug(f"[PREFETCH] Prefetch already in progress for {symbol}:{timeframe}:{start_from}")
            return

        candle_cache.mark_prefetch_started(symbol, timeframe, start_from)

        # Calculate how many bars we need to reach our target
        existing_count = len(candle_cache.cache.get(symbol, {}).get(timeframe, []))
        target_count = candle_cache.max_bars_per_symbol
        remaining = target_count - existing_count

        if remaining <= 0:
            logger.debug(f"[PREFETCH] Already have {existing_count} bars, target is {target_count}")
            return

        # Prefetch in segments
        segment_size = candle_cache.prefetch_segment_size
        segments_needed = (remaining + segment_size - 1) // segment_size  # Ceiling division

        for segment in range(segments_needed):
            segment_start = start_from + (segment * segment_size)
            prefetch_count = min(segment_size, remaining - (segment * segment_size))

            if prefetch_count <= 0:
                break

            logger.debug(f"[PREFETCH] Fetching segment {segment + 1}: {prefetch_count} bars starting from {segment_start}")

            try:
                # Get MT5 timeframe
                mt5_timeframe = TIMEFRAME_MAP[timeframe]

                # Fetch additional historical data
                # For backscroll, we need to get older data
                candles = await mt5_manager.get_rates(symbol, mt5_timeframe, prefetch_count + segment_start)

                if candles and len(candles) > segment_start:
                    # Take the older portion for backscroll
                    older_candles = candles[-prefetch_count:] if len(candles) > prefetch_count else candles
                    candle_cache.store_candles(symbol, timeframe, older_candles, is_append=True)
                    logger.info(f"[PREFETCH] Successfully prefetched {len(older_candles)} additional candles for {symbol}:{timeframe}")
                else:
                    logger.warning(f"[PREFETCH] No additional candles available for {symbol}:{timeframe}")
                    break

            except Exception as e:
                logger.error(f"[PREFETCH] Error prefetching segment {segment + 1} for {symbol}:{timeframe}: {e}")
                break

        logger.info(f"[PREFETCH] Completed prefetch for {symbol}:{timeframe}")

    except Exception as e:
        logger.error(f"[PREFETCH] Background prefetch failed for {symbol}:{timeframe}: {e}")
    finally:
        candle_cache.mark_prefetch_completed(symbol, timeframe, start_from)


@router.get("/{symbol}")
async def get_candles(
    symbol: str,
    timeframe: str = "1h",
    count: int = 500,  # Default to 500 candles as requested
    from_time: Optional[float] = None,  # Unix timestamp for backscroll
    background_tasks: BackgroundTasks = None,
    token: str = "",
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """
    Get OHLC candlestick data for a symbol with caching and prefetching

    Query parameters:
    - timeframe: 1m, 5m, 15m, 1h, 4h, 1d (default: 1h)
    - count: Number of candles to return (default: 500, max: 2000)
    - from_time: Unix timestamp to get candles from (for backscroll)
    """
    logger.info(f"[CANDLES] Request received for {symbol}, timeframe={timeframe}, count={count}, from_time={from_time}")

    # Verify token if provided
    if token:
        try:
            logger.debug(f"[CANDLES] Verifying token...")
            verify_token(token)
            logger.debug(f"[CANDLES] Token verified successfully")
        except Exception as e:
            logger.error(f"[CANDLES] Token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")

    # Validate timeframe
    if timeframe not in TIMEFRAME_MAP:
        logger.warning(f"[CANDLES] Invalid timeframe: {timeframe}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe. Must be one of: {list(TIMEFRAME_MAP.keys())}"
        )

    # Validate count (max 2000 as per cache limit)
    count = min(max(count, 1), 2000)
    logger.debug(f"[CANDLES] Count clamped to {count}")

    # Convert from_time to datetime if provided
    from_datetime = datetime.fromtimestamp(from_time) if from_time else None

    try:
        # Try to get from cache first
        cached_candles = candle_cache.get_cached_candles(symbol, timeframe, count, from_datetime)

        if cached_candles and len(cached_candles) >= count:
            logger.info(f"[CANDLES] Cache hit: returning {len(cached_candles)} cached candles for {symbol} ({timeframe})")

            # Start background prefetch if needed
            if background_tasks and candle_cache.is_prefetch_needed(symbol, timeframe, count):
                background_tasks.add_task(prefetch_candles_background, symbol, timeframe)

            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "count": len(cached_candles),
                "cached": True,
                "candles": cached_candles,
            }

        # Cache miss or insufficient data - fetch from MT5
        logger.info(f"[CANDLES] Cache miss or insufficient data - fetching from MT5")

        # Convert timeframe string to MT5 format
        mt5_timeframe = TIMEFRAME_MAP[timeframe]
        logger.debug(f"[CANDLES] Converted timeframe {timeframe} to MT5 format: {mt5_timeframe}")

        # For initial load, fetch more than requested to populate cache
        fetch_count = max(count, candle_cache.prefetch_segment_size)
        logger.info(f"[CANDLES] Fetching {fetch_count} candles from MT5 for {symbol}")

        # Fetch rates from MT5
        candles = await mt5_manager.get_rates(symbol, mt5_timeframe, fetch_count)

        if candles is None:
            error_msg = f"Could not fetch candles for symbol {symbol}. Verify symbol exists and MT5 is connected."
            logger.error(f"[CANDLES] {error_msg}")
            raise HTTPException(status_code=404, detail=error_msg)

        if not candles:
            error_msg = f"No candles available for {symbol}"
            logger.warning(f"[CANDLES] {error_msg}")
            raise HTTPException(status_code=404, detail=error_msg)

        # Store in cache
        candle_cache.store_candles(symbol, timeframe, candles)

        # Get the requested portion
        result_candles = candles[:count]

        logger.info(f"[CANDLES] Successfully retrieved {len(result_candles)} candles for {symbol} ({timeframe}) from MT5")

        # Start background prefetch for more data
        if background_tasks:
            background_tasks.add_task(prefetch_candles_background, symbol, timeframe)

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "count": len(result_candles),
            "cached": False,
            "candles": result_candles,
        }

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to load candles for {symbol}: {str(e)}"
        logger.error(f"[CANDLES] {error_msg}")
        logger.error(f"[CANDLES] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/cache/stats")
async def get_cache_stats(token: str = "") -> Dict[str, Any]:
    """Get cache statistics"""
    if token:
        try:
            verify_token(token)
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token")

    return candle_cache.get_cache_stats()


@router.delete("/cache/{symbol}")
async def clear_symbol_cache(symbol: str, token: str = "") -> Dict[str, str]:
    """Clear cache for a specific symbol"""
    if token:
        try:
            verify_token(token)
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token")

    candle_cache.clear_symbol_cache(symbol)
    return {"message": f"Cache cleared for symbol {symbol}"}


@router.delete("/cache")
async def clear_all_cache(token: str = "") -> Dict[str, str]:
    """Clear all cache"""
    if token:
        try:
            verify_token(token)
        except Exception as e:
            raise HTTPException(status_code=401, detail="Invalid token")
    try:
        candle_cache.clear_all_cache()
        return {"message": "All cache cleared"}
    except Exception as e:
        logger.error(f"[CANDLES] Unexpected error fetching candles for {symbol}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching candles: {str(e)}"
        )
