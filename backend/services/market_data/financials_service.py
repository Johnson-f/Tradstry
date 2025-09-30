# backend/services/market_data/financials_service.py

from typing import List, Optional
from .base_service import BaseMarketDataService
from models.market_data import (
    FundamentalData, FundamentalRequest, KeyStats, KeyStatsRequest,
    IncomeStatement, BalanceSheet, CashFlow, FinancialStatementRequest
)

class FinancialsService(BaseMarketDataService):
    """Service for financial statements and fundamental data."""

    async def get_key_stats(
        self, 
        request: KeyStatsRequest, 
        access_token: str = None
    ) -> Optional[KeyStats]:
        """Get key stats for a stock."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency
            }
            response = client.rpc('get_key_stats', params).execute()
            if response.data and len(response.data) > 0:
                return KeyStats(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_income_statement(
        self, 
        request: FinancialStatementRequest, 
        access_token: str = None
    ) -> List[IncomeStatement]:
        """Get income statement data for a stock."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency,
                'p_limit': request.limit
            }
            response = client.rpc('get_income_statement', params).execute()
            return [IncomeStatement(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_balance_sheet(
        self, 
        request: FinancialStatementRequest, 
        access_token: str = None
    ) -> List[BalanceSheet]:
        """Get balance sheet data for a stock."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency,
                'p_limit': request.limit
            }
            response = client.rpc('get_balance_sheet', params).execute()
            return [BalanceSheet(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)

    async def get_cash_flow(
        self, 
        request: FinancialStatementRequest, 
        access_token: str = None
    ) -> List[CashFlow]:
        """Get cash flow data for a stock."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_frequency': request.frequency,
                'p_limit': request.limit
            }
            response = client.rpc('get_cash_flow', params).execute()
            return [CashFlow(**item) for item in response.data] if response.data else []
        
        return await self._execute_with_retry(operation, access_token)
