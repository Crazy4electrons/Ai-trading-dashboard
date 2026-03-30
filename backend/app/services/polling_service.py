"""
Polling Service - handles periodic data fetching with exponential backoff retry logic
Each poller operates independently with its own retry counter and backoff state.
"""
import asyncio
import logging
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class PollerState:
    """Per-poller state tracking for retry logic and backoff"""
    
    def __init__(self, data_type: str, base_interval: int):
        self.data_type = data_type
        self.base_interval = base_interval  # Default poll interval in seconds
        self.retry_count = 0
        self.last_error: Optional[str] = None
        self.last_success_time: Optional[datetime] = None
        self.last_failure_time: Optional[datetime] = None
        self.is_failing = False
        self.backoff_multiplier = 1.0
    
    def get_current_interval(self) -> int:
        """Get the current poll interval based on backoff state"""
        if not self.is_failing:
            return self.base_interval
        
        # Exponential backoff: base interval * 2^retry_count (capped at max)
        backoff_interval = self.base_interval * (2 ** self.retry_count)
        max_interval = 120  # Max 2 minutes between attempts
        return min(backoff_interval, max_interval)
    
    def record_success(self):
        """Record a successful poll"""
        self.retry_count = 0
        self.is_failing = False
        self.last_error = None
        self.last_success_time = datetime.utcnow()
        self.backoff_multiplier = 1.0
        logger.info(f"[POLLING-{self.data_type}] ✓ Success - reset backoff")
    
    def record_failure(self, error: str):
        """Record a failed poll and prepare for retry"""
        self.is_failing = True
        self.retry_count += 1
        self.last_error = error
        self.last_failure_time = datetime.utcnow()
        self.backoff_multiplier = 2 ** (self.retry_count - 1)
        
        next_interval = self.get_current_interval()
        logger.warning(
            f"[POLLING-{self.data_type}] ✗ Failure #{self.retry_count} - "
            f"next attempt in {next_interval}s | Error: {error[:50]}"
        )


