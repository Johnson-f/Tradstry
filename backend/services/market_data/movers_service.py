# backend/services/market_data/movers_service.py

from typing import List, Dict, Any, Optional
from datetime import date
from decimal import Decimal
import httpx
import asyncio
import logging
from supabase import Client
from .base_service import BaseMarketDataService
from .symbol_registry_cache import (
    symbol_registry,
    SymbolSource,
    get_all_symbols_for_updates
)
from .price_cache_service import get_cached_prices
from .logo_service import LogoService
from .movers_cache_service import (
    movers_cache_service,
    MoverType,
    get_cached_movers_list,
    cache_movers_list
)
from models.market_data import (
    MarketMover, 
    MarketMoverWithPrices, 
    MarketMoverWithLogo,
    MarketMoversRequest, 
    CompanyLogosRequest
)

logger = logging.getLogger(__name__)

class MoversService(BaseMarketDataService):
    """Service for market movers (gainers, losers, active) with cache integration."""

    def __init__(self, supabase: Client = None, logo_service: LogoService = None):
        super().__init__(supabase)
        self.logo_service = logo_service or LogoService(self.supabase)
        self.cache_enabled = True  # Feature flag for cache

    async def get_top_gainers(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """
        Get top gainers with Redis cache integration.
        
        Flow:
        1. Check Redis cache (fast, ~1-5ms)
        2. If cache miss, query database (~100-300ms)
        3. Cache result for next request
        
        Cache TTL: 5 minutes (market movers change frequently)
        """
        # Try cache first
        if self.cache_enabled:
            cached_movers = await get_cached_movers_list(
                MoverType.GAINERS,
                limit=request.limit,
                data_date=request.data_date
            )
            
            if cached_movers:
                return [MarketMover(**item) for item in cached_movers]
        
        # Cache miss - query database
        async def operation(client):
            target_date = request.data_date.isoformat() if request.data_date else date.today().isoformat()
            params = {
                'p_data_date': target_date,
                'p_limit': request.limit
            }
            response = client.rpc('get_top_gainers', params).execute()
            
            # If no data for target date, try getting the most recent data
            if not response.data:
                logger.info(f"No gainers for {target_date}, fetching latest available data")
                latest_params = {'p_limit': request.limit}
                latest_response = client.rpc('get_top_gainers_latest', latest_params).execute()
                return [MarketMover(**item) for item in latest_response.data] if latest_response.data else []
            
            return [MarketMover(**item) for item in response.data]
        
        movers = await self._execute_with_retry(operation, access_token)
        
        # Cache for next request
        if self.cache_enabled and movers:
            movers_data = [m.dict() for m in movers]
            await cache_movers_list(
                MoverType.GAINERS,
                movers_data,
                limit=request.limit,
                data_date=request.data_date
            )
        
        return movers
    async def get_top_losers(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """
        Get top losers with Redis cache integration.
        
        Cache TTL: 5 minutes
        """
        # Try cache first
        if self.cache_enabled:
            cached_movers = await get_cached_movers_list(
                MoverType.LOSERS,
                limit=request.limit,
                data_date=request.data_date
            )
            
            if cached_movers:
                return [MarketMover(**item) for item in cached_movers]
        
        # Cache miss - query database
        async def operation(client):
            target_date = request.data_date.isoformat() if request.data_date else date.today().isoformat()
            params = {
                'p_data_date': target_date,
                'p_limit': request.limit
            }
            response = client.rpc('get_top_losers', params).execute()
            
            # If no data for target date, try getting the most recent data
            if not response.data:
                logger.info(f"No losers for {target_date}, fetching latest available data")
                latest_params = {'p_limit': request.limit}
                latest_response = client.rpc('get_top_losers_latest', latest_params).execute()
                return [MarketMover(**item) for item in latest_response.data] if latest_response.data else []
            
            return [MarketMover(**item) for item in response.data]
        
        movers = await self._execute_with_retry(operation, access_token)
        
        # Cache for next request
        if self.cache_enabled and movers:
            movers_data = [m.dict() for m in movers]
            await cache_movers_list(
                MoverType.LOSERS,
                movers_data,
                limit=request.limit,
                data_date=request.data_date
            )
        
        return movers

    async def get_most_active(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """
        Get most active stocks with Redis cache integration.
        
        Cache TTL: 5 minutes
        """
        # Try cache first
        if self.cache_enabled:
            cached_movers = await get_cached_movers_list(
                MoverType.MOST_ACTIVE,
                limit=request.limit,
                data_date=request.data_date
            )
            
            if cached_movers:
                return [MarketMover(**item) for item in cached_movers]
        
        # Cache miss - query database
        async def operation(client):
            target_date = request.data_date.isoformat() if request.data_date else date.today().isoformat()
            params = {
                'p_data_date': target_date,
                'p_limit': request.limit
            }
            response = client.rpc('get_most_active', params).execute()
            
            # If no data for target date, try getting the most recent data
            if not response.data:
                logger.info(f"No active stocks for {target_date}, fetching latest available data")
                latest_params = {'p_limit': request.limit}
                latest_response = client.rpc('get_most_active_latest', latest_params).execute()
                return [MarketMover(**item) for item in latest_response.data] if latest_response.data else []
            
            return [MarketMover(**item) for item in response.data]
        
        movers = await self._execute_with_retry(operation, access_token)
        
        # Cache for next request
        if self.cache_enabled and movers:
            movers_data = [m.dict() for m in movers]
            await cache_movers_list(
                MoverType.MOST_ACTIVE,
                movers_data,
                limit=request.limit,
                data_date=request.data_date
            )
        
        return movers

    async def get_top_gainers_with_logos(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithLogo]:
        """Get top gainers with company logos."""
        gainers = await self.get_top_gainers(request, access_token)
        if not gainers:
            return []
        
        symbols = [gainer.symbol for gainer in gainers]
        logos = await self.logo_service.get_company_logos_batch(CompanyLogosRequest(symbols=symbols), access_token)
        logo_dict = {logo.symbol: logo.logo for logo in logos}
        
        result = []
        for gainer in gainers:
            result.append(MarketMoverWithLogo(
                **gainer.dict(), logo=logo_dict.get(gainer.symbol)
            ))
        return result

    async def get_top_losers_with_logos(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithLogo]:
        """Get top losers with company logos."""
        losers = await self.get_top_losers(request, access_token)
        if not losers:
            return []

        symbols = [loser.symbol for loser in losers]
        logos = await self.logo_service.get_company_logos_batch(CompanyLogosRequest(symbols=symbols), access_token)
        logo_dict = {logo.symbol: logo.logo for logo in logos}

        result = []
        for loser in losers:
            result.append(MarketMoverWithLogo(
                **loser.dict(), logo=logo_dict.get(loser.symbol)
            ))
        return result

    async def get_most_active_with_logos(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithLogo]:
        """Get most active stocks with company logos."""
        most_active = await self.get_most_active(request, access_token)
        if not most_active:
            return []

        symbols = [stock.symbol for stock in most_active]
        logos = await self.logo_service.get_company_logos_batch(CompanyLogosRequest(symbols=symbols), access_token)
        logo_dict = {logo.symbol: logo.logo for logo in logos}

        result = []
        for stock in most_active:
            result.append(MarketMoverWithLogo(
                **stock.dict(), logo=logo_dict.get(stock.symbol)
            ))
        return result

    async def _fetch_real_time_prices(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """Fetch real-time prices from finance-query API for given symbols."""
        if not symbols:
            return {}

        try:
            # Build the API URL with symbols
            symbols_param = ",".join(symbols)
            api_url = f"https://finance-query.onrender.com/v1/simple-quotes"
            params = {"symbols": symbols_param}
            
            print(f"Fetching real-time prices for {len(symbols)} symbols: {symbols}")
            
            # Make HTTP request to finance-query API
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(api_url, params=params)
                
                if response.status_code != 200:
                    print(f"API request failed: {response.status_code}")
                    return {}
                
                data = response.json()
                
                if not data or not isinstance(data, list):
                    print("No data returned from API")
                    return {}
                
                # Convert list to dictionary keyed by symbol
                price_data = {}
                for item in data:
                    if isinstance(item, dict) and 'symbol' in item:
                        symbol = item['symbol'].upper()
                        price_data[symbol] = {
                            'price': self._safe_decimal(item.get('price')),
                            'after_hours_price': self._safe_decimal(item.get('afterHoursPrice')),
                            'change': self._safe_decimal(item.get('change')),
                            'percent_change': item.get('percentChange'),
                            'logo': item.get('logo'),
                            'name': item.get('name')
                        }
                
                print(f"Successfully fetched prices for {len(price_data)} symbols")
                return price_data
                
        except httpx.RequestError as e:
            print(f"HTTP request error: {e}")
            return {}
        except Exception as e:
            print(f"Unexpected error fetching prices: {e}")
            return {}

    def _safe_decimal(self, value: Any) -> Optional[Decimal]:
        """Safely convert string/number to Decimal."""
        if value is None:
            return None
        try:
            # Remove any non-numeric characters except decimal point and minus sign
            if isinstance(value, str):
                cleaned_value = value.replace('%', '').replace('$', '').replace(',', '').strip()
                if cleaned_value == '' or cleaned_value == '-':
                    return None
                return Decimal(cleaned_value)
            return Decimal(str(value))
        except (ValueError, TypeError, Exception):
            return None

    async def get_top_gainers_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithPrices]:
        """Get top gainers with real-time prices from finance-query API."""
        # Get gainers (from cache or database)
        gainers = await self.get_top_gainers(request, access_token)
        if not gainers:
            return []

        # Extract symbols and fetch real-time prices from cache
        symbols = [gainer.symbol for gainer in gainers]
        price_data = await get_cached_prices(symbols)
        
        # Combine ranking data with price data
        result = []
        for gainer in gainers:
            symbol = gainer.symbol.upper()
            prices = price_data.get(symbol, {})
            
            result.append(MarketMoverWithPrices(
                symbol=gainer.symbol,
                name=prices.get('name') or gainer.name,
                rank_position=gainer.rank_position,
                fetch_timestamp=gainer.fetch_timestamp,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_top_losers_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithPrices]:
        """Get top losers with real-time prices from finance-query API."""
        # Get losers (from cache or database)
        losers = await self.get_top_losers(request, access_token)
        if not losers:
            return []

        # Extract symbols and fetch real-time prices from cache
        symbols = [loser.symbol for loser in losers]
        price_data = await get_cached_prices(symbols)
        
        # Combine ranking data with price data
        result = []
        for loser in losers:
            symbol = loser.symbol.upper()
            prices = price_data.get(symbol, {})
            
            result.append(MarketMoverWithPrices(
                symbol=loser.symbol,
                name=prices.get('name') or loser.name,
                rank_position=loser.rank_position,
                fetch_timestamp=loser.fetch_timestamp,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_most_active_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithPrices]:
        """Get most active stocks with real-time prices from finance-query API."""
        # Get most active (from cache or database)
        most_active = await self.get_most_active(request, access_token)
        if not most_active:
            return []

        # Extract symbols and fetch real-time prices from cache
        symbols = [stock.symbol for stock in most_active]
        price_data = await get_cached_prices(symbols)
        
        # Combine ranking data with price data
        result = []
        for stock in most_active:
            symbol = stock.symbol.upper()
            prices = price_data.get(symbol, {})
            
            result.append(MarketMoverWithPrices(
                symbol=stock.symbol,
                name=prices.get('name') or stock.name,
                rank_position=stock.rank_position,
                fetch_timestamp=stock.fetch_timestamp,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_market_movers_overview_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> Dict[str, Any]:
        """Get comprehensive market movers overview with real-time prices."""
        try:
            # Fetch all three types concurrently with prices
            gainers_task = self.get_top_gainers_with_prices(request, access_token)
            losers_task = self.get_top_losers_with_prices(request, access_token)
            most_active_task = self.get_most_active_with_prices(request, access_token)
            
            gainers, losers, most_active = await asyncio.gather(
                gainers_task, losers_task, most_active_task, return_exceptions=True
            )
            
            # Handle any exceptions
            if isinstance(gainers, Exception):
                print(f"Error fetching gainers: {gainers}")
                gainers = []
            if isinstance(losers, Exception):
                print(f"Error fetching losers: {losers}")
                losers = []
            if isinstance(most_active, Exception):
                print(f"Error fetching most active: {most_active}")
                most_active = []
            
            return {
                "gainers": gainers,
                "losers": losers,
                "most_active": most_active,
                "summary": {
                    "total_gainers": len(gainers),
                    "total_losers": len(losers),
                    "total_most_active": len(most_active),
                    "data_date": request.data_date or date.today(),
                    "includes_real_time_prices": True
                }
            }
        except Exception as e:
            print(f"Error in get_all_movers_with_prices: {e}")
            return {
                "gainers": [],
                "losers": [],
                "most_active": [],
                "summary": {
                    "total_gainers": 0,
                    "total_losers": 0,
                    "total_most_active": 0,
                    "error": str(e)
                }
            }
    
    # ========================
    # Cache-Powered Operations
    # ========================
    
    async def get_all_mover_symbols_from_cache(self) -> List[str]:
        """
        Get all market mover symbols from Redis cache.
        
        Fast lookup (1-5ms) instead of database query (100-300ms).
        Uses Symbol Registry Cache for instant symbol retrieval.
        """
        if not self.cache_enabled:
            return await self._get_mover_symbols_from_database()
        
        try:
            # Get from Redis cache (fast! ~1-5ms)
            symbols = await get_mover_symbols()
            
            if symbols:
                return symbols
            return await self._get_mover_symbols_from_database()
            
        except Exception as e:
            logger.error(f"❌ Cache lookup failed: {e}. Falling back to database")
            return await self._get_mover_symbols_from_database()
    
    async def batch_fetch_mover_prices(
        self,
        access_token: str = None
    ) -> Dict[str, Any]:
        """
        Batch fetch prices for all market mover symbols using cache.
        
        More efficient than querying database for symbols.
        """
        logger.info("Fetching prices for cached mover symbols")
        
        try:
            # Get symbols from cache
            symbols = await self.get_all_mover_symbols_from_cache()
            
            if not symbols:
                logger.warning("No mover symbols to fetch prices for")
                return {}
            
            logger.info(f"Fetching prices for {len(symbols)} cached mover symbols")
            
            # Batch fetch prices from cache
            prices = await get_cached_prices(symbols)
            return prices
            
        except Exception as e:
            logger.error(f"Batch price fetch failed: {e}")
            return {}
    
    async def _get_mover_symbols_from_database(self, access_token: str = None) -> List[str]:
        """
        Fallback: Get mover symbols from database when cache unavailable.
        
        This should RARELY be called. If you see this log frequently,
        check Symbol Registry Cache health.
        """
        logger.warning("⚠️ Using DATABASE fallback for mover symbol lookup (slow path)")
        
        try:
            async def operation(client):
                response = client.table('market_movers').select('symbol').execute()
                return list(set([row['symbol'] for row in response.data])) if response.data else []
            
            symbols = await self._execute_with_retry(operation, access_token)
            return symbols
            
        except Exception as e:
            logger.error(f"❌ Database fallback failed: {e}")
            return []
            raise
