
import logging
from fastapi import APIRouter, Depends, Query, Body
from sqlmodel import Session, select
from typing import List, Dict, Optional

from app.database import get_session
from app.models import Symbol
from app.services.mt5_adapter import mt5_manager
from app.config import SYMBOL_CATEGORIES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/symbols", tags=["symbols"])

# Cache for symbols (in-memory)
symbols_cache: Optional[List[Dict]] = None


@router.get("/cache/refresh")
async def refresh_symbols_cache(session: Session = Depends(get_session)):
    """Refresh the symbols cache from MT5"""
    global symbols_cache
    logger.info("[SYMBOLS] Refreshing symbols cache from MT5...")
    
    # Get symbols from MT5
    symbols = await mt5_manager.get_symbols()
    symbols_cache = symbols
    logger.info(f"[SYMBOLS] Got {len(symbols)} symbols from MT5")
    
    # Store in database
    count_added = 0
    for sym_data in symbols:
        statement = select(Symbol).where(Symbol.name == sym_data["name"])
        existing = session.exec(statement).first()
        
        if not existing:
            symbol = Symbol(
                name=sym_data["name"],
                category=sym_data["category"],
                description=sym_data.get("description", ""),
                digits=sym_data.get("digits", 4),
                point=sym_data.get("point", 0.0001),
                bid=0.0,
                ask=0.0
            )
            session.add(symbol)
            count_added += 1
            logger.debug(f"[SYMBOLS] Added new symbol to DB: {sym_data['name']}")
    
    session.commit()
    logger.info(f"[SYMBOLS] Cache refresh complete: {count_added} new symbols added to DB, {len(symbols)} total")
    
    return {"message": f"Cached {len(symbols)} symbols, {count_added} new"}


@router.get("/all")
async def get_all_symbols(session: Session = Depends(get_session)) -> Dict[str, List[Dict]]:
    """Get all symbols grouped by category"""
    logger.info("[SYMBOLS] /all endpoint called")
    
    # Try cache first
    if symbols_cache:
        logger.info(f"[SYMBOLS] Using cached symbols: {len(symbols_cache)} total")
        grouped = _group_symbols_by_category(symbols_cache)
        logger.info(f"[SYMBOLS] Grouped into {len(grouped)} categories")
        return grouped
    
    logger.debug("[SYMBOLS] Cache empty, querying database...")
    # Fall back to database
    statement = select(Symbol)
    symbols = session.exec(statement).all()
    logger.info(f"[SYMBOLS] Found {len(symbols)} symbols in database")
    
    if not symbols:
        logger.warning("[SYMBOLS] No symbols in DB, attempting to refresh cache...")
        # If no symbols in DB, refresh cache
        await refresh_symbols_cache(session)
        if symbols_cache:
            logger.info(f"[SYMBOLS] Cache refreshed with {len(symbols_cache)} symbols")
            return _group_symbols_by_category(symbols_cache)
    
    symbol_dicts = [
        {
            "name": s.name,
            "category": s.category,
            "description": s.description,
            "bid": s.bid,
            "ask": s.ask,
            "digits": s.digits,
        }
        for s in symbols
    ]
    
    grouped = _group_symbols_by_category(symbol_dicts)
    logger.info(f"[SYMBOLS] Returning {len(grouped)} categories with {len(symbol_dicts)} total symbols")
    return grouped


@router.get("/categories")
async def get_categories() -> Dict[str, int]:
    """Get available categories with symbol counts"""
    all_symbols = await get_all_symbols()
    
    counts = {}
    for category, symbols in all_symbols.items():
        counts[category] = len(symbols)
    
    return counts


@router.get("/search")
async def search_symbols(
    query: str = Query(..., min_length=1),
    session: Session = Depends(get_session)
) -> List[Dict]:
    """Search for symbols by name or description"""
    logger.info(f"[SYMBOLS] Search query: '{query}'")
    
    statement = select(Symbol).where(
        (Symbol.name.ilike(f"%{query}%")) |
        (Symbol.description.ilike(f"%{query}%"))
    )
    symbols = session.exec(statement).all()
    logger.info(f"[SYMBOLS] Search returned {len(symbols)} results for '{query}'")
    
    return [
        {
            "name": s.name,
            "category": s.category,
            "description": s.description,
            "bid": s.bid,
            "ask": s.ask,
        }
        for s in symbols
    ]


@router.get("/quote/{symbol_name}")
async def get_symbol_quote(symbol_name: str) -> Dict:
    """Get live quote for a symbol (bid/ask prices)"""
    logger.info(f"[SYMBOLS] Getting live quote for {symbol_name}...")
    
    try:
        quote = await mt5_manager.get_symbol_info(symbol_name)
        if quote:
            # Ensure bid, ask, and spread are float values, not None
            bid = quote.get("bid")
            ask = quote.get("ask")
            spread = quote.get("spread")
            logger.info(f"[SYMBOLS] Live quote for {symbol_name}: bid={bid}, ask={ask}")
            return {
                "symbol": symbol_name,
                "bid": bid if bid is not None else 0.0,
                "ask": ask if ask is not None else 0.0,
                "spread": spread if spread is not None else 0.0,
            }
        else:
            logger.warning(f"[SYMBOLS] No quote data returned for {symbol_name}")
            return {"error": f"Could not get quote for {symbol_name}"}
    except Exception as e:
        logger.error(f"[SYMBOLS] Error getting quote for {symbol_name}: {e}", exc_info=True)
        return {"error": str(e)}


