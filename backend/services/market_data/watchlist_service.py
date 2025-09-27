# backend/services/market_data/watchlist_service.py

from typing import List, Optional
from .base_service import BaseMarketDataService
from models.market_data import Watchlist, WatchlistItem, WatchlistWithItems

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
