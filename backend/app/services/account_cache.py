"""
Account Data Cache Service - manages account info and positions caching with TTL
"""
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class AccountDataCache:
    """Manages account info caching with time-to-live (TTL)"""

    def __init__(self, account_ttl_seconds: int = 10, positions_ttl_seconds: int = 5):
        # Cache structure: account_id -> {'data': {...}, 'timestamp': datetime}
        self.account_cache: Dict[str, Dict[str, Any]] = {}
        self.positions_cache: Dict[str, Dict[str, Any]] = {}
        
        self.account_ttl = timedelta(seconds=account_ttl_seconds)
        self.positions_ttl = timedelta(seconds=positions_ttl_seconds)
        
        # Statistics
        self.account_hits = 0
        self.account_misses = 0
        self.positions_hits = 0
        self.positions_misses = 0

    def get_cached_account_info(self, account_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached account info if still valid (within TTL)
        
        Args:
            account_id: Account identifier
            
        Returns:
            Cached account data or None if expired/not cached
        """
        if account_id not in self.account_cache:
            self.account_misses += 1
            logger.debug(f"[ACCOUNT_CACHE] Cache miss for account {account_id}")
            return None

        cache_entry = self.account_cache[account_id]
        cached_time = cache_entry.get('timestamp')
        
        if cached_time and datetime.utcnow() - cached_time > self.account_ttl:
            # Cache expired
            del self.account_cache[account_id]
            self.account_misses += 1
            logger.debug(f"[ACCOUNT_CACHE] Cache expired for account {account_id}")
            return None

        self.account_hits += 1
        logger.debug(f"[ACCOUNT_CACHE] Cache hit for account {account_id}")
        return cache_entry.get('data')

    def store_account_info(self, account_id: str, data: Dict[str, Any]):
        """
        Store account info in cache
        
        Args:
            account_id: Account identifier
            data: Account data to cache
        """
        self.account_cache[account_id] = {
            'data': data.copy() if isinstance(data, dict) else data,
            'timestamp': datetime.utcnow()
        }
        logger.debug(f"[ACCOUNT_CACHE] Cached account info for {account_id}")

    def get_cached_positions(self, account_id: str) -> Optional[list]:
        """
        Get cached positions if still valid (within TTL)
        
        Args:
            account_id: Account identifier
            
        Returns:
            Cached positions list or None if expired/not cached
        """
        if account_id not in self.positions_cache:
            self.positions_misses += 1
            logger.debug(f"[POSITIONS_CACHE] Cache miss for account {account_id}")
            return None

        cache_entry = self.positions_cache[account_id]
        cached_time = cache_entry.get('timestamp')
        
        if cached_time and datetime.utcnow() - cached_time > self.positions_ttl:
            # Cache expired
            del self.positions_cache[account_id]
            self.positions_misses += 1
            logger.debug(f"[POSITIONS_CACHE] Cache expired for account {account_id}")
            return None

        self.positions_hits += 1
        logger.debug(f"[POSITIONS_CACHE] Cache hit for account {account_id}")
        return cache_entry.get('data')

    def store_positions(self, account_id: str, positions: list):
        """
        Store positions in cache
        
        Args:
            account_id: Account identifier
            positions: List of position data
        """
        self.positions_cache[account_id] = {
            'data': positions.copy() if isinstance(positions, list) else positions,
            'timestamp': datetime.utcnow()
        }
        logger.debug(f"[POSITIONS_CACHE] Cached {len(positions) if positions else 0} positions for {account_id}")

    def clear_account_cache(self, account_id: str = None):
        """Clear account cache for specific account or all"""
        if account_id:
            if account_id in self.account_cache:
                del self.account_cache[account_id]
                logger.info(f"[ACCOUNT_CACHE] Cleared cache for account {account_id}")
        else:
            self.account_cache.clear()
            logger.info("[ACCOUNT_CACHE] Cleared all account cache")

    def clear_positions_cache(self, account_id: str = None):
        """Clear positions cache for specific account or all"""
        if account_id:
            if account_id in self.positions_cache:
                del self.positions_cache[account_id]
                logger.info(f"[POSITIONS_CACHE] Cleared cache for account {account_id}")
        else:
            self.positions_cache.clear()
            logger.info("[POSITIONS_CACHE] Cleared all positions cache")

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            "account_cache": {
                "cached_accounts": len(self.account_cache),
                "hits": self.account_hits,
                "misses": self.account_misses,
                "hit_ratio": self.account_hits / (self.account_hits + self.account_misses) if (self.account_hits + self.account_misses) > 0 else 0,
                "ttl_seconds": self.account_ttl.total_seconds(),
            },
            "positions_cache": {
                "cached_accounts": len(self.positions_cache),
                "hits": self.positions_hits,
                "misses": self.positions_misses,
                "hit_ratio": self.positions_hits / (self.positions_hits + self.positions_misses) if (self.positions_hits + self.positions_misses) > 0 else 0,
                "ttl_seconds": self.positions_ttl.total_seconds(),
            }
        }


# Global cache instance
account_data_cache = AccountDataCache()
