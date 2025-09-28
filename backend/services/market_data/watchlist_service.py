# backend/services/market_data/watchlist_service.py

from typing import List, Optional, Dict, Any
from decimal import Decimal
import httpx
import asyncio
from .base_service import BaseMarketDataService
from models.market_data import (
    Watchlist, WatchlistItem, WatchlistItemWithPrices, 
    WatchlistWithItems, WatchlistWithItemsAndPrices
)

class WatchlistService(BaseMarketDataService):
    """Service for user watchlist operations."""

    async def get_user_watchlists(self, access_token: str = None) -> List[Watchlist]:
        """Get all watchlists for the authenticated user."""
        async def operation(client):
            response = client.rpc('get_user_watchlists').execute()
            return [Watchlist(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_watchlist_items(self, watchlist_id: int, access_token: str = None) -> List[WatchlistItem]:
        """Get all items in a specific watchlist."""
        async def operation(client):
            params = {'p_watchlist_id': watchlist_id}
            response = client.rpc('get_watchlist_items', params).execute()
            return [WatchlistItem(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def create_watchlist(self, name: str, access_token: str = None) -> int:
        """Create a new watchlist for the authenticated user."""
        async def operation(client):
            params = {'p_name': name}
            response = client.rpc('upsert_watchlist', params).execute()
            if response.data is not None:
                if isinstance(response.data, list) and len(response.data) > 0:
                    return response.data[0]
                elif isinstance(response.data, int):
                    return response.data
            raise Exception("Failed to create watchlist")
        
        return await self._execute_with_retry(operation, access_token)

    async def add_watchlist_item(
        self, watchlist_id: int, symbol: str, company_name: str = None, 
        price: float = None, percent_change: float = None, access_token: str = None
    ) -> int:
        """Add an item to a watchlist."""
        async def operation(client):
            params = {
                'p_watchlist_id': watchlist_id,
                'p_symbol': symbol.upper(),
                'p_company_name': company_name,
                'p_price': price,
                'p_percent_change': percent_change
            }
            response = client.rpc('upsert_watchlist_item', params).execute()
            if response.data is not None:
                if isinstance(response.data, int):
                    return response.data
                elif isinstance(response.data, list) and len(response.data) > 0:
                    return response.data[0]
            raise Exception("Failed to add item to watchlist")
        
        return await self._execute_with_retry(operation, access_token)

    async def delete_watchlist(self, watchlist_id: int, access_token: str = None) -> bool:
        """Delete a watchlist."""
        async def operation(client):
            params = {'p_watchlist_id': watchlist_id}
            response = client.rpc('delete_watchlist', params).execute()
            if response.data is not None:
                return response.data if isinstance(response.data, bool) else response.data[0]
            return False
        
        return await self._execute_with_retry(operation, access_token)

    async def delete_watchlist_item(self, item_id: int, access_token: str = None) -> bool:
        """Delete a watchlist item by ID."""
        async def operation(client):
            params = {'p_item_id': item_id}
            response = client.rpc('delete_watchlist_item', params).execute()
            if response.data is not None:
                return response.data if isinstance(response.data, bool) else response.data[0]
            return False
        
        return await self._execute_with_retry(operation, access_token)

    async def delete_watchlist_item_by_symbol(self, watchlist_id: int, symbol: str, access_token: str = None) -> bool:
        """Delete a watchlist item by symbol."""
        async def operation(client):
            params = {'p_watchlist_id': watchlist_id, 'p_symbol': symbol.upper()}
            response = client.rpc('delete_watchlist_item_by_symbol', params).execute()
            if response.data is not None:
                return response.data if isinstance(response.data, bool) else response.data[0]
            return False
        
        return await self._execute_with_retry(operation, access_token)

    async def clear_watchlist(self, watchlist_id: int, access_token: str = None) -> int:
        """Clear all items from a watchlist."""
        async def operation(client):
            params = {'p_watchlist_id': watchlist_id}
            response = client.rpc('clear_watchlist', params).execute()
            if response.data is not None:
                return response.data if isinstance(response.data, int) else response.data[0]
            return 0
        
        return await self._execute_with_retry(operation, access_token)

    async def get_watchlist_with_items(self, watchlist_id: int, access_token: str = None) -> Optional[WatchlistWithItems]:
        """Get a watchlist with all its items."""
        watchlists = await self.get_user_watchlists(access_token)
        watchlist = next((w for w in watchlists if w.id == watchlist_id), None)
        if not watchlist:
            return None
        
        items = await self.get_watchlist_items(watchlist_id, access_token)
        return WatchlistWithItems(**watchlist.dict(), items=items)

    async def _fetch_real_time_prices(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """Fetch real-time prices from finance-query API for given symbols."""
        if not symbols:
            return {}

        try:
            # Build the API URL with symbols
            symbols_param = ",".join(symbols)
            api_url = f"https://finance-query.onrender.com/v1/simple-quotes"
            params = {"symbols": symbols_param}
            
            print(f"Fetching real-time prices for {len(symbols)} watchlist symbols: {symbols}")
            
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
                
                print(f"Successfully fetched prices for {len(price_data)} watchlist symbols")
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

    async def get_watchlist_items_with_prices(self, watchlist_id: int, access_token: str = None) -> List[WatchlistItemWithPrices]:
        """Get watchlist items with real-time prices from finance-query API."""
        # First get the basic watchlist items from database
        items = await self.get_watchlist_items(watchlist_id, access_token)
        if not items:
            return []

        # Extract symbols and fetch real-time prices
        symbols = [item.symbol for item in items]
        price_data = await self._fetch_real_time_prices(symbols)
        
        # Combine item data with price data
        result = []
        for item in items:
            symbol_upper = item.symbol.upper()
            prices = price_data.get(symbol_upper, {})
            
            result.append(WatchlistItemWithPrices(
                id=item.id,
                symbol=item.symbol,
                company_name=item.company_name,
                added_at=item.added_at,
                updated_at=item.updated_at,
                name=prices.get('name') or item.company_name,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_watchlist_with_items_and_prices(self, watchlist_id: int, access_token: str = None) -> Optional[WatchlistWithItemsAndPrices]:
        """Get a watchlist with all its items enriched with real-time prices."""
        watchlists = await self.get_user_watchlists(access_token)
        watchlist = next((w for w in watchlists if w.id == watchlist_id), None)
        if not watchlist:
            return None
        
        items_with_prices = await self.get_watchlist_items_with_prices(watchlist_id, access_token)
        return WatchlistWithItemsAndPrices(**watchlist.dict(), items=items_with_prices)

    async def get_user_watchlists_with_prices(self, access_token: str = None) -> List[WatchlistWithItemsAndPrices]:
        """Get all user watchlists with items enriched with real-time prices."""
        watchlists = await self.get_user_watchlists(access_token)
        result = []
        
        for watchlist in watchlists:
            items_with_prices = await self.get_watchlist_items_with_prices(watchlist.id, access_token)
            result.append(WatchlistWithItemsAndPrices(**watchlist.dict(), items=items_with_prices))
        
        return result
