"""
Symbol Registry Cache Service for Tradistry

This service maintains a centralized cache of all stock symbols tracked in the database,
organized by source table. It reduces database reads by caching symbol lists and 
automatically refreshes every 2 hours or when new symbols are added.

Architecture:
- Caches symbols grouped by source table (stock_quotes, market_movers, watchlists, etc.)
- Time-based refresh: Every 2 hours
- Event-based refresh: When new symbols are inserted
- Provides fast lookups for services needing symbol lists
- Uses Redis for distributed caching
"""

import asyncio
import logging
from typing import List, Dict, Set, Optional, Any
from datetime import datetime, timedelta
from enum import Enum

from services.redis_client import redis_service
from .base_service import BaseMarketDataService

logger = logging.getLogger(__name__)


class SymbolSource(str, Enum):
    """Enumeration of tables that contain stock symbols."""
    STOCK_QUOTES = "stock_quotes"              # Tracked symbols for quotes
    MARKET_MOVERS = "market_movers"            # Gainers, losers, active stocks
    WATCHLIST_ITEMS = "watchlist_items"        # User watchlist symbols
    COMPANY_INFO = "company_info"              # Company metadata
    STOCK_PEERS = "stock_peers"                # Peer comparison symbols
    DIVIDEND_DATA = "dividend_data"            # Dividend-paying stocks
    EARNINGS_CALENDAR = "earnings_calendar"    # Earnings event symbols
    BALANCE_SHEET = "balance_sheet"            # Fundamental data symbols
    INCOME_STATEMENT = "income_statement"      # Fundamental data symbols
    CASH_FLOW = "cash_flow"                    # Fundamental data symbols
    HOLDERS = "holders"                        # Holder information symbols
    FINANCE_NEWS = "finance_news"              # News-related symbols


