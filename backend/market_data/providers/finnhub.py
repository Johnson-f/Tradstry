"""Finnhub API Provider Implementation"""

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


class FinnhubProvider(MarketDataProvider):
    """Finnhub API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "Finnhub")
        self.base_url = "https://finnhub.io/api/v1"
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Optional[Dict]:
        """Make API request to Finnhub"""
        if params is None:
            params = {}
        params['token'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/{endpoint}"
                async with session.get(url, params=params) as response:
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
        data = await self._make_request("quote", {'symbol': symbol})
        if not data:
            return None
        
        try:
            return StockQuote(
                symbol=symbol,
                price=Decimal(str(data['c'])),  # Current price
                change=Decimal(str(data['d'])),  # Change
                change_percent=Decimal(str(data['dp'])),  # Percent change
                volume=0,  # Finnhub doesn't provide volume in quote
                open=Decimal(str(data['o'])),
                high=Decimal(str(data['h'])),
                low=Decimal(str(data['l'])),
                previous_close=Decimal(str(data['pc'])),
                timestamp=datetime.fromtimestamp(data['t']),
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
        # Finnhub uses Unix timestamps
        start_timestamp = int(datetime.combine(start_date, datetime.min.time()).timestamp())
        end_timestamp = int(datetime.combine(end_date, datetime.max.time()).timestamp())
        
        # Map interval to Finnhub resolution
        resolution_map = {
            "1min": "1",
            "5min": "5",
            "15min": "15",
            "30min": "30",
            "60min": "60",
            "1d": "D",
            "daily": "D",
            "1w": "W",
            "weekly": "W",
            "1m": "M",
            "monthly": "M"
        }
        
        resolution = resolution_map.get(interval, "D")
        
        params = {
            'symbol': symbol,
            'resolution': resolution,
            'from': start_timestamp,
            'to': end_timestamp
        }
        
        data = await self._make_request("stock/candle", params)
        if not data or data.get('s') != 'ok':
            return None
        
        try:
            prices = []
            for i in range(len(data['t'])):
                price_date = datetime.fromtimestamp(data['t'][i]).date()
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_date,
                    open=Decimal(str(data['o'][i])),
                    high=Decimal(str(data['h'][i])),
                    low=Decimal(str(data['l'][i])),
                    close=Decimal(str(data['c'][i])),
                    volume=int(data['v'][i]),
                    provider=self.name
                ))
            
            return prices
        except Exception as e:
            self._log_error("get_historical", e)
            return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        data = await self._make_request("stock/profile2", {'symbol': symbol})
        if not data:
            return None
        
        try:
            return CompanyInfo(
                symbol=symbol,
                name=data.get('name', ''),
                exchange=data.get('exchange'),
                sector=data.get('finnhubIndustry'),
                industry=data.get('finnhubIndustry'),
                market_cap=int(data.get('marketCapitalization', 0) * 1000000) if data.get('marketCapitalization') else None,
                employees=None,  # Not provided by Finnhub
                description=None,  # Not in basic profile
                website=data.get('weburl'),
                ceo=None,  # Not provided
                headquarters=data.get('country'),
                founded=data.get('ipo'),
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
        """Get options chain - Finnhub requires premium for options data"""
        self._log_info(f"Options chain requires premium subscription on Finnhub")
        return None
    
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get news for a symbol or general market"""
        if symbol:
            # Company news
            today = date.today()
            from_date = (today - timedelta(days=7)).strftime('%Y-%m-%d')
            to_date = today.strftime('%Y-%m-%d')
            
            params = {
                'symbol': symbol,
                'from': from_date,
                'to': to_date
            }
            data = await self._make_request("company-news", params)
        else:
            # General news
            data = await self._make_request("news", {'category': 'general'})
        
        if not data:
            return None
        
        # Limit results
        return data[:limit] if isinstance(data, list) else None
    
    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings calendar"""
        data = await self._make_request("stock/earnings", {'symbol': symbol})
        return data if data else None
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental metrics"""
        data = await self._make_request("stock/metric", {
            'symbol': symbol,
            'metric': 'all'
        })
        
        if not data or 'metric' not in data:
            return None
        
        metrics = data['metric']
        return {
            'symbol': symbol,
            'provider': self.name,
            'pe_ratio': metrics.get('peBasicExclExtraTTM'),
            'peg_ratio': metrics.get('pegRatio'),
            'book_value': metrics.get('bookValuePerShareQuarterly'),
            'dividend_yield': metrics.get('dividendYieldIndicatedAnnual'),
            'eps': metrics.get('epsBasicExclExtraItemsTTM'),
            'revenue_per_share': metrics.get('revenuePerShareTTM'),
            'profit_margin': metrics.get('netProfitMarginTTM'),
            'operating_margin': metrics.get('operatingMarginTTM'),
            'return_on_assets': metrics.get('roaTTM'),
            'return_on_equity': metrics.get('roeTTM'),
            'revenue': metrics.get('revenueTTM'),
            'beta': metrics.get('beta'),
            '52_week_high': metrics.get('52WeekHigh'),
            '52_week_low': metrics.get('52WeekLow'),
            '10_day_avg_volume': metrics.get('10DayAverageTradingVolume'),
            '3_month_avg_volume': metrics.get('3MonthAverageTradingVolume')
        }
    
    async def get_economic_data(self, indicator: str) -> Optional[Dict[str, Any]]:
        """Get economic calendar data"""
        data = await self._make_request("calendar/economic")
        return data if data else None
