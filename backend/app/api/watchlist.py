"""
Watchlist API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging

from app.database import get_session
from app.models import Watchlist, WatchlistItem, Symbol, MTAccount
from app.security import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class SymbolItemResponse(BaseModel):
    """Symbol item in watchlist"""
    name: str
    category: str
    bid: float
    ask: float
    description: Optional[str] = None


class WatchlistItemResponse(BaseModel):
    """Watchlist item response"""
    id: str
    symbol: SymbolItemResponse


class WatchlistResponse(BaseModel):
    """Watchlist response"""
    id: str
    name: str
    items: List[WatchlistItemResponse]


class AddSymbolRequest(BaseModel):
    """Request to add symbol to watchlist"""
    symbol_name: str


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
            logger.warning("[WATCHLIST] No token provided (neither query param nor Authorization header)")
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        token_data = verify_token(extracted_token)
        if not token_data:
            logger.warning("[WATCHLIST] Invalid token")
            raise HTTPException(status_code=401, detail="Invalid token")
        
        account_id = token_data.get("account_id")
        if not account_id:
            logger.warning("[WATCHLIST] No account_id in token")
            raise HTTPException(status_code=401, detail="No account in token")
        
        statement = select(MTAccount).where(MTAccount.id == account_id)
        account = session.exec(statement).first()
        
        if not account:
            logger.warning(f"[WATCHLIST] Account not found for ID: {account_id}")
            raise HTTPException(status_code=404, detail="Account not found")
        
        return account
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get current account: {str(e)}"
        logger.error(f"[WATCHLIST] {error_msg}")
        logger.error(f"[WATCHLIST] Full error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/", response_model=WatchlistResponse)
async def get_watchlist(
    session: Session = Depends(get_session),
    token: str = None,
    authorization: Optional[str] = Header(None)
):
    """Get user's watchlist"""
    logger.info("[WATCHLIST] GET / called")
    
    account = await get_current_account(session, token, authorization)
    
    # Get or create watchlist
    statement = select(Watchlist).where(Watchlist.mt_account_id == account.id)
    watchlist = session.exec(statement).first()
    
    if not watchlist:
        watchlist = Watchlist(user_id=account.user_id, mt_account_id=account.id)
        session.add(watchlist)
        session.commit()
        session.refresh(watchlist)
    
    # Build response
    items = []
    for item in watchlist.items:
        items.append(WatchlistItemResponse(
            id=item.id,
            symbol=SymbolItemResponse(
                name=item.symbol.name,
                category=item.symbol.category,
                bid=item.symbol.bid,
                ask=item.symbol.ask,
                description=item.symbol.description
            )
        ))
    
    return WatchlistResponse(
        id=watchlist.id,
        name=watchlist.name,
        items=items
    )


@router.post("/add")
async def add_symbol_to_watchlist(
    request: AddSymbolRequest,
    session: Session = Depends(get_session),
    token: str = None,
    authorization: Optional[str] = Header(None)
):
    """Add a symbol to watchlist"""
    logger.info(f"[WATCHLIST] POST /add called for symbol: {request.symbol_name}")
    
    account = await get_current_account(session, token, authorization)
    
    # Verify symbol exists or create it
    statement = select(Symbol).where(Symbol.name == request.symbol_name)
    symbol = session.exec(statement).first()
    
    if not symbol:
        raise HTTPException(status_code=404, detail=f"Symbol {request.symbol_name} not found")
    
    # Get or create watchlist
    statement = select(Watchlist).where(Watchlist.mt_account_id == account.id)
    watchlist = session.exec(statement).first()
    
    if not watchlist:
        watchlist = Watchlist(user_id=account.user_id, mt_account_id=account.id)
        session.add(watchlist)
        session.flush()
    
    # Check if symbol already in watchlist
    statement = select(WatchlistItem).where(
        (WatchlistItem.watchlist_id == watchlist.id) &
        (WatchlistItem.symbol_id == symbol.id)
    )
    existing = session.exec(statement).first()
    
    if existing:
        raise HTTPException(status_code=409, detail="Symbol already in watchlist")
    
    # Add to watchlist
    item = WatchlistItem(watchlist_id=watchlist.id, symbol_id=symbol.id)
    session.add(item)
    session.commit()
    
    return {
        "message": f"Added {request.symbol_name} to watchlist",
        "symbol": {
            "name": symbol.name,
            "category": symbol.category,
            "bid": symbol.bid,
            "ask": symbol.ask,
        }
    }