class SymbolRegistryCache(BaseMarketDataService):
    """
    Manages cached symbol registry with automatic refresh and event-driven updates.
    
    Features:
    - Caches symbols by source table
    - Auto-refresh every 2 hours
    - Manual refresh on new symbol insertions
    - Provides fast symbol lookups
    - Tracks cache metadata (last updated, symbol counts)
    """
    
    def __init__(self, supabase=None):
        super().__init__(supabase)
        self.redis = redis_service
        self.cache_namespace = "symbol_registry"
        self.refresh_interval = 7200  # 2 hours in seconds
        self._refresh_task = None
        self._is_initialized = False
    
    # ========================
    # Initialization & Lifecycle
    # ========================
    
    async def initialize(self):
        """Initialize the symbol registry cache and start auto-refresh."""
        if self._is_initialized:
            logger.info("Symbol registry cache already initialized")
            return
        
        logger.info("Initializing symbol registry cache...")
        
        # Initial cache population
        await self.refresh_all_symbols()
        
        # Start background auto-refresh task
        self._refresh_task = asyncio.create_task(self._auto_refresh_loop())
        self._is_initialized = True
        
        logger.info("Symbol registry cache initialized successfully")
    
    async def shutdown(self):
        """Gracefully shutdown the cache service."""
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
        
        logger.info("Symbol registry cache shutdown complete")
    
    # ========================
    # Auto-Refresh Loop
    # ========================
    
    async def _auto_refresh_loop(self):
        """Background task that refreshes the cache every 2 hours."""
        logger.info(f"Starting auto-refresh loop (interval: {self.refresh_interval}s / 2 hours)")
        
        while True:
            try:
                # Wait for refresh interval
                await asyncio.sleep(self.refresh_interval)
                
                # Refresh all symbol caches
                logger.info("Auto-refresh triggered - refreshing all symbol caches")
                await self.refresh_all_symbols()
                
            except asyncio.CancelledError:
                logger.info("Auto-refresh loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in auto-refresh loop: {e}")
                # Continue running even if refresh fails
                await asyncio.sleep(60)  # Wait 1 minute before retry
    
    # ========================
    # Cache Population Methods
    # ========================
    
    async def refresh_all_symbols(self, access_token: str = None):
        """
        Refresh all symbol caches from database.
        Called on initialization and every 2 hours.
        """
        logger.info("Refreshing all symbol caches from database")
        start_time = datetime.now()
        
        try:
            # Refresh each symbol source in parallel
            tasks = [
                self._refresh_stock_quotes(access_token),
                self._refresh_market_movers(access_token),
                self._refresh_watchlist_items(access_token),
                self._refresh_company_info(access_token),
                self._refresh_stock_peers(access_token),
                self._refresh_dividend_data(access_token),
                self._refresh_earnings_calendar(access_token),
                self._refresh_fundamental_symbols(access_token),
                self._refresh_holders(access_token),
                self._refresh_finance_news(access_token),
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Log results
            successful = sum(1 for r in results if not isinstance(r, Exception))
            failed = len(results) - successful
            
            # Update master registry metadata
            await self._update_registry_metadata()
            
            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(
                f"Symbol cache refresh complete: {successful} sources updated, "
                f"{failed} failed, took {elapsed:.2f}s"
            )
            
            return {"success": True, "updated": successful, "failed": failed}
            
        except Exception as e:
            logger.error(f"Failed to refresh all symbols: {e}")
            return {"success": False, "error": str(e)}
    
    async def _refresh_stock_quotes(self, access_token: str = None) -> int:
        """Refresh stock_quotes symbol cache."""
        try:
            async def operation(client):
                # Query distinct symbols from stock_quotes table
                response = client.table('stock_quotes').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.STOCK_QUOTES, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.STOCK_QUOTES}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.STOCK_QUOTES}: {e}")
            return 0
    
    async def _refresh_market_movers(self, access_token: str = None) -> int:
        """Refresh market_movers symbol cache."""
        try:
            async def operation(client):
                response = client.table('market_movers').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.MARKET_MOVERS, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.MARKET_MOVERS}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.MARKET_MOVERS}: {e}")
            return 0
    
    async def _refresh_watchlist_items(self, access_token: str = None) -> int:
        """Refresh watchlist_items symbol cache."""
        try:
            async def operation(client):
                response = client.table('watchlist_items').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.WATCHLIST_ITEMS, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.WATCHLIST_ITEMS}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.WATCHLIST_ITEMS}: {e}")
            return 0
    
    async def _refresh_company_info(self, access_token: str = None) -> int:
        """Refresh company_info symbol cache."""
        try:
            async def operation(client):
                response = client.table('company_info').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.COMPANY_INFO, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.COMPANY_INFO}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.COMPANY_INFO}: {e}")
            return 0
    
    async def _refresh_stock_peers(self, access_token: str = None) -> int:
        """Refresh stock_peers symbol cache."""
        try:
            async def operation(client):
                # stock_peers table has 'symbol' and 'peer_name' (not peer_symbol)
                response = client.table('stock_peers').select('symbol').execute()
                symbols = set()
                if response.data:
                    for row in response.data:
                        if row.get('symbol'):
                            symbols.add(row['symbol'])
                return symbols
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.STOCK_PEERS, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.STOCK_PEERS}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.STOCK_PEERS}: {e}")
            return 0
    
    async def _refresh_dividend_data(self, access_token: str = None) -> int:
        """Refresh dividend_data symbol cache."""
        try:
            async def operation(client):
                response = client.table('dividend_data').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.DIVIDEND_DATA, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.DIVIDEND_DATA}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.DIVIDEND_DATA}: {e}")
            return 0
    
    async def _refresh_earnings_calendar(self, access_token: str = None) -> int:
        """Refresh earnings_calendar symbol cache."""
        try:
            async def operation(client):
                response = client.table('earnings_calendar').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.EARNINGS_CALENDAR, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.EARNINGS_CALENDAR}")
            return len(symbols)
            
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.EARNINGS_CALENDAR}: {e}")
            return 0
    
    async def _refresh_fundamental_symbols(self, access_token: str = None) -> int:
        """Refresh fundamental tables (balance_sheet, income_statement, cash_flow) symbol caches."""
        total_symbols = 0
        
        try:
            # Balance Sheet
            async def balance_sheet_op(client):
                response = client.table('balance_sheet').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            bs_symbols = await self._execute_with_retry(balance_sheet_op, access_token)
            await self._cache_symbols(SymbolSource.BALANCE_SHEET, list(bs_symbols))
            total_symbols += len(bs_symbols)
            logger.info(f"Cached {len(bs_symbols)} symbols from balance_sheet")
            
            # Income Statement
            async def income_op(client):
                response = client.table('income_statement').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            is_symbols = await self._execute_with_retry(income_op, access_token)
            await self._cache_symbols(SymbolSource.INCOME_STATEMENT, list(is_symbols))
            total_symbols += len(is_symbols)
            logger.info(f"Cached {len(is_symbols)} symbols from income_statement")
            
            # Cash Flow
            async def cash_flow_op(client):
                response = client.table('cash_flow').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            cf_symbols = await self._execute_with_retry(cash_flow_op, access_token)
            await self._cache_symbols(SymbolSource.CASH_FLOW, list(cf_symbols))
            total_symbols += len(cf_symbols)
            logger.info(f"Cached {len(cf_symbols)} symbols from cash_flow")
            
            return total_symbols
            
        except Exception as e:
            logger.error(f"Failed to refresh fundamental symbols: {e}")
            return total_symbols
    
    async def _refresh_holders(self, access_token: str = None) -> int:
        """Refresh holders symbol cache."""
        try:
            async def operation(client):
                response = client.table('holders').select('symbol').execute()
                return {row['symbol'] for row in response.data} if response.data else set()
            
            symbols = await self._execute_with_retry(operation, access_token)
            await self._cache_symbols(SymbolSource.HOLDERS, list(symbols))
            
            logger.info(f"Cached {len(symbols)} symbols from {SymbolSource.HOLDERS}")
            return len(symbols)
        except Exception as e:
            logger.error(f"Failed to refresh {SymbolSource.HOLDERS}: {e}")
            return 0
    
    async def _refresh_finance_news(self, access_token: str = None) -> int:
        """Refresh finance_news symbol cache."""
        # finance_news table doesn't have a 'symbol' column
        # Skip this table entirely to avoid 400 Bad Request errors
        logger.info("Skipping finance_news - table does not have symbol column")
        
        # Cache empty list to maintain consistent structure
        await self._cache_symbols(SymbolSource.FINANCE_NEWS, [])
        return 0
    
    # ========================
    # Cache Storage Methods
    # ========================
    
    async def _cache_symbols(self, source: SymbolSource, symbols: List[str]):
        """Store symbol list in Redis cache."""
        cache_key = f"symbols:{source.value}"
        
        try:
            # Store symbols list
            await self.redis.set(
                cache_key,
                symbols,
                ttl=self.refresh_interval + 300,  # TTL = 2 hours + 5 minute buffer
                namespace=self.cache_namespace
            )
            
            # Store metadata
            metadata_key = f"symbols:meta:{source.value}"
            metadata = {
                "count": len(symbols),
                "last_updated": datetime.now().isoformat(),
                "source": source.value
            }
            await self.redis.set(
                metadata_key,
                metadata,
                ttl=self.refresh_interval + 300,
                namespace=self.cache_namespace
            )
            
        except Exception as e:
            logger.error(f"Failed to cache symbols for {source.value}: {e}")
    
    async def _update_registry_metadata(self):
        """Update master registry metadata."""
        try:
            metadata = {
                "last_full_refresh": datetime.now().isoformat(),
                "refresh_interval_seconds": self.refresh_interval,
                "next_refresh": (datetime.now() + timedelta(seconds=self.refresh_interval)).isoformat(),
                "sources_count": len(SymbolSource)
            }
            
            await self.redis.set(
                "registry:metadata",
                metadata,
                ttl=self.refresh_interval + 300,
                namespace=self.cache_namespace
            )
            
        except Exception as e:
            logger.error(f"Failed to update registry metadata: {e}")
    
    # ========================
    # Retrieval Methods (Fast Lookups)
    # ========================
    
    async def get_symbols_by_source(self, source: SymbolSource) -> List[str]:
        """
        Get cached symbols for a specific source table.
        Returns empty list if cache miss.
        """
        cache_key = f"symbols:{source.value}"
        
        try:
            symbols = await self.redis.get(
                cache_key,
                namespace=self.cache_namespace,
                default=[]
            )
            
            logger.debug(f"Cache lookup for {source.value}: {len(symbols)} symbols")
            return symbols
            
        except Exception as e:
            logger.error(f"Failed to get symbols for {source.value}: {e}")
            return []
    
    async def get_all_unique_symbols(self) -> Set[str]:
        """Get all unique symbols across all sources."""
        try:
            all_symbols = set()
            
            for source in SymbolSource:
                symbols = await self.get_symbols_by_source(source)
                all_symbols.update(symbols)
            
            logger.info(f"Retrieved {len(all_symbols)} unique symbols across all sources")
            return all_symbols
            
        except Exception as e:
            logger.error(f"Failed to get all unique symbols: {e}")
            return set()
    
    async def get_symbols_for_price_updates(self) -> Dict[str, List[str]]:
        """
        Get symbols that need price updates, organized by source.
        Useful for batch price fetching operations.
        """
        try:
            result = {}
            
            # Priority sources that typically need price updates
            priority_sources = [
                SymbolSource.STOCK_QUOTES,
                SymbolSource.MARKET_MOVERS,
                SymbolSource.WATCHLIST_ITEMS,
            ]
            
            for source in priority_sources:
                symbols = await self.get_symbols_by_source(source)
                if symbols:
                    result[source.value] = symbols
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to get symbols for price updates: {e}")
            return {}
    
    async def get_source_metadata(self, source: SymbolSource) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific symbol source."""
        metadata_key = f"symbols:meta:{source.value}"
        
        try:
            metadata = await self.redis.get(
                metadata_key,
                namespace=self.cache_namespace,
                default=None
            )
            return metadata
            
        except Exception as e:
            logger.error(f"Failed to get metadata for {source.value}: {e}")
            return None
    
    async def get_registry_metadata(self) -> Optional[Dict[str, Any]]:
        """Get master registry metadata."""
        try:
            metadata = await self.redis.get(
                "registry:metadata",
                namespace=self.cache_namespace,
                default=None
            )
            return metadata
            
        except Exception as e:
            logger.error(f"Failed to get registry metadata: {e}")
            return None
    
    # ========================
    # Event-Driven Updates
    # ========================
    
    async def on_symbol_added(self, source: SymbolSource, symbol: str):
        """
        Event handler: Called when a new symbol is added to a table.
        Immediately updates the cache for that source.
        """
        logger.info(f"New symbol added: {symbol} to {source.value}")
        
        try:
            # Get current cached symbols
            symbols = await self.get_symbols_by_source(source)
            
            # Add new symbol if not already present
            if symbol.upper() not in [s.upper() for s in symbols]:
                symbols.append(symbol.upper())
                await self._cache_symbols(source, symbols)
                logger.info(f"Cache updated: Added {symbol} to {source.value}")
            else:
                logger.debug(f"Symbol {symbol} already in cache for {source.value}")
                
        except Exception as e:
            logger.error(f"Failed to handle symbol addition: {e}")
    
    async def on_symbols_batch_added(self, source: SymbolSource, symbols: List[str]):
        """
        Event handler: Called when multiple symbols are added.
        More efficient than multiple on_symbol_added calls.
        """
        logger.info(f"Batch symbol addition: {len(symbols)} symbols to {source.value}")
        
        try:
            # Get current cached symbols
            current_symbols = await self.get_symbols_by_source(source)
            current_upper = {s.upper() for s in current_symbols}
            
            # Add new symbols
            new_symbols = [s.upper() for s in symbols if s.upper() not in current_upper]
            
            if new_symbols:
                updated_symbols = current_symbols + new_symbols
                await self._cache_symbols(source, updated_symbols)
                logger.info(f"Cache updated: Added {len(new_symbols)} new symbols to {source.value}")
            else:
                logger.debug(f"No new symbols to add for {source.value}")
                
        except Exception as e:
            logger.error(f"Failed to handle batch symbol addition: {e}")
    
    async def on_symbol_removed(self, source: SymbolSource, symbol: str):
        """
        Event handler: Called when a symbol is removed from a table.
        Updates the cache to reflect removal.
        """
        logger.info(f"Symbol removed: {symbol} from {source.value}")
        
        try:
            # Get current cached symbols
            symbols = await self.get_symbols_by_source(source)
            
            # Remove symbol
            updated_symbols = [s for s in symbols if s.upper() != symbol.upper()]
            
            if len(updated_symbols) < len(symbols):
                await self._cache_symbols(source, updated_symbols)
                logger.info(f"Cache updated: Removed {symbol} from {source.value}")
            else:
                logger.debug(f"Symbol {symbol} not found in cache for {source.value}")
                
        except Exception as e:
            logger.error(f"Failed to handle symbol removal: {e}")
    
    # ========================
    # Utility Methods
    # ========================
    
    async def invalidate_source(self, source: SymbolSource):
        """Manually invalidate and refresh a specific source cache."""
        logger.info(f"Manually invalidating cache for {source.value}")
        
        try:
            # Delete existing cache
            cache_key = f"symbols:{source.value}"
            await self.redis.delete(cache_key, namespace=self.cache_namespace)
            
            # Refresh from database
            refresh_method = getattr(self, f"_refresh_{source.value}")
            await refresh_method()
            
            logger.info(f"Cache invalidated and refreshed for {source.value}")
            
        except Exception as e:
            logger.error(f"Failed to invalidate {source.value}: {e}")
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics."""
        try:
            stats = {
                "sources": {},
                "total_unique_symbols": 0,
                "registry_metadata": await self.get_registry_metadata()
            }
            
            all_symbols = set()
            
            for source in SymbolSource:
                metadata = await self.get_source_metadata(source)
                if metadata:
                    stats["sources"][source.value] = metadata
                    symbols = await self.get_symbols_by_source(source)
                    all_symbols.update(symbols)
            
            stats["total_unique_symbols"] = len(all_symbols)
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {}


