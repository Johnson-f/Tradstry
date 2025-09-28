# backend/services/market_data/movers_service.py

from typing import List, Dict, Any, Optional
from datetime import date
from decimal import Decimal
import httpx
import asyncio
from supabase import Client
from .base_service import BaseMarketDataService
from .logo_service import LogoService
from models.market_data import (
    MarketMover, MarketMoverWithLogo, MarketMoverWithPrices, MarketMoversRequest, CompanyLogosRequest
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

    async def _fetch_real_time_prices(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """Fetch real-time prices from finance-query API for given symbols."""
        if not symbols:
            return {}

        try:
            # Build the API URL with symbols
            symbols_param = ",".join(symbols)
            api_url = f"https://finance-query.onrender.com/v1/simple-quotes"
            params = {"symbols": symbols_param}
            
            print(f"Fetching real-time prices for {len(symbols)} symbols: {symbols}")
            
            # Make HTTP request to finance-query API
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(api_url, params=params)
                
                if response.status_code != 200:
                    print(f"API request failed: {response.status_code}")
                    return {}
                
                data = response.json()
                
                if not data or not isinstance(data, list):
                    print("No data returned from API")
                    return {}
                
                # Convert list to dictionary keyed by symbol
                price_data = {}
                for item in data:
                    if isinstance(item, dict) and 'symbol' in item:
                        symbol = item['symbol'].upper()
                        price_data[symbol] = {
                            'price': self._safe_decimal(item.get('price')),
                            'after_hours_price': self._safe_decimal(item.get('afterHoursPrice')),
                            'change': self._safe_decimal(item.get('change')),
                            'percent_change': item.get('percentChange'),
                            'logo': item.get('logo'),
                            'name': item.get('name')
                        }
                
                print(f"Successfully fetched prices for {len(price_data)} symbols")
                return price_data
                
        except httpx.RequestError as e:
            print(f"HTTP request error: {e}")
            return {}
        except Exception as e:
            print(f"Unexpected error fetching prices: {e}")
            return {}

    def _safe_decimal(self, value: Any) -> Optional[Decimal]:
        """Safely convert string/number to Decimal."""
        if value is None:
            return None
        try:
            # Remove any non-numeric characters except decimal point and minus sign
            if isinstance(value, str):
                cleaned_value = value.replace('%', '').replace('$', '').replace(',', '').strip()
                if cleaned_value == '' or cleaned_value == '-':
                    return None
                return Decimal(cleaned_value)
            return Decimal(str(value))
        except (ValueError, TypeError, Exception):
            return None

    async def get_top_gainers_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithPrices]:
        """Get top gainers with real-time prices from finance-query API."""
        # First get the basic gainers data from database
        gainers = await self.get_top_gainers(request, access_token)
        if not gainers:
            return []

        # Extract symbols and fetch real-time prices
        symbols = [gainer.symbol for gainer in gainers]
        price_data = await self._fetch_real_time_prices(symbols)
        
        # Combine ranking data with price data
        result = []
        for gainer in gainers:
            symbol = gainer.symbol.upper()
            prices = price_data.get(symbol, {})
            
            result.append(MarketMoverWithPrices(
                symbol=gainer.symbol,
                name=prices.get('name') or gainer.name,
                rank_position=gainer.rank_position,
                fetch_timestamp=gainer.fetch_timestamp,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_top_losers_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithPrices]:
        """Get top losers with real-time prices from finance-query API."""
        # First get the basic losers data from database
        losers = await self.get_top_losers(request, access_token)
        if not losers:
            return []

        # Extract symbols and fetch real-time prices
        symbols = [loser.symbol for loser in losers]
        price_data = await self._fetch_real_time_prices(symbols)
        
        # Combine ranking data with price data
        result = []
        for loser in losers:
            symbol = loser.symbol.upper()
            prices = price_data.get(symbol, {})
            
            result.append(MarketMoverWithPrices(
                symbol=loser.symbol,
                name=prices.get('name') or loser.name,
                rank_position=loser.rank_position,
                fetch_timestamp=loser.fetch_timestamp,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_most_active_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> List[MarketMoverWithPrices]:
        """Get most active stocks with real-time prices from finance-query API."""
        # First get the basic most active data from database
        most_active = await self.get_most_active(request, access_token)
        if not most_active:
            return []

        # Extract symbols and fetch real-time prices
        symbols = [stock.symbol for stock in most_active]
        price_data = await self._fetch_real_time_prices(symbols)
        
        # Combine ranking data with price data
        result = []
        for stock in most_active:
            symbol = stock.symbol.upper()
            prices = price_data.get(symbol, {})
            
            result.append(MarketMoverWithPrices(
                symbol=stock.symbol,
                name=prices.get('name') or stock.name,
                rank_position=stock.rank_position,
                fetch_timestamp=stock.fetch_timestamp,
                price=prices.get('price'),
                after_hours_price=prices.get('after_hours_price'),
                change=prices.get('change'),
                percent_change=prices.get('percent_change'),
                logo=prices.get('logo')
            ))
        
        return result

    async def get_market_movers_overview_with_prices(
        self, 
        request: MarketMoversRequest, 
        access_token: str = None
    ) -> Dict[str, Any]:
        """Get comprehensive market movers overview with real-time prices."""
        try:
            # Fetch all three types concurrently with prices
            gainers_task = self.get_top_gainers_with_prices(request, access_token)
            losers_task = self.get_top_losers_with_prices(request, access_token)
            most_active_task = self.get_most_active_with_prices(request, access_token)
            
            gainers, losers, most_active = await asyncio.gather(
                gainers_task, losers_task, most_active_task, return_exceptions=True
            )
            
            # Handle any exceptions
            if isinstance(gainers, Exception):
                print(f"Error fetching gainers: {gainers}")
                gainers = []
            if isinstance(losers, Exception):
                print(f"Error fetching losers: {losers}")
                losers = []
            if isinstance(most_active, Exception):
                print(f"Error fetching most active: {most_active}")
                most_active = []
            
            return {
                "gainers": gainers,
                "losers": losers,
                "most_active": most_active,
                "summary": {
                    "total_gainers": len(gainers),
                    "total_losers": len(losers),
                    "total_most_active": len(most_active),
                    "data_date": request.data_date or date.today(),
                    "includes_real_time_prices": True
                }
            }
            
        except Exception as e:
            print(f"Error in market movers overview: {e}")
            raise
