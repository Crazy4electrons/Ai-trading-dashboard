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
    
    async def get_symbol_info(self, symbol: str) -> Optional[Dict]:
        """Get detailed information about a symbol"""
        try:
            logger.debug(f"Fetching symbol info for {symbol}")
            info = mt5.symbol_info(symbol)
            if not info:
                logger.warning(f"Symbol info not found for {symbol}")
                return None
            
            result = {
                "name": info.name,
                "category": self._map_symbol_category(info.path),
                "bid": info.bid,
                "ask": info.ask,
                "spread": info.ask - info.bid,
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
            ticks = mt5.copy_ticks_from(symbol, datetime.utcnow() - timedelta(minutes=10), count)
            if ticks is None:
                return None
            
            tick_list = []
            for tick in ticks:
                tick_list.append({
                    "time": tick.time,
                    "bid": tick.bid,
                    "ask": tick.ask,
                    "last": tick.last,
                    "volume": tick.volume,
                })
            return tick_list
        except Exception as e:
            logger.error(f"Error getting ticks for {symbol}: {e}")
            return None
    
    async def get_rates(self, symbol: str, timeframe: int, count: int = 100) -> Optional[List[Dict]]:
        """
        Get OHLC candles for a symbol
        timeframe: 1=M1, 5=M5, 15=M15, 60=H1, 240=H4, 1440=D1
        """
        try:
            logger.info(f"Fetching {count} candles for {symbol} (timeframe: {timeframe})")
            rates = mt5.copy_rates_from(symbol, timeframe, datetime.utcnow(), count)
            if rates is None:
                logger.warning(f"No rates retrieved for {symbol}. MT5 error: {mt5.last_error()}")
                return None
            
            logger.info(f"Retrieved {len(rates)} candles for {symbol}")
            candles = []
            for rate in rates:
                candles.append({
                    "time": rate.time,
                    "open": rate.open,
                    "high": rate.high,
                    "low": rate.low,
                    "close": rate.close,
                    "tick_volume": rate.tick_volume,
                    "volume": rate.volume,
                    "spread": rate.spread,
                })
            return candles
        except Exception as e:
            logger.error(f"Error getting rates for {symbol}: {e}")
            return None
    
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

