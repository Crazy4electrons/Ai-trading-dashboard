"""
Watchlist API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.database import get_session
from app.models import Watchlist, WatchlistItem, Symbol, MTAccount
from app.security import verify_token

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


@router.get("/", response_model=WatchlistResponse)
async def get_watchlist(
    token: str = None,
    session: Session = Depends(get_session)
):
    """Get user's watchlist"""
    
    account = await get_current_account(token, session)
    
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
    token: str = None,
    session: Session = Depends(get_session)
):
    """Add a symbol to watchlist"""
    
    account = await get_current_account(token, session)
    
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
    token: str = None,
    session: Session = Depends(get_session)
):
    """Remove a symbol from watchlist"""
    
    account = await get_current_account(token, session)
    
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

