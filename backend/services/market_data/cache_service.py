# backend/services/market_data/cache_service.py

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from decimal import Decimal
import httpx
import asyncio
import logging
from .base_service import BaseMarketDataService
from services.redis_client import redis_service
from models.market_data import (
    CacheData, CachedSymbolData, MajorIndicesResponse, CacheDataRequest
)

logger = logging.getLogger(__name__)

class CacheService(BaseMarketDataService):
    """Service for retrieving cached market data with Redis caching."""
    
    def __init__(self, supabase=None):
        super().__init__(supabase)
        self.redis = redis_service
        self.cache_namespace = "historical_data"
        self.cache_enabled = True  # Feature flag

    async def get_cached_symbol_data(
        self,
        request: CacheDataRequest,
        access_token: str = None
    ) -> Optional[CachedSymbolData]:
        """Fetch fresh data for a specific symbol from finance-query API."""
        # Use the new single symbol fetch method
        result = await self.fetch_single_symbol_data(
            symbol=request.symbol,
            range_param="1d",  # Default range
            interval=request.period_type or "5m",
            access_token=access_token
        )
        
        if result and result.get('raw_data'):
            return result['raw_data']
        
        return None

    async def get_major_indices_data(
        self,
        limit: int = 100,
        period_type: str = "5m",
        data_provider: str = "finance_query",
        access_token: str = None
    ) -> MajorIndicesResponse:
        """Fetch fresh data for major indices (SPY, QQQ, DIA) from finance-query API."""
        indices_symbols = ['SPY', 'QQQ', 'DIA']
        indices_data = {}
        total_data_points = 0

        # Fetch fresh data from API for each index
        for symbol in indices_symbols:
            result = await self._fetch_symbol_historical_data(
                symbol=symbol,
                range_param="1d",
                interval=period_type,
                client=None  # Not using database client
            )
            
            if result and result.get('raw_data'):
                indices_data[symbol.lower()] = result['raw_data']
                total_data_points += result['raw_data'].data_points_count

        return MajorIndicesResponse(
            spy=indices_data.get('spy'),
            qqq=indices_data.get('qqq'),
            dia=indices_data.get('dia'),
            vix=None,  # VIX removed from indices
            timestamp=datetime.now(),
            total_data_points=total_data_points
        )

    async def fetch_historical_data_for_symbols(
        self,
        symbols: List[str],
        range_param: str = "1d",
        interval: str = "5m",
        access_token: str = None
    ) -> Dict[str, Any]:
        """Fetch historical data from finance-query API for specific requested symbols."""
        
        if not symbols or len(symbols) == 0:
            return {
                "success": False,
                "message": "No symbols provided",
                "processed_symbols": 0,
                "fetched_data_points": 0,
                "data": {}
            }
        
        # Clean and validate symbols
        cleaned_symbols = [symbol.upper().strip() for symbol in symbols if symbol and symbol.strip()]
        unique_symbols = list(set(cleaned_symbols))  # Remove duplicates
        
        print(f"Fetching historical data for {len(unique_symbols)} requested symbols: {unique_symbols}")
        
        processed_symbols = 0
        fetched_data_points = 0
        failed_symbols = []
        results_data = {}
        
        # Process symbols concurrently (no batching needed for user-requested symbols)
        tasks = [
            self._fetch_symbol_historical_data(symbol, range_param, interval, None)
            for symbol in unique_symbols
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for symbol, result in zip(unique_symbols, results):
            if isinstance(result, Exception):
                print(f"Error processing {symbol}: {result}")
                failed_symbols.append(symbol)
                results_data[symbol] = {"error": str(result)}
            elif result:
                processed_symbols += 1
                fetched_data_points += result.get('data_points_fetched', 0)
                results_data[symbol] = result
                print(f"Successfully fetched {result.get('data_points_fetched', 0)} data points for {symbol}")
            else:
                failed_symbols.append(symbol)
                results_data[symbol] = {"error": "No data returned from API"}
        
        return {
            "success": True,
            "message": f"Historical data fetching completed for requested symbols",
            "requested_symbols": unique_symbols,
            "total_symbols": len(unique_symbols),
            "processed_symbols": processed_symbols,
            "failed_symbols": len(failed_symbols),
            "failed_symbol_list": failed_symbols,
            "fetched_data_points": fetched_data_points,
            "range": range_param,
            "interval": interval,
            "data": results_data
        }
    
    async def fetch_single_symbol_data(
        self,
        symbol: str,
        range_param: str = "1d",
        interval: str = "5m",
        access_token: str = None
    ) -> Optional[Dict[str, Any]]:
        """Fetch historical data for a single symbol with Redis caching."""
        
        if not symbol or not symbol.strip():
            return None
        
        cleaned_symbol = symbol.upper().strip()
        cache_key = f"historical:{cleaned_symbol}:{range_param}:{interval}"
        
        # Try cache first if enabled
        if self.cache_enabled:
            try:
                cached = await self.redis.get(cache_key, namespace=self.cache_namespace)
                if cached:
                    logger.info(f"Cache HIT: {cache_key}")
                    return cached
            except Exception as e:
                logger.warning(f"Cache read error: {e}")
        
        # Cache miss - fetch from API
        logger.info(f"Cache MISS: Fetching historical data for {cleaned_symbol}")
        
        result = await self._fetch_symbol_historical_data(
            cleaned_symbol, 
            range_param, 
            interval, 
            None
        )
        
        if result:
            logger.info(f"Successfully fetched {result.get('data_points_fetched', 0)} data points for {cleaned_symbol}")
            
            # Cache the result with progressive TTL
            if self.cache_enabled:
                ttl = self._get_ttl_for_range(range_param)
                try:
                    await self.redis.set(cache_key, result, ttl, namespace=self.cache_namespace)
                    logger.info(f"Cache SET: {cache_key} (TTL: {ttl}s)")
                except Exception as e:
                    logger.warning(f"Cache write error: {e}")
        else:
            logger.warning(f"Failed to fetch data for {cleaned_symbol}")
        
        return result
    
    async def _fetch_symbol_historical_data(
        self, 
        symbol: str, 
        range_param: str, 
        interval: str, 
        client
    ) -> Optional[Dict[str, Any]]:
        """Fetch historical data for a single symbol from finance-query API."""
        
        try:
            # Build the API URL
            api_url = f"https://finance-query.onrender.com/v1/historical"
            params = {
                "symbol": symbol,
                "range": range_param,
                "interval": interval,
                "epoch": "true"
            }
            
            # Make HTTP request to finance-query API
            async with httpx.AsyncClient(timeout=30.0) as http_client:
                response = await http_client.get(api_url, params=params)
                
                if response.status_code != 200:
                    print(f"API request failed for {symbol}: {response.status_code}")
                    return None
                
                data = response.json()
                
                if not data or not isinstance(data, dict):
                    print(f"No data returned for {symbol}")
                    return None
                
                # Process epoch-keyed data
                processed_data_list = []
                current_time = datetime.now(timezone.utc)
                
                for epoch_str, ohlcv_data in data.items():
                    try:
                        # Convert epoch timestamp to datetime
                        epoch_timestamp = int(epoch_str)
                        period_start = datetime.fromtimestamp(epoch_timestamp, tz=timezone.utc)
                        
                        # Calculate period end (assuming interval duration)
                        interval_minutes = self._parse_interval_to_minutes(interval)
                        period_end = datetime.fromtimestamp(
                            epoch_timestamp + (interval_minutes * 60), 
                            tz=timezone.utc
                        )
                        
                        # Create data object
                        data_point = CacheData(
                            id=0,  # Not using database ID
                            symbol=symbol.upper(),
                            exchange_id=None,
                            open=Decimal(str(ohlcv_data["open"])) if ohlcv_data["open"] is not None else None,
                            high=Decimal(str(ohlcv_data["high"])) if ohlcv_data["high"] is not None else None,
                            low=Decimal(str(ohlcv_data["low"])) if ohlcv_data["low"] is not None else None,
                            adjclose=Decimal(str(ohlcv_data["adjClose"])) if ohlcv_data["adjClose"] is not None else None,
                            volume=int(ohlcv_data["volume"]) if ohlcv_data["volume"] is not None else None,
                            period_start=period_start,
                            period_end=period_end,
                            period_type=interval,
                            data_provider="finance_query",
                            cache_timestamp=current_time,
                            created_at=current_time,
                            updated_at=current_time
                        )
                        
                        processed_data_list.append(data_point)
                        
                    except (ValueError, KeyError) as e:
                        print(f"Error processing data point for {symbol} at {epoch_str}: {e}")
                        continue
                
                if not processed_data_list:
                    return None
                
                # Return the processed data without caching
                latest_timestamp = max((point.period_start for point in processed_data_list)) if processed_data_list else None
                
                cached_symbol_data = CachedSymbolData(
                    symbol=symbol.upper(),
                    data_points=processed_data_list,
                    latest_timestamp=latest_timestamp,
                    data_points_count=len(processed_data_list)
                )
                
                return {
                    "symbol": symbol,
                    "data_points_fetched": len(processed_data_list),
                    "period_type": interval,
                    "data_provider": "finance_query",
                    "raw_data": cached_symbol_data
                }
                
        except httpx.RequestError as e:
            print(f"HTTP request error for {symbol}: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error processing {symbol}: {e}")
            return None
    
    def _parse_interval_to_minutes(self, interval: str) -> int:
        """Parse interval string to minutes."""
        interval_map = {
            "1m": 1,
            "5m": 5,
            "15m": 15,
            "30m": 30,
            "1h": 60,
            "2h": 120,
            "4h": 240,
            "1d": 1440,
            "1w": 10080,
            "1M": 43200  # Approximate
        }
        return interval_map.get(interval, 5)  # Default to 5 minutes
    
    async def get_symbol_historical_summary(
        self,
        symbol: str,
        period_type: str = "5m",
        access_token: str = None
    ) -> Optional[Dict[str, Any]]:
        """Get fresh historical data summary for a symbol from finance-query API."""
        
        # Fetch fresh data from API
        result = await self._fetch_symbol_historical_data(
            symbol=symbol,
            range_param="1d",
            interval=period_type,
            client=None
        )
        
        if not result or not result.get('raw_data'):
            return None
        
        raw_data = result['raw_data']
        data_points = raw_data.data_points
        
        return {
            "symbol": symbol.upper(),
            "period_type": period_type,
            "total_data_points": len(data_points),
            "earliest_timestamp": data_points[0].period_start.isoformat() if data_points else None,
            "latest_timestamp": data_points[-1].period_start.isoformat() if data_points else None,
            "data_provider": "finance_query",
            "date_range_days": self._calculate_date_range_days_from_objects(data_points) if data_points else 0
        }
    
    def _calculate_date_range_days_from_objects(self, data_points: List[CacheData]) -> int:
        """Calculate the number of days covered by the data points."""
        if len(data_points) < 2:
            return 0
        
        try:
            earliest = data_points[0].period_start
            latest = data_points[-1].period_start
            return (latest - earliest).days
        except (AttributeError, TypeError):
            return 0
    
    # ========================
    # Cache Management
    # ========================
    
    def _get_ttl_for_range(self, range_param: str) -> int:
        """Get TTL (Time To Live) for cache based on data range.
        
        Older data = longer cache (changes less frequently)
        Recent data = shorter cache (changes more often)
        """
        ttl_map = {
            "1d": 300,      # 5 minutes
            "5d": 1800,     # 30 minutes
            "1mo": 3600,    # 1 hour
            "3mo": 7200,    # 2 hours
            "6mo": 14400,   # 4 hours
            "1y": 86400,    # 24 hours
            "2y": 86400,    # 24 hours
            "5y": 172800,   # 48 hours
            "max": 259200   # 72 hours
        }
        return ttl_map.get(range_param, 3600)  # Default: 1 hour
    
    async def invalidate_symbol_cache(
        self,
        symbol: str,
        range_param: str = None,
        interval: str = None
    ) -> int:
        """Manually invalidate cached historical data for a symbol.
        
        Args:
            symbol: Stock symbol
            range_param: Specific range to invalidate (None = all ranges)
            interval: Specific interval to invalidate (None = all intervals)
        
        Returns:
            Number of cache keys deleted
        """
        symbol = symbol.upper().strip()
        deleted = 0
        
        try:
            if range_param and interval:
                # Invalidate specific cache key
                cache_key = f"historical:{symbol}:{range_param}:{interval}"
                success = await self.redis.delete(cache_key, namespace=self.cache_namespace)
                if success:
                    deleted = 1
                    logger.info(f"Invalidated cache: {cache_key}")
            else:
                # Invalidate all caches for this symbol
                pattern = f"historical:{symbol}:*"
                keys = await self.redis.get_all_keys(pattern, namespace=self.cache_namespace)
                
                if keys:
                    for key in keys:
                        if await self.redis.delete(key, namespace=self.cache_namespace):
                            deleted += 1
                    
                    logger.info(f"Invalidated {deleted} cache keys for {symbol}")
            
            return deleted
            
        except Exception as e:
            logger.error(f"Failed to invalidate cache for {symbol}: {e}")
            return 0
    
    async def clear_all_historical_cache(self) -> int:
        """Clear all historical data cache.
        Use with caution - only for maintenance or debugging.
        """
        try:
            pattern = "historical:*"
            keys = await self.redis.get_all_keys(pattern, namespace=self.cache_namespace)
            
            if keys:
                deleted = 0
                for key in keys:
                    if await self.redis.delete(key, namespace=self.cache_namespace):
                        deleted += 1
                
                logger.info(f"Cleared {deleted} historical cache keys")
                return deleted
            
            return 0
            
        except Exception as e:
            logger.error(f"Failed to clear historical cache: {e}")
            return 0
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get statistics about the historical data cache."""
        try:
            pattern = "historical:*"
            keys = await self.redis.get_all_keys(pattern, namespace=self.cache_namespace)
            
            return {
                "total_cached_items": len(keys) if keys else 0,
                "namespace": self.cache_namespace,
                "cache_enabled": self.cache_enabled
            }
            
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {
                "error": str(e),
                "cache_enabled": self.cache_enabled
            }
