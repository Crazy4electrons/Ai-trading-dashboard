"""
Account API endpoints
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import Optional

from app.database import get_session
from app.models import MTAccount, AccountState
from app.security import verify_token
from app.services.mt5_adapter import mt5_manager
from app.services.account_cache import account_data_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])


async def get_current_account(token: str = None, session: Session = Depends(get_session)) -> MTAccount:
    """Get current account from token"""
    try:
        if not token:
            logger.warning("[ACCOUNT] No token provided")
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        logger.debug("[ACCOUNT] Verifying token...")
        token_data = verify_token(token)
        if not token_data:
            logger.warning("[ACCOUNT] Invalid token data")
            raise HTTPException(status_code=401, detail="Invalid token")
        
        account_id = token_data.get("account_id")
        if not account_id:
            logger.warning("[ACCOUNT] No account_id in token")
            raise HTTPException(status_code=401, detail="No account in token")
        
        logger.debug(f"[ACCOUNT] Looking up account ID: {account_id}")
        statement = select(MTAccount).where(MTAccount.id == account_id)
        account = session.exec(statement).first()
        
        if not account:
            logger.warning(f"[ACCOUNT] Account not found for ID: {account_id}")
            raise HTTPException(status_code=404, detail="Account not found")
        
        logger.debug(f"[ACCOUNT] Found account: {account.account_number}")
        return account
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get current account: {str(e)}"
        logger.error(f"[ACCOUNT] {error_msg}")
        logger.error(f"[ACCOUNT] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/info")
async def get_account_info(
    token: str = None,
    session: Session = Depends(get_session)
):
    """Get current account information with caching (10 sec TTL)"""
    
    try:
        account = await get_current_account(token, session)
        
        logger.info(f"[ACCOUNT] Request for account info: {account.account_number}")
        
        # Try to get from cache first
        cached_info = account_data_cache.get_cached_account_info(str(account.id))
        if cached_info:
            logger.debug(f"[ACCOUNT] Returning cached account info for {account.account_number}")
            return cached_info
        
        logger.debug(f"[ACCOUNT] Cache miss - fetching from MT5 for {account.account_number}")
        
        # Get live info from MT5
        info = await mt5_manager.get_account_info()
        
        if not info:
            error_msg = f"Could not retrieve account info from MT5 for {account.account_number}"
            logger.error(f"[ACCOUNT] {error_msg}")
            return {
                "error": error_msg,
                "account_stored": {
                    "account": account.account_number,
                    "server": account.server,
                    "currency": account.currency[:3] if account.currency else "USD",
                    "account_type": account.account_type,
                }
            }
        
        # Cache the result
        account_data_cache.store_account_info(str(account.id), info)
        logger.debug(f"[ACCOUNT] Cached account info for {account.account_number}")
        
        # Store account state in database
        try:
            state = AccountState(
                mt_account_id=account.id,
                balance=info.get("balance", 0),
                equity=info.get("equity", 0),
                margin=info.get("margin", 0),
                free_margin=info.get("free_margin", 0),
                margin_level=info.get("margin_level", 0),
            )
            session.add(state)
            session.commit()
            logger.debug(f"[ACCOUNT] Stored account state for {account.account_number}")
        except Exception as e:
            logger.error(f"[ACCOUNT] Failed to store account state: {e}")
            # Don't fail the request if database storage fails
            pass
        
        return info
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get account info: {str(e)}"
        logger.error(f"[ACCOUNT] {error_msg}")
        logger.error(f"[ACCOUNT] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/positions")
async def get_positions(
    token: str = None,
    session: Session = Depends(get_session)
):
    """Get open positions with caching (5 sec TTL)"""
    
    try:
        account = await get_current_account(token, session)
        
        logger.info(f"[POSITIONS] Request for positions: {account.account_number}")
        
        # Try to get from cache first
        cached_positions = account_data_cache.get_cached_positions(str(account.id))
        if cached_positions is not None:
            logger.debug(f"[POSITIONS] Returning cached positions for {account.account_number} ({len(cached_positions)} positions)")
            return {"positions": cached_positions}
        
        logger.debug(f"[POSITIONS] Cache miss - fetching from MT5 for {account.account_number}")
        
        positions = await mt5_manager.get_positions()
        
        if positions is None:
            error_msg = f"Could not retrieve positions from MT5 for {account.account_number}"
            logger.error(f"[POSITIONS] {error_msg}")
            return {"error": error_msg, "positions": []}
        
        # Cache the result
        account_data_cache.store_positions(str(account.id), positions)
        logger.info(f"[POSITIONS] Cached {len(positions)} positions for {account.account_number}")
        
        return {"positions": positions}
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get positions: {str(e)}"
        logger.error(f"[POSITIONS] {error_msg}")
        logger.error(f"[POSITIONS] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/history")
async def get_account_history(
    token: str = None,
    limit: int = 50,
    session: Session = Depends(get_session)
):
    """Get account state history"""
    
    try:
        account = await get_current_account(token, session)
        
        logger.info(f"[ACCOUNT] Fetching history for {account.account_number} (limit={limit})")
        
        statement = select(AccountState).where(
            AccountState.mt_account_id == account.id
        ).order_by(AccountState.timestamp.desc()).limit(limit)
        
        states = session.exec(statement).all()
        logger.info(f"[ACCOUNT] Retrieved {len(states)} historical states for {account.account_number}")
        
        return {
            "history": [
                {
                    "balance": s.balance,
                    "equity": s.equity,
                    "margin": s.margin,
                    "free_margin": s.free_margin,
                    "margin_level": s.margin_level,
                    "timestamp": s.timestamp.isoformat(),
                }
                for s in states
            ]
        }
    
    except Exception as e:
        error_msg = f"Failed to get account history: {str(e)}"
        logger.error(f"[ACCOUNT] {error_msg}")
        logger.error(f"[ACCOUNT] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/cache/stats")
async def get_cache_stats(token: str = ""):
    """Get account data cache statistics"""
    try:
        if token:
            logger.debug("[ACCOUNT] Verifying token for cache stats request")
            verify_token(token)
        
        stats = account_data_cache.get_cache_stats()
        logger.debug(f"[ACCOUNT] Cache stats: {stats}")
        return stats
    
    except Exception as e:
        error_msg = f"Failed to get cache stats: {str(e)}"
        logger.error(f"[ACCOUNT] {error_msg}")
        logger.error(f"[ACCOUNT] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)
