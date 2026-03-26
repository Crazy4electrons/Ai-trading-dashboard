"""
Candles API - provides OHLC data for charting
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from typing import List, Dict, Optional
from ..database import get_session
from ..security import verify_token
from ..services.mt5_adapter import mt5_manager

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
    timeframe: str = "1h",
    count: int = 100,
    token: str = "",
    session: Session = Depends(get_session),
) -> Dict[str, List]:
    """
    Get OHLC candlestick data for a symbol
    
    Query parameters:
    - timeframe: 1m, 5m, 15m, 1h, 4h, 1d (default: 1h)
    - count: Number of candles to return (default: 100, max: 1000)
    """
    logger.info(f"[CANDLES] Request received for {symbol}, timeframe={timeframe}, count={count}")
    
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
    
    # Validate count
    count = min(max(count, 1), 1000)  # Clamp between 1-1000
    logger.debug(f"[CANDLES] Count clamped to {count}")
    
    try:
        # Convert timeframe string to MT5 format
        mt5_timeframe = TIMEFRAME_MAP[timeframe]
        logger.debug(f"[CANDLES] Converted timeframe {timeframe} to MT5 format: {mt5_timeframe}")
        
        # Fetch rates from MT5
        logger.info(f"[CANDLES] Calling mt5_manager.get_rates({symbol}, {mt5_timeframe}, {count})")
        candles = await mt5_manager.get_rates(symbol, mt5_timeframe, count)
        
        if candles is None:
            logger.error(f"[CANDLES] Failed to fetch candles - returned None")
            raise HTTPException(
                status_code=404,
                detail=f"Could not fetch candles for symbol {symbol}. Verify symbol exists."
            )
        
        if not candles:
            logger.warning(f"[CANDLES] No candles available for {symbol}")
            raise HTTPException(
                status_code=404,
                detail=f"No candles available for {symbol}"
            )
        
        logger.info(f"[CANDLES] Successfully retrieved {len(candles)} candles for {symbol} ({timeframe})")
        logger.debug(f"[CANDLES] First candle: {candles[0] if candles else 'N/A'}, Last candle: {candles[-1] if candles else 'N/A'}")
        
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "count": len(candles),
            "candles": candles,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CANDLES] Unexpected error fetching candles for {symbol}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching candles: {str(e)}"
        )
