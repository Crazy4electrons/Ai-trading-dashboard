"""
Admin API endpoints - cache configuration and management
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from pydantic import BaseModel

from app.database import get_session
from app.security import verify_token
from app.services.candle_cache import CandleCacheService
from app.models import CacheConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


class CacheConfigUpdate(BaseModel):
    """Schema for updating cache configuration"""
    cache_months: int
    enabled: bool


class CacheConfigResponse(BaseModel):
    """Schema for cache configuration response"""
    timeframe: int
    cache_months: int
    enabled: bool
    last_sync_time: str | None = None


def get_admin_token(token: str | None = None) -> dict:
    """Verify admin token"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No token provided"
        )
    
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return payload


@router.get("/config")
async def get_cache_config(
    session: Session = Depends(get_session),
    token: str | None = None
):
    """Get all cache configurations"""
    admin_token = get_admin_token(token)
    
    cache_service = CandleCacheService(session)
    configs = cache_service.get_cache_config()
    
    return [
        {
            "timeframe": c.timeframe,
            "cache_months": c.cache_months,
            "enabled": c.enabled,
            "last_sync_time": c.last_sync_time.isoformat() if c.last_sync_time else None
        }
        for c in configs
    ]


@router.put("/config/{timeframe}")
async def update_cache_config(
    timeframe: int,
    update: CacheConfigUpdate,
    session: Session = Depends(get_session),
    token: str | None = None
):
    """Update cache configuration for a specific timeframe"""
    admin_token = get_admin_token(token)
    
    cache_service = CandleCacheService(session)
    config = cache_service.update_cache_config(
        timeframe=timeframe,
        cache_months=update.cache_months,
        enabled=update.enabled
    )
    
    logger.info(f"[ADMIN] Updated cache config for {timeframe}m: "
               f"cache_months={update.cache_months}, enabled={update.enabled}")
    
    return {
        "timeframe": config.timeframe,
        "cache_months": config.cache_months,
        "enabled": config.enabled,
        "last_sync_time": config.last_sync_time.isoformat() if config.last_sync_time else None
    }


@router.get("/cache-status")
async def get_cache_status(
    session: Session = Depends(get_session),
    token: str | None = None
):
    """Get current cache status across all timeframes"""
    admin_token = get_admin_token(token)
    
    cache_service = CandleCacheService(session)
    status = cache_service.get_cache_status()
    
    return status


@router.post("/sync-now")
async def force_sync_now(
    timeframe: int | None = None,
    token: str | None = None,
    session: Session = Depends(get_session)
):
    """Force immediate sync of candles (all timeframes or specific one)"""
    admin_token = get_admin_token(token)
    
    logger.warning(f"[ADMIN] Force sync requested for timeframe: {timeframe}")
    
    # Note: This would trigger cache_worker to sync immediately
    # For now, just return a message indicating the request was queued
    return {
        "status": "sync_queued",
        "message": f"Sync queued for timeframe {timeframe or 'all'}",
        "note": "Cache worker will process this on next cycle"
    }


@router.get("/symbols")
async def get_cached_symbols(
    token: str | None = None,
    session: Session = Depends(get_session)
):
    """Get list of symbols being cached"""
    admin_token = get_admin_token(token)
    
    from sqlmodel import select
    from app.models import Candle
    
    # Get unique symbols from candle table
    statement = select(Candle.symbol).distinct()
    symbols = session.exec(statement).all()
    
    return {
        "symbols": list(symbols) if symbols else [],
        "count": len(symbols) if symbols else 0
    }
