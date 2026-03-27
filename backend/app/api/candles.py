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

        if candle_cache.is_prefetch_in_progress(symbol, timeframe, start_from):
            logger.debug(f"[PREFETCH] Prefetch already in progress for {symbol}:{timeframe}:{start_from}")
            return

        candle_cache.mark_prefetch_started(symbol, timeframe, start_from)

        existing_count = len(candle_cache.cache.get(symbol, {}).get(timeframe, []))
        target_count = candle_cache.max_bars_per_symbol
        remaining = target_count - existing_count

        if remaining <= 0:
            logger.debug(f"[PREFETCH] Already have {existing_count} bars, target is {target_count}")
            return

        segment_size = candle_cache.prefetch_segment_size
        segments_needed = (remaining + segment_size - 1) // segment_size

        for segment in range(segments_needed):
            segment_start = start_from + (segment * segment_size)
            prefetch_count = min(segment_size, remaining - (segment * segment_size))

            if prefetch_count <= 0:
                break

            logger.debug(f"[PREFETCH] Fetching segment {segment + 1}: {prefetch_count} bars starting from {segment_start}")

            try:
                mt5_timeframe = TIMEFRAME_MAP[timeframe]
                candles = await mt5_manager.get_rates(symbol, mt5_timeframe, prefetch_count + segment_start)

                if candles and len(candles) > segment_start:
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
    count: int = 500,
    segment: int = 0,
    from_time: Optional[float] = None,
    background_tasks: BackgroundTasks = None,
    token: str = "",
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """
    Get OHLC candlestick data for a symbol with caching and prefetching.

    Query params:
      - timeframe: 1m,5m,15m,1h,4h,1d
      - count: bars per segment (max 500)
      - segment: 0/latest, 1 older, etc.
    """
    logger.info(f"[CANDLES] Request received for {symbol}, timeframe={timeframe}, segment={segment}, count={count}, from_time={from_time}")

    if token:
        try:
            logger.debug("[CANDLES] Verifying token...")
            verify_token(token)
            logger.debug("[CANDLES] Token verified successfully")
        except Exception as e:
            logger.error(f"[CANDLES] Token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")

    if timeframe not in TIMEFRAME_MAP:
        logger.warning(f"[CANDLES] Invalid timeframe: {timeframe}")
        raise HTTPException(status_code=400, detail=f"Invalid timeframe. Must be one of: {list(TIMEFRAME_MAP.keys())}")

    count = min(max(count, 1), 1000)
    if segment < 0:
        logger.warning(f"[CANDLES] Invalid segment: {segment}")
        raise HTTPException(status_code=400, detail="Invalid segment. Must be 0 or positive integer")

    # FIX: single try/except block — the original had two duplicate except clauses
    # which caused a SyntaxError and masked real errors.
    try:
        mt5_timeframe = TIMEFRAME_MAP[timeframe]

        if segment == 0:
            logger.debug(f"[CANDLES] Refreshing latest candles for {symbol}:{timeframe} from MT5")
            try:
                latest_candles = await mt5_manager.get_rates(symbol, mt5_timeframe, count)
                if latest_candles and len(latest_candles) > 0:
                    candle_cache.store_candles(symbol, timeframe, latest_candles, is_append=False)
                    logger.info(f"[CANDLES] Updated cache with {len(latest_candles)} latest candles for {symbol}:{timeframe}")
                else:
                    logger.warning(f"[CANDLES] MT5 returned no latest candles for {symbol}:{timeframe}")
            except Exception as e:
                logger.error(f"[CANDLES] Failed to refresh latest candles for {symbol}:{timeframe}: {e}")

        cached_segment = candle_cache.get_cached_segment(symbol, timeframe, segment, count)
        if cached_segment:
            logger.info(f"[CANDLES] Cache-hit segment {segment} for {symbol}:{timeframe} ({len(cached_segment)} bars)")

            sorted_segment = sorted(cached_segment, key=lambda c: c['time'])
            total_cached = candle_cache.get_cached_total(symbol, timeframe)
            has_more = total_cached > (segment + 1) * count

            if background_tasks and candle_cache.is_prefetch_needed(symbol, timeframe, count):
                background_tasks.add_task(prefetch_candles_background, symbol, timeframe)
                logger.debug(f"[CANDLES] Queued background prefetch for {symbol}:{timeframe}")

            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "segment": segment,
                "count": len(sorted_segment),
                "cached": True,
                "has_backscroll": has_more,
                "candles": sorted_segment,
            }

        # Cache miss — fetch from MT5
        fetch_count = candle_cache.max_bars_per_symbol

        logger.info(f"[CANDLES] Cache miss: fetching {fetch_count} bars from MT5 for {symbol}:{timeframe}")
        candles = await mt5_manager.get_rates(symbol, mt5_timeframe, fetch_count)

        if candles is None or not candles:
            error_msg = f"Couldn't load asset pair: {symbol}. Verify symbol exists and MT5 is connected."
            logger.error(f"[CANDLES-ERROR] {error_msg}")
            raise HTTPException(status_code=404, detail=error_msg)

        candle_cache.store_candles(symbol, timeframe, candles, is_append=False)
        logger.info(f"[CANDLES] Stored {len(candles)} candles in cache for {symbol}:{timeframe}")

        segment_data = candle_cache.get_cached_segment(symbol, timeframe, segment, count)
        sorted_segment = sorted(segment_data, key=lambda c: c['time']) if segment_data else []

        total_cached = candle_cache.get_cached_total(symbol, timeframe)
        has_more = total_cached > (segment + 1) * count

        if background_tasks:
            background_tasks.add_task(prefetch_candles_background, symbol, timeframe)
            logger.debug(f"[CANDLES] Queued background prefetch for {symbol}:{timeframe} after MT5 fetching")

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "segment": segment,
            "count": len(sorted_segment),
            "cached": False,
            "has_backscroll": has_more,
            "candles": sorted_segment,
        }

    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to load candles for {symbol}: {str(e)}"
        logger.error(f"[CANDLES-ERROR] {error_msg}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/cache/stats")
async def get_cache_stats(token: str = "") -> Dict[str, Any]:
    """Get cache statistics"""
    if token:
        try:
            verify_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

    return candle_cache.get_cache_stats()


@router.delete("/cache/{symbol}")
async def clear_symbol_cache(symbol: str, token: str = "") -> Dict[str, str]:
    """Clear cache for a specific symbol"""
    if token:
        try:
            verify_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

    candle_cache.clear_symbol_cache(symbol)
    return {"message": f"Cache cleared for symbol {symbol}"}


@router.delete("/cache")
async def clear_all_cache(token: str = "") -> Dict[str, str]:
    """Clear all cache"""
    if token:
        try:
            verify_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

    # FIX: removed erroneous try/except here that referenced undefined `symbol`
    candle_cache.clear_all_cache()
    return {"message": "All cache cleared"}