@router.delete("/{symbol_name}")
async def remove_symbol_from_watchlist(
    symbol_name: str,
    session: Session = Depends(get_session),
    token: str = None,
    authorization: Optional[str] = Header(None)
):
    """Remove a symbol from watchlist"""
    logger.info(f"[WATCHLIST] DELETE /{symbol_name} called")
    
    account = await get_current_account(session, token, authorization)
    
    # Get watchlist
    statement = select(Watchlist).where(Watchlist.mt_account_id == account.id)
    watchlist = session.exec(statement).first()
    
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    # Find and remove the symbol
    statement = select(WatchlistItem).where(
        (WatchlistItem.watchlist_id == watchlist.id)
    )
    items = session.exec(statement).all()
    
    removed = False
    for item in items:
        if item.symbol.name == symbol_name:
            session.delete(item)
            removed = True
            break
    
    if not removed:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol_name} not in watchlist")
    
    session.commit()
    
    return {"message": f"Removed {symbol_name} from watchlist"}


@router.get("/categories")
async def get_watchlist_categories(
    token: str = None,
    session: Session = Depends(get_session)
) -> dict:
    """Get watchlist items grouped by category"""
    
    account = await get_current_account(token, session)
    
    # Get watchlist
    statement = select(Watchlist).where(Watchlist.mt_account_id == account.id)
    watchlist = session.exec(statement).first()
    
    if not watchlist:
        return {}
    
    # Group by category
    grouped = {}
    for item in watchlist.items:
        category = item.symbol.category
        if category not in grouped:
            grouped[category] = []
        grouped[category].append({
            "name": item.symbol.name,
            "bid": item.symbol.bid,
            "ask": item.symbol.ask,
            "spread": item.symbol.ask - item.symbol.bid,
        })
    
    return grouped


@router.post("/initialize")
async def initialize_watchlist(
    token: str = None,
    session: Session = Depends(get_session)
) -> dict:
    """Initialize watchlist with default popular symbols"""
    import logging
    logger = logging.getLogger(__name__)
    
    account = await get_current_account(token, session)
    
    # Get or create watchlist
    statement = select(Watchlist).where(Watchlist.mt_account_id == account.id)
    watchlist = session.exec(statement).first()
    
    if not watchlist:
        watchlist = Watchlist(user_id=account.user_id, mt_account_id=account.id)
        session.add(watchlist)
        session.commit()
        session.refresh(watchlist)
    
    # Default popular symbols to add
    default_symbols = [
        "EURUSD",  # Most liquid pair
        "GBPUSD",
        "USDJPY",
        "USDCHF",
        "AUDUSD",
        "NZDUSD",
        "USDCAD",
        "EURJPY",
        "GBPJPY",
        "AUDJPY",
    ]
    
    added_count = 0
    existing_symbols = {item.symbol.name for item in watchlist.items}
    
    for symbol_name in default_symbols:
        # Check if already in watchlist
        if symbol_name in existing_symbols:
            logger.debug(f"Symbol {symbol_name} already in watchlist")
            continue
        
        # Find symbol in database
        statement = select(Symbol).where(Symbol.name == symbol_name)
        symbol = session.exec(statement).first()
        
        if symbol:
            try:
                # Add to watchlist
                item = WatchlistItem(
                    watchlist_id=watchlist.id,
                    symbol_id=symbol.id
                )
                session.add(item)
                added_count += 1
                logger.info(f"Added {symbol_name} to watchlist")
            except Exception as e:
                logger.error(f"Error adding {symbol_name} to watchlist: {e}")
        else:
            logger.warning(f"Symbol {symbol_name} not found in database")
    
    if added_count > 0:
        session.commit()
        logger.info(f"Initialized watchlist with {added_count} symbols")
    
    return {
        "success": True,
        "added_count": added_count,
        "message": f"Added {added_count} symbols to watchlist"
    }

