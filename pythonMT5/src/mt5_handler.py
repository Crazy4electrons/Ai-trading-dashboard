"""
Core MT5 operations wrapper
Handles all MetaTrader5 interactions, reconnection logic, and state management
"""
import MetaTrader5 as mt5
import time
import threading
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
import math
from logger import logger, log_mt5_event, log_error_with_context


class MT5Handler:
    """Wrapper for MetaTrader5 library with reconnection logic"""
    
    def __init__(self):
        """Initialize MT5 handler"""
        self.connected = False
        self.account_id = None
        self.last_balance = 0.0
        self.reconnect_attempts = 0
        self.reconnect_max_retries = 10
        self.reconnect_base_delay = 1.0  # seconds
        self.reconnect_max_delay = 30.0  # seconds
        self.last_reconnect_attempt = None
        self.login_params = None  # Store login params for reconnect
        self._lock = threading.RLock()
        self._tick_callbacks = []
        self._candle_callbacks = []
        self._trade_close_callbacks = []
    
    def login(self, account: int, password: str, server: str) -> bool:
        """
        Attempt to login to MT5
        
        Args:
            account: MT5 account number
            password: MT5 password
            server: MT5 server name
            
        Returns:
            True if login successful, False otherwise
        """
        with self._lock:
            try:
                # Initialize MT5
                if not mt5.initialize():
                    error_msg = mt5.last_error()
                    log_error_with_context(Exception(str(error_msg)), "MT5 initialization failed")
                    return False
                
                log_mt5_event("Initialized", {"result": True})
                
                # Attempt login
                if not mt5.login(account, password=password, server=server):
                    error_msg = mt5.last_error()
                    log_error_with_context(Exception(f"Login error: {error_msg}"), "MT5 login failed")
                    return False
                
                # Get account info to confirm connection
                account_info = mt5.account_info()
                if not account_info:
                    log_error_with_context(Exception("Could not fetch account info"), "MT5 account info failed")
                    return False
                
                # Store login params for reconnection
                self.login_params = {
                    'account': account,
                    'password': password,
                    'server': server
                }
                
                self.connected = True
                self.account_id = account_info.login
                self.last_balance = account_info.balance
                self.reconnect_attempts = 0
                
                log_mt5_event("Logged in successfully", {
                    "account": self.account_id,
                    "balance": self.last_balance,
                    "broker": account_info.company
                })
                
                return True
                
            except Exception as e:
                log_error_with_context(e, "MT5 login exception")
                self.connected = False
                return False
    
    def reconnect(self) -> bool:
        """
        Attempt to reconnect to MT5 with exponential backoff
        
        Returns:
            True if reconnect successful, False otherwise
        """
        with self._lock:
            if not self.login_params:
                logger.warning("No login params stored for reconnection")
                return False
            
            # Calculate exponential backoff delay
            delay = min(
                self.reconnect_base_delay * (2 ** self.reconnect_attempts),
                self.reconnect_max_delay
            )
            
            logger.info(
                f"[RECONNECT] Attempt {self.reconnect_attempts + 1}/{self.reconnect_max_retries} "
                f"in {delay:.1f}s"
            )
            
            time.sleep(delay)
            
            # Attempt login
            result = self.login(
                self.login_params['account'],
                self.login_params['password'],
                self.login_params['server']
            )
            
            if result:
                logger.info(f"[RECONNECT] Successful after {self.reconnect_attempts + 1} attempts")
                return True
            
            self.reconnect_attempts += 1
            
            if self.reconnect_attempts >= self.reconnect_max_retries:
                logger.error(
                    f"[RECONNECT] Max retries ({self.reconnect_max_retries}) reached. "
                    "Giving up."
                )
                return False
            
            return False
    
    def shutdown(self):
        """Gracefully shutdown MT5 connection"""
        with self._lock:
            try:
                if mt5 and self.connected:
                    mt5.shutdown()
                    self.connected = False
                    logger.info("MT5 shutdown successful")
            except Exception as e:
                log_error_with_context(e, "MT5 shutdown error")
    
    def is_connected(self) -> bool:
        """Check if MT5 is connected"""
        with self._lock:
            return self.connected
    
    def get_account_info(self) -> Dict[str, Any]:
        """Get account information"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5"}
            
            info = mt5.account_info()
            if not info:
                return {"error": True, "message": "Failed to fetch account info"}
            
            return {
                "error": False,
                "account_id": info.login,
                "balance": info.balance,
                "equity": info.equity,
                "free_margin": info.margin_free,
                "used_margin": getattr(info, 'margin_used', info.balance - info.margin_free),
                "margin_level": info.margin_level if hasattr(info, 'margin_level') else None,
                "currency": info.currency,
                "profit_loss": info.profit
            }
        except Exception as e:
            log_error_with_context(e, "get_account_info")
            return {"error": True, "message": str(e)}
    
    def get_candles(self, symbol: str, timeframe_str: str, count: int = 100) -> List[Dict]:
        """
        Get historical candles
        
        Args:
            symbol: Trading symbol (e.g., EURUSD)
            timeframe_str: Timeframe (1m, 5m, 15m, 1h, 4h, 1d, 1w)
            count: Number of candles to fetch
            
        Returns:
            List of candles or error dict
        """
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5"}
            
            # Convert timeframe string to MT5 constant
            timeframe_map = {
                '1m': mt5.TIMEFRAME_M1,
                '5m': mt5.TIMEFRAME_M5,
                '15m': mt5.TIMEFRAME_M15,
                '30m': mt5.TIMEFRAME_M30,
                '1h': mt5.TIMEFRAME_H1,
                '4h': mt5.TIMEFRAME_H4,
                '1d': mt5.TIMEFRAME_D1,
                '1w': mt5.TIMEFRAME_W1,
                '1mn': mt5.TIMEFRAME_MN1,
            }
            
            timeframe = timeframe_map.get(timeframe_str, mt5.TIMEFRAME_H1)
            
            # Fetch candles
            candles = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
            
            if candles is None:
                error = mt5.last_error()
                return {"error": True, "message": f"Failed to fetch candles: {error}"}
            
            # Convert to list of dicts with timestamps in milliseconds
            result = []
            for candle in candles:
                result.append({
                    "time": int(candle[0] * 1000),  # Convert to milliseconds
                    "open": float(candle[1]),
                    "high": float(candle[2]),
                    "low": float(candle[3]),
                    "close": float(candle[4]),
                    "volume": int(candle[5])
                })
            
            return {"error": False, "candles": result}
            
        except Exception as e:
            log_error_with_context(e, "get_candles")
            return {"error": True, "message": str(e)}
    
    def get_positions(self) -> Dict[str, Any]:
        """Get all open positions"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5", "positions": []}
            
            positions = mt5.positions_get()
            
            if positions is None:
                return {"error": True, "message": "Failed to fetch positions", "positions": []}
            
            result = []
            for pos in positions:
                # Get current price for P&L calculation
                tick = mt5.symbol_info_tick(pos.symbol)
                current_price = tick.bid if pos.type == 0 else tick.ask  # 0=BUY, 1=SELL
                
                profit_loss = pos.profit
                volume = pos.volume
                entry_price = pos.price_open
                
                pct_change = (profit_loss / (entry_price * volume * 100)) * 100 if entry_price > 0 else 0
                
                result.append({
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "type": "BUY" if pos.type == 0 else "SELL",
                    "volume": float(volume),
                    "open_price": float(entry_price),
                    "current_price": float(current_price),
                    "profit_loss": float(profit_loss),
                    "profit_loss_percent": float(pct_change),
                    "open_time": int(pos.time * 1000),
                    "comment": pos.comment
                })
            
            return {"error": False, "positions": result}
            
        except Exception as e:
            log_error_with_context(e, "get_positions")
            return {"error": True, "message": str(e), "positions": []}
    
    def get_trade_history(self, days: int = 30) -> Dict[str, Any]:
        """Get closed trade history"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5", "trades": []}
            
            # Get deals (trades) from last N days
            date_from = datetime.now() - timedelta(days=days)
            deals = mt5.history_deals_get(date_from, datetime.now())
            
            if deals is None:
                return {"error": True, "message": "Failed to fetch history", "trades": []}
            
            # Group deals by position/trade
            trades = {}
            for deal in deals:
                # Each deal-in has a corresponding deal-out for the same ticket
                ticket = deal.ticket
                if ticket not in trades:
                    trades[ticket] = {
                        "ticket": ticket,
                        "symbol": deal.symbol,
                        "volume": deal.volume,
                        "open_time": None,
                        "close_time": None,
                        "opens": [],
                        "closes": []
                    }
                
                # Determine if this is an opening (BUY/SELL) or closing deal
                if deal.type in [0, 1]:  # BUY or SELL
                    trades[ticket]["opens"].append({
                        "price": deal.price,
                        "time": deal.time,
                        "type": "BUY" if deal.type == 0 else "SELL"
                    })
                else:
                    trades[ticket]["closes"].append({
                        "price": deal.price,
                        "time": deal.time
                    })
            
            result = []
            for ticket, trade in trades.items():
                if trade["opens"] and trade["closes"]:
                    open_deal = trade["opens"][0]
                    close_deal = trade["closes"][-1]
                    
                    open_price = open_deal["price"]
                    close_price = close_deal["price"]
                    volume = trade["volume"]
                    
                    # Calculate P&L
                    if open_deal["type"] == "BUY":
                        profit_loss = (close_price - open_price) * volume * 100  # Assuming pip value
                    else:
                        profit_loss = (open_price - close_price) * volume * 100
                    
                    result.append({
                        "ticket": ticket,
                        "symbol": trade["symbol"],
                        "type": open_deal["type"],
                        "volume": float(volume),
                        "open_price": float(open_price),
                        "close_price": float(close_price),
                        "open_time": int(open_deal["time"] * 1000),
                        "close_time": int(close_deal["time"] * 1000),
                        "profit_loss": float(profit_loss)
                    })
            
            return {"error": False, "trades": result}
            
        except Exception as e:
            log_error_with_context(e, "get_trade_history")
            return {"error": True, "message": str(e), "trades": []}
    
    def get_symbols(self) -> Dict[str, Any]:
        """Get list of available symbols"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5", "symbols": []}
            
            symbols = mt5.symbols_get()
            
            if symbols is None:
                return {"error": True, "message": "Failed to fetch symbols", "symbols": []}
            
            result = [{"name": s.name, "description": s.description} for s in symbols[:100]]
            
            return {"error": False, "symbols": result}
            
        except Exception as e:
            log_error_with_context(e, "get_symbols")
            return {"error": True, "message": str(e), "symbols": []}
    
    def get_symbol_info(self, symbol: str) -> Dict[str, Any]:
        """Get symbol information"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5"}
            
            info = mt5.symbol_info(symbol)
            
            if not info:
                return {"error": True, "message": f"Symbol {symbol} not found"}
            
            tick = mt5.symbol_info_tick(symbol)
            
            return {
                "error": False,
                "symbol": symbol,
                "description": info.description,
                "bid": float(tick.bid) if tick else None,
                "ask": float(tick.ask) if tick else None,
                "digits": info.digits,
                "tick_size": float(info.point),
                "min_volume": float(info.volume_min),
                "max_volume": float(info.volume_max),
                "volume_step": float(info.volume_step)
            }
            
        except Exception as e:
            log_error_with_context(e, "get_symbol_info")
            return {"error": True, "message": str(e)}
    
    def get_depth(self, symbol: str) -> Dict[str, Any]:
        """Get market depth (order book)"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5"}
            
            # Get tick info
            tick = mt5.symbol_info_tick(symbol)
            
            if not tick:
                return {"error": True, "message": f"Failed to get depth for {symbol}"}
            
            # Return bid/ask spread as simple depth representation
            # Note: MT5 doesn't provide full order book depth, only current bid/ask
            return {
                "error": False,
                "symbol": symbol,
                "bids": [[float(tick.bid), 100.0]],
                "asks": [[float(tick.ask), 100.0]]
            }
            
        except Exception as e:
            log_error_with_context(e, "get_depth")
            return {"error": True, "message": str(e)}
    
    def place_order(self, symbol: str, order_type: str, volume: float, 
                   stop_loss: Optional[float] = None, 
                   take_profit: Optional[float] = None) -> Dict[str, Any]:
        """Place a market order"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5"}
            
            # Determine order direction
            order_type_map = {
                "BUY": mt5.ORDER_TYPE_BUY,
                "SELL": mt5.ORDER_TYPE_SELL
            }
            
            mt5_order_type = order_type_map.get(order_type.upper())
            if not mt5_order_type:
                return {"error": True, "message": f"Invalid order type: {order_type}"}
            
            # Get current price
            tick = mt5.symbol_info_tick(symbol)
            if not tick:
                return {"error": True, "message": f"Failed to get tick for {symbol}"}
            
            price = tick.ask if order_type.upper() == "BUY" else tick.bid
            
            # Create order request
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": mt5_order_type,
                "price": price,
                "deviation": 20,
                "magic": 0,
                "comment": "python_order",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            
            if stop_loss:
                request["sl"] = stop_loss
            if take_profit:
                request["tp"] = take_profit
            
            # Send order
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    "error": True,
                    "message": f"Order failed: {result.comment}"
                }
            
            return {
                "error": False,
                "ticket": result.order,
                "volume": volume,
                "price": float(price),
                "type": order_type
            }
            
        except Exception as e:
            log_error_with_context(e, "place_order")
            return {"error": True, "message": str(e)}
    
    def close_position(self, ticket: int) -> Dict[str, Any]:
        """Close an open position"""
        try:
            if not self.connected:
                return {"error": True, "message": "Not connected to MT5"}
            
            # Get position
            position = mt5.positions_get(ticket=ticket)
            if not position:
                return {"error": True, "message": f"Position {ticket} not found"}
            
            pos = position[0]
            
            # Get current price
            tick = mt5.symbol_info_tick(pos.symbol)
            if not tick:
                return {"error": True, "message": f"Failed to get tick for {pos.symbol}"}
            
            # Determine close order type (opposite of position)
            close_type = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
            price = tick.bid if pos.type == 0 else tick.ask
            
            # Create close order
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": pos.symbol,
                "volume": pos.volume,
                "type": close_type,
                "price": price,
                "deviation": 20,
                "magic": 0,
                "comment": "close_position",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    "error": True,
                    "message": f"Close failed: {result.comment}"
                }
            
            return {
                "error": False,
                "ticket": result.order,
                "closed_volume": pos.volume
            }
            
        except Exception as e:
            log_error_with_context(e, "close_position")
            return {"error": True, "message": str(e)}


# Global MT5 handler instance
_mt5_handler = None


def get_mt5_handler() -> MT5Handler:
    """Get or create global MT5 handler"""
    global _mt5_handler
    if _mt5_handler is None:
        _mt5_handler = MT5Handler()
    return _mt5_handler
