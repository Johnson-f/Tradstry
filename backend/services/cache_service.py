"""
Cache Service for Tradistry
Provides high-level caching utilities, decorators, and common caching patterns.
"""

import hashlib
import logging
from functools import wraps
from typing import Any, Callable, Dict, Optional, Union, List
from datetime import datetime, timedelta

from services.redis_client import redis_service, get_redis_service

logger = logging.getLogger(__name__)


class CacheService:
    """
    High-level cache service with specialized caching patterns for Tradistry.
    """

    def __init__(self):
        self.redis = redis_service

    # User-specific caching
    async def cache_user_data(
        self,
        user_id: str,
        data_type: str,
        data: Any,
        ttl: int = 3600
    ) -> bool:
        """Cache user-specific data."""
        key = f"user:{user_id}:{data_type}"
        return await self.redis.set(key, data, ttl, namespace="users")

    async def get_user_data(
        self,
        user_id: str,
        data_type: str,
        default: Any = None
    ) -> Any:
        """Get cached user-specific data."""
        key = f"user:{user_id}:{data_type}"
        return await self.redis.get(key, namespace="users", default=default)

    async def clear_user_cache(self, user_id: str) -> int:
        """Clear all cache for a specific user."""
        pattern = f"user:{user_id}:*"
        keys = await self.redis.get_all_keys(pattern, namespace="users")

        if keys:
            deleted = 0
            for key in keys:
                if await self.redis.delete(key, namespace="users"):
                    deleted += 1

            logger.info(f"Cleared {deleted} cache keys for user: {user_id}")
            return deleted

        return 0

    # AI-specific caching
    async def cache_ai_response(
        self,
        user_id: str,
        prompt_hash: str,
        response: Dict[str, Any],
        ttl: int = 1800  # 30 minutes
    ) -> bool:
        """Cache AI response for a specific user and prompt."""
        key = f"ai:{user_id}:{prompt_hash}"
        cache_data = {
            "response": response,
            "cached_at": datetime.now().isoformat(),
            "user_id": user_id,
            "prompt_hash": prompt_hash
        }
        return await self.redis.set(key, cache_data, ttl, namespace="ai")

    async def get_ai_response(
        self,
        user_id: str,
        prompt_hash: str
    ) -> Optional[Dict[str, Any]]:
        """Get cached AI response."""
        key = f"ai:{user_id}:{prompt_hash}"
        cached = await self.redis.get(key, namespace="ai")

        if cached and isinstance(cached, dict):
            # Check if cache is still valid
            cached_at = datetime.fromisoformat(cached.get("cached_at", ""))
            if datetime.now() - cached_at < timedelta(minutes=30):
                return cached.get("response")

        return None

    # Trading data caching
    async def cache_trading_data(
        self,
        user_id: str,
        symbol: str,
        data_type: str,
        data: Any,
        ttl: int = 900  # 15 minutes
    ) -> bool:
        """Cache trading-related data (quotes, analytics, etc.)."""
        key = f"trading:{user_id}:{symbol}:{data_type}"
        cache_data = {
            "data": data,
            "symbol": symbol,
            "cached_at": datetime.now().isoformat()
        }
        return await self.redis.set(key, cache_data, ttl, namespace="trading")

    async def get_trading_data(
        self,
        user_id: str,
        symbol: str,
        data_type: str
    ) -> Optional[Any]:
        """Get cached trading data."""
        key = f"trading:{user_id}:{symbol}:{data_type}"
        cached = await self.redis.get(key, namespace="trading")

        if cached and isinstance(cached, dict):
            return cached.get("data")

        return None

    # Analytics caching
    async def cache_analytics(
        self,
        user_id: str,
        analytics_type: str,
        timeframe: str,
        data: Any,
        ttl: int = 1800  # 30 minutes
    ) -> bool:
        """Cache analytics data."""
        key = f"analytics:{user_id}:{analytics_type}:{timeframe}"
        return await self.redis.set(key, data, ttl, namespace="analytics")

    async def get_analytics(
        self,
        user_id: str,
        analytics_type: str,
        timeframe: str
    ) -> Optional[Any]:
        """Get cached analytics data."""
        key = f"analytics:{user_id}:{analytics_type}:{timeframe}"
        return await self.redis.get(key, namespace="analytics")


