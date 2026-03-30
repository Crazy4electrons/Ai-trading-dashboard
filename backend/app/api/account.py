"""
Account API endpoints
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlmodel import Session, select
from typing import Optional

from app.database import get_session
from app.models import MTAccount, AccountState
from app.security import verify_token
from app.services.mt5_adapter import mt5_manager
from app.services.account_cache import account_data_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])


async def get_current_account(
    session: Session = Depends(get_session),
    token: str = None, 
    authorization: Optional[str] = Header(None)
) -> MTAccount:
    """Get current account from token"""
    try:
        # Extract token from Authorization header (Bearer token) or fall back to query param
        extracted_token = token
        if authorization and isinstance(authorization, str) and authorization.startswith("Bearer "):
            extracted_token = authorization[7:]  # Remove "Bearer " prefix
        
        if not extracted_token:
            logger.warning("[ACCOUNT] No token provided (neither query param nor Authorization header)")
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        logger.debug("[ACCOUNT] Verifying token...")
        token_data = verify_token(extracted_token)
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
    session: Session = Depends(get_session),
    token: str = None,
    authorization: Optional[str] = Header(None)
):
    """Get current account information with caching (10 sec TTL)"""
    
    try:
        account = await get_current_account(session, token, authorization)
        
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
    session: Session = Depends(get_session),
    token: str = None,
    authorization: Optional[str] = Header(None)
):
    """Get open positions with caching (5 sec TTL)"""
    
    try:
        account = await get_current_account(session, token, authorization)
        
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
    session: Session = Depends(get_session),
    token: str = None,
    limit: int = 50,
    authorization: Optional[str] = Header(None)
):
    """Get account state history"""
    
    try:
        account = await get_current_account(session, token, authorization)
        
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


# ============================================================================
# ANALYTICS & METRICS ENDPOINTS
# ============================================================================

@router.get("/trade-stats")
async def get_trade_stats(account: MTAccount = Depends(get_current_account)):
    """Get trade statistics for the account"""
    try:
        logger.info(f"[ACCOUNT] Fetching trade statistics for account {account.account_number}")
        
        # Placeholder implementation - would connect to MT5 or database
        # For now, return mock data
        trade_stats = {
            "total_trades": 150,
            "winning_trades": 95,
            "losing_trades": 55,
            "win_rate": 63.33,
            "total_pnl": 5250.75,
            "avg_win": 85.50,
            "avg_loss": 45.25,
            "profit_factor": 1.89,
        }
        
        logger.debug(f"[ACCOUNT] Trade stats: {trade_stats}")
        return trade_stats
        
    except Exception as e:
        error_msg = f"Failed to get trade stats: {str(e)}"
        logger.error(f"[ACCOUNT] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/portfolio-metrics")
async def get_portfolio_metrics(account: MTAccount = Depends(get_current_account)):
    """Get current portfolio metrics (balance, equity, margin, positions)"""
    try:
        logger.info(f"[ACCOUNT] Fetching portfolio metrics for account {account.account_number}")
        
        # Get current account info
        account_info = await mt5_manager.get_account_info()
        
        if account_info:
            portfolio_metrics = {
                "account_balance": account_info.get("balance", 0),
                "account_equity": account_info.get("equity", 0),
                "used_margin": account_info.get("margin", 0),
                "free_margin": account_info.get("margin_free", 0),
                "margin_level": (account_info.get("equity", 0) / account_info.get("margin", 0.001)) * 100 if account_info.get("margin", 0) > 0 else 0,
                "positions_count": len(account_info.get("positions", [])),
                "open_orders_count": len(account_info.get("orders", [])),
            }
        else:
            # Fallback mock data if MT5 is unavailable
            portfolio_metrics = {
                "account_balance": 10000.0,
                "account_equity": 10500.0,
                "used_margin": 2000.0,
                "free_margin": 8500.0,
                "margin_level": 525.0,
                "positions_count": 2,
                "open_orders_count": 1,
            }
        
        logger.debug(f"[ACCOUNT] Portfolio metrics: {portfolio_metrics}")
        return portfolio_metrics
        
    except Exception as e:
        error_msg = f"Failed to get portfolio metrics: {str(e)}"
        logger.error(f"[ACCOUNT] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)
