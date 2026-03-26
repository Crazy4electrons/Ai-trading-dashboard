"""
Advanced MT5 OHLC diagnostic - tests different methods and parameters
"""
import logging
from fastapi import APIRouter
import MetaTrader5 as mt5
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/debug/ohlc", tags=["debug-ohlc"])


@router.get("/test-timeframes/{symbol_name}")
async def test_all_timeframes(symbol_name: str):
    """Test all timeframe values to see which ones work"""
    logger.info(f"[DEBUG-OHLC] Testing all timeframes for {symbol_name}...")
    
    # Select the symbol first
    mt5.symbol_select(symbol_name, True)
    
    # Common timeframe values
    timeframes = {
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
    
    results = []
    now = datetime.utcnow()
    
    for tf_value, tf_name in timeframes.items():
        try:
            # Try copy_rates_from with a past timestamp
            past = now - timedelta(days=30)
            rates = mt5.copy_rates_from(symbol_name, tf_value, past, 10)
            
            # Check if rates is valid (handle numpy arrays properly)
            if rates is not None:
                try:
                    rates_len = len(rates)
                    if rates_len > 0:
                        results.append({
                            "timeframe": tf_value,
                            "name": tf_name,
                            "success": True,
                            "count": rates_len,
                            "latest_close": float(rates[-1].close) if rates_len > 0 else None,
                        })
                        logger.info(f"[DEBUG-OHLC] {tf_name}({tf_value}): SUCCESS - {rates_len} candles")
                    else:
                        results.append({
                            "timeframe": tf_value,
                            "name": tf_name,
                            "success": False,
                            "error": "Empty array returned",
                        })
                except Exception as e:
                    results.append({
                        "timeframe": tf_value,
                        "name": tf_name,
                        "success": False,
                        "error": f"Array processing error: {str(e)}",
                    })
            else:
                error = mt5.last_error()
                results.append({
                    "timeframe": tf_value,
                    "name": tf_name,
                    "success": False,
                    "error": error,
                })
                logger.warning(f"[DEBUG-OHLC] {tf_name}({tf_value}): FAILED - {error}")
        except Exception as e:
            results.append({
                "timeframe": tf_value,
                "name": tf_name,
                "success": False,
                "error": str(e),
            })
            logger.error(f"[DEBUG-OHLC] {tf_name}({tf_value}): EXCEPTION - {e}")
    
    return {
        "symbol": symbol_name,
        "timestamp": now.isoformat(),
        "results": results,
        "successful_timeframes": [r for r in results if r["success"]],
    }


@router.get("/test-time-ranges/{symbol_name}")
async def test_time_ranges(symbol_name: str, timeframe: int = 60):
    """Test different time ranges to find what works"""
    logger.info(f"[DEBUG-OHLC] Testing different time ranges for {symbol_name}...")
    
    mt5.symbol_select(symbol_name, True)
    
    now = datetime.utcnow()
    
    time_ranges = [
        ("1 hour ago", now - timedelta(hours=1)),
        ("6 hours ago", now - timedelta(hours=6)),
        ("1 day ago", now - timedelta(days=1)),
        ("7 days ago", now - timedelta(days=7)),
        ("14 days ago", now - timedelta(days=14)),
        ("30 days ago", now - timedelta(days=30)),
        ("90 days ago", now - timedelta(days=90)),
    ]
    
    results = []
    
    for label, timestamp in time_ranges:
        try:
            logger.info(f"[DEBUG-OHLC] Trying {label}: {timestamp}")
            rates = mt5.copy_rates_from(symbol_name, timeframe, timestamp, 5)
            
            if rates is not None:
                try:
                    rates_len = len(rates)
                    if rates_len > 0:
                        results.append({
                            "label": label,
                            "timestamp": timestamp.isoformat(),
                            "success": True,
                            "count": rates_len,
                        })
                        logger.info(f"[DEBUG-OHLC] {label}: SUCCESS - {rates_len} candles")
                    else:
                        results.append({
                            "label": label,
                            "timestamp": timestamp.isoformat(),
                            "success": False,
                            "error": "Empty array",
                        })
                except Exception as e:
                    results.append({
                        "label": label,
                        "timestamp": timestamp.isoformat(),
                        "success": False,
                        "error": f"Array error: {str(e)}",
                    })
            else:
                error = mt5.last_error()
                results.append({
                    "label": label,
                    "timestamp": timestamp.isoformat(),
                    "success": False,
                    "error": error,
                })
                logger.warning(f"[DEBUG-OHLC] {label}: FAILED - {error}")
        except Exception as e:
            results.append({
                "label": label,
                "timestamp": timestamp.isoformat(),
                "success": False,
                "error": str(e),
            })
            logger.error(f"[DEBUG-OHLC] {label}: EXCEPTION - {e}")
    
    return {
        "symbol": symbol_name,
        "timeframe": timeframe,
        "current_time": now.isoformat(),
        "results": results,
        "successful_ranges": [r for r in results if r["success"]],
    }


@router.get("/test-tick-data/{symbol_name}")
async def test_tick_data(symbol_name: str):
    """Test if we can get tick data instead of OHLC"""
    logger.info(f"[DEBUG-OHLC] Testing tick data for {symbol_name}...")
    
    mt5.symbol_select(symbol_name, True)
    
    now = datetime.utcnow()
    past = now - timedelta(hours=1)
    
    try:
        # Try to get ticks
        ticks = mt5.copy_ticks_from(symbol_name, past, 50)
        
        if ticks is not None and len(ticks) > 0:
            logger.info(f"[DEBUG-OHLC] Got {len(ticks)} ticks")
            sample_ticks = [
                {
                    "time": int(t.time),
                    "bid": float(t.bid),
                    "ask": float(t.ask),
                }
                for t in ticks[:5]
            ]
            return {
                "symbol": symbol_name,
                "success": True,
                "total_ticks": len(ticks),
                "sample_ticks": sample_ticks,
            }
        else:
            error = mt5.last_error()
            return {
                "symbol": symbol_name,
                "success": False,
                "error": f"copy_ticks_from returned None or empty: {error}",
            }
    except Exception as e:
        logger.error(f"[DEBUG-OHLC] Tick data error: {e}", exc_info=True)
        return {
            "symbol": symbol_name,
            "success": False,
            "error": str(e),
        }


@router.get("/mt5-version")
async def get_mt5_version():
    """Check MT5 version and capabilities"""
    logger.info("[DEBUG-OHLC] Checking MT5 version...")
    
    try:
        version = mt5.version()
        account = mt5.account_info()
        
        return {
            "mt5_version": version,
            "mt5_build": mt5.last_error() if version is None else "OK",
            "account_connected": account is not None,
            "account_login": account.login if account else None,
            "account_server": account.server if account else None,
        }
    except Exception as e:
        logger.error(f"[DEBUG-OHLC] Version check error: {e}", exc_info=True)
        return {
            "error": str(e),
        }
