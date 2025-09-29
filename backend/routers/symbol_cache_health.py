"""
Symbol Cache Health Check Router

Provides monitoring and health check endpoints for the Symbol Registry Cache.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

from services.market_data.symbol_registry_cache import (
    symbol_registry, 
    SymbolSource,
    get_tracked_symbols,
    get_mover_symbols,
    get_watchlist_symbols,
    get_all_symbols_for_updates
)
from services.market_data.startup_handler import get_cache_health

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/symbol-cache",
    tags=["Symbol Cache Health"]
)


@router.get("/health", response_model=Dict[str, Any])
async def check_cache_health():
    """
    Check the health status of the Symbol Registry Cache.
    
    Returns:
        - status: "healthy", "degraded", or "unhealthy"
        - cache_enabled: Whether cache is operational
        - total_symbols: Total unique symbols tracked
        - sources_tracked: Number of table sources tracked
        - last_refresh: Timestamp of last cache refresh
        - next_refresh: Scheduled next refresh time
    """
    try:
        health = await get_cache_health()
        return health
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=Dict[str, Any])
async def get_cache_statistics():
    """
    Get comprehensive statistics about the Symbol Registry Cache.
    
    Returns detailed information about:
    - Symbol counts per source table
    - Last update timestamps
    - Total unique symbols
    - Registry metadata
    """
    try:
        stats = await symbol_registry.get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources/{source_name}", response_model=Dict[str, Any])
async def get_source_details(source_name: str):
    """
    Get detailed information about a specific symbol source.
    
    Args:
        source_name: Name of the source (e.g., "stock_quotes", "market_movers")
    
    Returns:
        - symbols: List of symbols for this source
        - count: Number of symbols
        - metadata: Last updated timestamp and other info
    """
    try:
        # Validate source name
        try:
            source = SymbolSource(source_name)
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid source name. Valid sources: {[s.value for s in SymbolSource]}"
            )
        
        # Get symbols and metadata
        symbols = await symbol_registry.get_symbols_by_source(source)
        metadata = await symbol_registry.get_source_metadata(source)
        
        return {
            "source": source_name,
            "symbols": symbols,
            "count": len(symbols),
            "metadata": metadata
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get source details for {source_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh", response_model=Dict[str, Any])
async def trigger_manual_refresh():
    """
    Manually trigger a full cache refresh.
    
    This will refresh all symbol sources from the database.
    Use this after bulk data imports or if cache appears stale.
    
    Returns:
        - success: Whether refresh succeeded
        - updated: Number of sources successfully updated
        - failed: Number of sources that failed
    """
    try:
        logger.info("Manual cache refresh triggered via API")
        result = await symbol_registry.refresh_all_symbols()
        return result
    except Exception as e:
        logger.error(f"Manual refresh failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh/{source_name}", response_model=Dict[str, Any])
async def refresh_specific_source(source_name: str):
    """
    Manually refresh a specific source table.
    
    Args:
        source_name: Name of the source to refresh
    
    Returns:
        - success: Whether refresh succeeded
        - source: Source name
        - message: Status message
    """
    try:
        # Validate source name
        try:
            source = SymbolSource(source_name)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid source name. Valid sources: {[s.value for s in SymbolSource]}"
            )
        
        logger.info(f"Manual refresh triggered for {source_name}")
        await symbol_registry.invalidate_source(source)
        
        return {
            "success": True,
            "source": source_name,
            "message": f"Source {source_name} refreshed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refresh {source_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/tracked", response_model=Dict[str, Any])
async def get_all_tracked_symbols():
    """
    Get all symbols from stock_quotes table (actively tracked symbols).
    
    This is a convenience endpoint for the most commonly queried source.
    """
    try:
        symbols = await get_tracked_symbols()
        return {
            "source": "stock_quotes",
            "symbols": symbols,
            "count": len(symbols)
        }
    except Exception as e:
        logger.error(f"Failed to get tracked symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/movers", response_model=Dict[str, Any])
async def get_all_mover_symbols():
    """
    Get all symbols from market_movers table.
    
    Returns symbols for gainers, losers, and most active stocks.
    """
    try:
        symbols = await get_mover_symbols()
        return {
            "source": "market_movers",
            "symbols": symbols,
            "count": len(symbols)
        }
    except Exception as e:
        logger.error(f"Failed to get mover symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/watchlist", response_model=Dict[str, Any])
async def get_all_watchlist_symbols():
    """
    Get all symbols from watchlist_items table.
    
    Returns symbols across all user watchlists.
    """
    try:
        symbols = await get_watchlist_symbols()
        return {
            "source": "watchlist_items",
            "symbols": symbols,
            "count": len(symbols)
        }
    except Exception as e:
        logger.error(f"Failed to get watchlist symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/all", response_model=Dict[str, Any])
async def get_all_unique_symbols():
    """
    Get all unique symbols across all tracked tables.
    
    This combines symbols from all sources and returns unique values.
    Useful for bulk operations that need to process all symbols.
    """
    try:
        all_symbols = await get_all_symbols_for_updates()
        return {
            "symbols": list(all_symbols),
            "count": len(all_symbols),
            "message": "All unique symbols across all sources"
        }
    except Exception as e:
        logger.error(f"Failed to get all symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/priority", response_model=Dict[str, Any])
async def get_priority_symbols():
    """
    Get symbols from priority sources (quotes, movers, watchlists).
    
    Returns symbols organized by source for prioritized batch operations.
    Use this for price updates or other operations that need to prioritize
    certain symbols over others.
    """
    try:
        priority_symbols = await symbol_registry.get_symbols_for_price_updates()
        
        total = sum(len(symbols) for symbols in priority_symbols.values())
        unique = len(set(
            symbol 
            for symbols in priority_symbols.values() 
            for symbol in symbols
        ))
        
        return {
            "symbols_by_source": priority_symbols,
            "total_symbols": total,
            "unique_symbols": unique
        }
    except Exception as e:
        logger.error(f"Failed to get priority symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metadata", response_model=Dict[str, Any])
async def get_registry_metadata():
    """
    Get master registry metadata.
    
    Returns information about the overall cache system:
    - Last full refresh timestamp
    - Refresh interval
    - Next scheduled refresh
    - Number of sources tracked
    """
    try:
        metadata = await symbol_registry.get_registry_metadata()
        
        if not metadata:
            raise HTTPException(
                status_code=503,
                detail="Registry metadata not available - cache may not be initialized"
            )
        
        return metadata
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get registry metadata: {e}")
        raise HTTPException(status_code=500, detail=str(e))
