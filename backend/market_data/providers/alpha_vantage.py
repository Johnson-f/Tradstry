"""Alpha Vantage API Provider Implementation"""

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


class AlphaVantageProvider(MarketDataProvider):
    """Alpha Vantage API implementation"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "AlphaVantage")
        self.base_url = "https://www.alphavantage.co/query"
    
    async def _make_request(self, params: Dict[str, Any]) -> Optional[Dict]:
        """Make API request to Alpha Vantage"""
        params['apikey'] = self.api_key
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if "Error Message" in data or "Note" in data:
                            self._log_error("API Request", Exception(data.get("Error Message", data.get("Note"))))
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
        params = {
            'function': 'GLOBAL_QUOTE',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data or 'Global Quote' not in data:
            return None
        
        try:
            quote_data = data['Global Quote']
            return StockQuote(
                symbol=symbol,
                price=Decimal(quote_data['05. price']),
                change=Decimal(quote_data['09. change']),
                change_percent=Decimal(quote_data['10. change percent'].rstrip('%')),
                volume=int(quote_data['06. volume']),
                open=Decimal(quote_data['02. open']),
                high=Decimal(quote_data['03. high']),
                low=Decimal(quote_data['04. low']),
                previous_close=Decimal(quote_data['08. previous close']),
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
        params = {
            'function': 'TIME_SERIES_DAILY_ADJUSTED',
            'symbol': symbol,
            'outputsize': 'full'
        }
        
        data = await self._make_request(params)
        if not data or 'Time Series (Daily)' not in data:
            return None
        
        try:
            time_series = data['Time Series (Daily)']
            prices = []
            
            for date_str, values in time_series.items():
                price_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                
                if start_date <= price_date <= end_date:
                    prices.append(HistoricalPrice(
                        symbol=symbol,
                        date=price_date,
                        open=Decimal(values['1. open']),
                        high=Decimal(values['2. high']),
                        low=Decimal(values['3. low']),
                        close=Decimal(values['4. close']),
                        volume=int(values['6. volume']),
                        adjusted_close=Decimal(values['5. adjusted close']),
                        dividend=Decimal(values.get('7. dividend amount', '0')),
                        split=Decimal(values.get('8. split coefficient', '1')),
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
        """Get intraday prices for a symbol"""
        # Map intervals to Alpha Vantage format
        interval_map = {
            "1min": "1min",
            "5min": "5min",
            "15min": "15min",
            "30min": "30min",
            "60min": "60min"
        }
        
        av_interval = interval_map.get(interval, "5min")
        
        params = {
            'function': 'TIME_SERIES_INTRADAY',
            'symbol': symbol,
            'interval': av_interval,
            'outputsize': 'full'
        }
        
        data = await self._make_request(params)
        if not data:
            return None
        
        try:
            time_series_key = f'Time Series ({av_interval})'
            if time_series_key not in data:
                return None
            
            time_series = data[time_series_key]
            prices = []
            
            for datetime_str, values in time_series.items():
                price_datetime = datetime.strptime(datetime_str, '%Y-%m-%d %H:%M:%S')
                
                prices.append(HistoricalPrice(
                    symbol=symbol,
                    date=price_datetime.date(),
                    open=Decimal(values['1. open']),
                    high=Decimal(values['2. high']),
                    low=Decimal(values['3. low']),
                    close=Decimal(values['4. close']),
                    volume=int(values['5. volume']),
                    provider=self.name
                ))
            
            return prices
        except Exception as e:
            self._log_error("get_intraday", e)
            return None
    
    async def get_options_chain(
        self, 
        symbol: str, 
        expiration: Optional[date] = None
    ) -> Optional[List[OptionQuote]]:
        """Alpha Vantage doesn't provide options data in free tier"""
        self._log_info(f"Options chain not available for {symbol} on Alpha Vantage free tier")
        return None
    
    async def get_company_info(self, symbol: str) -> Optional[CompanyInfo]:
        """Get company information"""
        params = {
            'function': 'OVERVIEW',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data or 'Symbol' not in data:
            return None
        
        try:
            return CompanyInfo(
                symbol=symbol,
                name=data.get('Name', ''),
                exchange=data.get('Exchange'),
                sector=data.get('Sector'),
                industry=data.get('Industry'),
                market_cap=int(data.get('MarketCapitalization', 0)) if data.get('MarketCapitalization') else None,
                employees=int(data.get('FullTimeEmployees', 0)) if data.get('FullTimeEmployees') else None,
                description=data.get('Description'),
                website=data.get('OfficialSite'),
                ceo=data.get('CEO'),
                headquarters=f"{data.get('Address', '')}, {data.get('City', '')}, {data.get('Country', '')}".strip(', '),
                founded=data.get('FiscalYearEnd'),
                provider=self.name
            )
        except Exception as e:
            self._log_error("get_company_info", e)
            return None
    
    async def get_fundamentals(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get fundamental data"""
        params = {
            'function': 'OVERVIEW',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data:
            return None
        
        # Extract key fundamental metrics
        fundamentals = {
            'symbol': symbol,
            'provider': self.name,
            'pe_ratio': data.get('PERatio'),
            'peg_ratio': data.get('PEGRatio'),
            'book_value': data.get('BookValue'),
            'dividend_yield': data.get('DividendYield'),
            'eps': data.get('EPS'),
            'revenue_per_share': data.get('RevenuePerShareTTM'),
            'profit_margin': data.get('ProfitMargin'),
            'operating_margin': data.get('OperatingMarginTTM'),
            'return_on_assets': data.get('ReturnOnAssetsTTM'),
            'return_on_equity': data.get('ReturnOnEquityTTM'),
            'revenue': data.get('RevenueTTM'),
            'gross_profit': data.get('GrossProfitTTM'),
            'ebitda': data.get('EBITDA'),
            'beta': data.get('Beta'),
            '52_week_high': data.get('52WeekHigh'),
            '52_week_low': data.get('52WeekLow'),
            '50_day_ma': data.get('50DayMovingAverage'),
            '200_day_ma': data.get('200DayMovingAverage')
        }
        
        return fundamentals
    
    async def get_earnings(self, symbol: str) -> Optional[List[Dict[str, Any]]]:
        """Get earnings data"""
        params = {
            'function': 'EARNINGS',
            'symbol': symbol
        }
        
        data = await self._make_request(params)
        if not data or 'quarterlyEarnings' not in data:
            return None
        
        return data.get('quarterlyEarnings', [])
    
    async def get_technical_indicators(
        self, 
        symbol: str, 
        indicator: str,
        interval: str = "daily"
    ) -> Optional[Dict[str, Any]]:
        """Get technical indicators"""
        # Map indicator names to Alpha Vantage function names
        indicator_map = {
            'sma': 'SMA',
            'ema': 'EMA',
            'macd': 'MACD',
            'rsi': 'RSI',
            'bbands': 'BBANDS',
            'stoch': 'STOCH',
            'adx': 'ADX',
            'cci': 'CCI',
            'obv': 'OBV',
            'ad': 'AD'
        }
        
        av_function = indicator_map.get(indicator.lower())
        if not av_function:
            return None
        
        params = {
            'function': av_function,
            'symbol': symbol,
            'interval': self._standardize_interval(interval),
            'time_period': 20,  # Default period
            'series_type': 'close'
        }
        
        data = await self._make_request(params)
        return data