class PollingService:
    """
    Manages periodic polling for account data, positions, and history.
    
    Each poller has independent retry logic with exponential backoff:
    - Attempt 1 fail: retry in 2s (base interval 1s * 2)
    - Attempt 2 fail: retry in 4s (base interval 1s * 4)
    - Attempt 3 fail: retry in 8s (base interval 1s * 8)
    - Attempt 4 fail: retry in 16s (base interval 1s * 16)
    - Max backoff: 120 seconds
    
    Success resets the retry counter and returns to normal polling interval.
    """

    def __init__(self):
        self.active_pollers: Dict[str, asyncio.Task] = {}
        self.poller_state: Dict[str, PollerState] = {}
        self.callbacks: Dict[str, List[Callable]] = {}
        self.last_data: Dict[str, Any] = {}
        
        # Base poll intervals (before any backoff)
        self.poll_intervals = {
            "chart": 1,        # 1 second (real-time chart updates)
            "watchlist": 1,    # 1 second (watchlist updates)
            "account": 2,      # 2 seconds (account balance, equity)
            "positions": 5,    # 5 seconds (open positions)
            "history": 10,     # 10 seconds (new order history)
        }

    def register_callback(self, data_type: str, callback: Callable):
        """Register a callback for when data is updated"""
        if data_type not in self.callbacks:
            self.callbacks[data_type] = []
        self.callbacks[data_type].append(callback)
        logger.debug(f"[POLLING] Registered callback for {data_type}")

    def unregister_callback(self, data_type: str, callback: Callable):
        """Unregister a callback"""
        if data_type in self.callbacks and callback in self.callbacks[data_type]:
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
        # If new data is None, treat as unchanged (don't notify on null responses)
        if new_data is None:
            return False

        if data_type not in self.last_data:
            return True

        # For different data types, compare differently
        if data_type == "account":
            # Compare key account metrics
            old_data = self.last_data[data_type]
            if old_data is None:
                return True
            return (
                old_data.get("balance") != new_data.get("balance") or
                old_data.get("equity") != new_data.get("equity") or
                old_data.get("margin") != new_data.get("margin") or
                old_data.get("margin_free") != new_data.get("margin_free")
            )

        elif data_type in ["positions", "watchlist", "chart"]:
            # For list-based data, compare lengths and changes
            old_data = self.last_data[data_type]
            if old_data is None or len(old_data) != len(new_data):
                return True
            # Quick check: if identical, no change
            return json.dumps(old_data, sort_keys=True, default=str) != json.dumps(new_data, sort_keys=True, default=str)

        elif data_type == "history":
            # History is additive, so always consider it changed if we have new data
            return bool(new_data)

        return True  # Default to changed for unknown types

    async def _poll_data(self, data_type: str, fetch_func: Callable, account_id: str):
        """
        Poll data periodically with exponential backoff retry logic.
        
        Each poller independently:
        1. Attempts to fetch data
        2. On success: resets backoff, waits for base interval
        3. On failure: increments retry counter, waits with exponential backoff
        """
        # Initialize state for this poller
        if data_type not in self.poller_state:
            base_interval = self.poll_intervals.get(data_type, 10)
            self.poller_state[data_type] = PollerState(data_type, base_interval)
        
        state = self.poller_state[data_type]
        logger.info(f"[POLLING-{data_type}] Started for account {account_id} (base interval: {state.base_interval}s)")

        while True:
            try:
                current_interval = state.get_current_interval()
                logger.debug(f"[POLLING-{data_type}] Fetching... (interval: {current_interval}s, retry: {state.retry_count})")

                # Fetch new data with timeout
                try:
                    new_data = await asyncio.wait_for(fetch_func(), timeout=5.0)
                except asyncio.TimeoutError:
                    raise Exception(f"Fetch timeout after 5 seconds")

                # Check if data has changed
                if self._has_data_changed(data_type, new_data):
                    self.last_data[data_type] = new_data.copy() if hasattr(new_data, 'copy') else new_data
                    logger.debug(f"[POLLING-{data_type}] Data changed, notifying callbacks")
                    await self._notify_callbacks(data_type, new_data)
                else:
                    logger.debug(f"[POLLING-{data_type}] Data unchanged")

                # Record success and reset backoff
                state.record_success()
                
                # Wait for next poll using base interval
                await asyncio.sleep(state.base_interval)

            except asyncio.CancelledError:
                logger.info(f"[POLLING-{data_type}] Cancelled")
                break

            except Exception as e:
                error_msg = str(e)
                state.record_failure(error_msg)
                
                # Calculate next retry interval (with backoff)
                next_interval = state.get_current_interval()
                logger.warning(
                    f"[POLLING-{data_type}] Will retry in {next_interval}s "
                    f"(attempt #{state.retry_count})"
                )
                
                # Wait before retrying (exponential backoff)
                try:
                    await asyncio.sleep(next_interval)
                except asyncio.CancelledError:
                    logger.info(f"[POLLING-{data_type}] Cancelled during backoff")
                    break

    def start_polling(self, data_type: str, fetch_func: Callable, account_id: str):
        """
        Start polling for a data type with exponential backoff on failures.
        """
        if data_type in self.active_pollers:
            logger.warning(f"[POLLING] Polling already active for {data_type}")
            return

        base_interval = self.poll_intervals.get(data_type, 10)
        logger.info(
            f"[POLLING] Starting polling for {data_type} "
            f"(base interval: {base_interval}s, max backoff: 120s)"
        )
        
        task = asyncio.create_task(self._poll_data(data_type, fetch_func, account_id))
        self.active_pollers[data_type] = task

    def stop_polling(self, data_type: str):
        """Stop polling for a data type"""
        if data_type in self.active_pollers:
            logger.info(f"[POLLING] Stopping polling for {data_type}")
            self.active_pollers[data_type].cancel()
            del self.active_pollers[data_type]
            if data_type in self.poller_state:
                del self.poller_state[data_type]

    def stop_all_polling(self):
        """Stop all polling"""
        logger.info("[POLLING] Stopping all polling")
        for data_type, task in list(self.active_pollers.items()):
            task.cancel()
        self.active_pollers.clear()
        self.poller_state.clear()

    def get_poller_status(self, data_type: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific poller"""
        if data_type not in self.poller_state:
            return None
        
        state = self.poller_state[data_type]
        return {
            "data_type": data_type,
            "is_active": data_type in self.active_pollers,
            "is_failing": state.is_failing,
            "retry_count": state.retry_count,
            "base_interval": state.base_interval,
            "current_interval": state.get_current_interval(),
            "last_error": state.last_error,
            "last_success_time": state.last_success_time.isoformat() if state.last_success_time else None,
            "last_failure_time": state.last_failure_time.isoformat() if state.last_failure_time else None,
        }

    def get_all_poller_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all pollers"""
        status = {}
        for data_type in self.poller_state.keys():
            status[data_type] = self.get_poller_status(data_type)
        return status

    def get_last_data(self, data_type: str) -> Optional[Any]:
        """Get the last polled data for a type"""
        return self.last_data.get(data_type)

    def get_active_pollers(self) -> List[str]:
        """Get list of currently active pollers"""
        return list(self.active_pollers.keys())


# Global polling service instance
polling_service = PollingService()