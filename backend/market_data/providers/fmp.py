"""Financial Modeling Prep API Provider Implementation"""

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


class FMPProvider(MarketDataProvider):
    """Financial Modeling Prep API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "FMP")
        self.base_url = "https://financialmodelingprep.com/api"
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any] = None) -> Optional[Dict]:
        """Make API request to FMP"""
        if params is None:
            params = {}
        params['apikey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.base_url}/{endpoint}"
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if isinstance(data, dict) and 'Error Message' in data:
                            self._log_error("API Request", Exception(data['Error Message']))
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
        data = await self._make_request(f"v3/quote-short/{symbol}")
        
        if not data or not isinstance(data, list) or len(data) == 0:
            return None
        
        try:
            quote = data[0]
            
            # Get full quote for more details
            full_quote_data = await self._make_request(f"v3/quote/{symbol}")
            full_quote = full_quote_data[0] if full_quote_data and isinstance(full_quote_data, list) else {}
            
            return StockQuote(
                symbol=symbol,
                price=Decimal(str(quote['price'])),
                change=Decimal(str(full_quote.get('change', 0))),
                change_percent=Decimal(str(full_quote.get('changesPercentage', 0))),
                volume=int(full_quote.get('volume', 0)),
                open=Decimal(str(full_quote.get('open', quote['price']))),
                high=Decimal(str(full_quote.get('dayHigh', quote['price']))),
                low=Decimal(str(full_quote.get('dayLow', quote['price']))),
                previous_close=Decimal(str(full_quote.get('previousClose', quote['price']))),
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
        # FMP primarily supports daily data in free tier
        if interval not in ["1d", "daily"]:
            # Try to get intraday data
            return await self.get_intraday(symbol, interval)
        
        endpoint = f"v3/historical-price-full/{symbol}"
        params = {
            'from': start_date.strftime('%Y-%m-%d'),
            'to': end_date.strftime('%Y-%m-%d')
        }
        
        data = await self._make_request(endpoint, params)
        
        if not data or 'historical' not in data:
            return None
        
        try:
            prices = []
            for bar in data['historical']:
                price_date = datetime.strptime(bar['date'], '%Y-%m-%d').date()
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_date,
                    open=Decimal(str(bar['open'])),
                    high=Decimal(str(bar['high'])),
                    low=Decimal(str(bar['low'])),
                    close=Decimal(str(bar['close'])),
                    volume=int(bar.get('volume', 0)),
                    adjusted_close=Decimal(str(bar.get('adjClose', bar['close']))),
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
        """Get intraday prices"""
        # Map intervals to FMP format
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "1hour",
            "1h": "1hour",
            "4h": "4hour"
        }
        
        fmp_interval = interval_map.get(interval, "5min")
        
        endpoint = f"v3/historical-chart/{fmp_interval}/{symbol}"
        data = await self._make_request(endpoint)
        
        if not data or not isinstance(data, list):
            return None
        
        try:
            prices = []
            for bar in data:
                price_datetime = datetime.strptime(bar['date'], '%Y-%m-%d %H:%M:%S')
                
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
        """Get company information"""
        data = await self._make_request(f"v3/profile/{symbol}")
        
        if not data or not isinstance(data, list) or len(data) == 0:
            return None
        
        try:
            profile = data[0]
            return CompanyInfo(
                symbol=symbol,
                name=profile.get('companyName', ''),
                exchange=profile.get('exchangeShortName'),
                sector=profile.get('sector'),
                industry=profile.get('industry'),
                market_cap=int(profile.get('mktCap', 0)) if profile.get('mktCap') else None,
                employees=int(profile.get('fullTimeEmployees', 0)) if profile.get('fullTimeEmployees') else None,
                description=profile.get('description'),
                website=profile.get('website'),
                ceo=profile.get('ceo'),
                headquarters=f"{profile.get('city', '')}, {profile.get('state', '')}, {profile.get('country', '')}".strip(', '),
                founded=profile.get('ipoDate'),
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
        """Get options chain - requires premium subscription"""
        self._log_info(f"Options chain requires premium subscription on FMP")
        return None
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental metrics"""
        # Get key metrics
        metrics_data = await self._make_request(f"v3/key-metrics/{symbol}")
        
        # Get ratios
        ratios_data = await self._make_request(f"v3/ratios/{symbol}")
        
        if not metrics_data and not ratios_data:
            return None
        
        try:
            metrics = metrics_data[0] if metrics_data and isinstance(metrics_data, list) else {}
            ratios = ratios_data[0] if ratios_data and isinstance(ratios_data, list) else {}
            
            return {
                'symbol': symbol,
                'provider': self.name,
                'pe_ratio': metrics.get('peRatio') or ratios.get('priceEarningsRatio'),
                'peg_ratio': metrics.get('pegRatio') or ratios.get('priceEarningsToGrowthRatio'),
                'book_value': metrics.get('bookValuePerShare'),
                'dividend_yield': ratios.get('dividendYield'),
                'eps': metrics.get('eps'),
                'revenue_per_share': metrics.get('revenuePerShare'),
                'profit_margin': ratios.get('netProfitMargin'),
                'operating_margin': ratios.get('operatingProfitMargin'),
                'return_on_assets': ratios.get('returnOnAssets'),
                'return_on_equity': ratios.get('returnOnEquity'),
                'debt_to_equity': ratios.get('debtEquityRatio'),
                'current_ratio': ratios.get('currentRatio'),
                'quick_ratio': ratios.get('quickRatio'),
                'enterprise_value': metrics.get('enterpriseValue'),
                'market_cap': metrics.get('marketCap'),
                'price_to_book': metrics.get('priceToBookRatio'),
                'price_to_sales': metrics.get('priceToSalesRatio')
            }
        except Exception as e:
            self._log_error("get_fundamentals", e)
            return None
    
    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings calendar"""
        data = await self._make_request(f"v3/historical/earning_calendar/{symbol}")
        
        if not data or not isinstance(data, list):
            return None
        
        return data
    
    async def get_dividends(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get historical dividends"""
        data = await self._make_request(f"v3/historical-price-full/stock_dividend/{symbol}")
        
        if not data or 'historical' not in data:
            return None
        
        return data['historical']
    
    async def get_news(
        self, 
        symbol: Optional[str] = None, 
        limit: int = 10
    ) -> Optional[List[Dict[str, Any]]]:
        """Get stock news"""
        if symbol:
            endpoint = f"v3/stock_news"
            params = {'tickers': symbol, 'limit': limit}
        else:
            endpoint = f"v3/stock_news"
            params = {'limit': limit}
        
        data = await self._make_request(endpoint, params)
        
        if not data or not isinstance(data, list):
            return None
        
        return data[:limit]
    
    async def get_economic_data(self, indicator: str) -> Optional[Dict[str, Any]]:
        """Get economic calendar data"""
        endpoint = "v3/economic_calendar"
        data = await self._make_request(endpoint)
        
        if not data:
            return None
        
        # Filter by indicator if specified
        if indicator and isinstance(data, list):
            filtered = [item for item in data if indicator.lower() in item.get('event', '').lower()]
            return {'indicator': indicator, 'data': filtered, 'provider': self.name}
        
        return {'data': data, 'provider': self.name}
