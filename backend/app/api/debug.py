"""
Debug endpoints for testing MT5 data retrieval
"""
import logging
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import Symbol
from app.services.mt5_adapter import mt5_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/mt5/status")
async def check_mt5_status():
    """Check MT5 connection status"""
    logger.info("[DEBUG] Checking MT5 status...")
    
    try:
        # Try to get account info
        account_info = await mt5_manager.get_account_info()
        
        return {
            "status": "connected" if account_info else "disconnected",
            "account_info": account_info,
            "timestamp": __import__('datetime').datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error checking MT5 status: {e}", exc_info=True)
        return {
            "status": "error",
            "error": str(e),
        }


@router.get("/mt5/symbols/fetch")
async def fetch_mt5_symbols():
    """Fetch symbols directly from MT5"""
    logger.info("[DEBUG] Fetching symbols from MT5...")
    
    try:
        symbols = await mt5_manager.get_symbols()
        logger.info(f"[DEBUG] Retrieved {len(symbols)} symbols from MT5")
        
        return {
            "count": len(symbols),
            "symbols": symbols[:10],  # Return first 10 as sample
            "total_available": len(symbols),
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error fetching symbols: {e}", exc_info=True)
        return {
            "count": 0,
            "error": str(e),
        }


@router.get("/db/symbols")
async def check_db_symbols(session: Session = Depends(get_session)):
    """Check symbols stored in database"""
    logger.info("[DEBUG] Checking symbols in database...")
    
    try:
        statement = select(Symbol)
        symbols = session.exec(statement).all()
        logger.info(f"[DEBUG] Found {len(symbols)} symbols in database")
        
        return {
            "count": len(symbols),
            "symbols": [
                {
                    "name": s.name,
                    "category": s.category,
                    "bid": s.bid,
                    "ask": s.ask,
                }
                for s in symbols[:10]
            ],
            "total_in_db": len(symbols),
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error checking database: {e}", exc_info=True)
        return {
            "count": 0,
            "error": str(e),
        }


@router.get("/mt5/symbol/{symbol_name}/quote")
async def test_symbol_quote(symbol_name: str):
    """Test fetching quote for a specific symbol"""
    logger.info(f"[DEBUG] Testing quote fetch for {symbol_name}...")
    
    try:
        quote = await mt5_manager.get_symbol_info(symbol_name)
        
        if quote:
            logger.info(f"[DEBUG] Quote for {symbol_name}: bid={quote.get('bid')}, ask={quote.get('ask')}")
            return {
                "symbol": symbol_name,
                "success": True,
                "quote": quote,
            }
        else:
            logger.warning(f"[DEBUG] No quote data for {symbol_name}")
            return {
                "symbol": symbol_name,
                "success": False,
                "error": "No quote data returned from MT5",
            }
    except Exception as e:
        logger.error(f"[DEBUG] Error fetching quote for {symbol_name}: {e}", exc_info=True)
        return {
            "symbol": symbol_name,
            "success": False,
            "error": str(e),
        }


@router.get("/mt5/symbol/{symbol_name}/ohlc/detailed")
async def test_symbol_ohlc_detailed(symbol_name: str, timeframe: int = 60, count: int = 10):
    """Test fetching OHLC data with detailed diagnostics"""
    logger.info(f"[DEBUG] Detailed OHLC test for {symbol_name} (timeframe={timeframe}, count={count})...")
    
    try:
        import MetaTrader5 as mt5
        from datetime import datetime, timedelta
        
        # Step 1: Check if symbol can be selected
        logger.info(f"[DEBUG] Step 1: Selecting symbol {symbol_name}...")
        selected = mt5.symbol_select(symbol_name, True)
        logger.info(f"[DEBUG] Selection result: {selected}")
        
        # Step 2: Get symbol info to verify it's available
        logger.info(f"[DEBUG] Step 2: Getting symbol info for {symbol_name}...")
        info = mt5.symbol_info(symbol_name)
        info_data = {
            "available": info is not None,
            "name": info.name if info else None,
            "bid": info.bid if info else None,
            "ask": info.ask if info else None,
            "path": info.path if info else None,
        } if info else {"available": False}
        logger.info(f"[DEBUG] Symbol info: {info_data}")
        
        # Step 3: Check available timeframes
        logger.info(f"[DEBUG] Step 3: Testing OHLC retrieval...")
        
        timeframe_names = {
            1: "M1",
            5: "M5", 
            15: "M15",
            30: "M30",
            60: "H1",
            240: "H4",
            1440: "D1",
            10080: "W1",
            43200: "MN",
        }
        
        # Step 4: Try copy_rates_range (most reliable)
        now = datetime.utcnow()
        from_date = now - timedelta(days=100)
        to_date = now + timedelta(days=1)
        
        logger.info(f"[DEBUG] Attempting copy_rates_range from {from_date} to {to_date}...")
        rates = mt5.copy_rates_range(symbol_name, timeframe, from_date, to_date)
        
        if rates is None:
            error_code = mt5.last_error()
            logger.warning(f"[DEBUG] copy_rates_range failed. MT5 error: {error_code}")
            
            # Fallback to copy_rates_from
            logger.info(f"[DEBUG] Attempting fallback with copy_rates_from...")
            past_date = now - timedelta(days=10)
            rates = mt5.copy_rates_from(symbol_name, timeframe, past_date, count)
            
            if rates is None:
                error_code = mt5.last_error()
                logger.error(f"[DEBUG] Fallback also failed. MT5 error: {error_code}")
                return {
                    "symbol": symbol_name,
                    "success": False,
                    "error": f"Both copy_rates_range and copy_rates_from failed. MT5 error: {error_code}",
                    "diagnostics": {
                        "symbol_selected": selected,
                        "symbol_info": info_data,
                        "timeframe": timeframe,
                        "timeframe_name": timeframe_names.get(timeframe),
                        "current_time": now.isoformat(),
                        "mt5_error_code": error_code,
                    }
                }
        
        if len(rates) == 0:
            logger.warning(f"[DEBUG] Empty rates returned")
            return {
                "symbol": symbol_name,
                "success": False,
                "error": "Empty rates array returned from MT5",
                "diagnostics": {
                    "symbol_selected": selected,
                    "symbol_info": info_data,
                }
            }
        
        # Use only the last 'count' candles
        rates = rates[-count:] if len(rates) > count else rates
        logger.info(f"[DEBUG] Successfully retrieved {len(rates)} rates")
        
        candles = []
        for i, rate in enumerate(rates[:5]):
            candles.append({
                "index": i,
                "time": int(rate.time),
                "open": float(rate.open),
                "high": float(rate.high),
                "low": float(rate.low),
                "close": float(rate.close),
                "volume": int(rate.volume) if hasattr(rate, 'volume') else 0,
            })
        
        return {
            "symbol": symbol_name,
            "success": True,
            "timeframe": timeframe,
            "timeframe_name": timeframe_names.get(timeframe),
            "count": len(rates),
            "candles": candles,
            "diagnostics": {
                "symbol_selected": selected,
                "symbol_info": info_data,
                "current_time": now.isoformat(),
            }
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error in detailed OHLC test: {e}", exc_info=True)
        return {
            "symbol": symbol_name,
            "success": False,
            "error": str(e),
        }



@router.get("/test/batch")
async def test_batch_quotes():
    """Test batch quote fetching"""
    logger.info("[DEBUG] Testing batch quote fetch...")
    
    try:
        # Get some symbols from database
        statement = select(Symbol)
        symbols = __import__('sqlmodel').Session.exec(statement).all()
        
        if not symbols:
            logger.warning("[DEBUG] No symbols in database to test")
            return {
                "success": False,
                "error": "No symbols in database",
                "suggestion": "Run /api/debug/mt5/symbols/fetch first to load symbols",
            }
        
        symbol_names = [s.name for s in symbols[:5]]
        logger.info(f"[DEBUG] Testing batch quotes for: {symbol_names}")
        
        quotes = {}
        for symbol_name in symbol_names:
            try:
                quote = await mt5_manager.get_symbol_info(symbol_name)
                if quote:
                    quotes[symbol_name] = {
                        "bid": quote.get("bid"),
                        "ask": quote.get("ask"),
                    }
            except Exception as e:
                logger.error(f"[DEBUG] Error fetching {symbol_name}: {e}")
                quotes[symbol_name] = {"error": str(e)}
        
        return {
            "success": True,
            "symbols_tested": len(symbol_names),
            "symbols": symbol_names,
            "quotes": quotes,
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error in batch test: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }


@router.post("/mt5/symbols/cache")
async def cache_symbols_to_db(session: Session = Depends(get_session)):
    """Fetch symbols from MT5 and store them in database"""
    logger.info("[DEBUG] Caching symbols from MT5 to database...")
    
    try:
        symbols = await mt5_manager.get_symbols()
        logger.info(f"[DEBUG] Retrieved {len(symbols)} symbols from MT5")
        
        if not symbols:
            return {
                "success": False,
                "error": "No symbols retrieved from MT5",
            }
        
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
        
        session.commit()
        logger.info(f"[DEBUG] Cached {count_added} new symbols to database")
        
        return {
            "success": True,
            "mt5_symbols_total": len(symbols),
            "new_symbols_added": count_added,
            "message": f"Retrieved {len(symbols)} symbols from MT5, added {count_added} new to database",
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error caching symbols: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/mt5/symbols/select")
async def select_symbols():
    """Select top 100 symbols for live data feed"""
    logger.info("[DEBUG] Selecting symbols for live data feed...")
    
    try:
        count = await mt5_manager.select_symbols_for_feed(100)
        
        return {
            "success": True,
            "selected": count,
            "message": f"Selected {count} symbols for live data feed",
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error selecting symbols: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/full-diagnostic")
async def full_diagnostic(session: Session = Depends(get_session)):
    """Run a full diagnostic of the system"""
    logger.info("[DEBUG] Running full diagnostic...")
    
    diagnostics = {
        "mt5_status": None,
        "mt5_symbols": None,
        "db_symbols": None,
        "sample_quote": None,
        "sample_ohlc": None,
    }
    
    try:
        # Check MT5 status
        logger.info("[DEBUG] Step 1: Checking MT5 status...")
        account_info = await mt5_manager.get_account_info()
        diagnostics["mt5_status"] = {
            "connected": account_info is not None,
            "account": account_info,
        }
        
        # Get symbols from MT5
        logger.info("[DEBUG] Step 2: Fetching symbols from MT5...")
        symbols = await mt5_manager.get_symbols()
        diagnostics["mt5_symbols"] = {
            "count": len(symbols),
            "sample": symbols[:3] if symbols else [],
        }
        
        # Check database
        logger.info("[DEBUG] Step 3: Checking database symbols...")
        statement = select(Symbol)
        db_symbols = session.exec(statement).all()
        diagnostics["db_symbols"] = {
            "count": len(db_symbols),
            "sample": [
                {
                    "name": s.name,
                    "category": s.category,
                    "bid": s.bid,
                    "ask": s.ask,
                }
                for s in db_symbols[:3]
            ],
        }
        
        # Test quote fetch
        logger.info("[DEBUG] Step 4: Testing quote fetch...")
        test_symbol = (
            symbols[0]["name"] if symbols 
            else (db_symbols[0].name if db_symbols else "EURUSD")
        )
        quote = await mt5_manager.get_symbol_info(test_symbol)
        diagnostics["sample_quote"] = {
            "symbol": test_symbol,
            "quote": quote,
        }
        
        # Test OHLC fetch
        logger.info("[DEBUG] Step 5: Testing OHLC fetch...")
        rates = await mt5_manager.get_rates(test_symbol, 60, 5)
        diagnostics["sample_ohlc"] = {
            "symbol": test_symbol,
            "timeframe": 60,
            "count": len(rates) if rates else 0,
            "candles": rates[:2] if rates else [],
        }
        
        return {
            "success": True,
            "diagnostics": diagnostics,
            "timestamp": __import__('datetime').datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"[DEBUG] Error in full diagnostic: {e}", exc_info=True)
        diagnostics["error"] = str(e)
        return {
            "success": False,
            "diagnostics": diagnostics,
        }
