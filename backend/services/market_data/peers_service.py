# backend/services/market_data/peers_service.py

from typing import List, Dict, Any, Optional
from datetime import date
from decimal import Decimal
import httpx
import asyncio
from .base_service import BaseMarketDataService
from models.market_data import StockPeer, StockPeerWithPrices, PeerComparison

class PeersService(BaseMarketDataService):
    """Service for stock peers operations."""

    async def get_stock_peers(
        self, symbol: str, data_date: date = None, limit: int = 20, access_token: str = None
    ) -> List[StockPeer]:
        """Get all peers for a specific stock symbol."""
        async def operation(client):
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_limit': limit
            }
            response = client.rpc('get_stock_peers', params).execute()
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_performing_peers(
        self, symbol: str, data_date: date = None, limit: int = 10, access_token: str = None
    ) -> List[StockPeer]:
        """Get peers for a specific stock (redesigned: no price-based ranking, just metadata)."""
        async def operation(client):
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_limit': limit
            }
            # Use the available get_stock_peers function (no price-based ranking in redesigned schema)
            response = client.rpc('get_stock_peers', params).execute()
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_worst_performing_peers(
        self, symbol: str, data_date: date = None, limit: int = 10, access_token: str = None
    ) -> List[StockPeer]:
        """Get peers for a specific stock (redesigned: no price-based ranking, just metadata)."""
        async def operation(client):
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_limit': limit
            }
            # Use the available get_stock_peers function (no price-based ranking in redesigned schema)
            response = client.rpc('get_stock_peers', params).execute()
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_peer_comparison(
        self, symbol: str, data_date: date = None, access_token: str = None
    ) -> List[PeerComparison]:
        """Get peer comparison with the main stock data."""
        async def operation(client):
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat()
            }
            try:
                response = client.rpc('get_peer_comparison_metadata', params).execute()
                return [PeerComparison(**item) for item in response.data] if response.data else []
            except Exception as e:
                print(f"ERROR in get_peer_comparison_metadata for symbol {symbol}: {e}")
                return []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_peers_paginated(
        self, symbol: str, data_date: date = None, offset: int = 0, limit: int = 20,
        sort_column: str = "symbol", sort_direction: str = "ASC", access_token: str = None
    ) -> List[StockPeer]:
        """Get paginated peer results with sorting options."""
        async def operation(client):
            params = {
                'p_symbol': symbol.upper(),
                'p_data_date': (data_date or date.today()).isoformat(),
                'p_offset': offset,
                'p_limit': limit,
                'p_sort_column': sort_column,
                'p_sort_direction': sort_direction
            }
            response = client.rpc('get_peers_paginated', params).execute()
            return [StockPeer(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def _fetch_real_time_prices(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """Fetch real-time prices from finance-query API for given symbols."""
        if not symbols:
            return {}

        try:
            # Build the API URL with symbols
            symbols_param = ",".join(symbols)
            api_url = f"https://finance-query.onrender.com/v1/simple-quotes"
            params = {"symbols": symbols_param}
            
            print(f"Fetching real-time prices for {len(symbols)} peer symbols: {symbols}")
            
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
                
                print(f"Successfully fetched prices for {len(price_data)} peer symbols")
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

    async def get_stock_peers_with_prices(
        self, 
        symbol: str, 
        data_date: date = None, 
        limit: int = 20, 
        access_token: str = None
    ) -> List[StockPeerWithPrices]:
        """Get stock peers with real-time prices from finance-query API."""
        # First get the basic peers data from database
        peers = await self.get_stock_peers(symbol, data_date, limit, access_token)
        if not peers:
            return []

        # Extract symbols and fetch real-time prices
        symbols = [peer.peer_symbol for peer in peers]
        price_data = await self._fetch_real_time_prices(symbols)
        
        # Combine peer data with price data
        result = []
        for peer in peers:
            symbol_upper = peer.peer_symbol.upper()
            prices = price_data.get(symbol_upper, {})
            
            result.append(StockPeerWithPrices(
                peer_symbol=peer.peer_symbol,
                peer_name=peer.peer_name,
                logo=prices.get('logo') or peer.logo,  # Use API logo if available, fallback to DB
                fetch_timestamp=peer.fetch_timestamp,
                name=prices.get('name') or peer.peer_name,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change')
            ))
        
        return result

    async def get_top_performing_peers_with_prices(
        self, 
        symbol: str, 
        data_date: date = None, 
        limit: int = 10, 
        access_token: str = None
    ) -> List[StockPeerWithPrices]:
        """Get top performing peers with real-time prices from finance-query API."""
        # First get the basic peers data from database
        peers = await self.get_top_performing_peers(symbol, data_date, limit, access_token)
        if not peers:
            return []

        # Extract symbols and fetch real-time prices
        symbols = [peer.peer_symbol for peer in peers]
        price_data = await self._fetch_real_time_prices(symbols)
        
        # Combine peer data with price data
        result = []
        for peer in peers:
            symbol_upper = peer.peer_symbol.upper()
            prices = price_data.get(symbol_upper, {})
            
            result.append(StockPeerWithPrices(
                peer_symbol=peer.peer_symbol,
                peer_name=peer.peer_name,
                logo=prices.get('logo') or peer.logo,  # Use API logo if available, fallback to DB
                fetch_timestamp=peer.fetch_timestamp,
                name=prices.get('name') or peer.peer_name,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change')
            ))
        
        return result
