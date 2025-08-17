"""Polygon.io API Provider Implementation"""

import aiohttp
from typing import Dict, List, Optional, Any
from datetime import datetime, date, timedelta
from decimal import Decimal
from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo
)


class PolygonProvider(MarketDataProvider):
    """Polygon.io API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "Polygon")
        self.base_url = "https://api.polygon.io"
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Optional[Dict]:
        """Make API request to Polygon"""
        if params is None:
            params = {}
        params['apiKey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/{endpoint}"
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('status') == 'ERROR':
                            self._log_error("API Request", Exception(data.get('error', 'Unknown error')))
                            return None
                        return data
                    else:
                        self._log_error("API Request", Exception(f"HTTP {response.status}"))
                        return None
        except Exception as e:
            self._log_error("_make_request", e)
            return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current quote for a symbol"""
        # Get previous close
        prev_close_data = await self._make_request(f"v2/aggs/ticker/{symbol}/prev")
        
        # Get current quote
        quote_data = await self._make_request(f"v3/quotes/{symbol}")
        
        if not quote_data or 'results' not in quote_data:
            return None
        
        try:
            quote = quote_data['results'][0] if quote_data['results'] else {}
            prev_close = Decimal(str(prev_close_data['results'][0]['c'])) if prev_close_data and 'results' in prev_close_data else None
            
            last_price = Decimal(str(quote.get('last_quote', {}).get('P', 0)))
            
            return StockQuote(
                symbol=symbol,
                price=last_price,
                change=Decimal(str(last_price - prev_close)) if prev_close else Decimal('0'),
                change_percent=Decimal(str(((last_price - prev_close) / prev_close * 100))) if prev_close and prev_close != 0 else Decimal('0'),
                volume=0,  # Not available in quote
                open=None,
                high=None,
                low=None,
                previous_close=prev_close,
                timestamp=datetime.now(),
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_quote", e)
            return None
    
    async def get_historical(
        self, 
        symbol: str, 
        start_date: date, 
        end_date: date,
        interval: str = "1d"
    ) -> Optional[List[HistoricalPrice]]:
        """Get historical prices for a symbol"""
        # Map interval to Polygon timespan
        timespan_map = {
            "1min": "minute",
            "5min": "minute",
            "15min": "minute",
            "30min": "minute",
            "60min": "hour",
            "1d": "day",
            "daily": "day",
            "1w": "week",
            "weekly": "week",
            "1m": "month",
            "monthly": "month"
        }
        
        multiplier_map = {
            "1min": 1,
            "5min": 5,
            "15min": 15,
            "30min": 30,
            "60min": 1,
            "1d": 1,
            "daily": 1,
            "1w": 1,
            "weekly": 1,
            "1m": 1,
            "monthly": 1
        }
        
        timespan = timespan_map.get(interval, "day")
        multiplier = multiplier_map.get(interval, 1)
        
        endpoint = f"v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{start_date.strftime('%Y-%m-%d')}/{end_date.strftime('%Y-%m-%d')}"
        
        data = await self._make_request(endpoint, {'adjusted': 'true', 'sort': 'asc', 'limit': 5000})
        
        if not data or 'results' not in data:
            return None
        
        try:
            prices = []
            for bar in data['results']:
                price_date = datetime.fromtimestamp(bar['t'] / 1000).date()
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_date,
                    open=Decimal(str(bar['o'])),
                    high=Decimal(str(bar['h'])),
                    low=Decimal(str(bar['l'])),
                    close=Decimal(str(bar['c'])),
                    volume=int(bar['v']),
                    provider=self.name
                ))
            
            return prices
        except Exception as e:
            self._log_error("get_historical", e)
            return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        data = await self._make_request(f"v3/reference/tickers/{symbol}")
        
        if not data or 'results' not in data:
            return None
        
        try:
            info = data['results']
            return CompanyInfo(
                symbol=symbol,
                name=info.get('name', ''),
                exchange=info.get('primary_exchange'),
                sector=info.get('sic_description'),
                industry=info.get('sic_description'),
                market_cap=int(info.get('market_cap', 0)) if info.get('market_cap') else None,
                employees=int(info.get('total_employees', 0)) if info.get('total_employees') else None,
                description=info.get('description'),
                website=info.get('homepage_url'),
                ceo=None,  # Not provided
                headquarters=f"{info.get('address', {}).get('city', '')}, {info.get('address', {}).get('state', '')}".strip(', '),
                founded=None,  # Not provided
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_company_info", e)
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Get options chain for a symbol"""
        # Get contracts list
        endpoint = f"v3/reference/options/contracts"
        params = {
            'underlying_ticker': symbol,
            'limit': 1000,
            'sort': 'expiration_date'
        }
        
        if expiration:
            params['expiration_date'] = expiration.strftime('%Y-%m-%d')
        
        data = await self._make_request(endpoint, params)
        
        if not data or 'results' not in data:
            return None
        
        try:
            options = []
            for contract in data['results']:
                # Get quote for each contract
                contract_symbol = contract['ticker']
                quote_data = await self._make_request(f"v3/snapshot/options/contract/{contract_symbol}")
                
                if quote_data and 'results' in quote_data:
                    quote = quote_data['results']
                    
                    options.append(OptionQuote(
                        symbol=contract_symbol,
                        underlying_symbol=symbol,
                        strike=Decimal(str(contract['strike_price'])),
                        expiration=datetime.strptime(contract['expiration_date'], '%Y-%m-%d').date(),
                        option_type='call' if contract['contract_type'] == 'call' else 'put',
                        bid=Decimal(str(quote.get('last_quote', {}).get('bid', 0))),
                        ask=Decimal(str(quote.get('last_quote', {}).get('ask', 0))),
                        last_price=Decimal(str(quote.get('last_quote', {}).get('last', 0))),
                        volume=quote.get('day', {}).get('volume', 0),
                        open_interest=quote.get('open_interest', 0),
                        implied_volatility=Decimal(str(quote.get('implied_volatility', 0))),
                        delta=Decimal(str(quote.get('greeks', {}).get('delta', 0))),
                        gamma=Decimal(str(quote.get('greeks', {}).get('gamma', 0))),
                        theta=Decimal(str(quote.get('greeks', {}).get('theta', 0))),
                        vega=Decimal(str(quote.get('greeks', {}).get('vega', 0))),
                        timestamp=datetime.now(),
                        provider=self.name
                    ))
            
            return options
        except Exception as e:
            self._log_error("get_options_chain", e)
            return None
    
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get news articles"""
        params = {'limit': limit}
        
        if symbol:
            params['ticker'] = symbol
        
        data = await self._make_request("v2/reference/news", params)
        
        if not data or 'results' not in data:
            return None
        
        return data['results']
    
    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get dividend data"""
        data = await self._make_request(f"v3/reference/dividends", {'ticker': symbol})
        
        if not data or 'results' not in data:
            return None
        
        return data['results']
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental financials"""
        data = await self._make_request(f"vX/reference/financials", {
            'ticker': symbol,
            'limit': 1
        })
        
        if not data or 'results' not in data or not data['results']:
            return None
        
        financials = data['results'][0].get('financials', {})
        
        return {
            'symbol': symbol,
            'provider': self.name,
            'eps': financials.get('income_statement', {}).get('diluted_earnings_per_share', {}).get('value'),
            'revenue': financials.get('income_statement', {}).get('revenues', {}).get('value'),
            'gross_profit': financials.get('income_statement', {}).get('gross_profit', {}).get('value'),
            'operating_income': financials.get('income_statement', {}).get('operating_income', {}).get('value'),
            'net_income': financials.get('income_statement', {}).get('net_income_loss', {}).get('value'),
            'total_assets': financials.get('balance_sheet', {}).get('assets', {}).get('value'),
            'total_liabilities': financials.get('balance_sheet', {}).get('liabilities', {}).get('value'),
            'shareholders_equity': financials.get('balance_sheet', {}).get('equity', {}).get('value'),
            'operating_cash_flow': financials.get('cash_flow_statement', {}).get('net_cash_flow_from_operating_activities', {}).get('value')
        }
