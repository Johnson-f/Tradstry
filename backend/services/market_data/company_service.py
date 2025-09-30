# backend/services/market_data/company_service.py

from typing import List, Optional
from .base_service import BaseMarketDataService
from models.market_data import (
    CompanyInfo, CompanyBasic, CompanySearchRequest,
    CompanySectorRequest, CompanySearchTermRequest
)

class CompanyService(BaseMarketDataService):
    """Service for company information operations."""

    async def get_company_info_by_symbol(
        self,
        request: CompanySearchRequest,
        access_token: str = None
    ) -> Optional[CompanyInfo]:
        """Get detailed company information by symbol."""
        async def operation(client):
            params = {'p_symbol': request.symbol.upper()}
            if request.data_provider:
                params['p_data_provider'] = request.data_provider

            response = client.rpc('get_company_info_by_symbol', params).execute()

            if response.data and len(response.data) > 0:
                data = response.data[0]
                if 'yield' in data:
                    data['yield_'] = data.pop('yield')
                return CompanyInfo(**data)
            return None

        return await self._execute_with_retry(operation, access_token)

    async def get_companies_by_sector_industry(
        self,
        request: CompanySectorRequest,
        access_token: str = None
    ) -> List[CompanyBasic]:
        """Get companies filtered by sector and/or industry."""
        async def operation(client):
            params = {
                'p_sector': request.sector,
                'p_industry': request.industry,
                'p_limit': request.limit,
                'p_offset': request.offset
            }
            response = client.rpc('get_companies_by_sector_industry', params).execute()
            result = []
            if response.data:
                for item in response.data:
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    result.append(CompanyBasic(**item))
            return result

        return await self._execute_with_retry(operation, access_token)

    async def search_companies(
        self,
        request: CompanySearchTermRequest,
        access_token: str = None
    ) -> List[CompanyBasic]:
        """Search companies by name or symbol."""
        async def operation(client):
            params = {
                'p_search_term': request.search_term,
                'p_limit': request.limit
            }
            response = client.rpc('search_companies', params).execute()
            result = []
            if response.data:
                for item in response.data:
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    result.append(CompanyBasic(**item))
            return result

        return await self._execute_with_retry(operation, access_token)
