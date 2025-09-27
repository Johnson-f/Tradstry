# backend/services/market_data/price_movement_service.py

from typing import List
from .base_service import BaseMarketDataService
from models.market_data import (
    PriceMovement, PriceMovementRequest, TopMover, TopMoversRequest
)

class PriceMovementService(BaseMarketDataService):
    """Service for stock price movement operations."""

    async def get_significant_price_movements_with_news(
        self, 
        request: PriceMovementRequest, 
        access_token: str = None
    ) -> List[PriceMovement]:
        """Get significant price movements with related news."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper() if request.symbol else None,
                'p_days_back': request.days_back,
                'p_min_change_percent': float(request.min_change_percent),
                'p_limit': request.limit,
                'p_data_provider': request.data_provider
            }
            response = client.rpc('get_significant_price_movements_with_news', params).execute()
            return [PriceMovement(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_movers_with_news_today(
        self, 
        request: TopMoversRequest, 
        access_token: str = None
    ) -> List[TopMover]:
        """Get today's top movers with related news."""
        async def operation(client):
            params = {
                'p_limit': request.limit,
                'p_min_change_percent': float(request.min_change_percent)
            }
            response = client.rpc('get_top_movers_with_news_today', params).execute()
            return [TopMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
