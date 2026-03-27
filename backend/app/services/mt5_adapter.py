"""
MT5 adapter service - handles all MetaTrader5 connections and data access
"""
import MetaTrader5 as mt5
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta
import asyncio
import logging

logger = logging.getLogger(__name__)


class MT5Manager:
    """Manages MT5 connections and operations"""
    
    def __init__(self):
        self.connections: Dict[str, bool] = {}  # account_id -> is_connected
    
    async def initialize(self):
        """Initialize MT5 terminal"""
        try:
            if not mt5.initialize():
                logger.error(f"MT5 initialization failed, error code: {mt5.last_error()}")
                return False
            logger.info("MT5 initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Error initializing MT5: {e}")
            return False
    
    async def shutdown(self):
        """Shutdown MT5 terminal"""
        try:
            mt5.shutdown()
            logger.info("MT5 shutdown successfully")
        except Exception as e:
            logger.error(f"Error shutting down MT5: {e}")
    
    async def login(self, server: str, account: int, password: str) -> Tuple[bool, Optional[str]]:
        """
        Login to MT5 account
        Returns: (success, error_message)
        """
        try:
            if not mt5.login(account, password, server):
                error_code = mt5.last_error()
                logger.warning(f"MT5 login failed for account {account}: {error_code}")
                return False, f"Login failed with error code {error_code}"
            
            logger.info(f"Successfully logged in to account {account}")
            self.connections[str(account)] = True
            return True, None
        except Exception as e:
            logger.error(f"Error logging in to MT5: {e}")
            return False, str(e)
    
    async def logout(self, account_id: str):
        """Logout from MT5 account"""
        try:
            if mt5.shutdown():
                self.connections[account_id] = False
                logger.info(f"Logged out from account {account_id}")
        except Exception as e:
            logger.error(f"Error logging out: {e}")
    
    async def get_symbols(self) -> List[Dict]:
        """Get all available symbols with categories"""
        try:
            logger.info("Fetching symbols from MT5...")
            symbols = mt5.symbols_get()
            if not symbols:
                logger.warning("No symbols retrieved from MT5")
                return []
            
            logger.info(f"Retrieved {len(symbols)} symbols from MT5")
            symbol_list = []
            for symbol in symbols:
                # Map MT5 symbol group to our categories
                category = self._map_symbol_category(symbol.path)
                symbol_list.append({
                    "name": symbol.name,
                    "category": category,
                    "description": symbol.description,
                    "digits": symbol.digits,
                    "point": symbol.point,
                })
                logger.debug(f"Added symbol: {symbol.name} (category: {category})")
            
            logger.info(f"Successfully processed {len(symbol_list)} symbols")
            return symbol_list
        except Exception as e:
            logger.error(f"Error getting symbols: {e}", exc_info=True)
            return []
    
    async def select_symbols_for_feed(self, count: int = 100) -> int:
        """Select top N symbols for live data feed to improve quote availability"""
        try:
            logger.info(f"Selecting {count} symbols for live data feed...")
            symbols = mt5.symbols_get()
            if not symbols:
                logger.warning("No symbols available to select")
                return 0
            
            selected_count = 0
            for symbol in symbols[:count]:
                try:
                    if mt5.symbol_select(symbol.name, True):
                        selected_count += 1
                except Exception as e:
                    logger.debug(f"Could not select {symbol.name}: {e}")
            
            logger.info(f"Successfully selected {selected_count}/{count} symbols for live data")
            return selected_count
        except Exception as e:
            logger.error(f"Error selecting symbols for feed: {e}", exc_info=True)
            return 0
    
    async def get_symbol_info(self, symbol: str) -> Optional[Dict]:
        """Get detailed information about a symbol"""
        try:
            logger.debug(f"Fetching symbol info for {symbol}")
            
            # First, select the symbol to ensure it's available for live data
            selected = mt5.symbol_select(symbol, True)
            if not selected:
                logger.warning(f"Failed to select symbol {symbol}")
            
            info = mt5.symbol_info(symbol)
            if not info:
                logger.warning(f"Symbol info not found for {symbol}")
                return None
            
            result = {
                "name": info.name,
                "category": self._map_symbol_category(info.path),
                "bid": float(info.bid) if info.bid else 0.0,
                "ask": float(info.ask) if info.ask else 0.0,
                "spread": float(info.ask - info.bid) if info.ask and info.bid else 0.0,
                "digits": info.digits,
                "point": info.point,
                "description": info.description,
            }
            logger.debug(f"Symbol {symbol} info: bid={info.bid}, ask={info.ask}, spread={info.ask - info.bid}")
            return result
        except Exception as e:
            logger.error(f"Error getting symbol info for {symbol}: {e}", exc_info=True)
            return None
    
    async def get_ticks(self, symbol: str, count: int = 100) -> Optional[List[Dict]]:
        """Get recent ticks for a symbol"""
        try:
            logger.info(f"[GET_TICKS] START: Fetching {count} ticks for {symbol}")
            
            # First, select the symbol to ensure it's available for live data
            selected = mt5.symbol_select(symbol, True)
            logger.info(f"[GET_TICKS] Symbol selected: {selected}")
            if not selected:
                logger.warning(f"[GET_TICKS] Failed to select symbol {symbol} for ticks")
            
            now = datetime.utcnow()
            
            # Try copy_ticks_range first (alternative method)
            logger.info(f"[GET_TICKS] Attempt 1: copy_ticks_range (1 hour window)...")
            try:
                past = now - timedelta(hours=1)
                ticks = mt5.copy_ticks_range(symbol, past, now, mt5.COPY_TICKS_ALL)
                logger.info(f"[GET_TICKS] copy_ticks_range result: {ticks is not None}, type: {type(ticks)}")
                
                if ticks is not None:
                    try:
                        ticks_len = len(ticks)
                        logger.info(f"[GET_TICKS] copy_ticks_range returned {ticks_len} ticks")
                        if ticks_len > 0:
                            logger.info(f"[GET_TICKS] SUCCESS: Got {len(ticks)} ticks from copy_ticks_range")
                            return self._process_ticks(ticks)
                    except Exception as e:
                        logger.warning(f"[GET_TICKS] Error processing copy_ticks_range result: {e}")
                else:
                    error = mt5.last_error()
                    logger.debug(f"[GET_TICKS] copy_ticks_range failed: {error}")
            except Exception as e:
                logger.debug(f"[GET_TICKS] copy_ticks_range exception: {e}")
            
            # Fallback: Try copy_ticks_from (30 min window)
            logger.info(f"[GET_TICKS] Attempt 2: copy_ticks_from (30 min window)...")
            try:
                past = now - timedelta(minutes=30)
                ticks = mt5.copy_ticks_from(symbol, past, count, mt5.COPY_TICKS_ALL)
                logger.info(f"[GET_TICKS] copy_ticks_from result: {ticks is not None}, type: {type(ticks)}")
                
                if ticks is not None:
                    try:
                        ticks_len = len(ticks)
                        logger.info(f"[GET_TICKS] copy_ticks_from returned {ticks_len} ticks")
                        if ticks_len > 0:
                            logger.info(f"[GET_TICKS] SUCCESS: Got {len(ticks)} ticks from copy_ticks_from")
                            return self._process_ticks(ticks)
                    except Exception as e:
                        logger.warning(f"[GET_TICKS] Error processing copy_ticks_from result: {e}")
                else:
                    error = mt5.last_error()
                    logger.debug(f"[GET_TICKS] copy_ticks_from failed: {error}")
            except Exception as e:
                logger.debug(f"[GET_TICKS] copy_ticks_from exception: {e}")
            
            # Fallback: Try copy_ticks_from with longer time window
            logger.info(f"[GET_TICKS] Attempt 3: copy_ticks_from (2 hour window)...")
            try:
                past = now - timedelta(hours=2)
                ticks = mt5.copy_ticks_from(symbol, past, count * 2, mt5.COPY_TICKS_ALL)
                logger.info(f"[GET_TICKS] copy_ticks_from (2hr) result: {ticks is not None}")
                
                if ticks is not None:
                    try:
                        ticks_len = len(ticks)
                        logger.info(f"[GET_TICKS] copy_ticks_from (2hr) returned {ticks_len} ticks")
                        if ticks_len > 0:
                            logger.info(f"[GET_TICKS] SUCCESS: Got {len(ticks)} ticks from copy_ticks_from (2hr)")
                            return self._process_ticks(ticks)
                    except Exception as e:
                        logger.warning(f"[GET_TICKS] Error processing copy_ticks_from (2hr) result: {e}")
            except Exception as e:
                logger.debug(f"[GET_TICKS] copy_ticks_from (2hr) exception: {e}")
            
            # Fallback: Try copy_ticks_from with much longer window
            logger.info(f"[GET_TICKS] Attempt 4: copy_ticks_from (24 hour window)...")
            try:
                past = now - timedelta(hours=24)
                ticks = mt5.copy_ticks_from(symbol, past, count * 5, mt5.COPY_TICKS_ALL)
                logger.info(f"[GET_TICKS] copy_ticks_from (24hr) result: {ticks is not None}")
                
                if ticks is not None:
                    try:
                        ticks_len = len(ticks)
                        logger.info(f"[GET_TICKS] copy_ticks_from (24hr) returned {ticks_len} ticks")
                        if ticks_len > 0:
                            logger.info(f"[GET_TICKS] SUCCESS: Got {len(ticks)} ticks from copy_ticks_from (24hr)")
                            return self._process_ticks(ticks)
                    except Exception as e:
                        logger.warning(f"[GET_TICKS] Error processing copy_ticks_from (24hr) result: {e}")
            except Exception as e:
                logger.debug(f"[GET_TICKS] copy_ticks_from (24hr) exception: {e}")
            
            logger.error(f"[GET_TICKS] FAILURE: Could not retrieve any ticks for {symbol}")
            return None
            
        except Exception as e:
            logger.error(f"[GET_TICKS] Exception for {symbol}: {e}", exc_info=True)
            return None
    
    def _process_ticks(self, ticks) -> List[Dict]:
        """Process raw tick data from MT5"""
        tick_list = []
        for tick in ticks:
            try:
                # Handle both regular objects and numpy structured arrays
                if hasattr(tick, 'time'):
                    # Regular object access
                    tick_dict = {
                        "time": int(tick.time),
                        "bid": float(tick.bid),
                        "ask": float(tick.ask),
                        "last": float(tick.last) if hasattr(tick, 'last') else None,
                        "volume": int(tick.volume) if hasattr(tick, 'volume') else 0,
                    }
                else:
                    # Numpy structured array access using dict-like syntax
                    tick_dict = {
                        "time": int(tick['time']),
                        "bid": float(tick['bid']),
                        "ask": float(tick['ask']),
                        "last": float(tick['last']) if 'last' in tick.dtype.names else None,
                        "volume": int(tick['volume']) if 'volume' in tick.dtype.names else 0,
                    }
                tick_list.append(tick_dict)
            except Exception as e:
                logger.warning(f"[_PROCESS_TICKS] Error processing tick: {e}")
                continue
        
        logger.info(f"[_PROCESS_TICKS] Converted {len(tick_list)} ticks")
        return tick_list
    
    def _create_candles_from_ticks(self, ticks: List[Dict], timeframe_minutes: int = 60) -> List[Dict]:
        """Convert tick data into OHLC candles"""
        logger.info(f"[CREATE_CANDLES] START: Converting {len(ticks)} ticks to {timeframe_minutes}min candles")
        
        if not ticks or len(ticks) == 0:
            logger.warning(f"[CREATE_CANDLES] No ticks provided")
            return []
        
        try:
            candles = []
            current_candle = None
            
            for tick in ticks:
                tick_time = tick["time"]
                # Determine which candle this tick belongs to
                candle_time = (tick_time // (timeframe_minutes * 60)) * (timeframe_minutes * 60)
                
                if current_candle is None or current_candle["time"] != candle_time:
                    # New candle
                    if current_candle is not None:
                        candles.append(current_candle)
                    
                    current_candle = {
                        "time": candle_time,
                        "open": (tick["bid"] + tick["ask"]) / 2,
                        "high": (tick["bid"] + tick["ask"]) / 2,
                        "low": (tick["bid"] + tick["ask"]) / 2,
                        "close": (tick["bid"] + tick["ask"]) / 2,
                        "tick_count": 1,
                    }
                else:
                    # Update current candle
                    mid_price = (tick["bid"] + tick["ask"]) / 2
                    current_candle["high"] = max(current_candle["high"], mid_price)
                    current_candle["low"] = min(current_candle["low"], mid_price)
                    current_candle["close"] = mid_price
                    current_candle["tick_count"] += 1
            
            # Add the last candle
            if current_candle:
                candles.append(current_candle)
            
            logger.info(f"[CREATE_CANDLES] SUCCESS: Created {len(candles)} candles from {len(ticks)} ticks")
            return candles
        except Exception as e:
            logger.error(f"[CREATE_CANDLES] Error creating candles from ticks: {e}", exc_info=True)
            return []
    
    async def get_rates(self, symbol: str, timeframe: int, count: int = 100) -> Optional[List[Dict]]:
        """
        Get OHLC candles for a symbol
        timeframe: 1=M1, 5=M5, 15=M15, 30=M30, 60=H1, 240=H4, 1440=D1, 10080=W1, 43200=MN
        Falls back to creating candles from ticks if OHLC fails.
        """
        try:
            logger.info(f"[GET_RATES] START: Fetching {count} candles for {symbol} (timeframe: {timeframe})")
            
            # First, select the symbol to ensure it's available for live data
            selected = mt5.symbol_select(symbol, True)
            logger.info(f"[GET_RATES] Symbol selected: {selected}")
            if not selected:
                logger.warning(f"[GET_RATES] Failed to select symbol {symbol} for rates")
            
            now = datetime.utcnow()
            
            # Attempt 1: copy_rates_range with historical data
            logger.info(f"[GET_RATES] Attempt 1: copy_rates_range...")
            try:
                from_date = now - timedelta(days=100)
                to_date = now + timedelta(days=1)
                rates = mt5.copy_rates_range(symbol, timeframe, from_date, to_date)
                logger.info(f"[GET_RATES] copy_rates_range result: {rates is not None}, type: {type(rates)}")
                
                # Check if rates is valid (use len() to avoid numpy array truthiness issues)
                if rates is not None:
                    try:
                        rates_len = len(rates)
                        logger.info(f"[GET_RATES] copy_rates_range returned {rates_len} candles")
                        if rates_len > 0:
                            rates = rates[-count:] if rates_len > count else rates
                            logger.info(f"[GET_RATES] SUCCESS: Retrieved {len(rates)} candles via copy_rates_range")
                            return self._format_candles(rates)
                        else:
                            logger.info(f"[GET_RATES] copy_rates_range returned empty array")
                    except Exception as e:
                        logger.warning(f"[GET_RATES] Error processing copy_rates_range result: {e}")
                else:
                    error_code = mt5.last_error()
                    logger.debug(f"[GET_RATES] copy_rates_range returned None, MT5 error: {error_code}")
            except Exception as e:
                logger.debug(f"[GET_RATES] copy_rates_range exception: {e}")
            
            # Attempt 2: copy_rates_from with past timestamp
            logger.info(f"[GET_RATES] Attempt 2: copy_rates_from...")
            try:
                past_date = now - timedelta(days=30)
                rates = mt5.copy_rates_from(symbol, timeframe, past_date, count)
                logger.info(f"[GET_RATES] copy_rates_from result: {rates is not None}, type: {type(rates)}")
                
                if rates is not None:
                    try:
                        rates_len = len(rates)
                        logger.info(f"[GET_RATES] copy_rates_from returned {rates_len} candles")
                        if rates_len > 0:
                            logger.info(f"[GET_RATES] SUCCESS: Retrieved {len(rates)} candles via copy_rates_from")
                            return self._format_candles(rates)
                        else:
                            logger.info(f"[GET_RATES] copy_rates_from returned empty array")
                    except Exception as e:
                        logger.warning(f"[GET_RATES] Error processing copy_rates_from result: {e}")
                else:
                    error_code = mt5.last_error()
                    logger.debug(f"[GET_RATES] copy_rates_from returned None, MT5 error: {error_code}")
            except Exception as e:
                logger.debug(f"[GET_RATES] copy_rates_from exception: {e}")
            
            # Attempt 3: Fallback to tick-based candles
            logger.warning(f"[GET_RATES] OHLC methods failed, attempting fallback to ticks...")
            try:
                # Request many more ticks to generate enough candles
                # For 100 candles at 1h, we need roughly 100 * (3600/tick_interval) ticks
                # Assuming ~1 tick per second = 3600 ticks per hour, we need ~10000+ ticks
                ticks_needed = max(5000, count * 50)  # At least 5000, or 50x the candle count
                logger.info(f"[GET_RATES] Requesting {ticks_needed} ticks to generate {count} candles")
                
                ticks = await self.get_ticks(symbol, ticks_needed)
                logger.info(f"[GET_RATES] get_ticks returned: {ticks is not None}, count: {len(ticks) if ticks else 0}")
                
                if ticks and len(ticks) > 0:
                    logger.info(f"[GET_RATES] Retrieved {len(ticks)} ticks, converting to candles...")
                    # Convert timeframe number to minutes
                    timeframe_map = {
                        1: 1,      # M1
                        5: 5,      # M5
                        15: 15,    # M15
                        30: 30,    # M30
                        60: 60,    # H1
                        240: 240,  # H4
                        1440: 1440, # D1
                    }
                    tf_minutes = timeframe_map.get(timeframe, 60)
                    
                    candles = self._create_candles_from_ticks(ticks, tf_minutes)
                    logger.info(f"[GET_RATES] _create_candles_from_ticks returned {len(candles) if candles else 0} candles")
                    if candles:
                        logger.info(f"[GET_RATES] SUCCESS via fallback: Created {len(candles)} candles from {len(ticks)} ticks")
                        return candles[-count:] if len(candles) > count else candles
                    else:
                        logger.warning(f"[GET_RATES] _create_candles_from_ticks returned empty list")
                else:
                    logger.warning(f"[GET_RATES] get_ticks returned None or empty")
            except Exception as e:
                logger.error(f"[GET_RATES] Exception during tick fallback: {e}", exc_info=True)
            
            # All methods failed - return None
            error_code = mt5.last_error()
            logger.error(f"[GET_RATES] COMPLETE FAILURE for {symbol}. Last MT5 error: {error_code}")
            return None
            
        except Exception as e:
            logger.error(f"[GET_RATES] Exception in get_rates for {symbol}: {e}", exc_info=True)
            return None
    
    def _format_candles(self, rates) -> List[Dict]:
        """Format MT5 rates into standard candle format"""
        candles = []
        for rate in rates:
            candles.append({
                "time": int(rate.time),
                "open": float(rate.open),
                "high": float(rate.high),
                "low": float(rate.low),
                "close": float(rate.close),
                "tick_volume": int(rate.tick_volume),
                "volume": int(rate.volume) if hasattr(rate, 'volume') else 0,
                "spread": int(rate.spread) if hasattr(rate, 'spread') else 0,
            })
        return candles
    
    async def get_account_info(self) -> Optional[Dict]:
        """Get current account information"""
        try:
            account_info = mt5.account_info()
            if not account_info:
                logger.warning("Could not retrieve account info")
                return None
            
            return {
                "account": account_info.login,
                "server": account_info.server,
                "currency": account_info.currency,
                "balance": account_info.balance,
                "equity": account_info.equity,
                "margin": account_info.margin,
                "free_margin": account_info.margin_free,
                "margin_level": account_info.margin_level if account_info.margin_level > 0 else 0,
            }
        except Exception as e:
            logger.error(f"Error getting account info: {e}")
            return None
    
    async def get_positions(self) -> Optional[List[Dict]]:
        """Get open positions"""
        try:
            positions = mt5.positions_get()
            if positions is None:
                return []
            
            position_list = []
            for pos in positions:
                position_list.append({
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "type": "BUY" if pos.type == 0 else "SELL",
                    "volume": pos.volume,
                    "open_price": pos.price_open,
                    "current_price": pos.price_current,
                    "profit_loss": pos.profit,
                    "opened_time": pos.time,
                })
            return position_list
        except Exception as e:
            logger.error(f"Error getting positions: {e}")
            return []
    
    def _map_symbol_category(self, path: str) -> str:
        """Map MT5 symbol path to our category"""
        # MT5 symbol paths look like "Forex\\EURUSD" or "Crypto\\Bitcoin"
        path_upper = path.upper()
        
        if "FOREX" in path_upper:
            return "Forex"
        elif "CRYPTO" in path_upper or "BITCOIN" in path_upper:
            return "Crypto"
        elif "STOCK" in path_upper or "NYSE" in path_upper or "NASDAQ" in path_upper:
            return "Stocks"
        elif "COMMODITY" in path_upper or "ENERGY" in path_upper or "METAL" in path_upper:
            return "Commodities"
        elif "INDICE" in path_upper or "INDEX" in path_upper:
            return "Indices"
        elif "ETF" in path_upper:
            return "ETFs"
        else:
            return "Other"


# Global MT5 manager instance
mt5_manager = MT5Manager()

