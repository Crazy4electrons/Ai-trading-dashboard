"""
Real-time tick streaming from MT5
Subscribes to quote updates and streams all ticks in real-time
"""
import threading
import time
from typing import Dict, List, Optional
import MetaTrader5 as mt5
from logger import logger, log_mt5_event, log_error_with_context
from websocket_client import get_ws_client


class TickStream:
    """Manages real-time tick streaming"""
    
    def __init__(self):
        """Initialize tick streamer"""
        self.streaming = False
        self.subscribed_symbols = set()
        self.last_ticks = {}  # Cache latest tick per symbol
        self.stream_thread = None
        self._stop_event = threading.Event()
    
    def start_streaming(self, symbols: List[str]):
        """
        Start streaming ticks for symbols
        
        Args:
            symbols: List of symbols to stream (e.g., ['EURUSD', 'GBPUSD'])
        """
        if self.streaming:
            logger.warning("Tick streaming already running")
            return
        
        self.subscribed_symbols = set(symbols)
        self._stop_event.clear()
        self.streaming = True
        
        # Start background thread for tick polling
        self.stream_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.stream_thread.start()
        
        log_mt5_event("Tick streaming started", {"symbols": list(self.subscribed_symbols)})
    
    def stop_streaming(self):
        """Stop tick streaming"""
        self._stop_event.set()
        self.streaming = False
        if self.stream_thread:
            self.stream_thread.join(timeout=5)
        log_mt5_event("Tick streaming stopped")
    
    def add_symbol(self, symbol: str):
        """Add symbol to streaming list"""
        self.subscribed_symbols.add(symbol)
        log_mt5_event("Symbol added to tick stream", {"symbol": symbol})
    
    def remove_symbol(self, symbol: str):
        """Remove symbol from streaming list"""
        self.subscribed_symbols.discard(symbol)
        log_mt5_event("Symbol removed from tick stream", {"symbol": symbol})
    
    def get_last_tick(self, symbol: str) -> Optional[Dict]:
        """Get cached last tick for symbol"""
        return self.last_ticks.get(symbol)
    
    def _stream_loop(self):
        """Background loop for polling ticks"""
        try:
            logger.info("[Tick Stream] Polling loop started")
            
            while not self._stop_event.is_set() and len(self.subscribed_symbols) > 0:
                try:
                    # Get tick for each subscribed symbol
                    for symbol in list(self.subscribed_symbols):
                        try:
                            tick = mt5.symbol_info_tick(symbol)
                            
                            if tick:
                                timestamp = int(time.time() * 1000)  # milliseconds
                                
                                tick_data = {
                                    "symbol": symbol,
                                    "bid": float(tick.bid),
                                    "ask": float(tick.ask),
                                    "time": timestamp
                                }
                                
                                # Cache tick
                                self.last_ticks[symbol] = tick_data
                                
                                # Send via WebSocket to Node
                                ws_client = get_ws_client()
                                if ws_client.is_connected():
                                    ws_client.send_tick(symbol, tick_data["bid"], tick_data["ask"], timestamp)
                                
                                logger.debug(f"[Tick] {symbol}: bid={tick.bid}, ask={tick.ask}")
                            
                        except Exception as e:
                            log_error_with_context(e, f"Failed to get tick for {symbol}")
                    
                    # Poll frequency: ~100ms for real-time feel
                    # This streams ALL ticks without throttling
                    time.sleep(0.1)
                    
                except Exception as e:
                    log_error_with_context(e, "Tick stream polling error")
                    time.sleep(1)
            
            logger.info("[Tick Stream] Polling loop ended")
            
        except Exception as e:
            log_error_with_context(e, "Tick stream loop fatal error")


# Global tick stream instance
_tick_stream = None


def get_tick_stream() -> TickStream:
    """Get or create global tick stream"""
    global _tick_stream
    if _tick_stream is None:
        _tick_stream = TickStream()
    return _tick_stream


if __name__ == "__main__":
    stream = TickStream()
    stream.start_streaming(["EURUSD", "GBPUSD"])
    
    time.sleep(10)
    
    stream.stop_streaming()
