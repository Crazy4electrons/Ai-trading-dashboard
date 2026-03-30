"""
Candles API - provides OHLC data for charting with database caching
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Header
from sqlmodel import Session
from typing import List, Dict, Optional, Any
from datetime import datetime
from ..database import get_session
from ..security import verify_token
from ..services.mt5_adapter import mt5_manager
from ..services.candle_cache import CandleCacheService

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


@router.get("/{symbol}")
async def get_candles(
    symbol: str,
    session: Session = Depends(get_session),
    timeframe: str = "1h",
    count: int = 500,
    token: str = "",
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """
    Get OHLC candlestick data for a symbol from cache or MT5.
    
    Query params:
      - timeframe: 1m,5m,15m,1h,4h,1d
      - count: max candles to return
      - token: (deprecated) JWT token via query param - use Authorization header instead
      
    Headers:
      - Authorization: Bearer <token>
    """
    logger.info(f"[CANDLES] Request for {symbol}, timeframe={timeframe}, count={count}")

    # Extract token from Authorization header (Bearer token) or fall back to query param
    extracted_token = token
    if authorization and isinstance(authorization, str) and authorization.startswith("Bearer "):
        extracted_token = authorization[7:]  # Remove "Bearer " prefix
    
    if extracted_token:
        try:
            verify_token(extracted_token)
            logger.debug("[CANDLES] Token verified via Authorization header or query param")
        except Exception as e:
            logger.error(f"[CANDLES] Token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")

    if timeframe not in TIMEFRAME_MAP:
        logger.warning(f"[CANDLES] Invalid timeframe: {timeframe}")
        raise HTTPException(status_code=400, detail=f"Invalid timeframe. Must be one of: {list(TIMEFRAME_MAP.keys())}")

    count = min(max(count, 1), 1000)
    mt5_timeframe = TIMEFRAME_MAP[timeframe]
    
    try:
        cache_service = CandleCacheService(session)
        
        # Try to get candles from database cache first
        logger.debug(f"[CANDLES] Checking cache for {symbol} ({timeframe})")
        cached_candles = cache_service.get_cached_candles(symbol, mt5_timeframe)
        
        if cached_candles and len(cached_candles) > 0:
            logger.info(f"[CANDLES] Cache hit for {symbol} ({timeframe}): {len(cached_candles)} candles")
            
            # Convert DB objects to dict format for response
            candles_formatted = [
                {
                    "time": c.timestamp,
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "tick_volume": c.tick_volume,
                    "volume": c.volume,
                    "spread": c.spread
                }
                for c in cached_candles[-count:]  # Return most recent candles
            ]
            
            # If we have more candles in the cache than requested, there's definitely more history available
            has_backscroll = len(cached_candles) > count
            
            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "count": len(candles_formatted),
                "source": "database",
                "cached": True,
                "has_backscroll": has_backscroll,
                "candles": candles_formatted
            }
        
        # Cache miss — fetch fresh data from MT5
        logger.info(f"[CANDLES] Cache miss for {symbol} ({timeframe}), fetching from MT5...")
        
        try:
            mt5_candles = await mt5_manager.get_rates(symbol, mt5_timeframe, count)
            
            if mt5_candles and len(mt5_candles) > 0:
                # Store in cache for future requests
                cache_service.upsert_candles(symbol, mt5_timeframe, mt5_candles)
                logger.info(f"[CANDLES] Fetched {len(mt5_candles)} candles from MT5 and cached")
                
                # If MT5 returned requested count of candles, there may be more data available
                has_backscroll = len(mt5_candles) >= count and count < 5000
                
                return {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "count": len(mt5_candles),
                    "source": "mt5",
                    "cached": False,
                    "has_backscroll": has_backscroll,
                    "candles": mt5_candles
                }
            else:
                logger.warning(f"[CANDLES] MT5 returned no candles for {symbol}")
                raise HTTPException(status_code=404, detail=f"No data available for {symbol}")
        
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[CANDLES] Error fetching from MT5: {e}")
            raise HTTPException(status_code=503, detail="Failed to fetch candles from MT5")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CANDLES] Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
