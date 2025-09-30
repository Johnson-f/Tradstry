# backend/services/market_data/earnings_service.py

from typing import Optional
from datetime import date
from .base_service import BaseMarketDataService
from models.market_data import DailyEarningsSummary, EarningsRequest

class EarningsService(BaseMarketDataService):
    """Service for earnings-related operations."""

    async def get_daily_earnings_summary(
        self, 
        request: EarningsRequest, 
        access_token: str = None
    ) -> Optional[DailyEarningsSummary]:
        """Get comprehensive daily earnings summary."""
        async def operation(client):
            target_date = request.target_date or date.today()
            
            response = client.rpc(
                'get_daily_earnings_summary',
                {'target_date': target_date.isoformat()}
            ).execute()
            
            if response.data and len(response.data) > 0:
                return DailyEarningsSummary(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)
