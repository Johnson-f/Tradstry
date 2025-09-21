"""
Redis Client Service for Tradistry
Provides async Redis client management with connection pooling and health checks.
"""

import asyncio
import json
import logging
import ssl
from typing import Any, Dict, Optional, Union, List, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from urllib.parse import urlparse

import redis.asyncio as redis
from redis.asyncio import ConnectionPool
from redis.exceptions import RedisError, ConnectionError as RedisConnectionError, BusyLoadingError, ReadOnlyError

from config import get_settings

logger = logging.getLogger(__name__)


class RedisManager:
    """
    Redis Manager for handling connections, health checks, and basic operations.
    Implements singleton pattern for connection pooling.
    """

    _instance = None
    _pool: Optional[ConnectionPool] = None
    _client: Optional[redis.Redis] = None

    def __new__(cls) -> "RedisManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self.settings = get_settings()
            self._health_check_task = None
            self._initialized = True

    async def initialize(self) -> None:
        """Initialize Redis connection pool and client."""
        if self._pool is not None:
            logger.info("Redis connection pool already initialized")
            return

        try:
            # Check if we have a Redis URL for cloud connection and ensure SSL
            redis_url = self.settings.REDIS_URL
            if redis_url and redis_url.startswith('redis://'):
                # Convert redis:// to rediss:// for SSL (required for Redis Cloud)
                redis_url = redis_url.replace('redis://', 'rediss://', 1)
                logger.info("Automatically converted Redis URL to use SSL (rediss://)")
            if redis_url:
                logger.info(f"Using Redis URL for cloud connection: {redis_url.split('@')[0]}@[HIDDEN]")

                # Parse the URL to extract SSL requirements
                parsed_url = urlparse(redis_url)
                use_ssl = parsed_url.scheme == 'rediss' or getattr(self.settings, 'REDIS_SSL', True)
                
                # SSL context configuration for cloud Redis
                ssl_context = None
                if use_ssl:
                    ssl_context = ssl.create_default_context()
                    ssl_cert_reqs = getattr(self.settings, 'REDIS_SSL_CERT_REQS', 'required')
                    if ssl_cert_reqs == "none":
                        ssl_context.check_hostname = False
                        ssl_context.verify_mode = ssl.CERT_NONE
                    elif ssl_cert_reqs == "optional":
                        ssl_context.verify_mode = ssl.CERT_OPTIONAL
                    else:
                        ssl_context.verify_mode = ssl.CERT_REQUIRED
                
                # Create Redis client directly from URL (SSL is handled by rediss:// scheme)
                # Fix: Use actual exception classes instead of strings
                retry_on_error = [BusyLoadingError, ReadOnlyError]
                
                try:
                    self._client = redis.from_url(
                        redis_url,
                        decode_responses=getattr(self.settings, 'REDIS_DECODE_RESPONSES', True),
                        retry_on_timeout=getattr(self.settings, 'REDIS_RETRY_ON_TIMEOUT', True),
                        retry_on_error=retry_on_error,
                        health_check_interval=getattr(self.settings, 'REDIS_HEALTH_CHECK_INTERVAL', 30),
                        socket_timeout=getattr(self.settings, 'REDIS_SOCKET_TIMEOUT', 10),
                        socket_connect_timeout=getattr(self.settings, 'REDIS_SOCKET_CONNECT_TIMEOUT', 15),
                        max_connections=getattr(self.settings, 'REDIS_CONNECTION_POOL_MAX_SIZE', 50),
                        encoding='utf-8'
                    )
                except Exception as url_error:
                    logger.error(f"Failed to create Redis client from URL: {url_error}")
                    # Try without SSL as fallback
                    logger.info("Attempting fallback connection without SSL...")
                    fallback_url = self.settings.REDIS_URL  # Original URL without SSL conversion
                    self._client = redis.from_url(
                        fallback_url,
                        decode_responses=getattr(self.settings, 'REDIS_DECODE_RESPONSES', True),
                        retry_on_timeout=getattr(self.settings, 'REDIS_RETRY_ON_TIMEOUT', True),
                        retry_on_error=retry_on_error,
                        health_check_interval=getattr(self.settings, 'REDIS_HEALTH_CHECK_INTERVAL', 30),
                        socket_timeout=getattr(self.settings, 'REDIS_SOCKET_TIMEOUT', 10),
                        socket_connect_timeout=getattr(self.settings, 'REDIS_SOCKET_CONNECT_TIMEOUT', 15),
                        max_connections=getattr(self.settings, 'REDIS_CONNECTION_POOL_MAX_SIZE', 50),
                        encoding='utf-8'
                    )

            else:
                logger.info("Using individual Redis connection parameters")

                # SSL context for non-URL connections
                ssl_context = None
                if getattr(self.settings, 'REDIS_SSL', True):
                    ssl_context = ssl.create_default_context()
                    ssl_cert_reqs = getattr(self.settings, 'REDIS_SSL_CERT_REQS', 'required')
                    if ssl_cert_reqs == "none":
                        ssl_context.check_hostname = False
                        ssl_context.verify_mode = ssl.CERT_NONE
                    elif ssl_cert_reqs == "optional":
                        ssl_context.verify_mode = ssl.CERT_OPTIONAL
                    else:
                        ssl_context.verify_mode = ssl.CERT_REQUIRED

                # Fix: Use actual exception classes instead of strings
                retry_on_error = [BusyLoadingError, ReadOnlyError]

                # Create connection pool with optimized settings
                self._pool = ConnectionPool(
                    host=getattr(self.settings, 'REDIS_HOST', ''),
                    port=getattr(self.settings, 'REDIS_PORT', 6379),
                    db=getattr(self.settings, 'REDIS_DB', 0),
                    username=getattr(self.settings, 'REDIS_USERNAME', None),
                    password=getattr(self.settings, 'REDIS_PASSWORD', None),
                    decode_responses=getattr(self.settings, 'REDIS_DECODE_RESPONSES', True),
                    retry_on_timeout=getattr(self.settings, 'REDIS_RETRY_ON_TIMEOUT', True),
                    retry_on_error=retry_on_error,
                    health_check_interval=getattr(self.settings, 'REDIS_HEALTH_CHECK_INTERVAL', 30),
                    max_connections=getattr(self.settings, 'REDIS_CONNECTION_POOL_MAX_SIZE', 50),
                    socket_timeout=getattr(self.settings, 'REDIS_SOCKET_TIMEOUT', 5),
                    socket_connect_timeout=getattr(self.settings, 'REDIS_SOCKET_CONNECT_TIMEOUT', 10),
                    encoding='utf-8',
                    socket_keepalive=True,
                    socket_keepalive_options={},
                    ssl_context=ssl_context
                )

                # Create Redis client with connection pool
                self._client = redis.Redis(connection_pool=self._pool)

            # Test connection
            connection_successful = await self.ping()
            if not connection_successful:
                logger.warning("Redis connection test failed, but client initialized")

            # Log success with connection method used
            if redis_url:
                parsed_url = urlparse(redis_url)
                logger.info(
                    "Redis Cloud connection initialized successfully",
                    extra={
                        "connection_method": "URL",
                        "host": parsed_url.hostname,
                        "port": parsed_url.port,
                        "ssl_enabled": parsed_url.scheme == 'rediss',
                        "pool_max_connections": getattr(self.settings, 'REDIS_CONNECTION_POOL_MAX_SIZE', 50)
                    }
                )
            else:
                logger.info(
                    "Redis connection initialized successfully",
                    extra={
                        "connection_method": "individual_params",
                        "host": getattr(self.settings, 'REDIS_HOST', ''),
                        "port": getattr(self.settings, 'REDIS_PORT', 6379),
                        "db": getattr(self.settings, 'REDIS_DB', 0),
                        "ssl_enabled": getattr(self.settings, 'REDIS_SSL', True),
                        "pool_max_connections": getattr(self.settings, 'REDIS_CONNECTION_POOL_MAX_SIZE', 50)
                    }
                )

        except Exception as e:
            logger.error(
                "Failed to initialize Redis connection",
                extra={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "host": getattr(self.settings, 'REDIS_HOST', ''),
                    "port": getattr(self.settings, 'REDIS_PORT', 6379)
                }
            )
            raise

    async def close(self) -> None:
        """Close Redis connections and cleanup resources."""
        try:
            if self._client:
                await self._client.aclose()
                logger.info("Redis client closed successfully")

            if self._pool:
                await self._pool.aclose()
                logger.info("Redis connection pool closed successfully")

        except Exception as e:
            logger.error(f"Error closing Redis connections: {str(e)}")
        finally:
            self._client = None
            self._pool = None

    @property
    def client(self) -> redis.Redis:
        """Get Redis client instance."""
        if self._client is None:
            raise RuntimeError("Redis client not initialized. Call initialize() first.")
        return self._client

    async def ping(self) -> bool:
        """Test Redis connection."""
        try:
            result = await self.client.ping()
            logger.info("Redis ping successful", extra={"result": result})
            return True
        except RedisConnectionError as e:
            logger.error(f"Redis connection failed: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Redis ping failed: {str(e)}")
            return False

    async def get_connection_info(self) -> Dict[str, Any]:
        """Get Redis connection information."""
        try:
            info = await self.client.info("server")
            clients_info = await self.client.info("clients")

            return {
                "server": {
                    "version": info.get("redis_version"),
                    "mode": info.get("redis_mode", "standalone"),
                    "uptime": info.get("uptime_in_seconds"),
                },
                "clients": {
                    "connected": clients_info.get("connected_clients"),
                    "blocked": clients_info.get("blocked_clients"),
                },
                "pool": {
                    "max_connections": self.settings.REDIS_CONNECTION_POOL_MAX_SIZE,
                    "created_connections": self._pool.created_connections if self._pool else 0,
                    "available_connections": len(self._pool._available_connections) if self._pool else 0,
                }
            }
        except RedisError as e:
            logger.error(f"Failed to get Redis connection info: {str(e)}")
            return {}