@router.post("/quote/batch")
async def get_symbol_quotes_batch(request_data: Dict[str, list]) -> Dict[str, Dict[str, float]]:
    """Get live quotes for multiple symbols"""
    symbol_list = request_data.get("symbols", [])
    # Filter out None values
    symbol_list = [s for s in symbol_list if s is not None]
    logger.info(f"[SYMBOLS] Getting batch quotes for {len(symbol_list)} symbols")
    
    quotes: Dict[str, Dict[str, float]] = {}
    for symbol_name in symbol_list:
        try:
            quote = await mt5_manager.get_symbol_info(symbol_name)
            if quote:
                # Ensure bid and ask are float values, not None
                bid = quote.get("bid")
                ask = quote.get("ask")
                quotes[symbol_name] = {
                    "bid": float(bid) if bid is not None else 0.0,
                    "ask": float(ask) if ask is not None else 0.0,
                }
            else:
                logger.warning(f"[SYMBOLS] No data for {symbol_name}")
                quotes[symbol_name] = {"bid": 0.0, "ask": 0.0}
        except Exception as e:
            logger.error(f"[SYMBOLS] Error getting quote for {symbol_name}: {e}")
            quotes[symbol_name] = {"bid": 0.0, "ask": 0.0}
    
    logger.info(f"[SYMBOLS] Batch quote complete: {len(quotes)} symbols")
    return quotes


@router.get("/{symbol_name}")
async def get_symbol(symbol_name: str, session: Session = Depends(get_session)) -> Dict:
    """Get details for a specific symbol (tries MT5 first, then database)"""
    logger.debug(f"[SYMBOLS] Getting details for symbol: {symbol_name}")
    
    # Try to get live data from MT5 first
    try:
        logger.debug(f"[SYMBOLS] Fetching {symbol_name} info from MT5...")
        live_info = await mt5_manager.get_symbol_info(symbol_name)
        if live_info:
            logger.debug(f"[SYMBOLS] Got live info for {symbol_name}: bid={live_info['bid']}, ask={live_info['ask']}")
            
            # Update database with latest prices
            statement = select(Symbol).where(Symbol.name == symbol_name)
            symbol = session.exec(statement).first()
            if symbol:
                symbol.bid = live_info["bid"]
                symbol.ask = live_info["ask"]
                session.add(symbol)
                session.commit()
                logger.debug(f"[SYMBOLS] Updated {symbol_name} in database")
            
            return live_info
    except Exception as e:
        logger.warning(f"[SYMBOLS] Error getting {symbol_name} from MT5: {e}")
    
    # Fall back to database
    logger.debug(f"[SYMBOLS] Falling back to database for {symbol_name}")
    statement = select(Symbol).where(Symbol.name == symbol_name)
    symbol = session.exec(statement).first()
    
    if not symbol:
        logger.warning(f"[SYMBOLS] Symbol {symbol_name} not found")
        return {"error": f"Symbol {symbol_name} not found"}
    
    logger.debug(f"[SYMBOLS] Found {symbol_name} in DB: bid={symbol.bid}, ask={symbol.ask}")
    
    return {
        "name": symbol.name,
        "category": symbol.category,
        "description": symbol.description,
        "bid": symbol.bid,
        "ask": symbol.ask,
        "digits": symbol.digits,
        "point": symbol.point,
    }


@router.get("/{symbol_name}/ohlc")
async def get_symbol_ohlc(symbol_name: str, timeframe: int = 60, count: int = 100) -> Dict:
    """Get OHLC candles for a symbol
    timeframe: 1=M1, 5=M5, 15=M15, 30=M30, 60=H1, 240=H4, 1440=D1, 10080=W1, 43200=MN
    """
    logger.info(f"[SYMBOLS] Getting OHLC for {symbol_name} (TF={timeframe}, count={count})")
    
    try:
        candles = await mt5_manager.get_rates(symbol_name, timeframe, count)
        if candles:
            return {
                "symbol": symbol_name,
                "timeframe": timeframe,
                "count": len(candles),
                "candles": candles,
            }
        else:
            logger.warning(f"[SYMBOLS] No candles retrieved for {symbol_name}")
            return {
                "symbol": symbol_name,
                "timeframe": timeframe,
                "count": 0,
                "candles": [],
            }
    except Exception as e:
        logger.error(f"[SYMBOLS] Error getting OHLC for {symbol_name}: {e}", exc_info=True)
        return {
            "symbol": symbol_name,
            "error": str(e),
            "candles": [],
        }



def _group_symbols_by_category(symbols: List[Dict]) -> Dict[str, List[Dict]]:
    """Group symbols by category"""
    grouped = {cat: [] for cat in SYMBOL_CATEGORIES}
    
    for symbol in symbols:
        category = symbol.get("category", "Other")
        if category not in grouped:
            grouped[category] = []
        grouped[category].append(symbol)
    
    # Sort symbols within each category
    for category in grouped:
        grouped[category].sort(key=lambda x: x["name"])
    
    return grouped
    
    return grouped
