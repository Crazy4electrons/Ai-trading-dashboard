#!/usr/bin/env python3
"""
MT5 Bridge — Communicates with MetaTrader 5 terminal via Python library.
Runs as a subprocess, receives JSON commands via stdin, outputs JSON via stdout.
"""
import json
import sys
import os
from datetime import datetime, timedelta

# Add better error handling for imports
try:
    import MetaTrader5 as mt5
except ImportError as e:
    error_msg = (
        f"MetaTrader5 library not installed.\n"
        f"Install with: uv pip install MetaTrader5\n"
        f"or: pip install MetaTrader5\n"
        f"Error: {e}"
    )
    print(error_msg, file=sys.stderr, flush=True)
    sys.exit(1)
except Exception as e:
    error_msg = f"Error importing MetaTrader5: {e}"
    print(error_msg, file=sys.stderr, flush=True)
    sys.exit(1)

class MT5Bridge:
    def __init__(self):
        self.connected = False
        self.last_error = None

    def initialize(self, account, password, server):
        """Initialize and connect to MT5 terminal"""
        try:
            # Initialize MT5 — auto-detects MT5 terminal installation
            if not mt5.initialize():
                self.last_error = f"MT5 init failed: {mt5.last_error()}"
                return False

            # Connect to account
            if not mt5.login(account, password, server):
                self.last_error = f"MT5 login failed: {mt5.last_error()}"
                mt5.shutdown()
                return False

            self.connected = True
            return True
        except Exception as e:
            self.last_error = str(e)
            return False

    def get_account_info(self):
        """Get account information"""
        if not self.connected:
            return {"error": "Not connected"}
        try:
            info = mt5.account_info()
            if info is None:
                return {"error": mt5.last_error()}
            return {
                "login": info.login,
                "server": info.server,
                "currency": info.currency,
                "balance": info.balance,
                "equity": info.equity,
                "margin": info.margin,
                "freeMargin": info.margin_free,
                "leverage": info.leverage,
                "name": info.name,
            }
        except Exception as e:
            return {"error": str(e)}

    def get_candles(self, symbol, timeframe_str, count):
        """Get OHLCV candles"""
        if not self.connected:
            return {"error": "Not connected"}
        
        try:
            # Map timeframe string to MT5 constant
            timeframes = {
                "1m": mt5.TIMEFRAME_M1,
                "5m": mt5.TIMEFRAME_M5,
                "15m": mt5.TIMEFRAME_M15,
                "30m": mt5.TIMEFRAME_M30,
                "1h": mt5.TIMEFRAME_H1,
                "4h": mt5.TIMEFRAME_H4,
                "1d": mt5.TIMEFRAME_D1,
                "1w": mt5.TIMEFRAME_W1,
                "1mn": mt5.TIMEFRAME_MN1,
            }
            tf = timeframes.get(timeframe_str, mt5.TIMEFRAME_H1)

            # Get candles
            rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
            if rates is None:
                return {"error": f"Failed to get candles: {mt5.last_error()}"}

            candles = []
            for rate in rates:
                candles.append({
                    "time": int(rate[0]),
                    "open": float(rate[1]),
                    "high": float(rate[2]),
                    "low": float(rate[3]),
                    "close": float(rate[4]),
                    "volume": int(rate[5]),
                })
            return candles
        except Exception as e:
            return {"error": str(e)}

    def get_price(self, symbol):
        """Get current bid/ask price"""
        if not self.connected:
            return {"error": "Not connected"}
        
        try:
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return {"error": f"Failed to get price: {mt5.last_error()}"}
            
            return {
                "bid": float(tick.bid),
                "ask": float(tick.ask),
                "time": int(tick.time),
            }
        except Exception as e:
            return {"error": str(e)}

    def get_positions(self):
        """Get open positions"""
        if not self.connected:
            return {"error": "Not connected"}
        
        try:
            positions = mt5.positions_get()
            if positions is None:
                return {"error": mt5.last_error()}
            
            result = []
            for pos in positions:
                result.append({
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "type": "buy" if pos.type == 0 else "sell",
                    "volume": float(pos.volume),
                    "openPrice": float(pos.price_open),
                    "currentPrice": float(pos.price_current),
                    "profit": float(pos.profit),
                    "openTime": int(pos.time),
                })
            return result
        except Exception as e:
            return {"error": str(e)}

    def get_history(self, days=30):
        """Get order history"""
        if not self.connected:
            return {"error": "Not connected"}
        
        try:
            # Get deals from last N days
            from_date = datetime.now() - timedelta(days=days)
            deals = mt5.history_deals_get(from_date, datetime.now())
            if deals is None:
                return {"error": mt5.last_error()}
            
            result = []
            for deal in deals:
                result.append({
                    "ticket": deal.ticket,
                    "symbol": deal.symbol,
                    "type": deal.type,
                    "volume": float(deal.volume),
                    "price": float(deal.price),
                    "profit": float(deal.profit),
                    "time": int(deal.time),
                })
            return result
        except Exception as e:
            return {"error": str(e)}

    def place_order(self, symbol, order_type, volume):
        """Place a market order"""
        if not self.connected:
            return {"error": "Not connected"}
        
        try:
            # Get symbol info
            sym_info = mt5.symbol_info(symbol)
            if sym_info is None:
                return {"error": f"Symbol not found: {symbol}"}
            
            # Current price
            tick = mt5.symbol_info_tick(symbol)
            if tick is None:
                return {"error": "Failed to get current price"}
            
            # Prepare order
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume,
                "type": mt5.ORDER_TYPE_BUY if order_type == "buy" else mt5.ORDER_TYPE_SELL,
                "price": tick.ask if order_type == "buy" else tick.bid,
                "deviation": 20,
                "magic": 1234567,
                "comment": "python script order",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_IOC,
            }
            
            # Send order
            result = mt5.order_send(request)
            if result is None:
                return {"error": mt5.last_error()}
            
            return {
                "ticket": result.order,
                "retcode": result.retcode,
                "volume": result.volume,
            }
        except Exception as e:
            return {"error": str(e)}

    def shutdown(self):
        """Disconnect from MT5"""
        if self.connected:
            mt5.shutdown()
            self.connected = False

    def process_command(self, cmd_dict):
        """Process a command and return result"""
        cmd = cmd_dict.get("cmd")
        
        if cmd == "connect":
            success = self.initialize(
                cmd_dict.get("account"),
                cmd_dict.get("password"),
                cmd_dict.get("server", "MetaQuotes-Demo"),
            )
            if success:
                return {"success": True, "msg": "Connected to MT5"}
            else:
                return {"error": self.last_error}
        
        elif cmd == "account":
            return self.get_account_info()
        
        elif cmd == "candles":
            return self.get_candles(
                cmd_dict.get("symbol"),
                cmd_dict.get("timeframe", "1h"),
                cmd_dict.get("count", 200),
            )
        
        elif cmd == "price":
            return self.get_price(cmd_dict.get("symbol"))
        
        elif cmd == "positions":
            return self.get_positions()
        
        elif cmd == "history":
            return self.get_history(cmd_dict.get("days", 30))
        
        elif cmd == "order":
            return self.place_order(
                cmd_dict.get("symbol"),
                cmd_dict.get("type"),
                cmd_dict.get("volume"),
            )
        
        elif cmd == "shutdown":
            self.shutdown()
            return {"success": True}
        
        else:
            return {"error": f"Unknown command: {cmd}"}


