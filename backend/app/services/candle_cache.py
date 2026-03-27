"""
Candle Cache Service - manages OHLC data caching and prefetching
"""
import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import json
from collections import OrderedDict

logger = logging.getLogger(__name__)


class CandleCache:
    """Manages candle data caching with prefetching and backscroll support"""

    def __init__(self, max_bars_per_symbol: int = 2000, prefetch_segment_size: int = 500):
        # Cache structure: symbol -> timeframe -> list of candles (ordered by time, newest first)
        self.cache: Dict[str, Dict[str, List[Dict]]] = {}
        self.max_bars_per_symbol = max_bars_per_symbol
        self.prefetch_segment_size = prefetch_segment_size

        # Track what's currently being prefetched to avoid duplicate requests
        self.prefetching: set = set()

        # Cache metadata
        self.last_updated: Dict[str, Dict[str, datetime]] = {}
        self.cache_hits = 0
        self.cache_misses = 0

    def _get_cache_key(self, symbol: str, timeframe: str) -> str:
        """Generate cache key for symbol/timeframe combination"""
        return f"{symbol}:{timeframe}"

    def _get_symbol_timeframe_key(self, symbol: str, timeframe: str) -> Tuple[str, str]:
        """Get symbol and timeframe from cache key"""
        return symbol, timeframe

    def get_cached_candles(self, symbol: str, timeframe: str, count: int, from_time: Optional[datetime] = None) -> Optional[List[Dict]]:
        """
        Get candles from cache

        Args:
            symbol: Trading symbol
            timeframe: Timeframe string (1m, 5m, etc.)
            count: Number of candles to return
            from_time: If provided, get candles from this time onwards (for backscroll)

        Returns:
            List of candles or None if not in cache
        """
        cache_key = self._get_cache_key(symbol, timeframe)

        if symbol not in self.cache or timeframe not in self.cache[symbol]:
            self.cache_misses += 1
            logger.debug(f"[CACHE] Cache miss for {cache_key}")
            return None

        cached_candles = self.cache[symbol][timeframe]
        if not cached_candles:
            self.cache_misses += 1
            return None

        self.cache_hits += 1
        logger.debug(f"[CACHE] Cache hit for {cache_key} - returning {min(count, len(cached_candles))} of {len(cached_candles)} cached candles")

        if from_time:
            # Filter candles from the specified time onwards
            filtered_candles = [c for c in cached_candles if datetime.fromtimestamp(c['time']) >= from_time]
            return filtered_candles[:count]
        else:
            # Return most recent candles
            return cached_candles[:count]

    def get_cached_segment(self, symbol: str, timeframe: str, segment: int = 0, segment_size: int = 500) -> List[Dict]:
        """Return a specific segment of cached candles for charting.

        Segment 0 = most recent bars,
        Segment 1 = previous bars, etc.
        Cache is stored as chronological order (oldest first) from MT5.
        """
        if symbol not in self.cache or timeframe not in self.cache[symbol]:
            return []

        if segment < 0 or segment_size <= 0:
            return []

        candles = self.cache[symbol][timeframe]
        total = len(candles)
        if total == 0:
            return []

        # Latest bars are at the end of the list
        end_index = total - segment * segment_size
        start_index = max(end_index - segment_size, 0)

        if start_index >= total or end_index <= 0:
            return []

        segment_data = candles[start_index:end_index]

        self.cache_hits += 1
        logger.debug(f"[CACHE] Returning segment {segment} for {symbol}:{timeframe} ({len(segment_data)} bars, {start_index}:{end_index} from {total})")
        return segment_data

    def get_cached_total(self, symbol: str, timeframe: str) -> int:
        """Return total number of cached candles for symbol/timeframe."""
        if symbol not in self.cache or timeframe not in self.cache[symbol]:
            return 0
        return len(self.cache[symbol][timeframe])

    def store_candles(self, symbol: str, timeframe: str, candles: List[Dict], is_append: bool = False):
        """
        Store candles in cache

        Args:
            symbol: Trading symbol
            timeframe: Timeframe string
            candles: List of candle data
            is_append: If True, append to existing data; if False, replace
        """
        if not candles:
            logger.warning(f"[CACHE] Attempted to store empty candle list for {symbol}:{timeframe}")
            return

        # Initialize cache structure
        if symbol not in self.cache:
            self.cache[symbol] = {}
        if timeframe not in self.cache[symbol]:
            self.cache[symbol][timeframe] = []

        if is_append:
            # Append new candles (typically older data for backscroll)
            existing_candles = self.cache[symbol][timeframe]
            # Avoid duplicates by checking timestamps
            existing_times = {c['time'] for c in existing_candles}
            new_candles = [c for c in candles if c['time'] not in existing_times]

            if new_candles:
                self.cache[symbol][timeframe].extend(new_candles)
                logger.debug(f"[CACHE] Appended {len(new_candles)} new candles to {symbol}:{timeframe}")
            else:
                logger.debug(f"[CACHE] No new candles to append for {symbol}:{timeframe}")
        else:
            # Replace existing data
            self.cache[symbol][timeframe] = candles.copy()
            logger.debug(f"[CACHE] Stored {len(candles)} candles for {symbol}:{timeframe}")

        # Update metadata
        if symbol not in self.last_updated:
            self.last_updated[symbol] = {}
        self.last_updated[symbol][timeframe] = datetime.utcnow()

        # Trim cache if it exceeds max size
        self._trim_cache(symbol, timeframe)

    def _trim_cache(self, symbol: str, timeframe: str):
        """Trim cache to maintain max_bars_per_symbol limit"""
        if symbol in self.cache and timeframe in self.cache[symbol]:
            candles = self.cache[symbol][timeframe]
            if len(candles) > self.max_bars_per_symbol:
                # Keep most recent candles
                trimmed = candles[:self.max_bars_per_symbol]
                self.cache[symbol][timeframe] = trimmed
                logger.debug(f"[CACHE] Trimmed {symbol}:{timeframe} from {len(candles)} to {len(trimmed)} candles")

    def is_prefetch_needed(self, symbol: str, timeframe: str, requested_count: int) -> bool:
        """
        Check if prefetching is needed based on cache state and requested count
        """
        cache_key = self._get_cache_key(symbol, timeframe)

        # If not in cache at all, definitely need prefetch
        if symbol not in self.cache or timeframe not in self.cache[symbol]:
            return True

        cached_count = len(self.cache[symbol][timeframe])

        # If we have less than requested, might need more
        if cached_count < requested_count:
            return True

        # If we have less than our target cache size, prefetch more
        if cached_count < self.max_bars_per_symbol:
            return True

        return False

    def mark_prefetch_started(self, symbol: str, timeframe: str, segment_start: int = 0):
        """Mark that prefetching has started for a symbol/timeframe"""
        cache_key = f"{symbol}:{timeframe}:{segment_start}"
        self.prefetching.add(cache_key)
        logger.debug(f"[CACHE] Started prefetching {cache_key}")

    def mark_prefetch_completed(self, symbol: str, timeframe: str, segment_start: int = 0):
        """Mark that prefetching has completed for a symbol/timeframe"""
        cache_key = f"{symbol}:{timeframe}:{segment_start}"
        self.prefetching.discard(cache_key)
        logger.debug(f"[CACHE] Completed prefetching {cache_key}")

    def is_prefetch_in_progress(self, symbol: str, timeframe: str, segment_start: int = 0) -> bool:
        """Check if prefetching is currently in progress"""
        cache_key = f"{symbol}:{timeframe}:{segment_start}"
        return cache_key in self.prefetching

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_cached = sum(
            len(timeframes) for symbol in self.cache.values()
            for timeframes in symbol.values()
        )

        return {
            "total_symbols": len(self.cache),
            "total_cached_bars": total_cached,
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "hit_ratio": self.cache_hits / (self.cache_hits + self.cache_misses) if (self.cache_hits + self.cache_misses) > 0 else 0,
            "active_prefetches": len(self.prefetching),
            "max_bars_per_symbol": self.max_bars_per_symbol,
            "prefetch_segment_size": self.prefetch_segment_size
        }

    def clear_symbol_cache(self, symbol: str):
        """Clear all cached data for a symbol"""
        if symbol in self.cache:
            del self.cache[symbol]
            logger.info(f"[CACHE] Cleared cache for symbol {symbol}")

    def clear_all_cache(self):
        """Clear all cached data"""
        self.cache.clear()
        self.last_updated.clear()
        self.prefetching.clear()
        self.cache_hits = 0
        self.cache_misses = 0
        logger.info("[CACHE] Cleared all cache data")


# Global cache instance
candle_cache = CandleCache()