class RedisService:
    """
    High-level Redis service with caching utilities and common operations.
    """

    def __init__(self, manager: Optional[RedisManager] = None):
        self.manager = manager or RedisManager()
        self.settings = get_settings()

    @property
    def client(self) -> redis.Redis:
        """Get Redis client."""
        return self.manager.client

    def _build_key(self, key: str, namespace: Optional[str] = None) -> str:
        """Build Redis key with prefix and optional namespace."""
        parts = [self.settings.REDIS_KEY_PREFIX]
        if namespace:
            parts.append(namespace)
        parts.append(key)
        return ":".join(parts)

    async def get(self, key: str, namespace: Optional[str] = None, default: Any = None) -> Any:
        """Get value from Redis cache."""
        cache_key = self._build_key(key, namespace)

        try:
            value = await self.client.get(cache_key)
            if value is None:
                logger.debug(f"Cache miss for key: {cache_key}")
                return default

            # Try to deserialize JSON
            try:
                result = json.loads(value)
                logger.debug(f"Cache hit for key: {cache_key}")
                return result
            except (json.JSONDecodeError, TypeError):
                # Return as string if not valid JSON
                return value

        except RedisError as e:
            logger.error(
                f"Redis get operation failed for key: {cache_key}",
                extra={"error": str(e), "error_type": type(e).__name__}
            )
            return default

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        namespace: Optional[str] = None
    ) -> bool:
        """Set value in Redis cache with optional TTL."""
        cache_key = self._build_key(key, namespace)
        ttl = ttl or self.settings.REDIS_TTL_DEFAULT

        try:
            # Serialize value to JSON if it's not a string
            if isinstance(value, str):
                serialized_value = value
            else:
                serialized_value = json.dumps(value, default=self._json_serializer)

            result = await self.client.setex(cache_key, ttl, serialized_value)

            logger.debug(
                f"Cache set for key: {cache_key}",
                extra={"ttl": ttl, "value_type": type(value).__name__}
            )

            return result

        except RedisError as e:
            logger.error(
                f"Redis set operation failed for key: {cache_key}",
                extra={
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "ttl": ttl
                }
            )
            return False

    async def delete(self, key: str, namespace: Optional[str] = None) -> bool:
        """Delete key from Redis cache."""
        cache_key = self._build_key(key, namespace)

        try:
            result = await self.client.delete(cache_key)
            logger.debug(f"Cache delete for key: {cache_key}, result: {result}")
            return bool(result)

        except RedisError as e:
            logger.error(
                f"Redis delete operation failed for key: {cache_key}",
                extra={"error": str(e), "error_type": type(e).__name__}
            )
            return False

    async def exists(self, key: str, namespace: Optional[str] = None) -> bool:
        """Check if key exists in Redis cache."""
        cache_key = self._build_key(key, namespace)

        try:
            result = await self.client.exists(cache_key)
            return bool(result)

        except RedisError as e:
            logger.error(
                f"Redis exists operation failed for key: {cache_key}",
                extra={"error": str(e), "error_type": type(e).__name__}
            )
            return False

    async def get_ttl(self, key: str, namespace: Optional[str] = None) -> int:
        """Get TTL for a key in Redis cache."""
        cache_key = self._build_key(key, namespace)

        try:
            ttl = await self.client.ttl(cache_key)
            return ttl

        except RedisError as e:
            logger.error(
                f"Redis TTL operation failed for key: {cache_key}",
                extra={"error": str(e), "error_type": type(e).__name__}
            )
            return -1

    async def increment(self, key: str, amount: int = 1, namespace: Optional[str] = None) -> Optional[int]:
        """Increment a counter in Redis."""
        cache_key = self._build_key(key, namespace)

        try:
            result = await self.client.incrby(cache_key, amount)
            logger.debug(f"Cache increment for key: {cache_key}, amount: {amount}, result: {result}")
            return result

        except RedisError as e:
            logger.error(
                f"Redis increment operation failed for key: {cache_key}",
                extra={"error": str(e), "error_type": type(e).__name__, "amount": amount}
            )
            return None

    async def expire(self, key: str, ttl: int, namespace: Optional[str] = None) -> bool:
        """Set expiration time for a key."""
        cache_key = self._build_key(key, namespace)

        try:
            result = await self.client.expire(cache_key, ttl)
            return bool(result)

        except RedisError as e:
            logger.error(
                f"Redis expire operation failed for key: {cache_key}",
                extra={"error": str(e), "error_type": type(e).__name__, "ttl": ttl}
            )
            return False

    async def clear_namespace(self, namespace: str) -> int:
        """Clear all keys in a namespace."""
        pattern = self._build_key("*", namespace)

        try:
            keys = await self.client.keys(pattern)
            if keys:
                result = await self.client.delete(*keys)
                logger.info(f"Cleared {result} keys from namespace: {namespace}")
                return result
            return 0

        except RedisError as e:
            logger.error(
                f"Redis clear namespace operation failed for pattern: {pattern}",
                extra={"error": str(e), "error_type": type(e).__name__}
            )
            return 0

    async def get_all_keys(self, pattern: str = "*", namespace: Optional[str] = None) -> List[str]:
        """Get all keys matching a pattern."""
        search_pattern = self._build_key(pattern, namespace)

        try:
            keys = await self.client.keys(search_pattern)
            return [key.replace(f"{self.settings.REDIS_KEY_PREFIX}:", "") for key in keys]

        except RedisError as e:
            logger.error(
                f"Redis keys operation failed for pattern: {search_pattern}",
                extra={"error": str(e), "error_type": type(e).__name__}
            )
            return []

    def _json_serializer(self, obj: Any) -> str:
        """Custom JSON serializer for datetime and other objects."""
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif hasattr(obj, '__dict__'):
            return obj.__dict__
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


# Singleton instances
redis_manager = RedisManager()
redis_service = RedisService(redis_manager)


# Context manager for Redis operations
@asynccontextmanager
async def get_redis_service():
    """Context manager to get Redis service with proper initialization."""
    try:
        if redis_manager._client is None:
            await redis_manager.initialize()
        yield redis_service
    except Exception as e:
        logger.error(f"Redis service context manager error: {str(e)}")
        raise


# Utility functions
async def init_redis() -> RedisManager:
    """Initialize Redis connection."""
    await redis_manager.initialize()
    return redis_manager


async def close_redis() -> None:
    """Close Redis connection."""
    await redis_manager.close()


async def get_redis_health() -> Dict[str, Any]:
    """Get Redis health status."""
    try:
        is_connected = await redis_manager.ping()
        info = await redis_manager.get_connection_info() if is_connected else {}

        return {
            "status": "healthy" if is_connected else "unhealthy",
            "connected": is_connected,
            "info": info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "error",
            "connected": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }