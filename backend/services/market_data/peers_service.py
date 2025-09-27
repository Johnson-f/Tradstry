# backend/services/market_data/peers_service.py

from typing import List
from datetime import date
from .base_service import BaseMarketDataService
from models.market_data import StockPeer, PeerComparison

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
