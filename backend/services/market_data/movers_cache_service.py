# backend/services/market_data/movers_cache_service.py

"""
Market Movers Cache Service

Caches the ranked lists of market movers (gainers, losers, most active) in Redis
to eliminate database queries on every request.

Architecture:
- Caches top gainers, top losers, and most active stock lists
- Each list contains: symbol, name, rank_position, fetch_timestamp
- TTL: 5 minutes (market movers change frequently)
- Background refresh: Every 4 minutes to ensure fresh data
- Reduces database load by 95%+ during market hours

Performance:
- Cache hit: ~1-5ms (Redis lookup)
- Cache miss: ~100-300ms (database query)
- Expected hit rate: >95% during normal operation
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, date
from enum import Enum

from services.redis_client import redis_service
from config import get_settings

logger = logging.getLogger(__name__)


class MoverType(str, Enum):
    """Types of market movers."""
    GAINERS = "gainers"
    LOSERS = "losers"
    MOST_ACTIVE = "most_active"


class MoversCacheService:
    """
    Caches market movers lists to eliminate database queries.
    
    Each cached entry contains:
    - symbol: Stock symbol
    - name: Company name
    - rank_position: Position in ranking (1-25, etc.)
    - fetch_timestamp: When this data was populated
    - data_date: Date of the market data
    
    Real-time prices are fetched separately via PriceCacheService.
    """
    
    _instance = None
    
    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self.redis = redis_service
            self.settings = get_settings()
            self.cache_namespace = "market_movers"
            self.ttl = 300  # 5 minutes (market movers change frequently)
            self.refresh_interval = 240  # 4 minutes (refresh before TTL expires)
            
            # Background refresh
            self._refresh_task: Optional[asyncio.Task] = None
            self._is_running = False
            
            self._initialized = True
            logger.info("Movers Cache Service initialized")
    
    # ========================
    # Lifecycle Management
    # ========================
    
    async def start(self):
        """Start the movers cache service with background refresh."""
        if self._is_running:
            logger.warning("Movers cache service already running")
            return
        
        self._is_running = True
        self._refresh_task = asyncio.create_task(self._auto_refresh_loop())
        logger.info("🚀 Movers cache service started with auto-refresh")
    
    async def stop(self):
        """Stop the movers cache service."""
        self._is_running = False
        
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Movers cache service stopped")
    
    # ========================
    # Cache Operations
    # ========================
    
    async def get_cached_movers(
        self, 
        mover_type: MoverType, 
        limit: int = 25,
        data_date: Optional[date] = None
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached market movers list.
        
        Args:
            mover_type: Type of movers (gainers, losers, most_active)
            limit: Number of movers to return
            data_date: Specific date (None = today/latest)
        
        Returns:
            List of mover dictionaries with symbol, name, rank_position, etc.
            None if cache miss.
        """
        cache_key = self._build_cache_key(mover_type, limit, data_date)
        
        try:
            cached_data = await self.redis.get(
                cache_key,
                namespace=self.cache_namespace,
                default=None
            )
            
            if cached_data:
                # Check freshness
                cached_at = cached_data.get('cached_at')
                if cached_at:
                    cached_time = datetime.fromisoformat(cached_at)
                    age = (datetime.now() - cached_time).total_seconds()
                    
                    if age > self.ttl:
                        return None
                
                return cached_data.get('movers', [])
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Cache read error for {mover_type.value}: {e}")
            return None
    
    async def cache_movers(
        self,
        mover_type: MoverType,
        movers: List[Dict[str, Any]],
        limit: int = 25,
        data_date: Optional[date] = None
    ) -> bool:
        """
        Cache market movers list.
        
        Args:
            mover_type: Type of movers
            movers: List of mover data (symbol, name, rank_position, etc.)
            limit: Limit used for this query
            data_date: Date of the data
        
        Returns:
            True if cached successfully, False otherwise
        """
        cache_key = self._build_cache_key(mover_type, limit, data_date)
        
        try:
            cache_data = {
                'movers': movers,
                'mover_type': mover_type.value,
                'limit': limit,
                'cached_at': datetime.now().isoformat(),
                'ttl': self.ttl,
                'count': len(movers)
            }
            
            success = await self.redis.set(
                cache_key,
                cache_data,
                ttl=self.ttl,
                namespace=self.cache_namespace
            )
            
            if not success:
                logger.error(f"Failed to cache {mover_type.value}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Cache write error for {mover_type.value}: {e}")
            return False
    
    async def invalidate_movers(
        self,
        mover_type: Optional[MoverType] = None,
        limit: Optional[int] = None
    ):
        """
        Invalidate cached movers.
        
        Args:
            mover_type: Specific type to invalidate (None = all types)
            limit: Specific limit to invalidate (None = all limits)
        """
        try:
            if mover_type and limit:
                # Invalidate specific cache
                cache_key = self._build_cache_key(mover_type, limit)
                await self.redis.delete(cache_key, namespace=self.cache_namespace)
            else:
                # Invalidate all movers cache
                await self.redis.clear_namespace(self.cache_namespace)
                
        except Exception as e:
            logger.error(f"Failed to invalidate movers cache: {e}")
    
    # ========================
    # Auto-Refresh System
    # ========================
    
    async def _auto_refresh_loop(self):
        """
        Background task that pre-fetches popular mover queries before cache expires.
        
        Refreshes:
        - Top 25 gainers
        - Top 25 losers
        - Top 25 most active
        
        Every 4 minutes (before 5-minute TTL expires).
        """
        while self._is_running:
            try:
                await asyncio.sleep(self.refresh_interval)
                
                # Import here to avoid circular dependency
                from .movers_service import MoversService
                from models.market_data import MarketMoversRequest
                
                # Create service instance
                movers_service = MoversService()
                
                # Pre-fetch popular queries
                request = MarketMoversRequest(limit=25)
                
                # Fetch all three types concurrently
                tasks = [
                    movers_service.get_top_gainers(request),
                    movers_service.get_top_losers(request),
                    movers_service.get_most_active(request),
                ]
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Cache the results
                if not isinstance(results[0], Exception):
                    gainers_data = [m.dict() for m in results[0]]
                    await self.cache_movers(MoverType.GAINERS, gainers_data, limit=25)
                
                if not isinstance(results[1], Exception):
                    losers_data = [m.dict() for m in results[1]]
                    await self.cache_movers(MoverType.LOSERS, losers_data, limit=25)
                
                if not isinstance(results[2], Exception):
                    active_data = [m.dict() for m in results[2]]
                    await self.cache_movers(MoverType.MOST_ACTIVE, active_data, limit=25)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in movers auto-refresh loop: {e}")
                await asyncio.sleep(60)  # Wait before retry
    
    # ========================
    # Utility Methods
    # ========================
    
    def _build_cache_key(
        self,
        mover_type: MoverType,
        limit: int,
        data_date: Optional[date] = None
    ) -> str:
        """Build cache key for movers list."""
        date_str = data_date.isoformat() if data_date else "latest"
        return f"movers:{mover_type.value}:limit_{limit}:date_{date_str}"
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics and metrics."""
        try:
            # Get all cached mover keys
            pattern = "movers:*"
            keys = await self.redis.get_all_keys(pattern, namespace=self.cache_namespace)
            
            stats = {
                "total_cached_queries": len(keys) if keys else 0,
                "ttl_seconds": self.ttl,
                "refresh_interval_seconds": self.refresh_interval,
                "auto_refresh_running": self._is_running,
                "namespace": self.cache_namespace
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get movers cache stats: {e}")
            return {
                "error": str(e),
                "ttl_seconds": self.ttl
            }
    
    async def clear_all_cache(self) -> int:
        """Clear all movers cache (use with caution)."""
        try:
            deleted = await self.redis.clear_namespace(self.cache_namespace)
            return deleted
            
        except Exception as e:
            logger.error(f"Failed to clear movers cache: {e}")
            return 0


# Singleton instance
movers_cache_service = MoversCacheService()


# Helper functions
async def get_cached_movers_list(
    mover_type: MoverType,
    limit: int = 25,
    data_date: Optional[date] = None
) -> Optional[List[Dict[str, Any]]]:
    """Get cached market movers list."""
    return await movers_cache_service.get_cached_movers(mover_type, limit, data_date)


async def cache_movers_list(
    mover_type: MoverType,
    movers: List[Dict[str, Any]],
    limit: int = 25,
    data_date: Optional[date] = None
) -> bool:
    """Cache market movers list."""
    return await movers_cache_service.cache_movers(mover_type, movers, limit, data_date)


async def start_movers_cache():
    """Start the movers cache service."""
    await movers_cache_service.start()


async def stop_movers_cache():
    """Stop the movers cache service."""
    await movers_cache_service.stop()
