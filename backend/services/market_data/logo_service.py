# backend/services/market_data/logo_service.py

from typing import List
from .base_service import BaseMarketDataService
from models.market_data import (
    CompanyLogo, CompanyLogosRequest, EarningsCalendarLogo, EarningsCalendarLogosRequest
)

class LogoService(BaseMarketDataService):
    """Service for fetching company logos."""

    async def get_company_logos_batch(
        self, 
        request: CompanyLogosRequest, 
        access_token: str = None
    ) -> List[CompanyLogo]:
        """Get company logos for multiple symbols at once."""
        async def operation(client):
            symbols_array = request.symbols
            params = {'p_symbols': symbols_array}
            response = client.rpc('get_company_logos_batch', params).execute()
            return [CompanyLogo(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_earnings_calendar_logos_batch(
        self, 
        request: EarningsCalendarLogosRequest, 
        access_token: str = None
    ) -> List[EarningsCalendarLogo]:
        """Get company logos for multiple symbols from earnings_calendar table only."""
        async def operation(client):
            symbols_array = request.symbols
            params = {'p_symbols': symbols_array}
            response = client.rpc('get_earnings_calendar_logos_batch', params).execute()
            return [EarningsCalendarLogo(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
