"""
WebSocket client for MT5 Python server
Maintains persistent connection to Node backend for real-time data streaming
"""
import asyncio
import websockets
import json
import threading
import time
import os
from typing import Optional, Callable, Any
from logger import logger, log_websocket_event, log_error_with_context


class NodeWebSocketClient:
    """WebSocket client to connect Python server to Node backend"""
    
    def __init__(self, node_ws_url: Optional[str] = None, api_token: Optional[str] = None):
        """
        Initialize WebSocket client
        
        Args:
            node_ws_url: Node backend WebSocket URL (defaults to env var NODE_WS_URL)
            api_token: API token for authentication (defaults to env var NODE_API_TOKEN)
        """
        self.node_ws_url = node_ws_url or os.getenv("NODE_WS_URL", "ws://127.0.0.1:3001/api/mt5/ws-internal")
        self.api_token = api_token or os.getenv("NODE_API_TOKEN", "default_token")
        self.connected = False
        self.ws = None
        self.loop = None
        self.thread = None
        self.reconnect_attempts = 0
        self.reconnect_max_retries = 10
        self.reconnect_base_delay = 1.0
        self.reconnect_max_delay = 30.0
        self._callbacks = {}  # Message type -> callback functions
        self._stop_event = threading.Event()
    
    def start(self):
        """Start WebSocket connection thread"""
        if self.thread and self.thread.is_alive():
            logger.warning("WebSocket client thread already running")
            return
        
        self._stop_event.clear()
        self.thread = threading.Thread(target=self._run_ws_loop, daemon=True)
        self.thread.start()
        log_websocket_event("Client started", self.node_ws_url)
    
    def stop(self):
        """Stop WebSocket connection"""
        self._stop_event.set()
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._disconnect(), self.loop)
        log_websocket_event("Client stopped")
    
    def _run_ws_loop(self):
        """Run asyncio event loop for WebSocket"""
        try:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self._connect_loop())
        except Exception as e:
            log_error_with_context(e, "WebSocket loop error")
        finally:
            if self.loop:
                self.loop.close()
    
    async def _connect_loop(self):
        """Async connection loop with reconnection logic"""
        while not self._stop_event.is_set():
            try:
                await self._connect()
                self.reconnect_attempts = 0
                await self._message_loop()
            except Exception as e:
                log_error_with_context(e, "WebSocket connection error")
                self.connected = False
                await self._handle_disconnect()
    
    async def _connect(self):
        """Attempt to connect to Node WebSocket"""
        try:
            # Add token to headers (websockets 16.0+ uses additional_headers as list of tuples)
            additional_headers = [("X-API-Token", self.api_token)]
            
            log_websocket_event(f"Connecting (attempt {self.reconnect_attempts + 1})")
            
            self.ws = await websockets.connect(self.node_ws_url, additional_headers=additional_headers)
            self.connected = True
            self.reconnect_attempts = 0
            
            log_websocket_event("Connected successfully", self.node_ws_url)
            
            return True
            
        except Exception as e:
            log_error_with_context(e, f"Failed to connect to {self.node_ws_url}")
            self.connected = False
            
            raise
    
    async def _message_loop(self):
        """Listen for and handle incoming messages"""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type", "unknown")
                    
                    # Call registered callback if exists
                    if msg_type in self._callbacks:
                        for callback in self._callbacks[msg_type]:
                            try:
                                callback(data)
                            except Exception as e:
                                logger.error(f"Callback error for {msg_type}: {str(e)}")
                    
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {message[:100]}")
                except Exception as e:
                    logger.error(f"Message handling error: {str(e)}")
                    
        except Exception as e:
            if not self._stop_event.is_set():
                log_error_with_context(e, "Message loop error")
            raise
    
    async def _handle_disconnect(self):
        """Handle disconnection and attempt reconnect"""
        if self.ws:
            await self.ws.close()
            self.ws = None
        
        if self._stop_event.is_set():
            return
        
        # Exponential backoff reconnection
        delay = min(
            self.reconnect_base_delay * (2 ** self.reconnect_attempts),
            self.reconnect_max_delay
        )
        
        logger.info(
            f"[WebSocket Reconnect] Attempt {self.reconnect_attempts + 1}/"
            f"{self.reconnect_max_retries} in {delay:.1f}s"
        )
        
        await asyncio.sleep(delay)
        
        self.reconnect_attempts += 1
        
        if self.reconnect_attempts >= self.reconnect_max_retries:
            logger.error(
                f"[WebSocket Reconnect] Max retries ({self.reconnect_max_retries}) reached"
            )
    
    async def _disconnect(self):
        """Gracefully disconnect"""
        if self.ws:
            await self.ws.close()
        self.connected = False
    
    def send_tick(self, symbol: str, bid: float, ask: float, timestamp: int):
        """
        Send real-time tick data
        
        Args:
            symbol: Trading symbol
            bid: Current bid price
            ask: Current ask price
            timestamp: Timestamp in milliseconds
        """
        if not self.connected:
            return
        
        message = {
            "type": "tick",
            "symbol": symbol,
            "bid": bid,
            "ask": ask,
            "time": timestamp
        }
        
        self._send_json(message)
    
    def send_candle(self, symbol: str, timeframe: str, candle: dict):
        """
        Send candle update
        
        Args:
            symbol: Trading symbol
            timeframe: Timeframe string (1m, 5m, 1h, etc)
            candle: Candle OHLCV data
        """
        if not self.connected:
            return
        
        message = {
            "type": "candle",
            "symbol": symbol,
            "timeframe": timeframe,
            "candle": candle
        }
        
        self._send_json(message)
    
    def send_depth(self, symbol: str, bids: list, asks: list):
        """
        Send order book depth update
        
        Args:
            symbol: Trading symbol
            bids: List of [price, volume] for bids
            asks: List of [price, volume] for asks
        """
        if not self.connected:
            return
        
        message = {
            "type": "depth",
            "symbol": symbol,
            "bids": bids,
            "asks": asks
        }
        
        self._send_json(message)
    
    def send_trade_close(self, trade_data: dict):
        """
        Send trade close event
        
        Args:
            trade_data: Trade close details {symbol, volume, entry_price, exit_price, profit_loss, balance, timestamp}
        """
        if not self.connected:
            return
        
        message = {
            "type": "trade_close",
            **trade_data
        }
        
        self._send_json(message)
    
    def send_status(self, connected: bool, account_id: Optional[int] = None, 
                   error: Optional[str] = None, message: str = ""):
        """Send connection status update"""
        if not self.connected:
            logger.warning("Cannot send status: WebSocket not connected")
            return
        
        msg = {
            "type": "status",
            "connected": connected,
            "account_id": account_id,
            "error": error,
            "message": message
        }
        
        self._send_json(msg)
    
    def register_callback(self, message_type: str, callback: Callable):
        """
        Register a callback for incoming message type
        
        Args:
            message_type: Message type to listen for (e.g., 'command')
            callback: Function to call with message data
        """
        if message_type not in self._callbacks:
            self._callbacks[message_type] = []
        
        self._callbacks[message_type].append(callback)
        logger.debug(f"Registered callback for message type: {message_type}")
    
    def _send_json(self, data: dict):
        """Send JSON message via WebSocket"""
        if not self.connected or not self.ws:
            logger.warning("Cannot send: WebSocket not connected")
            return
        
        try:
            message = json.dumps(data)
            asyncio.run_coroutine_threadsafe(self.ws.send(message), self.loop)
        except Exception as e:
            log_error_with_context(e, "Failed to send WebSocket message")
    
    def is_connected(self) -> bool:
        """Check if WebSocket is connected"""
        return self.connected


# Global client instance
_ws_client = None


def get_ws_client() -> NodeWebSocketClient:
    """Get or create global WebSocket client"""
    global _ws_client
    if _ws_client is None:
        _ws_client = NodeWebSocketClient()
    return _ws_client


if __name__ == "__main__":
    client = NodeWebSocketClient()
    client.start()
    
    # Send test messages
    time.sleep(1)
    if client.is_connected():
        client.send_status(True, 123456, None, "Connected from test")
        client.send_tick("EURUSD", 1.0850, 1.0851, int(time.time() * 1000))
    
    time.sleep(5)
    client.stop()
