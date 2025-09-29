"""
Startup Handler for Market Data Caches

Manages the lifecycle of caching services with FastAPI app events:
- Symbol Registry Cache
- Price Data Cache
"""

import asyncio
import logging
from fastapi import FastAPI

from .symbol_registry_cache import symbol_registry
from .price_cache_service import price_cache_service

logger = logging.getLogger(__name__)


def register_symbol_cache_lifecycle(app: FastAPI):
    """
    Register symbol registry cache lifecycle events with FastAPI app.
    
    Args:
        app: FastAPI application instance
    """
    
    @app.on_event("startup")
    async def startup_symbol_cache():
        """Initialize symbol registry cache on application startup."""
        try:
            logger.info("🚀 Initializing Symbol Registry Cache...")
            await symbol_registry.initialize()
            logger.info("✅ Symbol Registry Cache initialized successfully")
            
            # Log initial stats
            stats = await symbol_registry.get_cache_stats()
            total_symbols = stats.get('total_unique_symbols', 0)
            logger.info(f"📊 Tracking {total_symbols} unique symbols across all tables")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Symbol Registry Cache: {e}")
            logger.warning("⚠️  Services will fall back to database queries")
    
    @app.on_event("shutdown")
    async def shutdown_symbol_cache():
        """Gracefully shutdown symbol registry cache."""
        try:
            logger.info("🛑 Shutting down Symbol Registry Cache...")
            await symbol_registry.shutdown()
            logger.info("✅ Symbol Registry Cache shutdown complete")
        except Exception as e:
            logger.error(f"❌ Error during Symbol Registry Cache shutdown: {e}")
    
    logger.info("Symbol Registry Cache lifecycle events registered")


def register_price_cache_lifecycle(app: FastAPI):
    """
    Register price data cache lifecycle events with FastAPI app.
    
    Args:
        app: FastAPI application instance
    """
    
    @app.on_event("startup")
    async def startup_price_cache():
        """Initialize price cache service on application startup."""
        try:
            logger.info("🚀 Initializing Price Cache Service...")
            await price_cache_service.start()
            logger.info("✅ Price Cache Service initialized successfully")
            logger.info(f"⏱️  Cache TTL: {price_cache_service.ttl} seconds")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize Price Cache Service: {e}")
            logger.warning("⚠️  Services will make direct API calls without caching")
    
    @app.on_event("shutdown")
    async def shutdown_price_cache():
        """Gracefully shutdown price cache service."""
        try:
            logger.info("🛑 Shutting down Price Cache Service...")
            await price_cache_service.stop()
            logger.info("✅ Price Cache Service shutdown complete")
        except Exception as e:
            logger.error(f"❌ Error during Price Cache Service shutdown: {e}")
    
    logger.info("Price Cache Service lifecycle events registered")


def register_all_cache_lifecycles(app: FastAPI):
    """
    Register all cache lifecycle events with FastAPI app.
    Convenience function to register both symbol and price caches.
    
    Args:
        app: FastAPI application instance
    """
    register_symbol_cache_lifecycle(app)
    register_price_cache_lifecycle(app)
    logger.info("✅ All cache lifecycle events registered")


async def get_cache_health() -> dict:
    """
    Get health status of the symbol registry cache.
    Use this in health check endpoints.
    
    Returns:
        dict: Health status with stats and metadata
    """
    try:
        stats = await symbol_registry.get_cache_stats()
        metadata = await symbol_registry.get_registry_metadata()
        
        is_healthy = metadata is not None and stats.get('total_unique_symbols', 0) > 0
        
        return {
            "status": "healthy" if is_healthy else "degraded",
            "cache_enabled": True,
            "total_symbols": stats.get('total_unique_symbols', 0),
            "sources_tracked": len(stats.get('sources', {})),
            "last_refresh": metadata.get('last_full_refresh') if metadata else None,
            "next_refresh": metadata.get('next_refresh') if metadata else None,
            "details": stats
        }
    except Exception as e:
        logger.error(f"Failed to get cache health: {e}")
        return {
            "status": "unhealthy",
            "cache_enabled": False,
            "error": str(e)
        }


async def get_price_cache_health() -> dict:
    """
    Get health status of the price cache service.
    Use this in health check endpoints.
    
    Returns:
        dict: Health status with stats and metadata
    """
    try:
        stats = await price_cache_service.get_cache_stats()
        
        is_healthy = price_cache_service._is_running and stats.get('total_cached_symbols', 0) >= 0
        
        return {
            "status": "healthy" if is_healthy else "degraded",
            "cache_enabled": True,
            "ttl_seconds": price_cache_service.ttl,
            "auto_refresh_running": price_cache_service._is_running,
            "details": stats
        }
    except Exception as e:
        logger.error(f"Failed to get price cache health: {e}")
        return {
            "status": "unhealthy",
            "cache_enabled": False,
            "error": str(e)
        }
