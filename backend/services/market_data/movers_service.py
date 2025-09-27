# backend/services/market_data/movers_service.py

from typing import List
from datetime import date
from supabase import Client
from .base_service import BaseMarketDataService
from .logo_service import LogoService
from models.market_data import (
    MarketMover, MarketMoverWithLogo, MarketMoversRequest, CompanyLogosRequest
)

class MoversService(BaseMarketDataService):
    """Service for market movers (gainers, losers, active)."""

    def __init__(self, supabase: Client = None, logo_service: LogoService = None):
        super().__init__(supabase)
        self.logo_service = logo_service or LogoService(self.supabase)

    async def get_top_gainers(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """Get top gainers for a specific date."""
        async def operation(client):
            params = {
                'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
                'p_limit': request.limit
            }
            response = client.rpc('get_top_gainers', params).execute()
            return [MarketMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_top_losers(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """Get top losers for a specific date."""
        async def operation(client):
            params = {
                'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
                'p_limit': request.limit
            }
            response = client.rpc('get_top_losers', params).execute()
            return [MarketMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_most_active(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMover]:
        """Get most active stocks for a specific date."""
        async def operation(client):
            params = {
                'p_data_date': request.data_date.isoformat() if request.data_date else date.today().isoformat(),
                'p_limit': request.limit
            }
            response = client.rpc('get_most_active', params).execute()
            return [MarketMover(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

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