# Cache decorators
def cache_result(
    ttl: int = 3600,
    namespace: str = "general",
    key_generator: Optional[Callable] = None
):
    """
    Decorator to cache function results.

    Args:
        ttl: Time to live in seconds
        namespace: Cache namespace
        key_generator: Custom function to generate cache key
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            if key_generator:
                cache_key = key_generator(*args, **kwargs)
            else:
                # Default key generation
                func_name = func.__name__
                args_str = str(args) + str(sorted(kwargs.items()))
                key_hash = hashlib.md5(args_str.encode()).hexdigest()[:12]
                cache_key = f"{func_name}:{key_hash}"

            # Try to get from cache
            async with get_redis_service() as redis:
                cached_result = await redis.get(cache_key, namespace=namespace)

                if cached_result is not None:
                    logger.debug(f"Cache hit for {func_name}: {cache_key}")
                    return cached_result

                # Execute function and cache result
                result = await func(*args, **kwargs) if hasattr(func, '__call__') else func(*args, **kwargs)

                # Cache the result
                await redis.set(cache_key, result, ttl=ttl, namespace=namespace)
                logger.debug(f"Cached result for {func_name}: {cache_key}")

                return result

        return wrapper
    return decorator


def cache_user_specific(
    ttl: int = 3600,
    data_type: str = "default"
):
    """
    Decorator to cache user-specific function results.
    First argument must be user_id.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not args:
                raise ValueError("Function must have user_id as first argument")

            user_id = str(args[0])

            # Generate cache key from function name and remaining args
            func_name = func.__name__
            remaining_args = str(args[1:]) + str(sorted(kwargs.items()))
            key_hash = hashlib.md5(remaining_args.encode()).hexdigest()[:12]

            cache_service = CacheService()
            cache_key = f"{func_name}:{key_hash}"

            # Try to get from cache
            cached_result = await cache_service.get_user_data(
                user_id, f"{data_type}:{cache_key}"
            )

            if cached_result is not None:
                logger.debug(f"User cache hit for {func_name}: user_id={user_id}")
                return cached_result

            # Execute function and cache result
            result = await func(*args, **kwargs) if hasattr(func, '__call__') else func(*args, **kwargs)

            # Cache the result
            await cache_service.cache_user_data(
                user_id, f"{data_type}:{cache_key}", result, ttl
            )
            logger.debug(f"User cache set for {func_name}: user_id={user_id}")

            return result

        return wrapper
    return decorator


# Singleton instance
cache_service = CacheService()


# Utility functions
async def clear_all_user_cache(user_id: str) -> int:
    """Clear all cache for a user across all namespaces."""
    total_cleared = 0

    namespaces = ["users", "ai", "trading", "analytics"]

    for namespace in namespaces:
        try:
            pattern = f"*{user_id}*"
            keys = await redis_service.get_all_keys(pattern, namespace=namespace)

            for key in keys:
                if await redis_service.delete(key, namespace=namespace):
                    total_cleared += 1

        except Exception as e:
            logger.error(f"Error clearing cache for namespace {namespace}: {str(e)}")

    logger.info(f"Cleared {total_cleared} total cache keys for user: {user_id}")
    return total_cleared


async def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics and health information."""
    try:
        async with get_redis_service() as redis:
            # Get basic stats
            info = await redis.client.info("memory")
            keyspace_info = await redis.client.info("keyspace")

            # Count keys by namespace
            namespaces = ["users", "ai", "trading", "analytics", "general"]
            namespace_stats = {}

            for namespace in namespaces:
                keys = await redis.get_all_keys("*", namespace=namespace)
                namespace_stats[namespace] = len(keys)

            return {
                "memory": {
                    "used_memory": info.get("used_memory"),
                    "used_memory_human": info.get("used_memory_human"),
                    "maxmemory": info.get("maxmemory"),
                    "maxmemory_human": info.get("maxmemory_human"),
                },
                "keys": {
                    "total": sum(namespace_stats.values()),
                    "by_namespace": namespace_stats
                },
                "keyspace": keyspace_info,
                "timestamp": datetime.now().isoformat()
            }

    except Exception as e:
        logger.error(f"Error getting cache stats: {str(e)}")
        return {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
