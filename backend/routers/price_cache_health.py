# backend/routers/price_cache_health.py

"""
Price Cache Health and Management Endpoints

Provides endpoints for monitoring and managing the price cache service.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from services.market_data.startup_handler import get_price_cache_health
from services.market_data.price_cache_service import price_cache_service

router = APIRouter(prefix="/price-cache", tags=["price-cache"])


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Get health status of the price cache service.
    
    Returns:
        Health status with TTL, auto-refresh status, and statistics
    """
    return await get_price_cache_health()


@router.get("/stats")
async def get_stats() -> Dict[str, Any]:
    """
    Get detailed statistics about cached price data.
    
    Returns:
        - total_cached_symbols: Number of symbols currently cached
        - ttl_seconds: Cache TTL
        - popular_symbols: Top 10 most requested symbols
        - in_flight_requests: Current pending API requests
        - auto_refresh_running: Status of auto-refresh loop
    """
    try:
        stats = await price_cache_service.get_cache_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.post("/invalidate/{symbol}")
async def invalidate_symbol(symbol: str) -> Dict[str, Any]:
    """
    Manually invalidate cached price data for a specific symbol.
    
    Args:
        symbol: Stock symbol to invalidate
    
    Returns:
        Success status
    """
    try:
        success = await price_cache_service.invalidate_symbol(symbol.upper())
        
        if success:
            return {
                "success": True,
                "message": f"Cache invalidated for {symbol.upper()}",
                "symbol": symbol.upper()
            }
        else:
            return {
                "success": False,
                "message": f"No cached data found for {symbol.upper()}",
                "symbol": symbol.upper()
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to invalidate cache: {str(e)}")


@router.post("/clear")
async def clear_all_cache() -> Dict[str, Any]:
    """
    Clear all cached price data (use with caution).
    
    Returns:
        Number of cache entries deleted
    """
    try:
        deleted = await price_cache_service.clear_all_cache()
        return {
            "success": True,
            "message": f"Cleared {deleted} cache entries",
            "deleted_count": deleted
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")


@router.get("/popular")
async def get_popular_symbols() -> Dict[str, Any]:
    """
    Get the most popular (frequently requested) symbols.
    
    Returns:
        Top 20 most requested symbols with request counts
    """
    try:
        stats = await price_cache_service.get_cache_stats()
        popular = stats.get('popular_symbols', {})
        
        return {
            "popular_symbols": popular,
            "total_count": len(popular)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get popular symbols: {str(e)}")
