"""
WebSocket service for real-time data broadcasting
"""
import asyncio
import json
import logging
from typing import Set, Dict, List, Callable
from datetime import datetime

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections with separate streams for watchlist and chart"""
    
    def __init__(self, batch_interval_ms: int = 100):
        self.active_connections: Dict[str, asyncio.Queue] = {}  # connection_id -> queue
        self.subscriptions: Dict[str, Set[str]] = {}  # account_id -> set of client_ids
        
        # Separate subscription tracking by stream type
        self.watch_quotes_subscribers: Dict[str, Set[str]] = {}  # account_id -> set of client_ids
        self.chart_ticks_subscribers: Dict[str, Dict[str, Set[str]]] = {}  # account_id -> symbol -> set of client_ids
        
        self.batch_interval = batch_interval_ms / 1000.0  # Convert to seconds
        self.message_queue: asyncio.Queue = asyncio.Queue()
        self.batch_timer_task = None
    
    async def connect(self, client_id: str, account_id: str):
        """Register a new WebSocket connection"""
        queue = asyncio.Queue()
        self.active_connections[client_id] = queue
        
        # Initialize subscriptions for this account
        if account_id not in self.subscriptions:
            self.subscriptions[account_id] = set()
            self.watch_quotes_subscribers[account_id] = set()
            self.chart_ticks_subscribers[account_id] = {}
        
        self.subscriptions[account_id].add(client_id)
        
        logger.info(f"Client {client_id} connected to account {account_id}")
    
    async def disconnect(self, client_id: str):
        """Unregister a WebSocket connection"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            
            # Remove from all subscriptions
            for account_id, clients in self.subscriptions.items():
                clients.discard(client_id)
            
            for account_id, clients in self.watch_quotes_subscribers.items():
                clients.discard(client_id)
            
            for account_id, symbol_subs in self.chart_ticks_subscribers.items():
                for symbol, clients in symbol_subs.items():
                    clients.discard(client_id)
            
            logger.info(f"Client {client_id} disconnected")
    
    async def subscribe_watch_quotes(self, client_id: str, account_id: str):
        """Subscribe client to watchlist quote updates"""
        if account_id in self.watch_quotes_subscribers:
            self.watch_quotes_subscribers[account_id].add(client_id)
            logger.info(f"Client {client_id} subscribed to watch_quotes for account {account_id}")
    
    async def unsubscribe_watch_quotes(self, client_id: str, account_id: str):
        """Unsubscribe client from watchlist quote updates"""
        if account_id in self.watch_quotes_subscribers:
            self.watch_quotes_subscribers[account_id].discard(client_id)
            logger.info(f"Client {client_id} unsubscribed from watch_quotes for account {account_id}")
    
    async def subscribe_chart_ticks(self, client_id: str, account_id: str, symbol: str):
        """Subscribe client to chart tick updates for a specific symbol"""
        if account_id not in self.chart_ticks_subscribers:
            self.chart_ticks_subscribers[account_id] = {}
        if symbol not in self.chart_ticks_subscribers[account_id]:
            self.chart_ticks_subscribers[account_id][symbol] = set()
        
        self.chart_ticks_subscribers[account_id][symbol].add(client_id)
        logger.info(f"Client {client_id} subscribed to chart_ticks for {symbol}")
    
    async def unsubscribe_chart_ticks(self, client_id: str, account_id: str, symbol: str):
        """Unsubscribe client from chart tick updates"""
        if (account_id in self.chart_ticks_subscribers and 
            symbol in self.chart_ticks_subscribers[account_id]):
            self.chart_ticks_subscribers[account_id][symbol].discard(client_id)
            logger.info(f"Client {client_id} unsubscribed from chart_ticks for {symbol}")
    
    async def broadcast_to_account(self, account_id: str, message: Dict):
        """Broadcast a message to all clients connected to an account"""
        if account_id not in self.subscriptions:
            return
        
        for client_id in self.subscriptions[account_id]:
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].put(message)
                except Exception as e:
                    logger.error(f"Error broadcasting to {client_id}: {e}")
    
    async def broadcast_watch_quotes(self, account_id: str, quote_data: Dict):
        """Broadcast watchlist quote update to subscribers"""
        if account_id not in self.watch_quotes_subscribers:
            return
        
        message = {
            "type": "watch_quotes",
            "timestamp": datetime.utcnow().isoformat(),
            "data": quote_data
        }
        
        for client_id in self.watch_quotes_subscribers[account_id]:
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].put(message)
                except Exception as e:
                    logger.error(f"Error broadcasting watch_quotes to {client_id}: {e}")
    
    async def broadcast_chart_ticks(self, account_id: str, symbol: str, tick_data: Dict):
        """Broadcast chart tick update for a specific symbol"""
        if (account_id not in self.chart_ticks_subscribers or 
            symbol not in self.chart_ticks_subscribers[account_id]):
            return
        
        message = {
            "type": "chart_ticks",
            "symbol": symbol,
            "timestamp": datetime.utcnow().isoformat(),
            "data": tick_data
        }
        
        for client_id in self.chart_ticks_subscribers[account_id][symbol]:
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].put(message)
                except Exception as e:
                    logger.error(f"Error broadcasting chart_ticks to {client_id}: {e}")
    
    async def broadcast_quote_update(self, account_id: str, quote_data: Dict):
        """Broadcast a quote/price update (legacy - use watch_quotes)"""
        # Only broadcast if someone is subscribed to watch_quotes
        await self.broadcast_watch_quotes(account_id, quote_data)
    
    async def broadcast_account_update(self, account_id: str, account_data: Dict):
        """Broadcast account state update (balance, equity, etc.)"""
        # Account updates are now handled via polling, not streaming
        logger.debug(f"[WS] Account update received but not broadcast (using polling): {account_data}")
    
    async def broadcast_watchlist_update(self, account_id: str, watchlist_data: List[Dict]):
        """Broadcast watchlist changes"""
        # Watchlist updates are now handled via polling, not streaming
        logger.debug(f"[WS] Watchlist update received but not broadcast (using polling): {len(watchlist_data)} items")
    
    async def broadcast_order_update(self, account_id: str, order_data: Dict):
        """Broadcast order/position update"""
        # Order updates are now handled via polling, not streaming
        logger.debug(f"[WS] Order update received but not broadcast (using polling): {order_data}")
    
    async def get_client_queue(self, client_id: str) -> asyncio.Queue:
        """Get the message queue for a client"""
        return self.active_connections.get(client_id)
    
    async def start_batch_processor(self):
        """Start the batch message processor"""
        while True:
            try:
                batch: List[Dict] = []
                timeout = asyncio.get_event_loop().time() + self.batch_interval
                
                # Collect messages for batch_interval duration
                while asyncio.get_event_loop().time() < timeout:
                    try:
                        message = await asyncio.wait_for(
                            self.message_queue.get(),
                            timeout=max(0.01, timeout - asyncio.get_event_loop().time())
                        )
                        batch.append(message)
                    except asyncio.TimeoutError:
                        break
                
                # Send batch if there are messages
                if batch:
                    await self._send_batch(batch)
                    
            except Exception as e:
                logger.error(f"Error in batch processor: {e}")
                await asyncio.sleep(0.1)
    
    async def _send_batch(self, messages: List[Dict]):
        """Send batched messages to appropriate clients"""
        # Group messages by account
        by_account: Dict[str, List[Dict]] = {}
        for msg in messages:
            account_id = msg.get("account_id", "unknown")
            if account_id not in by_account:
                by_account[account_id] = []
            by_account[account_id].append(msg)
        
        # Broadcast each account's batch
        for account_id, batch in by_account.items():
            batch_message = {
                "type": "batch",
                "timestamp": datetime.utcnow().isoformat(),
                "messages": batch
            }
            await self.broadcast_to_account(account_id, batch_message)


# Global WebSocket manager instance
ws_manager = WebSocketManager()
