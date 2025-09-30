# backend/services/market_data/historical_price_service.py

from typing import List
from .base_service import BaseMarketDataService
from models.market_data import (
    HistoricalPrice, HistoricalPriceRequest, HistoricalPriceSummary, HistoricalPriceSummaryRequest,
    LatestHistoricalPrice, LatestHistoricalPriceRequest, HistoricalPriceRange, HistoricalPriceRangeRequest
)

class HistoricalPriceService(BaseMarketDataService):
    """Service for historical price data operations."""

    async def get_historical_prices(
        self, 
        request: HistoricalPriceRequest, 
        access_token: str = None
    ) -> List[HistoricalPrice]:
        """Get historical price data."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_time_range': request.time_range,
                'p_time_interval': request.time_interval,
                'p_data_provider': request.data_provider,
                'p_limit': request.limit
            }
            response = client.rpc('get_historical_prices', params).execute()
            return [HistoricalPrice(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_historical_prices_by_symbol(
        self, 
        request: HistoricalPriceSummaryRequest, 
        access_token: str = None
    ) -> List[HistoricalPriceSummary]:
        """Get all available intervals for a specific symbol."""
        async def operation(client):
            params = {'p_symbol': request.symbol.upper()}
            response = client.rpc('get_historical_prices_by_symbol', params).execute()
            return [HistoricalPriceSummary(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_latest_historical_prices(
        self, 
        request: LatestHistoricalPriceRequest, 
        access_token: str = None
    ) -> List[LatestHistoricalPrice]:
        """Get the most recent historical price data for a symbol."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_limit': request.limit
            }
            response = client.rpc('get_latest_historical_prices', params).execute()
            return [LatestHistoricalPrice(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_historical_price_range(
        self, 
        request: HistoricalPriceRangeRequest, 
        access_token: str = None
    ) -> List[HistoricalPriceRange]:
        """Get historical prices within a specific date range."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_time_interval': request.time_interval,
                'p_start_date': request.start_date.isoformat(),
                'p_end_date': request.end_date.isoformat(),
                'p_data_provider': request.data_provider
            }
            response = client.rpc('get_historical_price_range', params).execute()
            return [HistoricalPriceRange(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