# ========================
# Global Instance
# ========================

# Singleton instance for application-wide use
symbol_registry = SymbolRegistryCache()


# ========================
# Convenience Functions
# ========================

async def get_tracked_symbols() -> List[str]:
    """Get all symbols from stock_quotes (actively tracked symbols)."""
    return await symbol_registry.get_symbols_by_source(SymbolSource.STOCK_QUOTES)


async def get_mover_symbols() -> List[str]:
    """Get all market mover symbols."""
    return await symbol_registry.get_symbols_by_source(SymbolSource.MARKET_MOVERS)


async def get_watchlist_symbols() -> List[str]:
    """Get all watchlist symbols across all users."""
    return await symbol_registry.get_symbols_by_source(SymbolSource.WATCHLIST_ITEMS)


async def get_all_symbols_for_updates() -> Set[str]:
    """Get all unique symbols that need price updates."""
    return await symbol_registry.get_all_unique_symbols()


async def notify_symbol_added(table_name: str, symbol: str):
    """
    Notify the cache that a new symbol was added.
    Call this from services after inserting new symbols.
    """
    try:
        source = SymbolSource(table_name)
        await symbol_registry.on_symbol_added(source, symbol)
    except ValueError:
        logger.warning(f"Unknown table name for symbol registry: {table_name}")
