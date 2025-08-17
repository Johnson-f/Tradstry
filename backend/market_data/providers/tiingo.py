"""Tiingo API Provider Implementation"""

import aiohttp
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from decimal import Decimal
from ..base import (
    MarketDataProvider, 
    StockQuote, 
    HistoricalPrice, 
    OptionQuote, 
    CompanyInfo
)


class TiingoProvider(MarketDataProvider):
    """Tiingo API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "Tiingo")
        self.base_url = "https://api.tiingo.com"
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Optional[Dict]:
        """Make API request to Tiingo"""
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Token {self.api_key}'
        }
        
        if params is None:
            params = {}
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/{endpoint}"
                async with session.get(url, params=params, headers=headers) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        self._log_error("API Request", Exception(f"HTTP {response.status}"))
                        return None
        except Exception as e:
            self._log_error("_make_request", e)
            return None
    
    async def get_quote(self, symbol: str) -> Optional[StockQuote]:
        """Get current quote for a symbol"""
        data = await self._make_request(f"tiingo/daily/{symbol}/prices")
        
        if not data or not isinstance(data, list) or len(data) == 0:
            return None
        
        try:
            latest = data[0]
            
            # Get IEX quote for real-time data
            iex_data = await self._make_request(f"iex/{symbol}")
            if iex_data and isinstance(iex_data, list) and len(iex_data) > 0:
                iex = iex_data[0]
                return StockQuote(
                    symbol=symbol,
                    price=Decimal(str(iex.get('last', latest['close']))),
                    change=Decimal(str(iex.get('last', latest['close']))) - Decimal(str(iex.get('prevClose', latest['close']))),
                    change_percent=Decimal(str((Decimal(str(iex.get('last', latest['close']))) - Decimal(str(iex.get('prevClose', latest['close'])))) / Decimal(str(iex.get('prevClose', latest['close']))) * 100)) if iex.get('prevClose') else Decimal('0'),
                    volume=int(iex.get('volume', 0)),
                    open=Decimal(str(iex.get('open', latest['open']))),
                    high=Decimal(str(iex.get('high', latest['high']))),
                    low=Decimal(str(iex.get('low', latest['low']))),
                    previous_close=Decimal(str(iex.get('prevClose', latest['close']))),
                    timestamp=datetime.fromisoformat(iex.get('timestamp', latest['date']).replace('Z', '+00:00')),
                    provider=self.name
                )
            
            # Fallback to EOD data
            return StockQuote(
                symbol=symbol,
                price=Decimal(str(latest['close'])),
                change=Decimal('0'),
                change_percent=Decimal('0'),
                volume=int(latest.get('volume', 0)),
                open=Decimal(str(latest['open'])),
                high=Decimal(str(latest['high'])),
                low=Decimal(str(latest['low'])),
                previous_close=Decimal(str(latest['close'])),
                timestamp=datetime.fromisoformat(latest['date'].replace('Z', '+00:00')),
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
        # Tiingo primarily supports daily data for free tier
        if interval not in ["1d", "daily"]:
            return await self.get_intraday(symbol, interval)
        
        params = {
            'startDate': start_date.strftime('%Y-%m-%d'),
            'endDate': end_date.strftime('%Y-%m-%d')
        }
        
        data = await self._make_request(f"tiingo/daily/{symbol}/prices", params)
        
        if not data or not isinstance(data, list):
            return None
        
        try:
            prices = []
            for bar in data:
                price_date = datetime.fromisoformat(bar['date'].replace('Z', '+00:00')).date()
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_date,
                    open=Decimal(str(bar['open'])),
                    high=Decimal(str(bar['high'])),
                    low=Decimal(str(bar['low'])),
                    close=Decimal(str(bar['close'])),
                    volume=int(bar.get('volume', 0)),
                    adjusted_close=Decimal(str(bar.get('adjClose', bar['close']))),
                    dividend=Decimal(str(bar.get('divCash', 0))),
                    split=Decimal(str(bar.get('splitFactor', 1))),
                    provider=self.name
                ))
            
            return sorted(prices, key=lambda x: x.date)
        except Exception as e:
            self._log_error("get_historical", e)
            return None
    
    async def get_intraday(
        self, 
        symbol: str, 
        interval: str = "5min"
    ) -> Optional[List[HistoricalPrice]]:
        """Get intraday prices from IEX"""
        # Map intervals to Tiingo resample frequencies
        freq_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "1hour",
            "1h": "1hour"
        }
        
        freq = freq_map.get(interval, "5min")
        
        params = {
            'resampleFreq': freq,
            'columns': 'open,high,low,close,volume'
        }
        
        data = await self._make_request(f"iex/{symbol}/prices", params)
        
        if not data or not isinstance(data, list):
            return None
        
        try:
            prices = []
            for bar in data:
                price_datetime = datetime.fromisoformat(bar['date'].replace('Z', '+00:00'))
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_datetime.date(),
                    open=Decimal(str(bar['open'])),
                    high=Decimal(str(bar['high'])),
                    low=Decimal(str(bar['low'])),
                    close=Decimal(str(bar['close'])),
                    volume=int(bar.get('volume', 0)),
                    provider=self.name
                ))
            
            return prices
        except Exception as e:
            self._log_error("get_intraday", e)
            return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company metadata"""
        data = await self._make_request(f"tiingo/daily/{symbol}")
        
        if not data:
            return None
        
        try:
            return CompanyInfo(
                symbol=symbol,
                name=data.get('name', ''),
                exchange=data.get('exchangeCode'),
                sector=None,  # Not provided by Tiingo
                industry=None,  # Not provided by Tiingo
                market_cap=None,  # Not provided in metadata
                employees=None,  # Not provided
                description=data.get('description'),
                website=None,  # Not provided
                ceo=None,  # Not provided
                headquarters=None,  # Not provided
                founded=data.get('startDate'),
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
        """Tiingo doesn't provide options data in free tier"""
        self._log_info(f"Options chain not available on Tiingo free tier")
        return None
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental statements"""
        # Get daily metrics
        daily_data = await self._make_request(f"tiingo/fundamentals/{symbol}/daily")
        
        # Get statements
        statements_data = await self._make_request(f"tiingo/fundamentals/{symbol}/statements")
        
        if not daily_data and not statements_data:
            return None
        
        try:
            fundamentals = {
                'symbol': symbol,
                'provider': self.name
            }
            
            if daily_data:
                fundamentals.update({
                    'pe_ratio': daily_data.get('peRatio'),
                    'market_cap': daily_data.get('marketCap'),
                    'enterprise_value': daily_data.get('enterpriseVal')
                })
            
            if statements_data and isinstance(statements_data, list) and len(statements_data) > 0:
                latest = statements_data[0]
                fundamentals.update({
                    'revenue': latest.get('revenue'),
                    'gross_profit': latest.get('grossProfit'),
                    'operating_income': latest.get('opIncome'),
                    'net_income': latest.get('netIncome'),
                    'eps': latest.get('eps'),
                    'total_assets': latest.get('totalAssets'),
                    'total_liabilities': latest.get('totalLiabilities'),
                    'shareholders_equity': latest.get('shareholderEquity'),
                    'operating_cash_flow': latest.get('opCashflow')
                })
            
            return fundamentals
        except Exception as e:
            self._log_error("get_fundamentals", e)
            return None
    
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get news articles"""
        if symbol:
            params = {
                'tickers': symbol,
                'limit': limit
            }
        else:
            params = {
                'limit': limit
            }
        
        data = await self._make_request("tiingo/news", params)
        
        if not data or not isinstance(data, list):
            return None
        
        return data[:limit]
    
    async def get_economic_data(self, indicator: str) -> Optional[Dict[str, Any]]:
        """Tiingo doesn't provide economic data in standard tier"""
        self._log_info(f"Economic data not available on Tiingo standard tier")
        return None
