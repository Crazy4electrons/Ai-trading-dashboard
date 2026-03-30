"""
MT5 adapter service - handles all MetaTrader5 connections and data access
"""
import MetaTrader5 as mt5
from typing import List, Optional, Dict, Tuple
from datetime import datetime, timedelta, timezone
import asyncio
import logging

logger = logging.getLogger(__name__)


class MT5Manager:
    """Manages MT5 connections and operations"""
    
    def __init__(self):
        self.connections: Dict[str, bool] = {}  # account_id -> is_connected
        self.is_initialized = False  # Track whether MT5 terminal has been initialized globally
    
    async def initialize(self, login: Optional[int] = None, password: Optional[str] = None, 
                         server: Optional[str] = None, max_retries: int = 3):
        """
        Initialize MT5 terminal with optional credentials and retry logic
        
        Args:
            login: Trading account number (optional)
            password: Trading account password (optional)
            server: Trade server name (optional)
            max_retries: Number of retry attempts (default: 3)
            
        Returns:
            Tuple[bool, Optional[str]]: (success, error_message)
        """
        # If credentials provided, initialize with them (direct connection with account)
        if login is not None and password is not None and server is not None:
            logger.info(f"[MT5-INIT] Attempting to initialize with credentials (account: {login}, server: {server})")
            
            for attempt in range(max_retries):
                try:
                    # Initialize MT5 with credentials for better account authorization
                    init_result = mt5.initialize(
                        login=login,
                        password=password,
                        server=server,
                        timeout=60000
                    )
                    
                    if init_result:
                        logger.info(f"[MT5-INIT] Successfully initialized with credentials (attempt {attempt + 1}/{max_retries})")
                        self.is_initialized = True
                        return True, None
                    
                    error_code = mt5.last_error()
                    logger.warning(f"[MT5-INIT] Initialization with credentials failed (attempt {attempt + 1}/{max_retries}), error code: {error_code}")
                    
                    # Exponential backoff: 1s, 2s, 4s
                    if attempt < max_retries - 1:
                        wait_time = 2 ** attempt
                        logger.info(f"[MT5-INIT] Retrying in {wait_time}s...")
                        await asyncio.sleep(wait_time)
                    
                    # Check if this is an authorization-specific error (-6)
                    if error_code == -6:
                        return False, f"Authorization failed (error {error_code}): Invalid credentials or server misconfiguration"
                    
                except Exception as e:
                    logger.error(f"[MT5-INIT] Exception during initialization attempt {attempt + 1}/{max_retries}: {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** attempt)
            
            # All retries exhausted with credentials
            error_code = mt5.last_error()
            error_msg = f"Failed to initialize MT5 after {max_retries} attempts (error: {error_code})"
            logger.error(f"[MT5-INIT] {error_msg}")
            return False, error_msg
        
        # Original behavior: initialize without credentials if already initialized
        if self.is_initialized:
            logger.debug("[MT5-INIT] MT5 already initialized, skipping")
            return True, None
        
        # Initialize terminal without credentials (find automatically)
        logger.info("[MT5-INIT] Initializing MT5 terminal without credentials (auto-detect mode)")
        
        for attempt in range(max_retries):
            try:
                if mt5.initialize():
                    logger.info(f"[MT5-INIT] MT5 initialized successfully (attempt {attempt + 1}/{max_retries})")
                    self.is_initialized = True
                    return True, None
                
                error_code = mt5.last_error()
                logger.warning(f"[MT5-INIT] Initialization failed (attempt {attempt + 1}/{max_retries}), error code: {error_code}")
                
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.info(f"[MT5-INIT] Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    
            except Exception as e:
                logger.error(f"[MT5-INIT] Exception during initialization attempt {attempt + 1}/{max_retries}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
        
        error_code = mt5.last_error()
        error_msg = f"MT5 initialization failed after {max_retries} attempts (error: {error_code})"
        logger.error(f"[MT5-INIT] {error_msg}")
        return False, error_msg
    
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
            count = max(1, min(count, 100000))
            logger.info(f"[GET_TICKS] START: Fetching {count} ticks for {symbol}")

            selected = mt5.symbol_select(symbol, True)
            logger.info(f"[GET_TICKS] Symbol selected: {selected}")
            if not selected:
                logger.warning(f"[GET_TICKS] Failed to select symbol {symbol} for ticks")

            # CRITICAL: Use explicit UTC-aware datetime to avoid timezone interpretation issues
            # MetaTrader5 expects UTC times and returns UTC Unix timestamps (seconds since epoch)
            now = datetime.now(tz=timezone.utc)

            # Estimate number of hours of ticks to retrieve based on desired count
            tick_rate_per_hour = 3600  # conservative guess: 1 tick/sec (varies by instrument)
            target_hours = min(max(int(count / max(tick_rate_per_hour, 1) * 1.5), 1), 720)
            window_candidates = [1, 3, 6, 12, 24, 48, 72, 168, 336, 720]

            for hours in window_candidates:
                if hours < target_hours:
                    continue
                logger.info(f"[GET_TICKS] Attempt with last {hours} hours of ticks")
                try:
                    past = now - timedelta(hours=hours)
                    ticks = mt5.copy_ticks_range(symbol, past, now, mt5.COPY_TICKS_ALL)
                    logger.info(f"[GET_TICKS] copy_ticks_range({hours}h) result: {ticks is not None}, type: {type(ticks)}")

                    if ticks is not None:
                        ticks_len = len(ticks)
                        logger.info(f"[GET_TICKS] copy_ticks_range({hours}h) returned {ticks_len} ticks")
                        if ticks_len > 0:
                            if ticks_len >= count or hours == 72:
                                logger.info(f"[GET_TICKS] SUCCESS: Selected {ticks_len} ticks from last {hours}h")
                                ticks_data = self._process_ticks(ticks)
                                return ticks_data
                            else:
                                logger.info(f"[GET_TICKS] Not enough ticks ({ticks_len} of {count}), expanding window")
                                continue
                    else:
                        logger.debug(f"[GET_TICKS] copy_ticks_range({hours}h) returned None, error: {mt5.last_error()}")

                except Exception as e:
                    logger.warning(f"[GET_TICKS] copy_ticks_range({hours}h) exception: {e}")

            # Fallback: use copy_ticks_from for extra history if available
            try:
                from_date = now - timedelta(days=30)
                ticks = mt5.copy_ticks_from(symbol, from_date, count * 6, mt5.COPY_TICKS_ALL)
                logger.info(f"[GET_TICKS] copy_ticks_from(30d) result: {ticks is not None}, type: {type(ticks)}")
                if ticks is not None and len(ticks) > 0:
                    ticks_len = len(ticks)
                    logger.info(f"[GET_TICKS] copy_ticks_from(30d) returned {ticks_len} ticks")
                    ticks_data = self._process_ticks(ticks)
                    if len(ticks_data) > count:
                        ticks_data = ticks_data[-count:]
                    return ticks_data
                else:
                    logger.debug(f"[GET_TICKS] copy_ticks_from(30d) no ticks, error: {mt5.last_error()}")
            except Exception as e:
                logger.warning(f"[GET_TICKS] copy_ticks_from(30d) exception: {e}")

            # Secondary fallback to 90 days in case more history is needed
            try:
                from_date = now - timedelta(days=90)
                ticks = mt5.copy_ticks_from(symbol, from_date, count * 12, mt5.COPY_TICKS_ALL)
                logger.info(f"[GET_TICKS] copy_ticks_from(90d) result: {ticks is not None}, type: {type(ticks)}")
                if ticks is not None and len(ticks) > 0:
                    ticks_len = len(ticks)
                    logger.info(f"[GET_TICKS] copy_ticks_from(90d) returned {ticks_len} ticks")
                    ticks_data = self._process_ticks(ticks)
                    if len(ticks_data) > count:
                        ticks_data = ticks_data[-count:]
                    return ticks_data
                else:
                    logger.debug(f"[GET_TICKS] copy_ticks_from(90d) no ticks, error: {mt5.last_error()}")
            except Exception as e:
                logger.warning(f"[GET_TICKS] copy_ticks_from(90d) exception: {e}")

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
        """
        Convert tick data into OHLC candles
        
        Note: tick['time'] is a Unix timestamp in UTC seconds from MetaTrader5.
        No timezone conversion needed - ticks are already in UTC format.
        """
        logger.info(f"[CREATE_CANDLES] START: Converting {len(ticks)} ticks to {timeframe_minutes}min candles")
        
        if not ticks or len(ticks) == 0:
            logger.warning(f"[CREATE_CANDLES] No ticks provided")
            return []
        
        try:
            candles = []
            current_candle = None
            
            for tick in ticks:
                tick_time = tick["time"]  # Unix timestamp (UTC seconds since epoch)
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
            count = max(1, min(count, 5000))  # hard cap backend to avoid too-heavy queries
            logger.info(f"[GET_RATES] START: Fetching {count} candles for {symbol} (timeframe: {timeframe})")

            selected = mt5.symbol_select(symbol, True)
            logger.info(f"[GET_RATES] Symbol selected: {selected}")
            if not selected:
                logger.warning(f"[GET_RATES] Failed to select symbol {symbol} for rates")

            # CRITICAL: Use explicit UTC-aware datetime to avoid timezone interpretation issues
            # When backend and MT5 are in different timezones, naive UTC datetimes cause MT5 to
            # misinterpret requests, returning fewer candles. Explicit timezone.utc prevents this.
            # All times must be UTC: copy_rates_from/range, copy_ticks_from/range all require UTC.
            now = datetime.now(tz=timezone.utc)

            def process_rates(source: str, rates) -> Optional[List[Dict]]:
                if rates is None:
                    logger.debug(f"[GET_RATES] {source} returned None, MT5 error: {mt5.last_error()}")
                    return None

                rates_len = len(rates)
                logger.info(f"[GET_RATES] {source} returned {rates_len} candles")
                if rates_len <= 0:
                    logger.info(f"[GET_RATES] {source} returned no candle data")
                    return None

                selected_rates = rates[-count:] if rates_len > count else rates
                formatted = self._format_candles(selected_rates)

                if formatted and self._is_sufficient_candles(len(formatted), count):
                    return formatted

                logger.warning(f"[GET_RATES] {source} produced {len(formatted)} candles (requested {count}) - falling back")
                return None

            # Attempt A: Most reliable - explicit date range without ambiguity
            logger.info("[GET_RATES] Attempt A: copy_rates_range (365d) - Most reliable with explicit UTC range")
            try:
                from_date = now - timedelta(days=365)
                to_date = now + timedelta(minutes=5)  # Slight future buffer to capture latest bar
                rates = mt5.copy_rates_range(symbol, timeframe, from_date, to_date)
                might_be = process_rates("copy_rates_range(365d)", rates)
                if might_be:
                    return might_be
            except Exception as e:
                logger.warning(f"[GET_RATES] copy_rates_range(365d) exception: {e}")

            # Attempt B: Faster fallback with smaller window
            logger.info("[GET_RATES] Attempt B: copy_rates_range (30d)")
            try:
                from_date = now - timedelta(days=30)
                to_date = now + timedelta(minutes=5)
                rates = mt5.copy_rates_range(symbol, timeframe, from_date, to_date)
                might_be = process_rates("copy_rates_range(30d)", rates)
                if might_be:
                    return might_be
            except Exception as e:
                logger.warning(f"[GET_RATES] copy_rates_range(30d) exception: {e}")

            # Attempt C: Previous Attempt A - less reliable due to "from now" ambiguity
            logger.info("[GET_RATES] Attempt C: copy_rates_from (from now)")
            try:
                rates = mt5.copy_rates_from(symbol, timeframe, now, count)
                might_be = process_rates("copy_rates_from", rates)
                if might_be:
                    return might_be
            except Exception as e:
                logger.warning(f"[GET_RATES] copy_rates_from exception: {e}")

            # Attempt D: Index-based methods (no timezone issues)
            logger.info("[GET_RATES] Attempt D: copy_rates_from_pos (index 0)")
            try:
                rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
                might_be = process_rates("copy_rates_from_pos(0)", rates)
                if might_be:
                    return might_be
            except Exception as e:
                logger.warning(f"[GET_RATES] copy_rates_from_pos(0) exception: {e}")

            # Attempt E: Tick fallback - last resort
            logger.info("[GET_RATES] Attempt E: Fallback to ticks to build candles")
            try:
                ratios = {1: 60, 5: 45, 15: 30, 30: 25, 60: 20, 240: 12, 1440: 6}
                tick_factor = ratios.get(timeframe, 30)
                ticks_needed = max(10000, count * tick_factor)
                logger.info(f"[GET_RATES] Requesting {ticks_needed} ticks for fallback (factor {tick_factor})")
                ticks = await self.get_ticks(symbol, ticks_needed)
                logger.info(f"[GET_RATES] get_ticks returned={ticks is not None}, length={(len(ticks) if ticks else 0)}")

                if ticks and len(ticks) > 0:
                    tf_map = {1:1,5:5,15:15,30:30,60:60,240:240,1440:1440}
                    tf_min = tf_map.get(timeframe, 60)
                    candles = self._create_candles_from_ticks(ticks, tf_min)

                    if candles and len(candles) > 0:
                        logger.info(f"[GET_RATES] _create_candles_from_ticks returned {len(candles)} candles")
                        candles = candles[-count:] if len(candles) > count else candles
                        return candles
                    logger.warning("[GET_RATES] _create_candles_from_ticks returned empty")
            except Exception as e:
                logger.error(f"[GET_RATES] Tick fallback exception: {e}", exc_info=True)

            logger.error(f"[GET_RATES] No candle data available for {symbol}")
            return None

        except Exception as e:
            logger.error(f"[GET_RATES] Exception in get_rates for {symbol}: {e}", exc_info=True)
            return None

    def _format_candles(self, rates) -> List[Dict]:
        """
        Format MT5 rates into standard candle format
        
        Note: rate.time is a Unix timestamp in UTC seconds (seconds since 1970.01.01 UTC).
        Frontend chart library (TradingView) handles Unix timestamps correctly, so no conversion needed.
        """
        candles = []
        for rate in rates:
            candles.append({
                "time": int(rate.time),  # Unix timestamp (UTC seconds) - already in correct format for frontend
                "open": float(rate.open),
                "high": float(rate.high),
                "low": float(rate.low),
                "close": float(rate.close),
                "tick_volume": int(rate.tick_volume),
                "volume": int(rate.volume) if hasattr(rate, 'volume') else 0,
                "spread": int(rate.spread) if hasattr(rate, 'spread') else 0,
            })
        return candles

    def _is_sufficient_candles(self, count: int, requested: int) -> bool:
        """Determine if fetched candles are sufficient to avoid fallbacks."""
        if count <= 0:
            return False

        # For small requests, try to meet the exact count.
        if requested <= 100:
            return count >= requested

        # For larger requests, accept a minimum of 100 bars to avoid tiny unhelpful payloads
        # while still being flexible on under-supplied data.
        return count >= 100

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