def main():
    """Main loop — read commands, execute, output results"""
    bridge = MT5Bridge()
    
    try:
        # Buffering disabled so output appears immediately
        sys.stdout = open(sys.stdout.fileno(), 'w', encoding='utf-8', buffering=1)
        sys.stderr = open(sys.stderr.fileno(), 'w', encoding='utf-8', buffering=1)
        
        # Log startup
        print(json.dumps({"status": "bridge_started"}), flush=True)
        
        while True:
            try:
                line = sys.stdin.readline().strip()
                if not line:
                    continue
                
                print(json.dumps({"debug": f"Received command: {line[:100]}"}), flush=True)
                
                cmd_dict = json.loads(line)
                result = bridge.process_command(cmd_dict)
                
                # Add debug info to response
                if result and isinstance(result, dict):
                    result["id"] = cmd_dict.get("id")
                
                print(json.dumps(result), flush=True)
            except json.JSONDecodeError as e:
                error_msg = f"JSON parse error: {e}"
                print(json.dumps({"error": error_msg, "id": cmd_dict.get("id") if 'cmd_dict' in locals() else None}), flush=True)
            except Exception as e:
                error_msg = f"Process error: {str(e)}"
                print(json.dumps({"error": error_msg, "id": cmd_dict.get("id") if 'cmd_dict' in locals() else None}), flush=True)
    except KeyboardInterrupt:
        print(json.dumps({"status": "shutdown"}), flush=True)
        bridge.shutdown()
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": f"Fatal error in main loop: {str(e)}"}), file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
