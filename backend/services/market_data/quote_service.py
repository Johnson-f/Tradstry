# backend/services/market_data/quote_service.py

from typing import Optional
from datetime import date
from .base_service import BaseMarketDataService
from models.market_data import (
    StockQuote, StockQuoteRequest, QuoteRequest, QuoteResponse, QuoteResult
)

class QuoteService(BaseMarketDataService):
    """Service for stock quote and metric operations."""

    async def get_stock_quotes(
        self, 
        request: StockQuoteRequest, 
        access_token: str = None
    ) -> Optional[StockQuote]:
        """Get stock quote data."""
        async def operation(client):
            params = {
                'p_symbol': request.symbol.upper(),
                'p_quote_date': request.quote_date.isoformat() if request.quote_date else date.today().isoformat(),
                'p_data_provider': request.data_provider
            }
            response = client.rpc('get_stock_quotes', params).execute()
            if response.data and len(response.data) > 0:
                return StockQuote(**response.data[0])
            return None
        
        return await self._execute_with_retry(operation, access_token)

    async def get_quotes(
        self, 
        request: QuoteRequest, 
        access_token: str = None
    ) -> QuoteResponse:
        """Get stock quotes from database instead of external API."""
        async def operation(client):
            symbols_array = [s.upper() for s in request.symbols]
            params = {'p_symbols': symbols_array}
            response = client.rpc('get_company_info_by_symbols', params).execute()
            
            results = []
            if response.data:
                for item in response.data:
                    if 'yield' in item:
                        item['yield_'] = item.pop('yield')
                    
                    result = QuoteResult(
                        symbol=item.get('symbol', ''),
                        name=item.get('name') or item.get('company_name') or item.get('symbol', ''),
                        price=float(item.get('price', 0) or 0),
                        change=float(item.get('change', 0) or 0),
                        changePercent=float(item.get('percent_change', 0) or 0),
                        dayHigh=float(item.get('high', 0) or 0),
                        dayLow=float(item.get('low', 0) or 0),
                        volume=int(item.get('volume', 0) or 0),
                        marketCap=item.get('market_cap'),
                        logo=item.get('logo')
                    )
                    results.append(result)
            
            found_symbols = {r.symbol.upper() for r in results}
            for symbol in request.symbols:
                if symbol.upper() not in found_symbols:
                    result = QuoteResult(
                        symbol=symbol,
                        name=symbol,
                        price=0.0,
                        change=0.0,
                        changePercent=0.0,
                        dayHigh=0.0,
                        dayLow=0.0,
                        volume=0
                    )
                    results.append(result)
            
            return QuoteResponse(quotes=results)
        
        return await self._execute_with_retry(operation, access_token)
