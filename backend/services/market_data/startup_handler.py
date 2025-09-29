"""
Startup Handler for Symbol Registry Cache

This module provides easy integration of the symbol registry cache
into the FastAPI application lifecycle.

Usage in main.py:
    from services.market_data.startup_handler import register_symbol_cache_lifecycle
    
    register_symbol_cache_lifecycle(app)
"""

import logging
from fastapi import FastAPI
from .symbol_registry_cache import symbol_registry

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
