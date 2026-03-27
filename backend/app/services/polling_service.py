"""
Polling Service - handles periodic data fetching for non-streaming data
"""
import asyncio
import logging
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class PollingService:
    """Manages periodic polling for account data, positions, and history"""

    def __init__(self):
        self.active_pollers: Dict[str, asyncio.Task] = {}
        self.callbacks: Dict[str, List[Callable]] = {}
        self.last_data: Dict[str, Any] = {}
        self.poll_intervals = {
            "account": 10,  # 10 seconds
            "positions": 5,  # 5 seconds
            "history": 30,  # 30 seconds (for appending new history)
        }

    def register_callback(self, data_type: str, callback: Callable):
        """Register a callback for when data is updated"""
        if data_type not in self.callbacks:
            self.callbacks[data_type] = []
        self.callbacks[data_type].append(callback)
        logger.debug(f"[POLLING] Registered callback for {data_type}")

    def unregister_callback(self, data_type: str, callback: Callable):
        """Unregister a callback"""
        if data_type in self.callbacks:
            self.callbacks[data_type].remove(callback)
            logger.debug(f"[POLLING] Unregistered callback for {data_type}")

    async def _notify_callbacks(self, data_type: str, data: Any):
        """Notify all callbacks for a data type"""
        if data_type in self.callbacks:
            for callback in self.callbacks[data_type]:
                try:
                    await callback(data)
                except Exception as e:
                    logger.error(f"[POLLING] Error in callback for {data_type}: {e}")

    def _has_data_changed(self, data_type: str, new_data: Any) -> bool:
        """Check if data has actually changed"""
        if data_type not in self.last_data:
            return True

        # For different data types, compare differently
        if data_type == "account":
            # Compare key account metrics
            old_data = self.last_data[data_type]
            return (
                old_data.get("balance") != new_data.get("balance") or
                old_data.get("equity") != new_data.get("equity") or
                old_data.get("margin") != new_data.get("margin") or
                old_data.get("margin_free") != new_data.get("margin_free")
            )

        elif data_type == "positions":
            # Compare positions by ticket and key fields
            old_positions = self.last_data[data_type]
            if len(old_positions) != len(new_data):
                return True

            # Check if any position has changed
            for old_pos, new_pos in zip(old_positions, new_data):
                if (old_pos.get("ticket") != new_pos.get("ticket") or
                    old_pos.get("profit") != new_pos.get("profit") or
                    old_pos.get("volume") != new_pos.get("volume")):
                    return True
            return False

        elif data_type == "history":
            # History is additive, so always consider it changed if we have new data
            return bool(new_data)

        return True  # Default to changed for unknown types

    async def _poll_data(self, data_type: str, fetch_func: Callable, account_id: str):
        """Poll data periodically"""
        interval = self.poll_intervals.get(data_type, 30)

        while True:
            try:
                logger.debug(f"[POLLING] Fetching {data_type} for account {account_id}")

                # Fetch new data
                new_data = await fetch_func()

                # Check if data has changed
                if self._has_data_changed(data_type, new_data):
                    logger.info(f"[POLLING] {data_type} data changed, notifying callbacks")
                    self.last_data[data_type] = new_data.copy() if hasattr(new_data, 'copy') else new_data
                    await self._notify_callbacks(data_type, new_data)
                else:
                    logger.debug(f"[POLLING] {data_type} data unchanged")

            except Exception as e:
                logger.error(f"[POLLING] Error polling {data_type}: {e}")

            # Wait for next poll
            await asyncio.sleep(interval)

    def start_polling(self, data_type: str, fetch_func: Callable, account_id: str):
        """Start polling for a data type"""
        if data_type in self.active_pollers:
            logger.warning(f"[POLLING] Polling already active for {data_type}")
            return

        logger.info(f"[POLLING] Starting polling for {data_type} (interval: {self.poll_intervals.get(data_type, 30)}s)")
        task = asyncio.create_task(self._poll_data(data_type, fetch_func, account_id))
        self.active_pollers[data_type] = task

    def stop_polling(self, data_type: str):
        """Stop polling for a data type"""
        if data_type in self.active_pollers:
            logger.info(f"[POLLING] Stopping polling for {data_type}")
            self.active_pollers[data_type].cancel()
            del self.active_pollers[data_type]

    def stop_all_polling(self):
        """Stop all polling"""
        logger.info("[POLLING] Stopping all polling")
        for data_type, task in self.active_pollers.items():
            task.cancel()
        self.active_pollers.clear()

    def get_last_data(self, data_type: str) -> Optional[Any]:
        """Get the last polled data for a type"""
        return self.last_data.get(data_type)

    def get_active_pollers(self) -> List[str]:
        """Get list of currently active pollers"""
        return list(self.active_pollers.keys())


# Global polling service instance
polling_service = PollingService()