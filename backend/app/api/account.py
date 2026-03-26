"""
Account API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import Optional

from app.database import get_session
from app.models import MTAccount, AccountState
from app.security import verify_token
from app.services.mt5_adapter import mt5_manager

router = APIRouter(prefix="/api/account", tags=["account"])


async def get_current_account(token: str = None, session: Session = Depends(get_session)) -> MTAccount:
    """Get current account from token"""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token_data = verify_token(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    account_id = token_data.get("account_id")
    statement = select(MTAccount).where(MTAccount.id == account_id)
    account = session.exec(statement).first()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    return account


@router.get("/info")
async def get_account_info(
    token: str = None,
    session: Session = Depends(get_session)
):
    """Get current account information"""
    
    account = await get_current_account(token, session)
    
    # Get live info from MT5
    info = await mt5_manager.get_account_info()
    
    if not info:
        return {
            "error": "Could not retrieve account info from MT5",
            "account_stored": {
                "account": account.account_number,
                "server": account.server,
                "currency": account.currency[:3],
                "account_type": account.account_type,
            }
        }
    
    # Store account state in database
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
    
    return info


@router.get("/positions")
async def get_positions(
    token: str = None,
    session: Session = Depends(get_session)
):
    """Get open positions"""
    
    account = await get_current_account(token, session)
    
    positions = await mt5_manager.get_positions()
    
    if positions is None:
        return {"error": "Could not retrieve positions from MT5"}
    
    return {"positions": positions}


@router.get("/history")
async def get_account_history(
    token: str = None,
    limit: int = 50,
    session: Session = Depends(get_session)
):
    """Get account state history"""
    
    account = await get_current_account(token, session)
    
    statement = select(AccountState).where(
        AccountState.mt_account_id == account.id
    ).order_by(AccountState.timestamp.desc()).limit(limit)
    
    states = session.exec(statement).all()
    
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
