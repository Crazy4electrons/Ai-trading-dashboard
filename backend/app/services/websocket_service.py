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
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self, batch_interval_ms: int = 100):
        self.active_connections: Dict[str, asyncio.Queue] = {}  # connection_id -> queue
        self.subscriptions: Dict[str, Set[str]] = {}  # account_id -> set of client_ids
        self.batch_interval = batch_interval_ms / 1000.0  # Convert to seconds
        self.message_queue: asyncio.Queue = asyncio.Queue()
        self.batch_timer_task = None
    
    async def connect(self, client_id: str, account_id: str):
        """Register a new WebSocket connection"""
        queue = asyncio.Queue()
        self.active_connections[client_id] = queue
        
        # Subscribe to account updates
        if account_id not in self.subscriptions:
            self.subscriptions[account_id] = set()
        self.subscriptions[account_id].add(client_id)
        
        logger.info(f"Client {client_id} connected to account {account_id}")
    
    async def disconnect(self, client_id: str):
        """Unregister a WebSocket connection"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            
            # Remove from subscriptions
            for account_id, clients in self.subscriptions.items():
                if client_id in clients:
                    clients.discard(client_id)
            
            logger.info(f"Client {client_id} disconnected")
    
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
    
    async def broadcast_quote_update(self, account_id: str, quote_data: Dict):
        """Broadcast a quote/price update"""
        message = {
            "type": "quote",
            "timestamp": datetime.utcnow().isoformat(),
            "data": quote_data
        }
        await self.broadcast_to_account(account_id, message)
    
    async def broadcast_account_update(self, account_id: str, account_data: Dict):
        """Broadcast account state update (balance, equity, etc.)"""
        message = {
            "type": "account",
            "timestamp": datetime.utcnow().isoformat(),
            "data": account_data
        }
        await self.broadcast_to_account(account_id, message)
    
    async def broadcast_watchlist_update(self, account_id: str, watchlist_data: List[Dict]):
        """Broadcast watchlist changes"""
        message = {
            "type": "watchlist",
            "timestamp": datetime.utcnow().isoformat(),
            "data": watchlist_data
        }
        await self.broadcast_to_account(account_id, message)
    
    async def broadcast_order_update(self, account_id: str, order_data: Dict):
        """Broadcast order/position update"""
        message = {
            "type": "order",
            "timestamp": datetime.utcnow().isoformat(),
            "data": order_data
        }
        await self.broadcast_to_account(account_id, message)
    
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
